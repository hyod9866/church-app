import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import multer from 'multer';
import * as csv from 'fast-csv';
import iconv from 'iconv-lite';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
// (pg 직접 연결은 더 이상 사용하지 않음 — 2026-09-27 임시 마이그레이션 엔드포인트 제거)

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_KEY must be set in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Supabase/PostgREST는 한 번의 select 응답을 기본 1000행으로 제한한다.
// attendance처럼 전체 행 수가 1000을 넘을 수 있는 테이블을 필터 없이(또는 넓은 필터로) 조회하면
// 나머지 행이 조용히 잘려나가 집계가 틀어진다(예: 특정 모임의 출석 인원이 0명으로 보이는 버그).
// 이 헬퍼는 .range()로 페이지를 나눠 끝까지 가져와 그런 누락을 방지한다.
// buildQuery(from, to)는 매 페이지마다 새 쿼리 객체를 만들어 .range(from, to)를 적용해 반환해야 한다.
// 사용법: await fetchAllRows((from, to) => supabase.from('attendance').select('...').eq('is_present', 1).range(from, to))
// [2026-09-27] 익명 상담: 상담 관리에서 '익명'으로 상담을 등록하면 상담 기록을 붙이기 위해 members에
// 이름이 '익명'인 행이 하나씩 생긴다(POST /api/counseling). 이 행은 성도가 아니므로 성도 목록·검색·
// 출석률·통계·교회 목록 조회에서는 제외한다. 상담 관리(GET /api/counseling)에서는 계속 보인다.
const ANONYMOUS_COUNSELING_NAME = '익명';

async function fetchAllRows(buildQuery) {
  const pageSize = 1000;
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    allRows = allRows.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

// 강효근(관리자)의 현재 소속(교회/교구) 조회 헬퍼.
// 교구전체모임 생성 시점 스냅샷 기록, 출석률 계산, /api/users/default-profile 에서 공통으로 사용.
// (호출 시점의 "현재" 값을 반환 — 과거 시점 값이 필요하면 meetings.leader_church_snapshot 등을 대신 사용할 것)
async function fetchLeaderChurchParish() {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('church, parish')
      .eq('name', '강효근')
      .single();
    if (error) throw error;
    return data || null;
  } catch (err) {
    console.warn('fetchLeaderChurchParish failed:', err.message);
    return null;
  }
}

// Token generation & verification helpers
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'super-secret-key-12345';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@church.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'church1234!';

import crypto from 'crypto';

function generateToken(payload, expiryMs = 24 * 60 * 60 * 1000) {
  const data = JSON.stringify({ ...payload, exp: Date.now() + expiryMs }); // 기본 1일 만료
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64') + '.' + hmac;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const dataStr = Buffer.from(parts[0], 'base64').toString('utf8');
  const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(dataStr).digest('hex');
  if (parts[1] !== expectedHmac) return null;

  try {
    const payload = JSON.parse(dataStr);
    if (payload.exp < Date.now()) return null; // 만료됨
    return payload;
  } catch (e) {
    return null;
  }
}

// [2026-08-27] 로그인 아이디/비밀번호(+게스트 계정)를 설정 화면에서 바꿀 수 있게 하면서 도입.
// 비밀번호는 절대 평문으로 저장하지 않고, scrypt 해시(salt:hash 형태의 hex 문자열)로만 저장한다.
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  try {
    const hashBuf = Buffer.from(hash, 'hex');
    const testBuf = crypto.scryptSync(String(password), salt, 64);
    if (hashBuf.length !== testBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, testBuf);
  } catch (e) {
    return false;
  }
}

// 로그인 아이디/비밀번호(관리자 + 게스트)는 members 테이블의 '강효근' 행에 함께 저장한다
// (managed_districts, calendar_feed_token과 동일한 기존 패턴). 컬럼이 아직 없는 DB(마이그레이션 전)
// 에서는 migrationNeeded=true를 반환하고, 호출부는 기존 ADMIN_EMAIL/ADMIN_PASSWORD 환경변수와
// 게스트 기본값(guest/guest)으로 안전하게 폴백한다 — 즉 컬럼을 추가하기 전에도 로그인은 계속 동작한다.
async function fetchAdminCredentials() {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('login_id, login_password_hash, guest_login_id, guest_password_hash, guest_enabled')
      .eq('name', '강효근')
      .single();
    if (error) {
      if (/login_id|login_password_hash|guest_login_id|guest_password_hash|guest_enabled/i.test(error.message || '')) {
        return { migrationNeeded: true };
      }
      throw error;
    }
    return { ...(data || {}), migrationNeeded: false };
  } catch (err) {
    console.warn('fetchAdminCredentials failed:', err.message);
    return { migrationNeeded: true };
  }
}

// Cookie parser helper
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, c) => {
    const idx = c.indexOf('=');
    if (idx !== -1) {
      const key = c.substring(0, idx).trim();
      const val = c.substring(idx + 1).trim();
      acc[key] = val;
    }
    return acc;
  }, {});
  return cookies[name] || null;
}

// Auth middleware
function checkAuth(req, res, next) {
  const url = req.url.split('?')[0];

  // Pass-through list (No auth required)
  const passThroughExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  const isStaticAsset = passThroughExtensions.some(ext => url.endsWith(ext));

  if (
    url === '/login.html' || 
    url === '/api/login' || 
    url === '/api/login-biometric' || 
    url.startsWith('/api/calendar/feed') ||
    url.startsWith('/api/cron/daily-reminders') ||
    url.startsWith('/api/cron/sync-church-staff') ||
    isStaticAsset
  ) {
    return next();
  }

  // Token verification
  const token = getCookie(req, 'auth_token');
  const user = verifyToken(token);
  console.log(`[AUTH DEBUG] URL: ${url}, Token present: ${!!token}, User valid: ${!!user}`);
  if (!user && token) {
    console.log(`[AUTH DEBUG] Token: ${token.substring(0, Math.min(15, token.length))}...`);
    const parts = token.split('.');
    console.log(`[AUTH DEBUG] Token parts count: ${parts.length}`);
    if (parts.length === 2) {
      try {
        const dataStr = Buffer.from(parts[0], 'base64').toString('utf8');
        console.log(`[AUTH DEBUG] Token payload: ${dataStr}`);
        const expectedHmac = crypto.createHmac('sha256', COOKIE_SECRET).update(dataStr).digest('hex');
        console.log(`[AUTH DEBUG] HMAC match: ${parts[1] === expectedHmac}`);
      } catch (err) {
        console.log(`[AUTH DEBUG] Parsing error: ${err.message}`);
      }
    }
  }

  if (user) {
    req.user = user;
    // [2026-08-27] 게스트 계정은 조회(GET)만 허용 — 등록/수정/삭제(POST/PUT/PATCH/DELETE)는
    // UI에서 버튼을 숨기더라도 API 자체에서 한 번 더 막아 데이터가 실수로/우회로 바뀌지 않게 한다.
    // 로그아웃(/api/logout)만 예외로 허용해서 게스트도 로그아웃은 할 수 있게 한다.
    if (user.role === 'guest' && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
      if (url !== '/api/logout') {
        return res.status(403).json({ error: '게스트 계정은 조회만 가능합니다. 등록·수정·삭제는 관리자 계정으로 로그인해 주세요.' });
      }
    }
    return next();
  }

  // Auth failed
  if (url.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // For web page requests, redirect to login page
  res.redirect('/login.html');
}

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.use(checkAuth);

const uploadDir = process.env.VERCEL ? '/tmp/uploads' : 'uploads';
try {
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  console.warn('Failed to create uploads directory:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.VERCEL ? '/tmp/uploads/' : 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage: storage });

app.use(express.static(dirname(fileURLToPath(import.meta.url)) + '/public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// --- Family Link Sync Engine ---
// meBs: 이 관계를 "나"(현재 저장 중인 사람) 기준으로 뒤집을 때, 사위/며느리처럼 "나"의 성별에
// 따라 결과가 갈리는 경우에만 사용(없으면 남편/아내 쪽으로 기본 처리). [2026-10-01] 장인/장모/
// 시부/시모/사위/며느리 역관계 추가.
function getSymmetricRelation(relation, meBs) {
    if (relation.includes('남편')) return '아내';
    if (relation.includes('아내')) return '남편';
    if (relation.includes('부모')) return '자녀';
    if (relation.includes('자녀')) return '부모';
    // 내가 상대를 장인/장모(또는 시부/시모)라고 불렀다면, 상대가 나를 부르는 말은 내 성별과 무관하게
    // 항상 "사위"(또는 "며느리")로 고정된다.
    if (relation.includes('장인') || relation.includes('장모')) return '사위';
    if (relation.includes('시부') || relation.includes('시모')) return '며느리';
    // 반대로 내가 상대를 사위/며느리라고 불렀다면, 상대가 나를 부르는 말은 "나"의 성별로 갈린다.
    if (relation.includes('사위')) return meBs === 'S' ? '장모' : '장인';
    if (relation.includes('며느리')) return meBs === 'S' ? '시모' : '시부';
    return '기타';
}

// [2026-10-01] 나(me)에게 target과 other가 둘 다 '자녀'면 두 사람은 형제자매다.
// target 쪽 목록에 적힐 "other(호칭)"을 target 기준 성별+나이로 정확히 고른다
// (형/오빠/누나/언니는 target 본인의 성별에 따라 달라지고, 동생 쪽은 generic하게 남동생/여동생).
// 생년을 모르거나 동갑(쌍둥이 등)이라 손위/손아래를 가릴 수 없으면 안전하게 '기타'로 둔다.
function getSiblingRelation(target, other) {
    const ty = parseInt(target.birth_year, 10);
    const oy = parseInt(other.birth_year, 10);
    if (!ty || !oy || ty === oy) return '기타';
    if (oy < ty) {
        // other가 target보다 손위
        if (target.bs === 'B') return (other.bs === 'B') ? '형' : '누나';
        return (other.bs === 'B') ? '오빠' : '언니';
    }
    // other가 target보다 손아래
    return (other.bs === 'B') ? '남동생' : '여동생';
}

async function syncFamilyLinks(memberId, memberName, memberBs, familyRelation, providedFid, callback, familyRelationIds) {
  if (!familyRelation) return callback(null, providedFid);
  const entries = familyRelation.split(',').map(s => s.trim()).filter(s => s);
  const inputMap = {}; // 핵심 성명 -> 관계 태그 (역관계 텍스트 생성용)
  const idHints = familyRelationIds || {}; // "이름(관계)" 문자열 -> member_id (검색으로 특정 사람을 골랐을 때 프론트가 함께 보냄)

  // [2026-07-07 감사 보고서 8번 항목] 예전에는 가족관계 텍스트의 이름과 핵심 성명이 같은
  // "모든" active 성도를 무조건 가족 그룹에 편입시켰다. 동명이인이 있으면 전혀 남남인
  // 사람이 같은 가족으로 묶이고 그 사람의 가족관계 텍스트까지 덮어써지는 위험이 있었다.
  // 이제는 이름이 아니라 ID를 우선 기준으로 삼는다:
  //   1) 검색으로 특정 사람을 골랐다면(idHints) 그 사람의 id로 정확히 매칭
  //   2) 이미 같은 family_id를 가진 사람(과거에 이미 정확히 연결된 그룹원 — 이후 아래에서
  //      family_id로 다시 매칭하므로 이름이 같은 다른 사람과 섞이지 않음)
  //   3) 위 둘 다 해당 안 되는, ID 정보가 전혀 없는 레거시 입력만 예전처럼 이름으로 찾는다
  //      (기존 데이터 호환용 — 새로 입력되는 항목은 프론트가 항상 idHints를 함께 보낸다)
  const hintedIds = new Set();
  const unresolvedCoreNames = new Set();
  entries.forEach(e => {
    const m = e.match(/^(.+?)\((.+?)\)$/);
    if (!m) return;
    const coreName = m[1].trim().replace(/[DBS P]$/i, '').trim();
    inputMap[coreName] = m[2];
    const hintedId = idHints[e];
    if (hintedId !== undefined && hintedId !== null && hintedId !== '') {
      hintedIds.add(parseInt(hintedId));
    } else {
      unresolvedCoreNames.add(coreName);
    }
  });

  const familyCoreNames = Object.keys(inputMap);
  if (familyCoreNames.length === 0) return callback(null, providedFid);

  try {
    // active 성도를 모두 가져온 뒤 메모리에서 매칭
    // [2026-07-07 페이지네이션] 활성 성도가 1000명을 넘으면 조용히 잘려나가, 뒤쪽에 있는
    // 동명이인 가족 구성원을 찾지 못해 가족관계 연결이 누락될 수 있으므로 fetchAllRows 사용.
    const activeMembers = await fetchAllRows((from, to) =>
      supabase
        .from('members')
        .select('id, name, bs, family_id, family_relation, birth_year')
        .eq('status', 'active')
        .range(from, to)
    );

    const meId = parseInt(memberId);
    let fid = (providedFid && providedFid !== 'null' && providedFid !== '') ? parseInt(providedFid) : null;

    const groupMembers = activeMembers.filter(m => {
      if (m.id === meId) return true; // 본인은 항상 id로 정확히 포함 (이름 매칭 아님)
      if (fid !== null && m.family_id !== null && m.family_id !== '' && parseInt(m.family_id) === fid) return true;
      if (hintedIds.has(m.id)) return true;
      if (unresolvedCoreNames.size === 0) return false;
      const coreName = m.name.trim().replace(/[DBS P]$/i, '').trim();
      return unresolvedCoreNames.has(coreName);
    });

    if (!fid) {
        const ex = groupMembers.find(m => m.family_id !== null && m.family_id !== '');
        if (ex) fid = parseInt(ex.family_id);
    }

    const finalizeSync = async (targetFid) => {
      const tasks = [];
      groupMembers.forEach(target => {
        let finalRelationVal = '';
        if (target.id === meId) {
          finalRelationVal = familyRelation;
        } else {
          const others = groupMembers.filter(o => o.id !== target.id);
          const rels = others.map(other => {
            const targetCore = target.name.replace(/[DBS P]$/i, '').trim();
            const otherCore = other.name.replace(/[DBS P]$/i, '').trim();
            
            let r = '기타';
            if (other.id === meId) {
              r = getSymmetricRelation(inputMap[targetCore] || '기타', memberBs);
            } else {
              const myRelToTarget = inputMap[targetCore] || '기타';
              const myRelToOther = inputMap[otherCore] || '기타';
              if (myRelToTarget.includes('남편') || myRelToTarget.includes('아내')) {
                // target은 나의 배우자.
                // [2026-10-01] other가 "나"의 부모라면, target에게 other는 친부모가 아니라
                // 처가/시댁 쪽 부모 — 장인/장모(target이 남편일 때) 또는 시부/시모(target이 아내일 때).
                if (myRelToOther.includes('부모')) {
                  r = myRelToTarget.includes('남편')
                    ? ((other.bs === 'B') ? '장인' : '장모')
                    : ((other.bs === 'B') ? '시부' : '시모');
                } else {
                  r = myRelToOther;
                }
              } else if (myRelToOther.includes('남편') || myRelToOther.includes('아내')) {
                // other는 나의 배우자.
                // [2026-10-01] target이 "나"의 부모라면, other는 target에게 친자녀가 아니라
                // 자녀의 배우자 — 사위(other가 남자) 또는 며느리(other가 여자).
                if (myRelToTarget.includes('부모')) {
                  r = (other.bs === 'B') ? '사위' : '며느리';
                } else {
                  r = getSymmetricRelation(myRelToTarget, memberBs);
                }
              }
              // [2026-10-01] 나(me)에게 target과 other가 둘 다 '부모'면 두 사람은 서로 배우자다
              // (예: 이은혜 기준 이명호·고성희가 둘 다 부모 → 둘은 부부). 이 경우가 비어 있어서
              // 지금까지는 기본값 '기타'로 떨어졌고, 그 결과 기존에 맞게 들어있던 남편/아내 표시까지
              // 상대방 쪽에서 '기타'로 덮어써지는 문제가 있었다. bs(성별)로 남편/아내를 정해준다.
              else if (myRelToTarget.includes('부모') && myRelToOther.includes('부모')) r = (other.bs === 'B') ? '남편' : '아내';
              // 나(me)에게 target과 other가 둘 다 '자녀'면 두 사람은 형제자매 — target 기준 호칭 적용.
              else if (myRelToTarget.includes('자녀') && myRelToOther.includes('자녀')) r = getSiblingRelation(target, other);
            }
            return `${other.name.trim()}(${r})`;
          });
          
          const existingText = target.family_relation || '';
          const existingEntries = existingText.split(',').map(s => s.trim()).filter(s => s);
          const newLinkedNames = others.map(o => o.name.replace(/[DBS P]$/i, '').trim());
          const preservedEntries = existingEntries.filter(entry => {
            const match = entry.match(/^(.+?)\(/);
            const name = match ? match[1].trim() : entry.trim();
            const nameCore = name.replace(/[DBS P]$/i, '').trim();
            return !newLinkedNames.includes(nameCore);
          });
          
          finalRelationVal = [...rels, ...preservedEntries].join(', ');
        }
        tasks.push({ family_id: targetFid, family_relation: finalRelationVal, id: target.id });
      });

      for (const task of tasks) {
        const updatePayload = {
          family_id: task.family_id,
          family_relation: task.family_relation
        };
        // 만약 새로 구성된 가족관계에 '남편'이나 '아내'가 포함된다면, 해당 성도도 기혼으로 자동 보정
        if (task.family_relation && (task.family_relation.includes('남편') || task.family_relation.includes('아내'))) {
          updatePayload.marital_status = '기혼';
        }

        const { error: updateErr } = await supabase
          .from('members')
          .update(updatePayload)
          .eq('id', task.id);
        if (updateErr) console.error('Family relation update error:', updateErr);
      }
      return callback(null, targetFid);
    };

    if (!fid) {
      const { data: maxFidRow, error: maxErr } = await supabase
        .from('members')
        .select('family_id')
        .not('family_id', 'is', null) // [2026-09-27] NULL 제외: NULL이 정렬 맨 앞에 와서 최댓값이 0으로 계산되던 버그 (새 family_id가 1로 충돌)
        .order('family_id', { ascending: false })
        .limit(1);
      if (maxErr) throw maxErr;
      const maxFidVal = maxFidRow && maxFidRow.length > 0 ? (maxFidRow[0].family_id || 0) : 0;
      await finalizeSync(maxFidVal + 1);
    } else {
      await finalizeSync(fid);
    }
  } catch (err) {
    return callback(err);
  }
}

// Helper function to sync member profile based on history
async function syncMemberProfileFromRecords(memberId) {
    const { data: records, error: recError } = await supabase
      .from('member_records')
      .select('*')
      .eq('member_id', memberId)
      .order('date', { ascending: true })
      .order('id', { ascending: true });
      
    if (recError) throw recError;
    
    const { data: member, error: memError } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
      
    if (memError) throw memError;
    if (!member) throw new Error('Member not found');

    let currentChurch = member.church || '교회정보없음';
    let currentParish = member.parish || '교구정보없음';
    let currentDistrict = member.district || '구역정보없음';
    let currentCategory = member.category || '봉사회';
    let currentStatus = member.status || 'active';

    // [2026-07-07 감사 보고서 7번 항목] 원래는 position/church_service를 무조건 빈 배열에서
    // 시작해 POSITION/SERVICE 기록만으로 재구성했다. 그런데 그 성도에 대한 POSITION/SERVICE
    // 기록이 하나도 없는 경우(레거시 데이터이거나 엑셀 일괄 등록 등으로 직접 입력만 된 경우)에도
    // 무조건 빈 값에서 시작하다 보니, 수정 화면에서 직접 입력한 직분·부서가 아무 근거 기록 없이
    // 조용히 지워져 버렸다. 이제 해당 성도에게 POSITION/SERVICE 기록이 "하나라도" 있을 때만
    // 기록 기반으로 처음부터 재구성하고, 기록이 전혀 없다면 현재 저장된 값을 그대로 유지한다.
    const parseListPreserving = (val) => {
      if (!val || val === '없음') return [];
      return val.split(',').map(s => s.trim()).filter(Boolean);
    };
    const hasPositionRecords = records.some(rec => rec.status === 'POSITION' || rec.status === 'POSITION_DISMISS');
    const hasServiceRecords = records.some(rec => rec.status === 'SERVICE' || rec.status === 'SERVICE_DISMISS');
    let currentPosition = hasPositionRecords ? [] : parseListPreserving(member.position);
    let currentService = hasServiceRecords ? [] : parseListPreserving(member.church_service);

    const today = new Date().toISOString().split('T')[0];
    const activeRecords = records.filter(rec => rec.date <= today);

    activeRecords.forEach(rec => {
        if (rec.status === 'DISTRICT') {
            currentDistrict = rec.remark;
        } else if (rec.status === 'CATEGORY') {
            currentCategory = rec.remark;
        } else if (rec.status === 'CHURCH_IN') {
            const parts = rec.remark.split(' > ');
            if (parts[0]) currentChurch = parts[0];
            if (parts[1]) currentParish = parts[1];
            if (parts[2]) currentDistrict = parts[2];
            currentStatus = 'active';
        } else if (rec.status === 'CHURCH_MOVE') {
            if (rec.remark.startsWith('서울중앙교회')) {
                const parts = rec.remark.split(' > ');
                if (parts[0]) currentChurch = parts[0];
                if (parts[1]) currentParish = parts[1];
                if (parts[2]) currentDistrict = parts[2];
                currentStatus = 'active';
            } else {
                currentChurch = rec.remark;
                currentStatus = 'active'; // Transfer out but keep active
            }
        } else if (rec.status === 'PARISH_MOVE') {
            currentParish = rec.remark;
        } else if (rec.status === 'POSITION') {
            const newPos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
            currentPosition = Array.from(new Set([...currentPosition, ...newPos]));
        } else if (rec.status === 'POSITION_DISMISS') {
            const cleanedRemark = rec.remark.replace(/\[면직\]\s*|면직\s*/g, '');
            const removePos = cleanedRemark.split(',').map(p => p.trim()).filter(p => p);
            currentPosition = currentPosition.filter(p => !removePos.includes(p));
        } else if (rec.status === 'SERVICE') {
            const newSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
            currentService = Array.from(new Set([...currentService, ...newSvc]));
        } else if (rec.status === 'SERVICE_DISMISS') {
            const cleanedRemark = rec.remark.replace(/\[면직\]\s*|면직\s*/g, '');
            const removeSvc = cleanedRemark.split(',').map(s => s.trim()).filter(s => s);
            currentService = currentService.filter(s => !removeSvc.includes(s));
        } else if (rec.status === 'FELLOWSHIP') {
            if (rec.remark.includes('안나옴')) currentStatus = 'inactive';
            else if (rec.remark.includes('나옴')) currentStatus = 'active';
        }
    });

    const { error: updateErr } = await supabase
      .from('members')
      .update({
        church: currentChurch,
        parish: currentParish,
        district: currentDistrict,
        category: currentCategory,
        position: currentPosition.join(', '),
        church_service: currentService.length ? currentService.join(', ') : '없음',
        status: currentStatus
      })
      .eq('id', memberId);
      
    if (updateErr) throw updateErr;
}

async function syncAllMembersProfilePromise() {
    // [2026-07-07 페이지네이션] 성도 1000명을 넘으면 뒤쪽 성도는 동기화 대상에서 조용히 빠진다.
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('members')
        .select('id')
        .range(from, to)
    );
    if (!rows || rows.length === 0) return;
    
    // Supabase 커넥션 과부하 방지를 위한 20개씩 분할(Batching) 처리
    const batchSize = 20;
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await Promise.all(batch.map(row => syncMemberProfileFromRecords(row.id)));
    }
}

// Keep a wrapper for compatibility with any legacy code calling callback style
function syncAllMembersProfile(callback) {
    syncAllMembersProfilePromise()
        .then(() => callback && callback())
        .catch(err => {
            console.error('syncAllMembersProfile error:', err);
            callback && callback(err);
        });
}

// Login & Logout APIs
// [2026-08-27] 관리자 계정 + 게스트 계정(조회 전용) 2단계 로그인.
// 두 계정 모두 members 테이블의 '강효근' 행에 저장된 아이디/비밀번호 해시를 우선 사용하고,
// 아직 설정 화면에서 한 번도 저장한 적이 없거나(컬럼 자체가 없는 마이그레이션 전 포함) 값이
// 비어있으면 각각 기존 기본값(관리자: ADMIN_EMAIL/ADMIN_PASSWORD 환경변수, 게스트: guest/guest)
// 으로 안전하게 폴백한다 — 즉 설정에서 아무것도 안 바꿔도 로그인은 그대로 동작한다.
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
  }

  const creds = await fetchAdminCredentials();

  // 관리자 계정 확인
  const adminId = (!creds.migrationNeeded && creds.login_id) ? creds.login_id : ADMIN_EMAIL;
  let adminOk = false;
  if (email === adminId) {
    adminOk = (!creds.migrationNeeded && creds.login_password_hash)
      ? verifyPassword(password, creds.login_password_hash)
      : (password === ADMIN_PASSWORD);
  }
  if (adminOk) {
    const token = generateToken({ email, role: 'admin' });
    res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    return res.json({ success: true, role: 'admin' });
  }

  // 게스트 계정 확인 (guest_enabled가 명시적으로 false가 아닌 이상 기본 활성화)
  const guestEnabled = creds.migrationNeeded ? true : (creds.guest_enabled !== false);
  if (guestEnabled) {
    const guestId = (!creds.migrationNeeded && creds.guest_login_id) ? creds.guest_login_id : 'guest';
    let guestOk = false;
    if (email === guestId) {
      guestOk = (!creds.migrationNeeded && creds.guest_password_hash)
        ? verifyPassword(password, creds.guest_password_hash)
        : (password === 'guest');
    }
    if (guestOk) {
      const token = generateToken({ email, role: 'guest' });
      res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
      return res.json({ success: true, role: 'guest' });
    }
  }

  res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
});

app.post('/api/register-biometric', (req, res) => {
  if (!req.user || !req.user.email) {
    return res.status(401).json({ error: '인증되지 않은 사용자입니다.' });
  }
  const { email } = req.body;
  if (email !== req.user.email) {
    return res.status(400).json({ error: '이메일 정보가 일치하지 않습니다.' });
  }
  // 30일 유효한 생체인식 전용 서명 토큰 발급 (로그인 당시의 role을 그대로 이어받는다 — 게스트가
  // 생체인식을 등록해도 계속 조회 전용으로 유지되도록)
  const token = generateToken({ email, biometric: true, role: req.user.role || 'admin' }, 30 * 24 * 60 * 60 * 1000);
  return res.json({ success: true, token });
});

app.post('/api/login-biometric', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: '이메일 또는 생체인식 토큰이 없습니다.' });
  }
  const payload = verifyToken(token);
  if (payload && payload.email === email && payload.biometric === true) {
    const loginToken = generateToken({ email, role: payload.role || 'admin' });
    res.setHeader('Set-Cookie', `auth_token=${loginToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    return res.json({ success: true, role: payload.role || 'admin' });
  }
  res.status(401).json({ error: '생체인식 정보가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ success: true });
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
  res.redirect('/login.html');
});

// 현재 로그인 세션 정보 (관리자/게스트 여부 확인용 — 화면에서 조회 전용 배너 표시 등에 사용)
app.get('/api/session', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ email: req.user.email, role: req.user.role || 'admin' });
});

// 로그인 아이디/비밀번호 설정 조회 (비밀번호 해시는 절대 응답에 포함하지 않는다)
app.get('/api/users/login-settings', async (req, res) => {
  try {
    const creds = await fetchAdminCredentials();
    if (creds.migrationNeeded) {
      return res.json({ migration_needed: true, login_id: ADMIN_EMAIL, guest_login_id: 'guest', guest_enabled: true });
    }
    res.json({
      migration_needed: false,
      login_id: creds.login_id || ADMIN_EMAIL,
      guest_login_id: creds.guest_login_id || 'guest',
      guest_enabled: creds.guest_enabled !== false
    });
  } catch (err) {
    console.error('Failed to get login settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// 로그인 아이디/비밀번호 변경 (관리자 계정용 아이디/비밀번호는 본인 확인을 위해 current_password 필요,
// 게스트 계정은 관리자만 이 API에 접근 가능하므로(게스트는 checkAuth에서 쓰기 자체가 막힘) 별도 확인 없이 변경)
app.put('/api/users/login-settings', async (req, res) => {
  try {
    const { current_password, new_login_id, new_password, guest_login_id, new_guest_password, guest_enabled } = req.body || {};
    const creds = await fetchAdminCredentials();
    if (creds.migrationNeeded) {
      return res.status(400).json({
        error: 'members 테이블에 로그인 설정 컬럼이 없습니다. Supabase SQL Editor에서 다음을 실행하세요: ALTER TABLE members ADD COLUMN IF NOT EXISTS login_id text, ADD COLUMN IF NOT EXISTS login_password_hash text, ADD COLUMN IF NOT EXISTS guest_login_id text, ADD COLUMN IF NOT EXISTS guest_password_hash text, ADD COLUMN IF NOT EXISTS guest_enabled boolean;'
      });
    }

    const patch = {};

    // 관리자 아이디/비밀번호 변경 — 본인 확인을 위해 현재 비밀번호가 맞는지 먼저 검사
    if ((new_login_id !== undefined && String(new_login_id).trim()) || (new_password !== undefined && new_password)) {
      const currentOk = creds.login_password_hash
        ? verifyPassword(current_password || '', creds.login_password_hash)
        : (current_password === ADMIN_PASSWORD);
      if (!currentOk) {
        return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
      }
      if (new_login_id !== undefined && String(new_login_id).trim()) {
        patch.login_id = String(new_login_id).trim();
      }
      if (new_password !== undefined && new_password) {
        if (String(new_password).length < 4) {
          return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
        }
        patch.login_password_hash = hashPassword(new_password);
      }
    }

    // 게스트 계정 설정
    if (guest_login_id !== undefined && String(guest_login_id).trim()) {
      patch.guest_login_id = String(guest_login_id).trim();
    }
    if (new_guest_password !== undefined && new_guest_password) {
      if (String(new_guest_password).length < 4) {
        return res.status(400).json({ error: '게스트 비밀번호는 4자 이상이어야 합니다.' });
      }
      patch.guest_password_hash = hashPassword(new_guest_password);
    }
    if (guest_enabled !== undefined) {
      patch.guest_enabled = !!guest_enabled;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: '변경할 항목이 없습니다.' });
    }

    const { data, error } = await supabase
      .from('members')
      .update(patch)
      .eq('name', '강효근')
      .select('login_id, guest_login_id, guest_enabled')
      .single();
    if (error) throw error;

    res.json({
      success: true,
      login_id: data.login_id || ADMIN_EMAIL,
      guest_login_id: data.guest_login_id || 'guest',
      guest_enabled: data.guest_enabled !== false
    });
  } catch (err) {
    console.error('Failed to update login settings:', err);
    res.status(500).json({ error: err.message });
  }
});

// [2026-09-27] /api/run-migration-temp 제거: parish_no / churches.address 컬럼을 추가하던 일회성
// 마이그레이션 엔드포인트였는데, 로그인 없이 누구나 호출 가능(checkAuth 예외 목록)했고 DB 관리자
// 비밀번호가 코드에 그대로 적혀 있었다. 컬럼은 이미 추가되어 있어 더 이상 필요 없다.

app.get('/api/members/search', async (req, res) => {
  try {
    // [성능 개선 및 Cloudflare 522 타임아웃 방지]
    // 성도 등록/수정/삭제 시 개별 프로필 동기화가 이미 수행되므로, 검색 API를 호출할 때마다 전체 성도를 동기화하는 무거운 로직은 제외합니다.
    // await syncAllMembersProfilePromise();

    const { q, gender, category, district, status: st, parish, church, marital_status, member_status: ms } = req.query;

    // [2026-07-07 페이지네이션] 필터 없이(또는 넓은 필터로) 조회하면 PostgREST 기본 1000행
    // 제한에 걸려 성도가 1000명을 넘는 순간부터 뒤쪽 성도가 조용히 잘려나간다.
    // fetchAllRows는 매 페이지마다 새 쿼리 객체가 필요하므로, 필터 적용 로직을 함수로 감싸서
    // 매 호출마다 동일한 필터를 재적용한 뒤 .range(from, to)를 붙인다.
    const buildQuery = (from, to) => {
      let query = supabase.from('members').select('*').neq('name', ANONYMOUS_COUNSELING_NAME);  // 익명 상담 기록용 행 제외(성도 아님)

      if (st === 'inactive') {
        query = query.eq('status', 'inactive');
      } else if (st === 'all' || st === '전체') {
        // 전체 조회
      } else {
        query = query.eq('status', 'active');
      }

      // 기본적으로 member_status가 'member'인 성도만 노출 (명시적으로 'all'이나 'evangelism'을 요구하지 않는 한)
      if (ms === 'evangelism') {
        query = query.eq('member_status', 'evangelism');
      } else if (ms === 'all') {
        // 전도대상 + 성도 모두 포함
      } else {
        // 기본값: 일반 성도만
        query = query.eq('member_status', 'member');
      }

      if (gender && gender !== '전체') {
        query = query.eq('bs', gender);
      }
      if (category && category !== '전체') {
        const catClean = category.replace(/회$/, '');
        query = query.ilike('category', `%${catClean}%`);
      }
      if (district && district !== '전체') {
        query = query.eq('district', district);
      }
      if (parish && parish !== '전체' && parish !== 'all') {
        query = query.eq('parish', parish);
      }
      if (church && church !== '전체') {
        query = query.eq('church', church);
      }
      if (marital_status && marital_status !== '전체') {
        if (marital_status === '기혼') {
          query = query.eq('marital_status', '기혼');
        } else if (marital_status === '미혼_미선택') {
          query = query.or('marital_status.is.null,marital_status.neq.기혼');
        }
      }
      if (q) {
        query = query.ilike('name', `%${q}%`);
      }

      // district/name만으로는 동률(tie)이 흔해 페이지 경계에서 순서가 흔들릴 수 있으므로
      // id를 최종 타이브레이커로 추가해 페이지 간 정렬을 안정적으로 유지한다.
      return query
        .order('district', { ascending: true })
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
    };

    const data = await fetchAllRows(buildQuery);
    res.json(data || []);
  } catch (err) {
    console.error('Search members error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 강효근 성도의 기본 소속 정보 + 관리자 설정 조회 API
// 반환: { church, parish, district, managed_districts, districts: ['581','582','583'] }
// districts = 번호 드롭다운/기본 모임 구분에 쓰이는 관리 구역 번호 목록.
//   1순위: members.managed_districts (관리자 설정 화면에서 편집, 예: "581,582,583")
//   2순위: 소속 교구(parish) 이름으로 districts 테이블 조회 (managed_districts 미설정 시)
//   ※ 하드코딩 581~583 fallback은 제거됨
app.get('/api/users/default-profile', async (req, res) => {
  try {
    let { data, error } = await supabase
      .from('members')
      .select('church, parish, district, managed_districts, calendar_feed_token')
      .eq('name', '강효근')
      .single();

    // managed_districts / calendar_feed_token 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
    let calendarMigrationNeeded = false;
    if (error && /calendar_feed_token/i.test(error.message || '')) {
      calendarMigrationNeeded = true;
      const retry = await supabase
        .from('members')
        .select('church, parish, district, managed_districts')
        .eq('name', '강효근')
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error && /managed_districts/i.test(error.message || '')) {
      const retry = await supabase
        .from('members')
        .select('church, parish, district')
        .eq('name', '강효근')
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;

    const row = data || {};
    let districts = String(row.managed_districts || '')
      .split(/[,\s/]+/)
      .map(s => s.replace(/[^0-9]/g, ''))
      .filter(Boolean);

    if (districts.length === 0 && row.parish) {
      try {
        const { data: parishes } = await supabase.from('parishes').select('id, name');
        const matched = (parishes || []).find(p => (p.name || '').trim() === row.parish.trim());
        if (matched) {
          const { data: ds } = await supabase.from('districts').select('name').eq('parish_id', matched.id);
          districts = (ds || [])
            .map(d => (d.name || '').replace(/[^0-9]/g, ''))
            .filter(Boolean);
        }
      } catch (fbErr) {
        console.warn('default-profile: districts fallback lookup failed:', fbErr.message);
      }
    }

    // 구글캘린더 연동용 비공개 토큰: 상담/심방 메모 등 민감정보가 포함된 피드이므로
    // 최초 조회 시 자동 발급해 저장한다 (없으면 /api/calendar/feed가 인증 없이 열려버림).
    let calendarFeedToken = row.calendar_feed_token || null;
    if (!calendarFeedToken && !calendarMigrationNeeded) {
      try {
        calendarFeedToken = crypto.randomBytes(16).toString('hex');
        await supabase.from('members').update({ calendar_feed_token: calendarFeedToken }).eq('name', '강효근');
      } catch (tokenErr) {
        console.warn('calendar_feed_token 자동 발급 실패:', tokenErr.message);
        calendarFeedToken = null;
      }
    }

    res.json({ ...row, districts, calendar_feed_token: calendarFeedToken, calendar_migration_needed: calendarMigrationNeeded });
  } catch (err) {
    console.error('Failed to get default profile:', err);
    res.json({ church: '서울중앙교회', parish: '부곡교구', district: '581구역', districts: [], calendar_feed_token: null });
  }
});

// 구글캘린더 연동 토큰 재발급 (기존 URL로의 접근을 즉시 차단하고 새 토큰을 발급)
app.post('/api/users/regenerate-calendar-token', async (req, res) => {
  try {
    const newToken = crypto.randomBytes(16).toString('hex');
    const { data, error } = await supabase
      .from('members')
      .update({ calendar_feed_token: newToken })
      .eq('name', '강효근')
      .select('calendar_feed_token')
      .single();
    if (error) {
      if (/calendar_feed_token/i.test(error.message || '')) {
        return res.status(400).json({
          error: 'members 테이블에 calendar_feed_token 컬럼이 없습니다. Supabase SQL Editor에서 다음을 실행하세요: ALTER TABLE members ADD COLUMN IF NOT EXISTS calendar_feed_token text;'
        });
      }
      throw error;
    }
    res.json({ calendar_feed_token: data.calendar_feed_token });
  } catch (err) {
    console.error('Failed to regenerate calendar token:', err);
    res.status(500).json({ error: err.message });
  }
});

// 관리자 설정 저장 API (강효근 행의 관리 교회/교구/구역 목록 갱신)
// body: { church?, parish?, managed_districts? }  — 전달된 필드만 갱신
app.put('/api/users/default-profile', async (req, res) => {
  try {
    const { church, parish, managed_districts } = req.body || {};
    const patch = {};
    if (church !== undefined) patch.church = String(church).trim();
    if (parish !== undefined) patch.parish = String(parish).trim();
    if (managed_districts !== undefined) patch.managed_districts = String(managed_districts).trim();
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: '갱신할 필드가 없습니다.' });
    }

    const { data, error } = await supabase
      .from('members')
      .update(patch)
      .eq('name', '강효근')
      .select('church, parish, district, managed_districts')
      .single();

    if (error) {
      if (/managed_districts/i.test(error.message || '')) {
        return res.status(400).json({
          error: 'members 테이블에 managed_districts 컬럼이 없습니다. Supabase SQL Editor에서 다음을 실행하세요: ALTER TABLE members ADD COLUMN IF NOT EXISTS managed_districts text;'
        });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    console.error('Failed to update default profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// 출석 의무 대상 판정 규칙 (2026-07-05 통일)
// 이 함수는 public/js/member-profile.js의 window.isMandatoryMeeting과
// 반드시 동일한 규칙을 유지해야 한다 (성도 상세 모달 출석 탭 vs 이 집계 API가
// 서로 다른 출석률을 보여주는 문제를 막기 위함). 한쪽만 고치지 말 것.
//
// - 구역모임: 구역이 배정된 성도 전원 (구역 번호 일치)
// - 조모임(구역 단위): 그 구역 소속 "어머니회/은장회" 자매만
// - 교구전체모임: 모임을 만든 리더와 같은 교회(+서울중앙교회면 교구까지) 소속 성도 전원
// - 전체조모임: 위와 동일한 소속 범위의 "어머니회/은장회" 자매
// - 교구청년모임/청년모임: 위와 동일한 소속 범위의 "청년회" (id=270은 청년모임 참석률이
//   낮아 의도적으로 제외된 케이스로 확인됨 - 2026-07-05 사용자 확인, 그대로 유지)
// - 교구형제모임: 위와 동일한 소속 범위의 "봉사회" 형제 (예전엔 형제이기만 하면 다 포함되던 버그를 수정)
// - 교구임원모임: "그 모임이 열린 날짜" 기준으로 직분(position)이 있었던 성도
//   (2026-07-05 수정: 예전엔 회원의 "현재" position 값 하나로 과거 모임까지 전부 판정해서,
//    임기 중간에 임명된 사람은 임명 전에 열린 임원모임까지 참석 의무 대상으로 잘못 잡혔었음.
//    인적사항(POSITION/POSITION_DISMISS) 이력을 모임 날짜 시점까지만 재생해서 판정하도록 변경)
// ------------------------------------------------------------------
function hasPositionAsOf(positionRecords, dateStr) {
  if (!positionRecords || positionRecords.length === 0) return false;
  const sorted = [...positionRecords].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });
  let positions = [];
  sorted.forEach(rec => {
    if (rec.date > dateStr) return; // 모임 날짜 이후에 벌어진 임명/면직은 아직 반영되지 않은 것으로 취급
    if (rec.status === 'POSITION') {
      const newPos = (rec.remark || '').split(',').map(p => p.trim()).filter(p => p);
      positions = Array.from(new Set([...positions, ...newPos]));
    } else if (rec.status === 'POSITION_DISMISS') {
      const cleaned = (rec.remark || '').replace(/\[면직\]\s*|면직\s*/g, '');
      const removePos = cleaned.split(',').map(p => p.trim()).filter(p => p);
      positions = positions.filter(p => !removePos.includes(p));
    }
  });
  return positions.length > 0;
}

function isMandatoryMeeting(member, meeting, leaderProfile, positionRecords) {
  const mType = meeting.type || '';
  const mDistMatch = mType.match(/\d+/);
  const mDistNum = mDistMatch ? mDistMatch[0] : null;
  const memDistNum = (member.district || '').replace(/[^0-9]/g, '');
  const isGroupEligibleSister = member.bs === 'S' && (member.category === '어머니회' || member.category === '은장회');

  // 구역모임: 구역 배정자 전원
  if (mType.includes('구역모임')) {
    return !mDistNum || mDistNum === memDistNum;
  }

  // 조모임(구역 단위, "전체조모임"은 제외): 어머니회/은장회 자매만
  if (mType.includes('조모임') && !mType.includes('전체조모임')) {
    if (!isGroupEligibleSister) return false;
    return !mDistNum || mDistNum === memDistNum;
  }

  // 교구 단위 모임 (교구전체모임, 교구형제모임, 전체조모임, 교구임원모임, 청년모임 등):
  // 모임을 만든 리더와 같은 교회(+서울중앙교회면 교구까지)에 속한 성도만 대상.
  const isParishMeeting = mType.includes('교구전체모임') || mType.includes('교구형제모임') || mType.includes('전체조모임') || mType.includes('교구임원모임') || mType.includes('청년');

  if (isParishMeeting) {
    if (member.member_status === 'evangelism') return false;
    const effectiveChurch = meeting.leader_church_snapshot || (leaderProfile && leaderProfile.church) || null;
    const effectiveParish = meeting.leader_parish_snapshot || (leaderProfile && leaderProfile.parish) || null;
    if (effectiveChurch) {
      if ((member.church || '').trim() !== effectiveChurch.trim()) return false;
      if (effectiveChurch.trim() === '서울중앙교회' && effectiveParish &&
          (member.parish || '').trim() !== effectiveParish.trim()) return false;
    }
  }

  if (mType.includes('교구전체모임')) return true;
  if (mType.includes('교구형제모임')) return member.bs === 'B' && member.category === '봉사회';
  if (mType.includes('전체조모임')) return isGroupEligibleSister;
  if (mType.includes('교구임원모임')) return hasPositionAsOf(positionRecords, meeting.date);
  if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

  return false;
}

app.get('/api/members/attendance-rates', async (req, res) => {
  try {
    const today = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

    // [2026-08-27] '상담'(counseling) 타입 meeting은 POST /api/counseling이 등록 편의상
    // attendance row(is_present:1)를 함께 만들어 두는데, 이게 여기서 걸러지지 않으면
    // "상담 받은 횟수"가 "출석한 횟수"로 잘못 합산되어 성도현황 표의 출석률이 부풀려진다.
    // 클라이언트 쪽 member-profile.js의 renderAttendanceTab은 이미 '상담'을 제외하고 있으므로,
    // 여기서도 동일하게 제외해서 성도현황 표 ↔ 성도 상세정보 출석 히스토리 수치를 일치시킨다.
    // (상담과 출석은 다른 개념 — 상담 기록은 counseling_history 쪽에서 별도로 집계된다.)
    let { data: meetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, type, date, leader_church_snapshot, leader_parish_snapshot')
      .neq('type', '심방')
      .neq('type', '설교')
      .neq('type', '외부설교')
      .neq('type', '상담')
      .lte('date', today);

    // leader_*_snapshot 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
    if (meetErr && /leader_church_snapshot|leader_parish_snapshot/i.test(meetErr.message || '')) {
      const retry = await supabase
        .from('meetings')
        .select('id, type, date')
        .neq('type', '심방')
        .neq('type', '설교')
        .neq('type', '외부설교')
        .neq('type', '상담')
        .lte('date', today);
      meetings = retry.data;
      meetErr = retry.error;
    }
    if (meetErr) throw meetErr;

    const meetingMap = {};
    meetings.forEach(m => {
      meetingMap[m.id] = m;
    });

    // [2026-07-07 페이지네이션] 성도/직분이력 전체 조회 — 필터 없이 조회하면 1000행을 넘는
    // 순간부터 조용히 잘려나가 출석률 분모(성도 수)가 틀어진다. fetchAllRows로 전체 페이지 조회.
    const members = await fetchAllRows((from, to) =>
      supabase
        .from('members')
        .select('id, name, category, bs, district, position, church, parish, member_status')
        .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
        .range(from, to)
    );

    // 교구전체모임 의무 대상 판정용 폴백: 강효근의 "현재" 소속 교회/교구
    // (각 모임에 leader_church_snapshot/leader_parish_snapshot이 있으면 isMandatoryMeeting에서 그걸 우선 사용하고,
    //  스냅샷이 없는 과거 모임에 한해서만 이 현재 값으로 대체 계산한다)
    const leaderProfile = await fetchLeaderChurchParish();

    // 교구임원모임 의무 대상 판정을 "모임 날짜 시점" 기준으로 정확히 하기 위한 직분 이력 일괄 조회
    // (2026-07-05: isMandatoryMeeting의 날짜 인지 판정과 함께 추가)
    const positionRecordsRaw = await fetchAllRows((from, to) =>
      supabase
        .from('member_records')
        .select('id, member_id, date, status, remark')
        .in('status', ['POSITION', 'POSITION_DISMISS'])
        .range(from, to)
    );
    const positionRecordsByMember = {};
    (positionRecordsRaw || []).forEach(r => {
      if (!positionRecordsByMember[r.member_id]) positionRecordsByMember[r.member_id] = [];
      positionRecordsByMember[r.member_id].push(r);
    });

    let allAttendance = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: pageData, error: attErr } = await supabase
        .from('attendance')
        .select('meeting_id, member_id, is_present')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (attErr) throw attErr;

      allAttendance = allAttendance.concat(pageData || []);
      if (!pageData || pageData.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    const memberAtts = {};
    allAttendance.forEach(a => {
      const mt = meetingMap[a.meeting_id];
      if (mt) {
        if (!memberAtts[a.member_id]) memberAtts[a.member_id] = [];
        memberAtts[a.member_id].push({
          meeting_id: a.meeting_id,
          is_present: a.is_present,
          type: mt.type,
          date: mt.date,
          leader_church_snapshot: mt.leader_church_snapshot || null,
          leader_parish_snapshot: mt.leader_parish_snapshot || null
        });
      }
    });

    const rates = {};
    members.forEach(member => {
      const atts = memberAtts[member.id] || [];
      const filtered = atts.filter(h => {
        return isMandatoryMeeting(member, h, leaderProfile, positionRecordsByMember[member.id]) || h.is_present;
      });

      const totalCount = filtered.length;
      const attendCount = filtered.filter(h => h.is_present).length;
      const ratePercent = totalCount > 0 ? Math.round((attendCount / totalCount) * 100) : 0;

      rates[member.id] = {
        ratePercent,
        attendCount,
        totalCount
      };
    });

    res.json(rates);
  } catch (err) {
    console.error('Get attendance rates error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    let { data: attendanceData, error: attError } = await supabase
      .from('attendance')
      .select(`
        meeting_id,
        is_present,
        testimony_snapshot,
        meetings (
          title,
          date,
          type,
          memo,
          leader_church_snapshot,
          leader_parish_snapshot
        )
      `)
      .eq('member_id', id);

    // leader_*_snapshot 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
    if (attError && /leader_church_snapshot|leader_parish_snapshot/i.test(attError.message || '')) {
      const retry = await supabase
        .from('attendance')
        .select(`
          meeting_id,
          is_present,
          testimony_snapshot,
          meetings (
            title,
            date,
            type,
            memo
          )
        `)
        .eq('member_id', id);
      attendanceData = retry.data;
      attError = retry.error;
    }

    if (attError) throw attError;

    const history = attendanceData.map(a => ({
      meeting_id: a.meeting_id,
      title: a.meetings?.title || '',
      date: a.meetings?.date || '',
      type: a.meetings?.type || '',
      memo: a.meetings?.memo || '',
      is_present: a.is_present,
      testimony_snapshot: a.testimony_snapshot,
      leader_church_snapshot: a.meetings?.leader_church_snapshot || null,
      leader_parish_snapshot: a.meetings?.leader_parish_snapshot || null
    })).sort((a, b) => b.date.localeCompare(a.date));

    const { data: member, error: memError } = await supabase
      .from('members')
      .select('*')
      .eq('id', id)
      .single();

    if (memError) throw memError;

    let family = [];
    if (member?.family_id) {
      const { data: familyData, error: famError } = await supabase
        .from('members')
        .select('id, name, district, bs')
        .eq('family_id', member.family_id)
        .neq('id', id);

      if (famError) throw famError;
      family = familyData || [];
    }

    // isMandatoryMeeting의 교구 단위 모임 판정용 폴백 (attendance-rates와 동일 기준)
    const leaderProfile = await fetchLeaderChurchParish();

    res.json({ member, history, family, leaderProfile });
  } catch (err) {
    console.error('Get member history error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/family-search', async (req, res) => {
  const { q } = req.query;
  try {
    const { data, error } = await supabase
      .from('members')
      .select('id, name, district, bs, family_id')
      .ilike('name', `%${q}%`)
      .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
      .eq('status', 'active')
      .limit(10);
      
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members', async (req, res) => {
  const b = req.body;
  try {
    let fid = (b.family_id && b.family_id !== '') ? parseInt(b.family_id) : null;
    if (!fid && b.family_relation) {
        const { data: maxRow, error: maxErr } = await supabase
          .from('members')
          .select('family_id')
          .not('family_id', 'is', null) // [2026-09-27] NULL 제외: NULL이 정렬 맨 앞에 와서 최댓값이 0으로 계산되던 버그 (새 family_id가 1로 충돌)
          .order('family_id', { ascending: false })
          .limit(1);
        if (maxErr) throw maxErr;
        const maxFid = maxRow && maxRow.length > 0 ? (maxRow[0].family_id || 0) : 0;
        fid = maxFid + 1;
    }

    const birthYearVal = (b.birth_year === '' || b.birth_year === undefined || b.birth_year === null) ? null : parseInt(b.birth_year);
    
    // 가족관계에 남편이나 아내가 포함되어 있다면 결혼 상태를 자동으로 '기혼'으로 설정
    let maritalStatusVal = b.marital_status;
    if (b.family_relation && (b.family_relation.includes('남편') || b.family_relation.includes('아내'))) {
      maritalStatusVal = '기혼';
    }
    
    const insertData = {
      name: b.name,
      category: b.category,
      birth_year: birthYearVal,
      bs: b.bs,
      district: b.district,
      salvation_date: b.salvation_date || null,
      phone: b.phone,
      address: b.address,
      family_relation: b.family_relation,
      testimony: b.testimony,
      position: b.position,
      church_service: b.church_service,
      status: b.status || 'active',
      family_id: fid,
      church: b.church || '교회정보없음',
      parish: b.parish || '교구정보없음',
      district: b.district || '구역정보없음',
      marital_status: maritalStatusVal
    };
    // [2026-08-27] "성도 정보 수정" 모달에 성도/전도대상 구분 필드가 새로 생기면서 등록 폼에도
    // 함께 전송된다. body에 실제로 포함된 경우에만 반영해서(생략 시 DB 기본값 'member' 유지),
    // 이 값을 안 보내는 다른 호출부(엑셀 일괄 등록 등)가 있어도 조용히 덮어쓰지 않도록 한다.
    if (b.member_status !== undefined && b.member_status !== '') {
      insertData.member_status = b.member_status;
    }

    const { data, error } = await supabase
      .from('members')
      .insert(insertData)
      .select('id')
      .single();
      
    if (error) throw error;
    const newId = data.id;

    // [2026-07-07 감사 보고서 8번 항목] 프론트가 가족 검색에서 특정 사람을 고르면 "이름(관계)"
    // 문자열 -> 그 사람의 member_id 매핑을 함께 보낸다. 있으면 syncFamilyLinks가 이름 대신
    // 이 id로 정확히 매칭해 동명이인 오연결을 막는다.
    let familyRelationIds = {};
    try { familyRelationIds = b.family_relation_ids ? JSON.parse(b.family_relation_ids) : {}; } catch (e) { familyRelationIds = {}; }

    syncFamilyLinks(newId, b.name, b.bs, b.family_relation, fid, async (err, finalFid) => {
      if (err) console.error('syncFamilyLinks error:', err);

      if (b.pendingRecords && Array.isArray(b.pendingRecords)) {
        const recordsToInsert = b.pendingRecords.map(rec => ({
          member_id: newId,
          date: rec.date,
          status: rec.status,
          remark: rec.remark
        }));

        if (recordsToInsert.length > 0) {
          const { error: recErr } = await supabase
            .from('member_records')
            .insert(recordsToInsert);
          if (recErr) console.error('Pending records insert error:', recErr);
        }
      }

      // [2026-07-07] syncMemberProfileFromRecords는 position/church_service를 오직
      // POSITION/SERVICE 기록으로만 재구성한다 (감사 보고서 7번 항목). 엑셀 일괄 등록처럼
      // pendingRecords 없이 position/church_service를 직접 채워 넣는 생성 경로에서는
      // 바로 아래 syncMemberProfileFromRecords 호출이 방금 넣은 값을 즉시 빈 값으로
      // 되돌려버렸으므로, 값이 있으면 대응하는 POSITION/SERVICE 기록을 먼저 만들어둔다.
      try {
        const initialRecords = [];
        const todayStr = new Date().toISOString().split('T')[0];
        const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
        const initialPositions = splitList(b.position);
        if (initialPositions.length > 0) {
          initialRecords.push({ member_id: newId, date: todayStr, status: 'POSITION', remark: initialPositions.join(', ') });
        }
        const initialServices = splitList(b.church_service);
        if (initialServices.length > 0) {
          initialRecords.push({ member_id: newId, date: todayStr, status: 'SERVICE', remark: initialServices.join(', ') });
        }
        if (initialRecords.length > 0) {
          const { error: initErr } = await supabase.from('member_records').insert(initialRecords);
          if (initErr) console.error('Initial position/service record insert error:', initErr);
        }
      } catch (initErr) {
        console.error('Initial position/service record sync failed:', initErr);
      }

      try {
        await syncMemberProfileFromRecords(newId);
      } catch (syncErr) {
        console.error('Initial sync error:', syncErr);
      }
      res.json({ id: newId, family_id: finalFid });
    }, familyRelationIds);
  } catch (err) {
    console.error('Create member error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/:id', async (req, res) => {
  const { id } = req.params; const b = req.body;
  try {
    let fid = (b.family_id && b.family_id !== '') ? parseInt(b.family_id) : null;
    if (!fid && b.family_relation && b.family_relation.trim() !== '') {
        const { data: maxRow, error: maxErr } = await supabase
          .from('members')
          .select('family_id')
          .not('family_id', 'is', null) // [2026-09-27] NULL 제외: NULL이 정렬 맨 앞에 와서 최댓값이 0으로 계산되던 버그 (새 family_id가 1로 충돌)
          .order('family_id', { ascending: false })
          .limit(1);
        if (maxErr) throw maxErr;
        const maxFid = maxRow && maxRow.length > 0 ? (maxRow[0].family_id || 0) : 0;
        fid = maxFid + 1;
    }

    const birthYearVal = (b.birth_year === '' || b.birth_year === undefined || b.birth_year === null) ? null : parseInt(b.birth_year);

    // 가족관계에 남편이나 아내가 포함되어 있다면 결혼 상태를 자동으로 '기혼'으로 설정
    let maritalStatusVal = b.marital_status;
    if (b.family_relation && (b.family_relation.includes('남편') || b.family_relation.includes('아내'))) {
      maritalStatusVal = '기혼';
    }

    const updateData = {
      name: b.name,
      category: b.category,
      birth_year: birthYearVal,
      bs: b.bs,
      district: b.district,
      salvation_date: b.salvation_date || null,
      phone: b.phone,
      address: b.address,
      family_relation: b.family_relation,
      testimony: b.testimony,
      position: b.position,
      church_service: b.church_service,
      status: b.status || 'active',
      family_id: fid,
      church: b.church,
      parish: b.parish,
      marital_status: maritalStatusVal
    };
    // [2026-08-27] "성도 정보 수정" 모달에 성도/전도대상(member_status) 구분 필드가 새로 생겼다.
    // 예전엔 이 화면이 이 값을 아예 안 보내서, 상담 등록 화면 말고는 전도대상 상태를 고칠 방법이
    // 없었다(잘못 전도대상으로 저장된 성도를 되돌릴 수도 없었음). body에 실제로 포함된 경우에만
    // 반영해서, 이 값을 보내지 않는 다른 PUT 호출부(엑셀 일괄 등록의 가족관계 갱신,
    // "교제안나옴" 처리 등)가 기존 값을 조용히 지워버리지 않도록 한다.
    if (b.member_status !== undefined && b.member_status !== '') {
      updateData.member_status = b.member_status;
    }

    // 소속 교회/교구/구역 + 직분/부서 변경 감지를 위해 "수정 전" 값을 먼저 조회
    // (반드시 update()보다 먼저 실행해야 함 — update 이후에 조회하면 이미 새 값으로 덮어써진 뒤라
    //  "변경 전"과 "변경 후"를 비교하는 것이 아니라 새 값끼리 비교하는 꼴이 되어 오작동할 수 있음)
    const { data: oldMemberBeforeUpdate, error: getOldErr } = await supabase
      .from('members')
      .select('church, parish, district, position, church_service, family_relation')
      .eq('id', id)
      .single();

    const { error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;

    // 소속 교회/교구/구역 + 직분/부서 변경 감지 및 자동 인적기록 생성
    // [2026-07-07] syncMemberProfileFromRecords는 position/church_service를 "기록으로만"
    // 처음부터 재구성하므로(감사 보고서 7번 항목), 수정 화면에서 직접 바꾼 직분·부서가
    // 대응하는 POSITION/SERVICE 기록 없이 저장되면 바로 다음 줄의 syncMemberProfileFromRecords
    // 호출에서 조용히 원복(대개 빈 값)돼 버렸다. church/parish/district와 동일하게, 바뀐
    // 항목만큼 기록을 자동 생성해 "기록이 항상 실제 값과 일치"하도록 맞춘다.
    const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
    try {
      const oldMember = oldMemberBeforeUpdate;

      if (!getOldErr && oldMember) {
        const todayStr = new Date().toISOString().split('T')[0];
        const autoRecords = [];

        // [2026-07-07] 일부 화면(엑셀 일괄 등록의 2단계 가족관계 갱신 등)은 이 PUT을 호출할 때
        // church/parish/district/position/church_service 중 일부 필드를 아예 body에 담지 않는다.
        // 예전에는 "안 보낸 값(undefined)"과 "기존 값"이 다르다는 이유로 그 필드가 지워진 것으로
        // 오인해 CHURCH_MOVE 등을 잘못된 빈 값으로 자동 기록해버리는 문제가 있었다.
        // 이제 body에 해당 필드가 실제로 존재할 때만("포함됐지만 빈 문자열"도 포함) 변경으로 간주한다.
        const churchProvided = b.church !== undefined;
        const parishProvided = b.parish !== undefined;
        const districtProvided = b.district !== undefined;

        if (churchProvided && oldMember.church !== b.church) {
          const remarkVal = b.church && b.church.includes('서울중앙교회')
            ? `${b.church} > ${b.parish || ''} > ${b.district || '미배정'}`
            : b.church;
          autoRecords.push({
            member_id: id,
            date: todayStr,
            status: 'CHURCH_MOVE',
            remark: remarkVal || ''
          });
        } else {
          if (parishProvided && oldMember.parish !== b.parish) {
            autoRecords.push({
              member_id: id,
              date: todayStr,
              status: 'PARISH_MOVE',
              remark: b.parish || ''
            });
          }
          if (districtProvided && oldMember.district !== b.district) {
            autoRecords.push({
              member_id: id,
              date: todayStr,
              status: 'DISTRICT',
              remark: b.district || ''
            });
          }
        }

        // 직분/부서도 마찬가지로 body에 실제로 포함된 경우에만 변경분을 기록으로 자동 반영한다.
        // (감사 보고서 7번 항목 — syncMemberProfileFromRecords가 기록만으로 재구성하므로,
        //  직접 바꾼 값이 기록으로 남지 않으면 바로 아래에서 조용히 원복되던 문제)
        if (b.position !== undefined) {
          const oldPositions = new Set(splitList(oldMember.position));
          const newPositions = new Set(splitList(b.position));
          const addedPositions = [...newPositions].filter(p => !oldPositions.has(p));
          const removedPositions = [...oldPositions].filter(p => !newPositions.has(p));
          if (addedPositions.length > 0) {
            autoRecords.push({ member_id: id, date: todayStr, status: 'POSITION', remark: addedPositions.join(', ') });
          }
          if (removedPositions.length > 0) {
            autoRecords.push({ member_id: id, date: todayStr, status: 'POSITION_DISMISS', remark: `[면직] ${removedPositions.join(', ')}` });
          }
        }

        if (b.church_service !== undefined) {
          const oldServices = new Set(splitList(oldMember.church_service));
          const newServices = new Set(splitList(b.church_service));
          const addedServices = [...newServices].filter(s => !oldServices.has(s));
          const removedServices = [...oldServices].filter(s => !newServices.has(s));
          if (addedServices.length > 0) {
            autoRecords.push({ member_id: id, date: todayStr, status: 'SERVICE', remark: addedServices.join(', ') });
          }
          if (removedServices.length > 0) {
            autoRecords.push({ member_id: id, date: todayStr, status: 'SERVICE_DISMISS', remark: `[면직] ${removedServices.join(', ')}` });
          }
        }

        if (autoRecords.length > 0) {
          await supabase.from('member_records').insert(autoRecords);
        }
      }
    } catch (autoErr) {
      console.error('Auto record sync failed:', autoErr);
    }

    await syncMemberProfileFromRecords(id);

    // [2026-07-07 감사 보고서 8번 항목] 프론트가 가족 검색에서 특정 사람을 고르면 "이름(관계)"
    // 문자열 -> 그 사람의 member_id 매핑을 함께 보낸다. 있으면 syncFamilyLinks가 이름 대신
    // 이 id로 정확히 매칭해 동명이인 오연결을 막는다.
    let familyRelationIds = {};
    try { familyRelationIds = b.family_relation_ids ? JSON.parse(b.family_relation_ids) : {}; } catch (e) { familyRelationIds = {}; }

    const finishMemberUpdate = async (finalFid) => {
      if (b.pendingRecords && Array.isArray(b.pendingRecords)) {
        const recordsToInsert = b.pendingRecords.map(rec => ({
          member_id: id,
          date: rec.date,
          status: rec.status,
          remark: rec.remark
        }));

        if (recordsToInsert.length > 0) {
          const { error: recErr } = await supabase
            .from('member_records')
            .insert(recordsToInsert);
          if (recErr) console.error('Pending records insert error:', recErr);
        }

        await syncMemberProfileFromRecords(id);
      }
      res.json({ status: 'success', family_id: finalFid });
    };

    // [2026-08-23] 저장하려는 가족관계 텍스트가 저장 전 값과 완전히 동일하면
    // (= 이번 저장에서 가족관계를 건드리지 않았다는 뜻) syncFamilyLinks의 무거운 작업
    // (활성 성도 전체 스캔 + 가족 구성원 전원 재저장)을 건너뛴다.
    // 이게 "가족이 이미 연결된 성도는 전화번호 하나만 고쳐도 매번 느리다"는 문제의
    // 핵심 원인이었다 — 예전엔 가족관계가 조금도 안 바뀌어도 매번 이 전체 동기화가 다시 돌았다.
    const familyRelationUnchanged = !getOldErr && oldMemberBeforeUpdate &&
      (b.family_relation || '').trim() === (oldMemberBeforeUpdate.family_relation || '').trim();

    if (familyRelationUnchanged) {
      await finishMemberUpdate(fid);
    } else {
      syncFamilyLinks(id, b.name, b.bs, b.family_relation, fid, async (err, finalFid) => {
        if (err) console.error('syncFamilyLinks error:', err);
        await finishMemberUpdate(finalFid);
      }, familyRelationIds);
    }
  } catch (err) {
    console.error('Update member error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/:id/records', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('member_records')
      .select('*')
      .eq('member_id', req.params.id)
      .order('date', { ascending: false });
      
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/members/:id/records', async (req, res) => {
  const { id } = req.params; const { date, status, remark } = req.body;
  try {
    const { data, error } = await supabase
      .from('member_records')
      .insert({ member_id: id, date, status, remark })
      .select('id')
      .single();
      
    if (error) throw error;
    
    await syncMemberProfileFromRecords(id);
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/records/:id', async (req, res) => {
  try {
    const { data: row, error: findError } = await supabase
      .from('member_records')
      .select('member_id')
      .eq('id', req.params.id)
      .single();
      
    if (findError || !row) return res.status(500).json({ error: 'Record not found' });
    const memberId = row.member_id;
    
    const { error: deleteError } = await supabase
      .from('member_records')
      .delete()
      .eq('id', req.params.id);
      
    if (deleteError) throw deleteError;
    
    await syncMemberProfileFromRecords(memberId);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/members/records/:id', async (req, res) => {
  const { id } = req.params;
  let { date, status, remark } = req.body;
  try {
    const { data: row, error: findError } = await supabase
      .from('member_records')
      .select('member_id, remark')
      .eq('id', id)
      .single();
    if (findError || !row) return res.status(500).json({ error: 'Record not found' });
    const memberId = row.member_id;

    // COUNSELING 기록은 상담 관리 포맷([상담] ... (비고: ...))을 보존/적용
    // 프론트에서 순수 내용만 보내줄 수도 있으므로, 포맷이 없으면 자동으로 감싸줌
    if (status === 'COUNSELING' && remark) {
      if (!remark.startsWith('[상담]') && !remark.startsWith('[lead:')) {
        // 기존 remark에서 (비고: ...) 부분을 추출해 보존
        const oldRemark = row.remark || '';
        const bigoMatch = oldRemark.match(/\(비고:\s*(.*?)\)\s*$/);
        const oldBigo = bigoMatch ? bigoMatch[1] : '';
        remark = `[상담] ${remark.trim()}`;
        if (oldBigo) remark += ` (비고: ${oldBigo})`;
      }
    }
    const { error: updateError } = await supabase
      .from('member_records')
      .update({ date, status, remark })
      .eq('id', id);
      
    if (updateError) throw updateError;
    
    await syncMemberProfileFromRecords(memberId);
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Batch update sort_order
app.post('/api/members/sort-order', async (req, res) => {
    const { order } = req.body; // Array of { id, sort_order }
    if (!order || !Array.isArray(order)) return res.status(400).json({ error: 'Invalid data' });

    try {
        await Promise.all(order.map(item => 
            supabase
                .from('members')
                .update({ sort_order: item.sort_order })
                .eq('id', item.id)
        ));
        res.json({ status: 'success' });
    } catch (err) {
        console.error('Sort order error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// --- Organizational API ---
// 성도들이 등록되어 있는 활성 교회 목록만 반환 (사이드바 및 메인 조회용)
app.get('/api/churches', async (req, res) => {
  try {
      const { data: memberChurches, error: memErr } = await supabase
          .from('members')
          .select('church')
          .not('church', 'is', null)
          .not('church', 'eq', '')
          .neq('name', ANONYMOUS_COUNSELING_NAME);  // 익명 상담 기록용 행 제외(성도 아님)
      
      if (memErr) throw memErr;
      
      const activeNames = Array.from(new Set(memberChurches.map(m => m.church).filter(Boolean)));
      if (activeNames.length === 0) {
          activeNames.push('서울중앙교회');
      }
      
      const { data, error } = await supabase
          .from('churches')
          .select('*')
          .in('name', activeNames)
          .order('name', { ascending: true });
          
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// 전체 교회 목록 반환 (신규 성도 추가/수정 모달용)
app.get('/api/churches/all', async (req, res) => {
  try {
      const { data, error } = await supabase
          .from('churches')
          .select('*')
          .order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// ============================================================
// [2026-09-27] 교회현황 "전도인 현황" — 교회별 담임목사·부목사·전도사 자동 연동
// 출처: 로그인 없이 볼 수 있는 공개 페이지 church.jbch.org/guide/organization.php?chId=<교회번호>
// (robots.txt 전체 허용 확인). 교회번호는 churches.jbch_ch_id
// (migrations/2026-09-27_church_staff.sql 에서 235곳 연결).
//
// 동작:
//  - 교회현황에서 교회를 열었을 때 한 번도 안 가져왔거나 6일이 지났으면 그 자리에서 가져온다.
//  - "지금 업데이트" 버튼(관리자)으로 즉시 다시 가져올 수 있다.
//  - 매일 새벽 크론이 6일 넘게 안 가져온 교회부터 최대 60곳씩 다시 가져온다 → 모든 교회가 주 1회 갱신.
//  - 이전 명단과 비교해 부임/이임/직분 변경을 church_staff_changes에 남긴다(인사이동 추적).
// 안전장치:
//  - 페이지 구조가 바뀌어 목회자 영역을 못 찾거나, 기존엔 명단이 있었는데 0명으로 읽히면
//    기존 명단을 지우지 않고 staff_sync_error에 사유만 기록한다(잘못된 빈 명단으로 덮어쓰기 방지).
// ============================================================
const JBCH_STAFF_STALE_DAYS = 6;
const JBCH_STAFF_CRON_BATCH = 60;
const jbchOrganizationUrl = (chId) => `https://church.jbch.org/guide/organization.php?chId=${encodeURIComponent(chId)}`;

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function htmlToText(s) {
  return decodeHtmlEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// organization.php HTML → [{ role, jbch_person_id, name, title, duties, photo_url, sort_order }]
// 목회자 영역(id="preacher")을 못 찾으면 null (= 구조 변경/오류, 기존 데이터 유지)
function parseJbchOrganization(html) {
  // 원본 HTML은 속성에 작은따옴표/큰따옴표/따옴표 없음이 섞여 있어 모두 허용한다.
  const start = html.search(/id=["']?preacher["'\s>]/i);
  if (start < 0) return null;
  let end = html.length;
  const rest = html.slice(start + 1);
  for (const marker of [/id=["']?duty["'\s>]/i, /id=["']?staff["'\s>]/i]) {
    const i = rest.search(marker);
    if (i >= 0 && start + 1 + i < end) end = start + 1 + i;
  }
  const section = html.slice(start, end);
  const staff = [];
  // 역할 제목: <h5 class="... subtitle">담임목사</h5> / 부목사 / 전도사 ...
  const roleParts = section.split(/<h5[^>]*\bsubtitle\b[^>]*>/i).slice(1);
  roleParts.forEach(part => {
    const roleEnd = part.indexOf('</h5>');
    if (roleEnd < 0) return;
    const role = htmlToText(part.slice(0, roleEnd));
    if (!role) return;
    const cards = part.slice(roleEnd).split(/<div[^>]*class=["'][^"']*\bpost-org\b[^"']*["'][^>]*>/i).slice(1);
    cards.forEach(card => {
      const nameMatch = card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      if (!nameMatch) return;
      const full = htmlToText(nameMatch[1]);
      if (!full) return;
      const tm = full.match(/^(.*?)\s*(담임목사|목사|전도사|선교사|강도사)$/);
      const name = (tm && tm[1].trim()) ? tm[1].trim() : full;
      const title = tm ? tm[2] : null;
      const idMatch = card.match(/name=["']?ids["']?\s+value=["']?(\d+)/i);
      const imgMatch = card.match(/<img[^>]*src=["']([^"']+)["']/i);
      const duties = [...card.matchAll(/<div[^>]*class=["'][^"']*\blabel\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
        .map(m => htmlToText(m[1]))
        .filter(Boolean);
      staff.push({
        role,
        jbch_person_id: idMatch ? parseInt(idMatch[1], 10) : null,
        name,
        title,
        duties: duties.join(', '),
        photo_url: imgMatch ? decodeHtmlEntities(imgMatch[1]) : null,
        sort_order: staff.length
      });
    });
  });
  return staff;
}

const staffKey = (s) => (s.jbch_person_id ? `id:${s.jbch_person_id}` : `nm:${s.name}`);

// 교회 한 곳의 명단을 다시 가져와 저장. 반환: { ok, count, changes, error }
async function syncChurchStaff(church) {
  const nowIso = new Date().toISOString();
  const recordError = async (msg) => {
    await supabase.from('churches').update({ staff_sync_error: msg, staff_synced_at: nowIso }).eq('id', church.id);
    return { ok: false, error: msg };
  };
  if (!church.jbch_ch_id) return { ok: false, error: '교회 안내 사이트 교회번호(jbch_ch_id)가 연결되지 않았습니다.' };

  let html;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(jbchOrganizationUrl(church.jbch_ch_id), {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (church-app staff sync; weekly)' }
    });
    clearTimeout(timer);
    if (!r.ok) return await recordError(`교회 안내 페이지 응답 오류 (HTTP ${r.status})`);
    html = await r.text();
  } catch (e) {
    return await recordError(`교회 안내 페이지를 불러오지 못했습니다: ${e.name === 'AbortError' ? '시간 초과' : e.message}`);
  }

  const parsed = parseJbchOrganization(html);
  if (parsed === null) return await recordError('교회 안내 페이지에서 목회자 영역을 찾지 못했습니다 (페이지 구조 변경 가능성).');

  const { data: oldRows, error: oldErr } = await supabase
    .from('church_staff').select('jbch_person_id, role, name, title').eq('church_id', church.id);
  if (oldErr) throw oldErr;
  const old = oldRows || [];

  if (parsed.length === 0 && old.length > 0) {
    return await recordError('목회자가 0명으로 읽혔습니다. 기존 명단을 유지합니다 (확인 필요).');
  }

  // 변경 내역 계산 (처음 가져올 때는 기록하지 않음 — 전원이 '부임'으로 찍히는 것 방지)
  const changes = [];
  if (church.staff_synced_at && old.length > 0) {
    const oldMap = new Map(old.map(s => [staffKey(s), s]));
    const newMap = new Map(parsed.map(s => [staffKey(s), s]));
    parsed.forEach(s => {
      const o = oldMap.get(staffKey(s));
      if (!o) changes.push({ change_type: 'added', jbch_person_id: s.jbch_person_id, name: s.name, title: s.title, old_role: null, new_role: s.role });
      else if (o.role !== s.role) changes.push({ change_type: 'role_changed', jbch_person_id: s.jbch_person_id, name: s.name, title: s.title, old_role: o.role, new_role: s.role });
    });
    old.forEach(o => {
      if (!newMap.has(staffKey(o))) changes.push({ change_type: 'removed', jbch_person_id: o.jbch_person_id, name: o.name, title: o.title, old_role: o.role, new_role: null });
    });
  }

  // 새 명단을 먼저 넣고 → 옛 행 삭제 (중간에 실패해도 명단이 통째로 비는 순간이 없도록)
  const { data: inserted, error: insErr } = await supabase
    .from('church_staff')
    .insert(parsed.map(s => ({ ...s, church_id: church.id, updated_at: nowIso })))
    .select('id');
  if (insErr) throw insErr;
  const keepIds = (inserted || []).map(r => r.id);
  let del = supabase.from('church_staff').delete().eq('church_id', church.id);
  if (keepIds.length > 0) del = del.not('id', 'in', `(${keepIds.join(',')})`);
  const { error: delErr } = await del;
  if (delErr) throw delErr;

  if (changes.length > 0) {
    const { error: chErr } = await supabase
      .from('church_staff_changes')
      .insert(changes.map(c => ({ ...c, church_id: church.id, detected_at: nowIso })));
    if (chErr) console.error('church_staff_changes insert error:', chErr);
  }

  await supabase.from('churches').update({ staff_synced_at: nowIso, staff_sync_error: null }).eq('id', church.id);
  return { ok: true, count: parsed.length, changes: changes.length };
}

async function loadChurchStaffPayload(churchId) {
  const [{ data: church, error: chErr }, { data: staff, error: stErr }, { data: changes, error: cgErr }] = await Promise.all([
    supabase.from('churches').select('id, name, jbch_ch_id, staff_synced_at, staff_sync_error').eq('id', churchId).single(),
    supabase.from('church_staff').select('role, name, title, duties, photo_url, jbch_person_id, sort_order').eq('church_id', churchId).order('sort_order', { ascending: true }),
    supabase.from('church_staff_changes').select('change_type, name, title, old_role, new_role, detected_at')
      .eq('church_id', churchId)
      .gte('detected_at', new Date(Date.now() - 180 * 86400000).toISOString())
      .order('detected_at', { ascending: false })
      .limit(30)
  ]);
  if (chErr) throw chErr;
  if (stErr) throw stErr;
  if (cgErr) throw cgErr;
  return {
    church_id: church.id,
    church_name: church.name,
    jbch_ch_id: church.jbch_ch_id,
    source_url: church.jbch_ch_id ? jbchOrganizationUrl(church.jbch_ch_id) : null,
    synced_at: church.staff_synced_at,
    sync_error: church.staff_sync_error,
    staff: staff || [],
    changes: changes || []
  };
}

// 교회 한 곳의 전도인 현황 조회 (한 번도 안 가져왔으면 이 자리에서 가져옴)
app.get('/api/churches/:id/staff', async (req, res) => {
  try {
    const churchId = parseInt(req.params.id, 10);
    if (!churchId) return res.status(400).json({ error: '잘못된 교회 id' });
    const { data: church, error } = await supabase
      .from('churches').select('id, jbch_ch_id, staff_synced_at').eq('id', churchId).single();
    if (error) throw error;
    // 한 번도 안 가져왔거나 6일 넘게 지났으면 이 자리에서 새로 가져온다(약 0.3초, 교회당 주 1회 정도).
    // 크론(CRON_SECRET)이 설정되지 않은 환경에서도 화면을 여는 것만으로 최신 상태가 유지되게 하기 위함.
    const stale = !church.staff_synced_at ||
      (Date.now() - new Date(church.staff_synced_at).getTime()) > JBCH_STAFF_STALE_DAYS * 86400000;
    if (church.jbch_ch_id && stale) {
      try { await syncChurchStaff(church); } catch (e) { console.error('inline staff sync failed:', e.message); }
    }
    res.json(await loadChurchStaffPayload(churchId));
  } catch (err) {
    console.error('GET /api/churches/:id/staff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// "지금 업데이트" — 관리자만 (게스트는 checkAuth에서 POST 차단)
app.post('/api/churches/:id/staff/sync', async (req, res) => {
  try {
    const churchId = parseInt(req.params.id, 10);
    if (!churchId) return res.status(400).json({ error: '잘못된 교회 id' });
    const { data: church, error } = await supabase
      .from('churches').select('id, jbch_ch_id, staff_synced_at').eq('id', churchId).single();
    if (error) throw error;
    const result = await syncChurchStaff(church);
    res.json({ result, ...(await loadChurchStaffPayload(churchId)) });
  } catch (err) {
    console.error('POST /api/churches/:id/staff/sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// [2026-09-27] GET /api/cron/sync-church-staff — 전도인 현황 정기 갱신 (vercel.json crons, 매일 새벽)
// 6일 넘게 안 가져온 교회부터 최대 JBCH_STAFF_CRON_BATCH곳씩 → 235곳 모두 약 주 1회 갱신.
// 상대 사이트 부담을 줄이려고 동시에 3곳씩만 가져온다.
app.get('/api/cron/sync-church-staff', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const requestToken = authHeader ? authHeader.replace('Bearer ', '') : req.query.key;
  if (!cronSecret || requestToken !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const staleBefore = new Date(Date.now() - JBCH_STAFF_STALE_DAYS * 86400000).toISOString();
    const { data: targets, error } = await supabase
      .from('churches')
      .select('id, name, jbch_ch_id, staff_synced_at')
      .not('jbch_ch_id', 'is', null)
      .or(`staff_synced_at.is.null,staff_synced_at.lt."${staleBefore}"`)
      .order('staff_synced_at', { ascending: true, nullsFirst: true })
      .limit(JBCH_STAFF_CRON_BATCH);
    if (error) throw error;

    const summary = { targets: (targets || []).length, ok: 0, failed: 0, changes: 0, errors: [] };
    const queue = [...(targets || [])];
    const worker = async () => {
      while (queue.length > 0) {
        const ch = queue.shift();
        try {
          const r = await syncChurchStaff(ch);
          if (r.ok) { summary.ok++; summary.changes += r.changes || 0; }
          else { summary.failed++; summary.errors.push(`${ch.name}: ${r.error}`); }
        } catch (e) {
          summary.failed++; summary.errors.push(`${ch.name}: ${e.message}`);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    console.log('[cron sync-church-staff]', JSON.stringify(summary));
    res.json(summary);
  } catch (err) {
    console.error('cron sync-church-staff error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// [2026-09-27] 성도 분포 지도 — 주소 → 좌표 변환(카카오) + 조회 API
// 원본: 전도사님이 주신 "성도분포도_만들기_v1.0.html"(엑셀 업로드 + 브라우저 변환 방식)을
// 프로그램 안으로 옮긴 것. 달라진 점:
//  - 카카오 REST 키는 브라우저가 아니라 서버 환경변수(KAKAO_REST_API_KEY)에만 둔다.
//  - 좌표는 서버가 한 번 변환해 members.geo_* 에 저장하고, 주소가 바뀐 성도만 다시 변환한다.
//    (geo_address = 좌표를 만들 때 쓴 주소. members.address와 다르면 "변환 대기"로 본다.)
//  - 시·군이 없는 주소(예: "푸르지오라포레 108동")는 기본 지역(설정 geo_default_regions,
//    기본값 경기 의왕시 → 수원시 → 화성시)을 앞에 붙여 차례로 찾는다. 그 지역 결과만 인정한다.
// ============================================================
const GEO_DEFAULT_REGIONS = ['경기 의왕시', '경기 수원시', '경기 화성시'];
const GEO_BATCH_ADDRESSES = 25;
const GEO_PROVINCES = '서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주';
const GEO_RE_PROV = `(?:[가-힣]+(?:특별자치도|특별자치시|특별시|광역시|도)|${GEO_PROVINCES})`;

// 주소 맨 앞의 광역/시·군을 찾는다. 예: "경기 의왕시 안골로 10" → { city:'경기 의왕시', must:'의왕시' }
function geoCityOf(a) {
  const s = String(a || '').trim();
  const m = new RegExp(`^(${GEO_RE_PROV})?\\s*([가-힣]{2,10}(?:시|군))(?![가-힣])`).exec(s);
  if (m && m[2]) return { city: [m[1], m[2]].filter(Boolean).join(' '), must: m[2] };
  const p = new RegExp(`^(${GEO_RE_PROV})(?![가-힣])`).exec(s);
  if (p) return { city: p[1], must: p[1].slice(0, 2) };
  return { city: '', must: '' };
}

// 주소에서 도로명+번호 / 지번(동+번호) / 아파트·건물명 / 동을 뽑는다.
// 우리 DB 주소는 "안골로10 고천파크루체이편한세상 108동 902호", "중앙샛길36-1 프라임그린빌103-301"처럼
// 띄어쓰기·시군이 제각각이라, 도로명/지번을 먼저 찾고 그 뒤에 붙은 부분에서만 동·호수를 떼어낸다
// (먼저 떼면 "골우물길19-5"의 번지 19-5가 호수로 오인돼 지워진다).
function geoParseAddr(a) {
  let s = String(a || '').replace(/\s+/g, ' ').trim();
  let dong = null, apt = null;
  for (const m of (s.match(/\(([^)]*)\)/g) || [])) {
    for (const t of m.slice(1, -1).split(',').map(x => x.trim()).filter(Boolean)) {
      if (dong === null && /(동|읍|면|리|가)$/.test(t)) dong = t;
      else if (apt === null) apt = t;
    }
  }
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().split(',')[0].trim();
  const stripUnit = (t) => String(t || '')
    .replace(/\s*\d+\s*동\s*\d+\s*호?\s*$/, '')   // 103동 1303호
    .replace(/\s*\d+\s*-\s*\d+\s*호?\s*$/, '')     // 103-301
    .replace(/\s*\d+\s*호\s*$/, '')                   // 1109호
    .replace(/\s*\d+\s*동\s*$/, '')                   // 101동
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .trim();
  const NOT_UNIT = '(?![\\d-]*\\s*(?:동|호)(?:[\\s\\d]|$))';
  const road = new RegExp('([가-힣A-Za-z0-9]+(?:로|길))\\s*(\\d+(?:-\\d+)?)' + NOT_UNIT).exec(s);
  const jibun = road ? null : new RegExp('([가-힣]+(?:동|읍|면|리|가))\\s+(\\d+(?:-\\d+)?)' + NOT_UNIT).exec(s);
  const base = road || jibun;
  let rest = base ? s.slice(base.index + base[0].length) : s;
  rest = stripUnit(rest);
  if (apt === null && rest && /[가-힣]{2,}/.test(rest)) apt = rest;
  const lead = base ? s.slice(0, base.index + base[0].length).trim() : '';
  const head = base ? [lead, apt && !s.includes('(') ? apt : ''].filter(Boolean).join(' ') : stripUnit(s);
  if (dong === null) {
    const d = /([가-힣]+(?:동|읍|면))(?![가-힣])/.exec(base ? lead : head);
    if (d) dong = d[1];
  }
  return {
    head,
    road: road ? `${road[1]} ${road[2]}` : null,
    jibun: jibun ? `${jibun[1]} ${jibun[2]}` : null,
    apt,
    dong
  };
}

async function kakaoLocal(path, query) {
  const url = `https://dapi.kakao.com/v2/local/search/${path}.json?size=5&query=${encodeURIComponent(query)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` }, signal: ctrl.signal });
    if (r.status === 401 || r.status === 403) {
      const t = await r.text();
      const e = new Error(`카카오 키 인증 실패 (${r.status}): ${t.slice(0, 150)}`);
      e.kakaoAuth = true;
      throw e;
    }
    if (!r.ok) return [];
    return (await r.json()).documents || [];
  } finally {
    clearTimeout(timer);
  }
}

// 결과 주소에 must(시·군)가 들어 있는 것만 인정 — 다른 도시의 같은 이름 아파트/동을 막는다.
function kakaoPickDoc(docs, must) {
  const ok = docs.filter(d => !must
    || (d.address_name || '').includes(must)
    || ((d.road_address || {}).address_name || '').includes(must));
  for (const d of ok) if (d.road_address && d.road_address.x) {
    return { lat: +d.road_address.y, lon: +d.road_address.x, dong: d.road_address.region_3depth_name || '',
             matched: d.road_address.address_name || d.address_name || '' };
  }
  for (const d of ok) if (d.x) {
    const dm = /([가-힣0-9]+(?:동|읍|면|가))(?=\s|$)/.exec(d.address_name || '');
    return { lat: +d.y, lon: +d.x,
             dong: (d.address && d.address.region_3depth_name) || d.region_3depth_name || (dm ? dm[1] : ''),
             matched: [d.place_name, d.road_address_name || d.address_name].filter(Boolean).join(' · ') };
  }
  return null;
}

// 주소 하나 → { lat, lon, precision: exact|near|approx, dong, apt, matched, region } 또는 null
async function geocodeMemberAddress(address, regions) {
  const { city, must } = geoCityOf(address);
  const p = geoParseAddr(address);
  const tries = city ? [{ prefix: city + ' ', must, region: null }]
    : regions.map(r => ({ prefix: r + ' ', must: geoCityOf(r).must || r, region: r }));
  const body = (t) => (city ? t.replace(city, '').trim() : t);
  for (const t of tries) {
    const q = (x) => (t.prefix + body(x)).replace(/\s+/g, ' ').trim();
    const steps = [];
    if (p.road) steps.push(['address', q(p.road), 'exact']);
    if (p.jibun) steps.push(['address', q(p.jibun), 'exact']);
    steps.push(['address', q(p.head), 'exact']);
    if (p.apt) steps.push(['keyword', q(p.apt), 'near']);
    steps.push(['keyword', q(p.head), 'near']);
    if (p.road) steps.push(['address', q(p.road.replace(/\s[\d-]+$/, '')), 'near']);
    if (p.dong) steps.push(['address', q(p.dong), 'approx']);
    const seen = new Set();
    for (const [kind, query, precision] of steps) {
      if (!query || query === t.prefix.trim() || seen.has(kind + query)) continue;
      seen.add(kind + query);
      const hit = kakaoPickDoc(await kakaoLocal(kind, query), t.must);
      await new Promise(r => setTimeout(r, 40));
      if (hit) return { ...hit, precision, apt: p.apt || '', dong: hit.dong || p.dong || '', region: t.region };
    }
  }
  return null;
}

async function loadGeoRegions() {
  try {
    const { data } = await supabase.from('settings').select('value').eq('key', 'geo_default_regions').maybeSingle();
    const v = data && data.value;
    const list = (Array.isArray(v) ? v : String(v || '').split(','))
      .map(s => String(s).trim()).filter(Boolean);
    if (list.length) return list;
  } catch (e) { /* 설정이 없으면 기본값 */ }
  return GEO_DEFAULT_REGIONS;
}

const DIST_MEMBER_COLS = 'id, name, bs, district, category, position, church_service, birth_year, address, church, parish, geo_lat, geo_lon, geo_precision, geo_address, geo_dong, geo_apt, geo_matched, geo_region, geo_updated_at';
const needsGeocode = (m) => {
  const addr = (m.address || '').trim();
  return !!addr && (m.geo_address || '') !== addr;
};

// [2026-09-27] 성도 분포는 "정식 성도" 중에서도 강효근(담당 전도사)이 현재 맡은 교회/교구 소속만 보여야 한다.
// 상담 중 새로 생성된 성도 행은 다른 교회·교구 소속이거나 소속 정보가 없을 수 있는데(member_status가 'member'로
// 기본 저장돼도), 그런 분들까지 지도/주소 확인 목록에 섞이면 안 된다. /api/visitation/status와 동일한 범위 규칙을 쓴다.
async function fetchDistributionMembers() {
  const { data: myProfile, error: profErr } = await supabase
    .from('members').select('church, parish').eq('name', '강효근').single();
  if (profErr) console.error('distribution scope profile lookup failed:', profErr);
  const myChurch = (myProfile && myProfile.church) || '서울중앙교회';
  const myParish = (myProfile && myProfile.parish) || '부곡교구';

  const rawMembers = await fetchAllRows((from, to) =>
    supabase.from('members').select(DIST_MEMBER_COLS)
      .eq('status', 'active')
      .eq('member_status', 'member')
      .neq('name', ANONYMOUS_COUNSELING_NAME)
      .order('id', { ascending: true })
      .range(from, to)
  );

  return (rawMembers || []).filter(m => (
    myChurch === '서울중앙교회'
      ? (m.church === myChurch && m.parish === myParish)
      : (m.church === myChurch)
  ));
}

// 성도 분포 지도용 데이터 (좌표는 현재 주소와 일치할 때만 내려준다 — 주소가 바뀌었으면 '변환 대기')
app.get('/api/distribution', async (req, res) => {
  try {
    const [members, regions] = await Promise.all([fetchDistributionMembers(), loadGeoRegions()]);
    let pending = 0;
    const out = members.map(m => {
      const addr = (m.address || '').trim();
      const fresh = addr && (m.geo_address || '') === addr;
      if (addr && !fresh) pending++;
      return {
        id: m.id, name: m.name, bs: m.bs, district: m.district, category: m.category,
        position: m.position, church_service: m.church_service, birth_year: m.birth_year, address: addr,
        lat: fresh && m.geo_precision !== 'fail' ? m.geo_lat : null,
        lon: fresh && m.geo_precision !== 'fail' ? m.geo_lon : null,
        precision: fresh ? m.geo_precision : (addr ? 'pending' : 'noaddr'),
        dong: fresh ? m.geo_dong : null, apt: fresh ? m.geo_apt : null,
        matched: fresh ? m.geo_matched : null, region: fresh ? m.geo_region : null
      };
    });
    res.json({ key_configured: !!process.env.KAKAO_REST_API_KEY, regions, pending, members: out });
  } catch (err) {
    console.error('GET /api/distribution error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 주소 → 좌표 변환 (관리자). 한 번에 주소 GEO_BATCH_ADDRESSES건씩 처리하고 남은 건수를 돌려준다.
// body: { retryFailed?: boolean, redo?: 'region' } — 실패(또는 기본 지역 추정) 주소를 변환 대기로 되돌린 뒤 다시 시도
app.post('/api/distribution/geocode', async (req, res) => {
  try {
    if (!process.env.KAKAO_REST_API_KEY) {
      return res.status(400).json({ error: '카카오 REST API 키가 설정되지 않았습니다 (Vercel 환경변수 KAKAO_REST_API_KEY).' });
    }
    // "못 찾은 주소 다시 찾기": 실패 표시를 지워 변환 대기로 되돌린 뒤 평소처럼 처리한다
    // (실패 건을 매번 다시 고르면 프론트의 반복 호출이 끝나지 않으므로 이 방식으로 한 번만 되돌림).
    if (req.body && (req.body.retryFailed || req.body.redo === 'region')) {
      const { error: rErr } = await supabase.from('members')
        .update({ geo_address: null }).eq('geo_precision', 'fail');
      if (rErr) throw rErr;
    }
    // 기본 지역 목록을 바꾼 뒤: 기본 지역으로 추정했던 주소들도 새 순서로 다시 찾는다.
    if (req.body && req.body.redo === 'region') {
      const { error: gErr } = await supabase.from('members')
        .update({ geo_address: null }).not('geo_region', 'is', null);
      if (gErr) throw gErr;
    }
    const [members, regions] = await Promise.all([fetchDistributionMembers(), loadGeoRegions()]);
    const todo = members.filter(m => needsGeocode(m));
    const byAddr = new Map();
    todo.forEach(m => { const a = m.address.trim(); if (!byAddr.has(a)) byAddr.set(a, []); byAddr.get(a).push(m.id); });
    const addrs = [...byAddr.keys()];
    const batch = addrs.slice(0, GEO_BATCH_ADDRESSES);
    const summary = { processed: 0, exact: 0, near: 0, approx: 0, fail: 0 };
    // 서버 함수 실행 시간 제한을 넘지 않도록 한 번 호출에 약 7초까지만 처리하고 나머지는 다음 호출로 넘긴다
    // (화면이 남은 건수가 0이 될 때까지 반복 호출한다).
    const started = Date.now();
    for (const addr of batch) {
      if (Date.now() - started > 7000) break;
      let hit = null;
      try {
        hit = await geocodeMemberAddress(addr, regions);
      } catch (e) {
        if (e.kakaoAuth) return res.status(400).json({ error: e.message, ...summary });
        console.error('geocode error:', addr, e.message);
        continue; // 일시 오류는 다음에 다시 시도(geo_address를 안 바꿈)
      }
      const nowIso = new Date().toISOString();
      const patch = hit
        ? { geo_lat: hit.lat, geo_lon: hit.lon, geo_precision: hit.precision, geo_address: addr,
            geo_dong: hit.dong || null, geo_apt: hit.apt || null, geo_matched: hit.matched || null,
            geo_region: hit.region, geo_updated_at: nowIso }
        : { geo_lat: null, geo_lon: null, geo_precision: 'fail', geo_address: addr,
            geo_dong: null, geo_apt: null, geo_matched: null, geo_region: null, geo_updated_at: nowIso };
      const { error } = await supabase.from('members').update(patch).in('id', byAddr.get(addr));
      if (error) throw error;
      summary.processed++;
      summary[hit ? hit.precision : 'fail']++;
    }
    const remainingAddrs = addrs.length - summary.processed;
    res.json({ ...summary, remaining: Math.max(0, remainingAddrs), total: addrs.length });
  } catch (err) {
    console.error('POST /api/distribution/geocode error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/parishes', async (req, res) => {
  const { church_id } = req.query;
  try {
      let query = supabase.from('parishes').select('*');
      const cid = parseInt(church_id);
      if (church_id && !isNaN(cid)) {
          query = query.eq('church_id', cid);
      }
      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.get('/api/districts', async (req, res) => {
  const { parish_id } = req.query;
  try {
      let query = supabase.from('districts').select('*');
      const pid = parseInt(parish_id);
      if (parish_id && !isNaN(pid)) {
          query = query.eq('parish_id', pid);
      }
      const { data, error } = await query.order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Create Church
app.post('/api/churches', async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      const { data, error } = await supabase
          .from('churches')
          .insert({ name, address })
          .select('id')
          .single();
      if (error) throw error;
      res.json({ id: data.id });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Update Church
app.put('/api/churches/:id', async (req, res) => {
  const { name, address } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      // 1. 기존 교회 이름을 조회
      const { data: oldChurch, error: findError } = await supabase
          .from('churches')
          .select('name')
          .eq('id', id)
          .single();
      if (findError) throw findError;

      // 2. 교회 정보 업데이트
      const { error } = await supabase
          .from('churches')
          .update({ name, address })
          .eq('id', id);
      if (error) throw error;

      // 3. 기존 교회 이름을 가졌던 성도들의 church 컬럼 텍스트 일괄 수정 (Cascade Update)
      if (oldChurch && oldChurch.name !== name) {
          const { error: memberUpdateErr } = await supabase
              .from('members')
              .update({ church: name })
              .eq('church', oldChurch.name);
          if (memberUpdateErr) console.error('Failed to cascade update members church:', memberUpdateErr);
      }

      res.json({ status: 'success' });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Delete Church
app.delete('/api/churches/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: row, error: churchErr } = await supabase
      .from('churches')
      .select('name')
      .eq('id', id)
      .single();
      
    if (churchErr || !row) return res.status(404).json({ error: 'Church not found' });
    if (row.name.includes('서울중앙교회')) {
      return res.status(400).json({ error: '서울중앙교회 본교는 삭제할 수 없습니다.' });
    }

    const { count: parishCount, error: pCountErr } = await supabase
      .from('parishes')
      .select('*', { count: 'exact', head: true })
      .eq('church_id', id);
    if (pCountErr) throw pCountErr;
    if (parishCount > 0) {
      return res.status(400).json({ error: '하위 교구 정보가 존재하여 삭제할 수 없습니다.' });
    }

    const { count: memberCount, error: mCountErr } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('parish', '타 교구')
      .eq('church', row.name);
    if (mCountErr) throw mCountErr;
    if (memberCount > 0) {
      return res.status(400).json({ error: '이 교회에 소속된 타 교구 성도가 존재하여 삭제할 수 없습니다.' });
    }

    const { error: delErr } = await supabase
      .from('churches')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create Parish
app.post('/api/parishes', async (req, res) => {
  const { name, church_id, parish_no } = req.body;
  if (!name || !church_id) return res.status(400).json({ error: 'name and church_id are required' });
  try {
      const { data, error } = await supabase
          .from('parishes')
          .insert({ name, church_id, parish_no: parish_no ? parseInt(parish_no) : null })
          .select('id')
          .single();
      if (error) throw error;
      res.json({ id: data.id });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Update Parish
app.put('/api/parishes/:id', async (req, res) => {
  const { name, parish_no } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      // 1. 기존 교구 이름을 조회
      const { data: oldParish, error: findError } = await supabase
          .from('parishes')
          .select('name')
          .eq('id', id)
          .single();
      if (findError) throw findError;

      // 2. 교구 정보 업데이트
      const { error } = await supabase
          .from('parishes')
          .update({ name, parish_no: parish_no ? parseInt(parish_no) : null })
          .eq('id', id);
      if (error) throw error;

      // 3. 기존 교구 이름을 가졌던 성도들의 parish 컬럼 텍스트 일괄 수정 (Cascade Update)
      if (oldParish && oldParish.name !== name) {
          const { error: memberUpdateErr } = await supabase
              .from('members')
              .update({ parish: name })
              .eq('parish', oldParish.name);
          if (memberUpdateErr) console.error('Failed to cascade update members parish:', memberUpdateErr);
      }

      res.json({ status: 'success' });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Delete Parish
app.delete('/api/parishes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: parishRow, error: pErr } = await supabase
      .from('parishes')
      .select('name')
      .eq('id', id)
      .single();
    if (pErr || !parishRow) return res.status(404).json({ error: 'Parish not found' });
    
    const { count: distCount, error: distCountErr } = await supabase
      .from('districts')
      .select('*', { count: 'exact', head: true })
      .eq('parish_id', id);
    if (distCountErr) throw distCountErr;
    if (distCount > 0) {
      return res.status(400).json({ error: '하위 구역 정보가 존재하여 교구를 삭제할 수 없습니다.' });
    }

    const { count: memCount, error: memCountErr } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('parish', parishRow.name);
    if (memCountErr) throw memCountErr;
    if (memCount > 0) {
      return res.status(400).json({ error: '이 교구에 소속된 성도가 존재하여 삭제할 수 없습니다.' });
    }

    const { error: delErr } = await supabase
      .from('parishes')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create District
app.post('/api/districts', async (req, res) => {
  const { name, parish_id } = req.body;
  if (!name || !parish_id) return res.status(400).json({ error: 'name and parish_id are required' });
  try {
      const { data, error } = await supabase
          .from('districts')
          .insert({ name, parish_id })
          .select('id')
          .single();
      if (error) throw error;
      res.json({ id: data.id });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Update District
app.put('/api/districts/:id', async (req, res) => {
  const { name } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      // 1. 기존 구역 정보와 교구 정보 조회
      const { data: oldDist, error: findError } = await supabase
          .from('districts')
          .select('name, parishes(name)')
          .eq('id', id)
          .single();
      if (findError) throw findError;

      // 2. 구역 이름 업데이트
      const { error } = await supabase
          .from('districts')
          .update({ name })
          .eq('id', id);
      if (error) throw error;

      // 3. 기존 구역 이름을 가졌고 해당 교구에 속한 성도들의 district 컬럼 텍스트 일괄 수정 (Cascade Update)
      const parishName = oldDist && oldDist.parishes ? oldDist.parishes.name : null;
      if (oldDist && oldDist.name !== name && parishName) {
          const { error: memberUpdateErr } = await supabase
              .from('members')
              .update({ district: name })
              .eq('district', oldDist.name)
              .eq('parish', parishName);
          if (memberUpdateErr) console.error('Failed to cascade update members district:', memberUpdateErr);
      }

      res.json({ status: 'success' });
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Delete District
app.delete('/api/districts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: distRow, error: distErr } = await supabase
      .from('districts')
      .select('name')
      .eq('id', id)
      .single();
    if (distErr || !distRow) return res.status(404).json({ error: 'District not found' });
    
    const { count: memCount, error: memCountErr } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('district', distRow.name)
      .eq('status', 'active');
    if (memCountErr) throw memCountErr;
    if (memCount > 0) {
      return res.status(400).json({ error: '이 구역에 소속된 활성 성도가 존재하여 삭제할 수 없습니다.' });
    }

    const { error: delErr } = await supabase
      .from('districts')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Meetings & Attendance API ---
app.get('/api/meetings', async (req, res) => {
  try {
    // [2026-07-07 페이지네이션] 모임(meetings) 자체도 필터 없이 조회하므로 1000건을 넘으면
    // 조용히 잘려나간다 (감사 보고서 6번 항목). date만으로는 동률이 흔하므로 id를 타이브레이커로
    // 추가해 페이지 경계에서도 정렬이 안정적으로 유지되도록 한다.
    // [2026-09-22 성능개선] meetings / attendance / members(구원기념일용) 세 조회는 서로
    // 의존성이 없는데도 기존엔 하나씩 순서대로 await 해서 세 번의 왕복 지연이 그대로 더해졌다
    // (Vercel↔Supabase 리전이 멀리 떨어져 있을 때 이 직렬 대기가 응답 지연의 대부분을 차지했다).
    // Promise.all로 동시에 요청해 전체 응답 시간을 "가장 느린 조회 하나"에 가깝게 줄인다.
    // 가져오는 시점만 병렬로 바뀔 뿐, 계산 결과·순서는 기존과 완전히 동일하다.
    const [meetings, presentAttendance, members] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('meetings')
          .select('*')
          .order('date', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      ),
      // ⚠ 페이지네이션 없이 조회하면 PostgREST 기본 1000행 제한에 걸려 참석 데이터가 잘려나가고,
      // 그 결과 일부 모임의 참석 인원이 실제와 다르게(대개 0명으로) 표시되는 버그가 있었다.
      // fetchAllRows로 전체 페이지를 끝까지 가져와 집계한다.
      fetchAllRows((from, to) =>
        supabase
          .from('attendance')
          .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present, members(district)')
          .eq('is_present', 1)
          .range(from, to)
      ),
      // [2026-07-07 페이지네이션] 구원기념일 대상자 조회도 전체 성도 수에 비례해 1000명을
      // 넘을 수 있으므로 fetchAllRows로 전체 페이지 조회.
      fetchAllRows((from, to) =>
        supabase
          .from('members')
          .select('id, name, salvation_date, bs, position')
          .not('salvation_date', 'is', null)
          .neq('salvation_date', '')
          .neq('status', 'inactive')
          .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
          .range(from, to)
      )
    ]);

    const countMap = {};
    const testimonyCountMap = {};
    const districtCountMap = {};
    const districtTestimonyCountMap = {};

    if (presentAttendance) {
      presentAttendance.forEach(a => {
        if (Number(a.is_present) !== 1) return;

        countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1;
        if (a.testimony_snapshot && a.testimony_snapshot.trim() !== '') {
            testimonyCountMap[a.meeting_id] = (testimonyCountMap[a.meeting_id] || 0) + 1;
        }

        let dist = a.district_snapshot ? a.district_snapshot.trim() : null;
        if (!dist && a.members && a.members.district) {
          dist = a.members.district.trim();
        }
        if (dist) {
          dist = dist.replace('구역', '').trim();
          if (dist) {
            dist = dist + '구역';
          }
        }
        if (!dist) dist = '미지정';
        
        if (!districtCountMap[a.meeting_id]) {
          districtCountMap[a.meeting_id] = {};
        }
        districtCountMap[a.meeting_id][dist] = (districtCountMap[a.meeting_id][dist] || 0) + 1;

        if (a.testimony_snapshot && a.testimony_snapshot.trim() !== '') {
          if (!districtTestimonyCountMap[a.meeting_id]) {
            districtTestimonyCountMap[a.meeting_id] = {};
          }
          districtTestimonyCountMap[a.meeting_id][dist] = (districtTestimonyCountMap[a.meeting_id][dist] || 0) + 1;
        }
      });
    }

    const rows = meetings.map(m => {
      let sermon_bible = '';
      let sermon_tags = '';
      let obsidian_uri = '';
      let cleanMemo = m.memo || '';
      
      if (cleanMemo.startsWith('{')) {
          const firstLine = cleanMemo.split(/\r?\n|\\n/)[0];
          try {
              if (firstLine.endsWith('}')) {
                  const meta = JSON.parse(firstLine);
                  if (meta.bible !== undefined || meta.tags !== undefined || meta.obsidian_uri !== undefined) {
                      sermon_bible = meta.bible || '';
                      sermon_tags = meta.tags || '';
                      obsidian_uri = meta.obsidian_uri || '';
                      cleanMemo = cleanMemo.substring(firstLine.length).replace(/^(\r?\n|\\n)+/, '');
                  }
              }
          } catch(e) {}
      }

      // 혹시 남아있는 [obsidian:...] 텍스트를 메모에서 완전히 분리 제거
      const obsMatch = cleanMemo.match(/\[obsidian:\s*(.*?)\]/);
      if (obsMatch) {
          if (!obsidian_uri) obsidian_uri = obsMatch[1].trim();
          cleanMemo = cleanMemo.replace(/\[obsidian:\s*.*?\]/g, '').trim();
      }

      return {
        ...m,
        memo: cleanMemo,
        sermon_bible,
        sermon_tags,
        obsidian_uri,
        attendee_count: countMap[m.id] || 0,
        testimony_count: testimonyCountMap[m.id] || 0,
        district_attendees: districtCountMap[m.id] || {},
        district_testimonies: districtTestimonyCountMap[m.id] || {}
      };
    });

    const anniversaries = [];
    const years = [2024, 2025, 2026, 2027, 2028];
    
    if (members) {
      const groups = {}; // key: "MM-DD" -> value: array of { id, name, suffix }
      members.forEach(member => {
        const dateParts = member.salvation_date.split('-');
        if (dateParts.length === 3) {
          const month = dateParts[1];
          const day = dateParts[2];
          const key = `${month}-${day}`;
          
          let suffix = member.bs === 'B' ? 'B' : (member.bs === 'S' ? 'S' : '');
          if (member.position && member.position.includes('집사')) {
            suffix = 'D';
          }
          
          if (!groups[key]) {
            groups[key] = [];
          }
          groups[key].push({
            id: member.id,
            name: member.name,
            suffix: suffix
          });
        }
      });

      Object.keys(groups).forEach(key => {
        const [month, day] = key.split('-');
        const list = groups[key];
        const joinedNames = list.map(item => `${item.name}${item.suffix}`).join(', ');
        
        years.forEach(year => {
          anniversaries.push({
            id: list.length === 1 ? `salvation-${list[0].id}-${year}` : `salvation-${key}-${year}`,
            title: `🎂 ${joinedNames}`,
            date: `${year}-${month}-${day}`,
            type: '구원기념일',
            sermon_title: '',
            attendee_count: 0,
            members: list
          });
        });
      });
    }
    
    res.json([...rows, ...anniversaries]);
  } catch (err) {
    console.error('Meetings error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/meetings', async (req, res) => {
  const { title, date, end_date, type, sermon_title, memo, church, start_time, end_time, sermon_bible, sermon_tags } = req.body;
  try {
    let finalMemo = memo || '';
    if (sermon_bible || sermon_tags) {
        const meta = { bible: sermon_bible || '', tags: sermon_tags || '' };
        finalMemo = JSON.stringify(meta) + '\\n\\n' + finalMemo;
    }

    // 생성 시점의 강효근(관리자) 소속을 스냅샷으로 함께 저장.
    // 나중에 관리자 소속(admin_settings)이 바뀌어도 이 모임의 대상자/의무출석 판정은
    // "만들어질 때의" 교회/교구 기준으로 계속 정확하게 계산되도록 하기 위함.
    // (attendance 테이블의 district_snapshot/category_snapshot과 동일한 패턴)
    const leaderProfile = await fetchLeaderChurchParish();

    const insertRow = {
      title, date, end_date: end_date || null, type,
      sermon_title: sermon_title || null, memo: finalMemo, church,
      start_time: start_time || null, end_time: end_time || null,
      leader_church_snapshot: leaderProfile?.church || null,
      leader_parish_snapshot: leaderProfile?.parish || null,
    };

    let { data, error } = await supabase
      .from('meetings')
      .insert(insertRow)
      .select('id')
      .single();

    // leader_*_snapshot 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
    if (error && /leader_church_snapshot|leader_parish_snapshot/i.test(error.message || '')) {
      console.warn('meetings.leader_*_snapshot 컬럼이 없어 스냅샷 없이 저장합니다. SQL: ALTER TABLE meetings ADD COLUMN IF NOT EXISTS leader_church_snapshot text, ADD COLUMN IF NOT EXISTS leader_parish_snapshot text;');
      delete insertRow.leader_church_snapshot;
      delete insertRow.leader_parish_snapshot;
      const retry = await supabase.from('meetings').insert(insertRow).select('id').single();
      data = retry.data;
      error = retry.error;
    }

    if (error) throw error;
    res.json({ id: data.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/meetings/:id/attendance', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        *,
        members (
          name,
          district,
          category,
          member_status,
          bs
        )
      `)
      .eq('meeting_id', req.params.id);
      
    if (error) throw error;

    const rows = (data || []).map(a => ({
      id: a.id,
      meeting_id: a.meeting_id,
      member_id: a.member_id,
      is_present: a.is_present,
      testimony_snapshot: a.testimony_snapshot,
      district_snapshot: a.district_snapshot,
      category_snapshot: a.category_snapshot,
      name: a.members?.name || '',
      district: a.members?.district || '',
      category: a.members?.category || '',
      member_status: a.members?.member_status || 'member',
      bs: a.members?.bs || ''
    }));
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// [2026-07-06 안전화] 예전에는 "전체 삭제 → 재삽입" 방식이라
//  (1) 삭제 성공 후 삽입이 실패하면 그 모임의 출석이 통째로 유실되고
//  (2) 프론트가 스냅샷을 안 보내므로 재저장할 때마다 district/category_snapshot이
//      null로 초기화되어 과거 모임의 구역별 통계가 소급 변경되는 문제가 있었다.
// 이제 upsert(있으면 갱신, 없으면 삽입) 후 목록에서 빠진 행만 삭제한다.
//  → 어느 단계에서 실패해도 기존 데이터가 통째로 사라지지 않고,
//    기존 스냅샷은 프론트가 값을 보내지 않는 한 그대로 보존된다.
// ※ upsert는 attendance UNIQUE(meeting_id, member_id) 제약 필요
//   (migrations/2026-07-06_attendance_unique.sql 참고). 제약이 아직 없으면
//   기존 방식으로 폴백하되 경고 로그를 남긴다.
app.post('/api/attendance', async (req, res) => {
  const { meeting_id, attendance_data } = req.body;
  try {
    if (meeting_id === undefined || meeting_id === null) {
      return res.status(400).json({ error: 'meeting_id가 필요합니다.' });
    }
    const rawRows = Array.isArray(attendance_data) ? attendance_data : [];

    // 같은 성도가 payload에 중복으로 들어오면 upsert가 실패하므로 성도당 1행으로 정리
    const byMember = {};
    rawRows.forEach(d => {
      if (d && d.member_id !== undefined && d.member_id !== null) byMember[d.member_id] = d;
    });
    const rows = Object.values(byMember);

    // 기존 행 조회 — 스냅샷 보존 + "빠진 성도" 삭제 대상 파악용
    const existing = await fetchAllRows((from, to) =>
      supabase
        .from('attendance')
        .select('id, member_id, district_snapshot, category_snapshot')
        .eq('meeting_id', meeting_id)
        .range(from, to)
    );
    const existingByMember = {};
    existing.forEach(r => { existingByMember[r.member_id] = r; });

    if (rows.length > 0) {
      const upsertRows = rows.map(d => {
        const prev = existingByMember[d.member_id];
        return {
          meeting_id,
          member_id: d.member_id,
          is_present: d.is_present || 0,
          testimony_snapshot: d.testimony_snapshot || null,
          // 프론트가 스냅샷을 안 보내면 기존 값을 보존 (과거 구역 통계 소실 방지)
          district_snapshot: d.district_snapshot || (prev ? prev.district_snapshot : null),
          category_snapshot: d.category_snapshot || (prev ? prev.category_snapshot : null)
        };
      });

      const { error: upErr } = await supabase
        .from('attendance')
        .upsert(upsertRows, { onConflict: 'meeting_id,member_id' });

      if (upErr && /no unique|there is no unique|exclusion constraint/i.test(upErr.message || '')) {
        // UNIQUE 제약 미적용 DB 폴백 (구 방식) — 데이터 유실 위험이 있으므로 마이그레이션 권장
        console.warn('[attendance] UNIQUE(meeting_id, member_id) 제약이 없어 delete+insert 폴백으로 저장합니다. Supabase SQL Editor에서 migrations/2026-07-06_attendance_unique.sql 실행을 권장합니다.');
        const { error: delAllErr } = await supabase.from('attendance').delete().eq('meeting_id', meeting_id);
        if (delAllErr) throw delAllErr;
        const { error: insErr } = await supabase.from('attendance').insert(upsertRows);
        if (insErr) throw insErr;
        return res.json({ status: 'success' });
      } else if (upErr) {
        throw upErr;
      }
    }

    // upsert가 성공한 뒤에만, 이번 목록에서 빠진 성도의 행을 삭제한다
    const keepIds = new Set(rows.map(d => d.member_id));
    const toDeleteIds = existing.filter(r => !keepIds.has(r.member_id)).map(r => r.id);
    if (toDeleteIds.length > 0) {
      const { error: delErr } = await supabase.from('attendance').delete().in('id', toDeleteIds);
      if (delErr) throw delErr;
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Attendance save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// [2026-07-06 안전화] 예전에는 "조회 후 없으면 삽입" 방식이라
//  (1) 연타/동시 요청 시 둘 다 "없음"으로 판정해 같은 (모임, 성도) 출석 행이
//      2개 생기고 참석 인원 집계가 부풀려지는 경쟁 조건이 있었고
//  (2) maybeSingle()은 이미 중복 행이 있는 성도를 만나면 500 오류를 냈다.
// 이제 업데이트를 먼저 시도하고(중복 행이 있어도 전부 갱신됨), 갱신된 행이
// 없을 때만 삽입한다. 삽입이 UNIQUE 충돌(23505)로 실패하면 경쟁 상황이므로
// 업데이트로 재시도한다. (UNIQUE 제약: migrations/2026-07-06_attendance_unique.sql)
app.post('/api/attendance/toggle', async (req, res) => {
  const { member_id, meeting_id, is_present } = req.body;
  try {
    const presentVal = is_present ? 1 : 0;

    const { data: updated, error: updateErr } = await supabase
      .from('attendance')
      .update({ is_present: presentVal })
      .eq('meeting_id', meeting_id)
      .eq('member_id', member_id)
      .select('id');
    if (updateErr) throw updateErr;

    if (!updated || updated.length === 0) {
      const { data: member, error: memErr } = await supabase
        .from('members')
        .select('district, category')
        .eq('id', member_id)
        .single();

      if (memErr) throw memErr;

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert({
          meeting_id,
          member_id,
          is_present: presentVal,
          district_snapshot: member?.district || null,
          category_snapshot: member?.category || null
        });

      if (insertErr) {
        // 동시 요청이 먼저 삽입한 경우(UNIQUE 충돌) → 업데이트로 재시도
        if (insertErr.code === '23505' || /duplicate key/i.test(insertErr.message || '')) {
          const { error: retryErr } = await supabase
            .from('attendance')
            .update({ is_present: presentVal })
            .eq('meeting_id', meeting_id)
            .eq('member_id', member_id);
          if (retryErr) throw retryErr;
        } else {
          throw insertErr;
        }
      }
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Toggle attendance error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/testimony', async (req, res) => {
  const { member_id, meeting_id, testimony } = req.body;
  try {
    const memberId = parseInt(member_id);
    const meetingId = parseInt(meeting_id);
    if (isNaN(memberId) || isNaN(meetingId)) {
      return res.status(400).json({ error: '유효한 member_id와 meeting_id가 필요합니다.' });
    }

    // [2026-07-06 안전화] toggle과 동일 — "조회 후 삽입"의 경쟁 조건으로 중복 행이
    // 생기고, 중복이 이미 있으면 maybeSingle()이 500을 내던 문제를 업데이트 우선 방식으로 수정
    const { data: updated, error: updateErr } = await supabase
      .from('attendance')
      .update({ testimony_snapshot: testimony || null })
      .eq('meeting_id', meetingId)
      .eq('member_id', memberId)
      .select('id');
    if (updateErr) throw updateErr;

    if (!updated || updated.length === 0) {
      const { data: member, error: memErr } = await supabase
        .from('members')
        .select('district, category')
        .eq('id', memberId)
        .single();

      if (memErr) throw memErr;

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert({
          meeting_id: meetingId,
          member_id: memberId,
          is_present: 0,
          testimony_snapshot: testimony || null,
          district_snapshot: member?.district || null,
          category_snapshot: member?.category || null
        });

      if (insertErr) {
        if (insertErr.code === '23505' || /duplicate key/i.test(insertErr.message || '')) {
          const { error: retryErr } = await supabase
            .from('attendance')
            .update({ testimony_snapshot: testimony || null })
            .eq('meeting_id', meetingId)
            .eq('member_id', memberId);
          if (retryErr) throw retryErr;
        } else {
          throw insertErr;
        }
      }
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Testimony save error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/meetings/:id', async (req, res) => {
  const { title, date, end_date, type, sermon_title, memo, church, start_time, end_time, sermon_bible, sermon_tags, obsidian_uri } = req.body;
  try {
    let finalMemo = memo || '';
    let existingObsidianUri = obsidian_uri || '';
    let existingObsidianFile = '';

    if (finalMemo.startsWith('{')) {
        const firstLine = finalMemo.split(/\r?\n|\\n/)[0];
        try {
            if (firstLine.endsWith('}')) {
                const parsed = JSON.parse(firstLine);
                if (parsed.bible !== undefined || parsed.tags !== undefined || parsed.obsidian_uri !== undefined) {
                    if (!existingObsidianUri && parsed.obsidian_uri) existingObsidianUri = parsed.obsidian_uri;
                    if (parsed.obsidian_file) existingObsidianFile = parsed.obsidian_file;
                    finalMemo = finalMemo.substring(firstLine.length).replace(/^(\r?\n|\\n)+/, '');
                }
            }
        } catch(e) {}
    }
    const obsMatch = finalMemo.match(/\[obsidian:\s*(.*?)\]/);
    if (obsMatch) {
        if (!existingObsidianUri) existingObsidianUri = obsMatch[1].trim();
        finalMemo = finalMemo.replace(/\[obsidian:\s*.*?\]/g, '').trim();
    }

    if (sermon_bible || sermon_tags || existingObsidianUri) {
        const meta = {
            bible: sermon_bible || '',
            tags: sermon_tags || '',
            ...(existingObsidianUri ? { obsidian_uri: existingObsidianUri, obsidian_file: existingObsidianFile } : {})
        };
        finalMemo = JSON.stringify(meta) + '\n\n' + finalMemo;
    }

    const { error } = await supabase
      .from('meetings')
      .update({ title, date, end_date: end_date || null, type, sermon_title: sermon_title || null, memo: finalMemo, church, start_time: start_time || null, end_time: end_time || null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/meetings/:id', async (req, res) => {
  try {
    const { error: attDelErr } = await supabase
      .from('attendance')
      .delete()
      .eq('meeting_id', req.params.id);
    if (attDelErr) throw attDelErr;

    const { error: meetDelErr } = await supabase
      .from('meetings')
      .delete()
      .eq('id', req.params.id);
    if (meetDelErr) throw meetDelErr;

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/members/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error: attDelErr } = await supabase
      .from('attendance')
      .delete()
      .eq('member_id', id);
    if (attDelErr) throw attDelErr;

    const { error: recDelErr } = await supabase
      .from('member_records')
      .delete()
      .eq('member_id', id);
    if (recDelErr) throw recDelErr;

    const { error: memDelErr } = await supabase
      .from('members')
      .delete()
      .eq('id', id);
    if (memDelErr) throw memDelErr;

    res.json({ status: 'success' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/members/:id', async (req, res) => {
  const allowed = [
    'testimony', 'visitation_note', 'phone', 'address', 'category', 'district',
    'status', 'member_status', 'salvation_date', 'position', 'church_service',
    'marital_status', 'family_relation'
  ];
  const updatePayload = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updatePayload[key] = req.body[key];
    }
  }
  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: '수정할 데이터가 없습니다.' });
  }
  try {
    const { error } = await supabase
      .from('members')
      .update(updatePayload)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
    console.error('PATCH /api/members/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/visitation/status', async (req, res) => {
    try {
        // 담당자(강효근) 본인의 현재 소속 교회/교구 조회 — 발령이 나면 관리 대상이 그 교회로 자동 전환되도록
        const { data: myProfile, error: profErr } = await supabase
            .from('members')
            .select('church, parish')
            .eq('name', '강효근')
            .single();
        if (profErr) console.error('visitation scope profile lookup failed:', profErr);
        const myChurch = (myProfile && myProfile.church) || '서울중앙교회';
        const myParish = (myProfile && myProfile.parish) || '부곡교구';

        // [2026-07-07 페이지네이션] 성도/모임/상담기록 전체 조회가 1000행을 넘으면 조용히
        // 잘려나가 심방 대상 명단이나 마지막 심방/상담일이 누락될 수 있으므로 fetchAllRows 사용.
        const rawMembers = await fetchAllRows((from, to) =>
            supabase
                .from('members')
                .select('id, name, district, category, position, family_relation, church, parish, member_status')
                .eq('status', 'active')
                .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
                .range(from, to)
        );

        // 담당 범위 필터: 서울중앙교회면 담당 교구까지 일치해야 하고, 그 외 교회는 교회 전체가 대상.
        // 전도대상자(member_status = 'evangelism')는 아직 정식 성도가 아니므로 심방 대상에서 제외(상담 관리에서 별도 관리).
        const members = (rawMembers || []).filter(m => {
            const inScope = myChurch === '서울중앙교회'
                ? (m.church === myChurch && m.parish === myParish)
                : (m.church === myChurch);
            return inScope && m.member_status !== 'evangelism';
        });

        const meetings = await fetchAllRows((from, to) =>
            supabase
                .from('meetings')
                .select('id, title, date, sermon_title, memo, type')
                .in('type', ['심방', '상담'])
                .range(from, to)
        );

        const cRecords = await fetchAllRows((from, to) =>
            supabase
                .from('member_records')
                .select('member_id, date, status, remark')
                .eq('status', 'COUNSELING')
                .range(from, to)
        );

        const meetingMap = {};
        if (meetings) {
          meetings.forEach(m => { meetingMap[m.id] = m; });
        }
        const meetingIds = (meetings || []).map(m => m.id);

        let attendance = [];
        if (meetingIds.length > 0) {
            // 심방/상담 건수가 늘어나 1000행을 넘어도 누락되지 않도록 페이지네이션 조회 (fetchAllRows 참고: /api/meetings 버그와 동일 패턴)
            attendance = await fetchAllRows((from, to) =>
                supabase
                    .from('attendance')
                    .select('member_id, meeting_id, is_present')
                    .eq('is_present', 1)
                    .in('meeting_id', meetingIds)
                    .range(from, to)
            );
        }

        const memberVisitations = {};
        attendance.forEach(a => {
            const meet = meetingMap[a.meeting_id];
            if (meet) {
                if (!memberVisitations[a.member_id]) {
                    memberVisitations[a.member_id] = [];
                }
                memberVisitations[a.member_id].push(meet);
            }
        });

        // member_records의 상담 데이터도 병합
        if (cRecords) {
            cRecords.forEach(r => {
                if (!memberVisitations[r.member_id]) {
                    memberVisitations[r.member_id] = [];
                }
                memberVisitations[r.member_id].push({
                    id: 'c_' + r.date + '_' + Math.random().toString(36).substring(2, 7),
                    title: '상담',
                    date: r.date,
                    sermon_title: null,
                    memo: r.remark,
                    type: '상담'
                });
            });
        }

        const result = members.map(m => {
            const visits = memberVisitations[m.id] || [];
            visits.sort((a, b) => b.date.localeCompare(a.date));

            const lastVisit = visits[0];
            const counselingVisits = visits.filter(v => v.type === '상담');
            const visitationVisits = visits.filter(v => v.type === '심방');
            const lastCounseling = counselingVisits[0];
            const lastVisitation = visitationVisits[0];

            return {
                id: m.id,
                name: m.name,
                district: m.district,
                category: m.category,
                position: m.position,
                family_relation: m.family_relation,
                last_visitation: lastVisit ? lastVisit.date : null,
                total_count: visits.length,
                counseling_count: counselingVisits.length,
                visitation_count: visitationVisits.length,
                last_counseling_date: lastCounseling ? lastCounseling.date : null,
                last_counseling_memo: lastCounseling ? lastCounseling.memo : null,
                last_visitation_date: lastVisitation ? lastVisitation.date : null,
                last_visitation_memo: lastVisitation ? lastVisitation.memo : null,
                last_sermon: lastVisit ? lastVisit.sermon_title : null,
                last_memo: lastVisit ? lastVisit.memo : null,
                last_type: lastVisit ? lastVisit.type : null
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Visitation status error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/visitation/counseling', async (req, res) => {
  const { member_id, name, date, counseling_memo, remark_memo, church, parish, district } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수 항목입니다.' });
  if (!date) return res.status(400).json({ error: '날짜는 필수 항목입니다.' });

  try {
    let finalMemberId = member_id;

    // 1. 성도 조회 또는 신규 생성
    if (!finalMemberId) {
      // 신규 등록
      const insertData = {
        name: name.trim(),
        church: church ? church.trim() : '교회정보없음',
        parish: parish ? parish.trim() : '교구정보없음',
        district: district ? district.trim() : '구역정보없음',
        category: '봉사회',
        status: 'active'
      };

      const { data: newMem, error: insErr } = await supabase
        .from('members')
        .insert(insertData)
        .select('id')
        .single();

      if (insErr) throw insErr;
      finalMemberId = newMem.id;

      // 신규 등록 시 소속이 있는 경우에만 CHURCH_IN 삽입
      if (church || parish || district) {
        const remarkStr = `${church || '교회정보없음'} > ${parish || '교구정보없음'} > ${district || '구역정보없음'}`;
        const { error: recErr } = await supabase
          .from('member_records')
          .insert({
            member_id: finalMemberId,
            date: date,
            status: 'CHURCH_IN',
            remark: remarkStr
          });
        if (recErr) throw recErr;
      }
    } else {
      // 기존 성도 소속 변경 감지 및 동기화
      const { data: curMem, error: curMemErr } = await supabase
        .from('members')
        .select('church, parish, district')
        .eq('id', finalMemberId)
        .single();

      if (curMemErr) throw curMemErr;

      // 소속 중 하나라도 입력된 정보와 다른지 비교 (비어있지 않은 정보 기준)
      const isChurchDiff = church && church.trim() !== (curMem.church || '').trim();
      const isParishDiff = parish && parish.trim() !== (curMem.parish || '').trim();
      const isDistrictDiff = district && district.trim() !== (curMem.district || '').trim();

      if (isChurchDiff || isParishDiff || isDistrictDiff) {
        const newChurch = church ? church.trim() : (curMem.church || '교회정보없음');
        const newParish = parish ? parish.trim() : (curMem.parish || '교구정보없음');
        const newDistrict = district ? district.trim() : (curMem.district || '구역정보없음');

        const remarkStr = `${newChurch} > ${newParish} > ${newDistrict}`;
        
        // 소속 변경 이력 추가
        const { error: recMoveErr } = await supabase
          .from('member_records')
          .insert({
            member_id: finalMemberId,
            date: date,
            status: 'CHURCH_MOVE',
            remark: remarkStr
          });
        if (recMoveErr) throw recMoveErr;
      }
    }

    // 2. 상담 이력(COUNSELING) 삽입
    let remarkText = counseling_memo ? `[상담] ${counseling_memo.trim()}` : '[상담] 내용 없음';
    if (remark_memo && remark_memo.trim()) {
      remarkText += ` (비고: ${remark_memo.trim()})`;
    }

    const { error: counselErr } = await supabase
      .from('member_records')
      .insert({
        member_id: finalMemberId,
        date: date,
        status: 'COUNSELING',
        remark: remarkText
      });

    if (counselErr) throw counselErr;

    // 3. 프로필 소속 정보 최종 얼라인 동기화
    await syncMemberProfileFromRecords(finalMemberId);

    res.json({ success: true, member_id: finalMemberId });
  } catch (err) {
    console.error('Save counseling error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// NEW: 상담 관리 전용 API  (meetings + attendance 기반, member_records 병합)
// ─────────────────────────────────────────────────────────

// 상담 본문 및 해시태그를 정교하게 파싱해주는 공통 자가치유 헬퍼 함수
function parseCounselingContent(rawText) {
  let text = rawText || '';
  
  // 1. 모든 [상담] 접두사 제거
  text = text.replace(/\[상담\]/g, '').trim();
  
  // 2. 전체 텍스트에서 해시태그(#\S+) 추출
  const tagRegex = /#\S+/g;
  const tagsFound = text.match(tagRegex) || [];
  
  // 중복 태그 제거
  const uniqueTags = Array.from(new Set(tagsFound));
  
  // 3. 본문에서 해시태그 제거 및 줄바꿈/공백 정리
  let cleanContent = text.replace(tagRegex, '').trim();
  
  // 4. 추출한 태그들을 공백으로 연결
  const tagsStr = uniqueTags.join(' ');
  
  return { tags: tagsStr, content: cleanContent };
}

function parseMemoField(memoText) {
  let text = (memoText || '').trim();
  let lead_target = '';
  let counseling_method = '';

  // 1. [lead:...] 패턴 모두 추출 및 텍스트에서 제거
  const leadMatches = [...text.matchAll(/\[lead:\s*(.*?)\]/g)];
  if (leadMatches.length > 0) {
    const targets = leadMatches.map(m => m[1].trim()).filter(Boolean);
    lead_target = targets.join(' ');
    text = text.replace(/\[lead:\s*.*?\]/g, '');
  }

  // 2. [method:...] 패턴 모두 추출 및 텍스트에서 제거
  const methodMatches = [...text.matchAll(/\[method:\s*(.*?)\]/g)];
  if (methodMatches.length > 0) {
    counseling_method = methodMatches[methodMatches.length - 1][1].trim();
    text = text.replace(/\[method:\s*.*?\]/g, '');
  }

  // 3. 레거시 메타태그 ([대면상담], [전화상담], [성도], [전도대상]) 제거
  text = text.replace(/\[(대면상담|전화상담|성도|전도대상)\]/g, '');

  // 4. 남은 텍스트 정제
  text = text.replace(/\s+/g, ' ').trim();

  return {
    lead_target,
    counseling_method: counseling_method || '대면',
    remark_memo: text
  };
}

// GET /api/counseling — 상담 이력이 있는 성도 목록 (달력 개인상담 + member_records COUNSELING 통합)
app.get('/api/counseling', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    // [2026-09-23 성능개선] 아래 members / counselingMeetings / cRecords 세 조회는 서로
    // 의존성이 없는데 기존엔 하나씩 순서대로 await 했다. attendance(3번)만 counselingMeetings의
    // id 목록이 있어야 조회할 수 있으므로, 그 셋을 먼저 동시에 요청한 뒤 attendance를 이어서
    // 요청하는 2단계로 바꿔 왕복 횟수를 4번→사실상 2번으로 줄인다. 결과·순서는 기존과 동일.
    //
    // 1. members 전체 조회
    // [2026-07-07 페이지네이션] 성도 1000명을 넘으면 조용히 잘려나가 "상담 이력이 있는 성도"
    // 목록에서 뒤쪽 성도가 통째로 누락될 수 있으므로 fetchAllRows 사용.
    //
    // 2. meetings(type='상담') 조회 — 상담 건수가 누적되어 1000건을 넘어도 누락되지 않도록 페이지네이션
    //
    // 4. member_records COUNSELING 조회 (기존 레거시 데이터) — 역시 1000건 초과 대비 페이지네이션
    const [members, counselingMeetings, cRecords] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('members')
          .select('id, name, district, category, position, family_relation, bs, church, parish, salvation_date, member_status')
          .eq('status', 'active')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('meetings')
          .select('id, title, date, memo, type')
          .eq('type', '상담')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('member_records')
          .select('member_id, date, remark, id')
          .eq('status', 'COUNSELING')
          .range(from, to)
      )
    ]);

    const memberMap = {};
    (members || []).forEach(m => { memberMap[m.id] = m; });

    const counselingMeetingIds = (counselingMeetings || []).map(m => m.id);
    const meetingMap = {};
    (counselingMeetings || []).forEach(m => { meetingMap[m.id] = m; });

    // 3. 해당 meetings의 attendance 조회 (모든 성도 포함 - is_present 무관)
    // 상담 건수가 늘어나 1000행을 넘어도 누락되지 않도록 페이지네이션 조회
    // (counselingMeetingIds가 있어야 조회 가능하므로 위 3개 조회가 끝난 뒤 진행)
    let attRows = [];
    if (counselingMeetingIds.length > 0) {
      attRows = await fetchAllRows((from, to) =>
        supabase
          .from('attendance')
          .select('member_id, meeting_id, testimony_snapshot, is_present')
          .in('meeting_id', counselingMeetingIds)
          .range(from, to)
      );
    }

    // 5. memberId별로 상담 세션 수집
    const memberCounselingMap = {}; // memberId → [{ date, content, source, session_id }]

    // meetings 기반 (달력 개인상담)
    attRows.forEach(a => {
      const meet = meetingMap[a.meeting_id];
      if (!meet) return;
      if (!memberCounselingMap[a.member_id]) memberCounselingMap[a.member_id] = [];
      
      const parsed = parseCounselingContent(a.testimony_snapshot);
      const parsedMemo = parseMemoField(meet.memo);
      
      memberCounselingMap[a.member_id].push({
        date: meet.date,
        content: parsed.content,
        tags: parsed.tags,
        source: 'meeting',
        session_id: `m_${a.meeting_id}`,
        meeting_id: a.meeting_id,
        is_present: a.is_present,
        member_status: memberMap[a.member_id]?.member_status || 'member',
        lead_target: parsedMemo.lead_target,
        counseling_method: parsedMemo.counseling_method,
        remark_memo: parsedMemo.remark_memo
      });
    });

    // member_records 기반 (레거시 상담 등록)
    (cRecords || []).forEach(r => {
      if (!memberCounselingMap[r.member_id]) memberCounselingMap[r.member_id] = [];
      
      let rawRemark = r.remark || '';
      let remarkMemo = '';
      const match = rawRemark.match(/\(비고:\s*(.*?)\)\s*$/);
      if (match) {
        remarkMemo = match[1];
        rawRemark = rawRemark.replace(/\(비고:\s*(.*?)\)\s*$/, '').trim();
      }
      const parsed = parseCounselingContent(rawRemark);
      const parsedMemo = parseMemoField(remarkMemo);
      
      memberCounselingMap[r.member_id].push({
        date: r.date,
        content: parsed.content,
        tags: parsed.tags,
        source: 'record',
        session_id: `r_${r.id}`,
        record_id: r.id,
        member_status: memberMap[r.member_id]?.member_status || 'member',
        lead_target: parsedMemo.lead_target,
        counseling_method: parsedMemo.counseling_method,
        remark_memo: parsedMemo.remark_memo
      });
    });

    // 6. 상담 이력이 있는 성도만 필터링하여 반환
    const result = members
      .filter(m => memberCounselingMap[m.id] && memberCounselingMap[m.id].length > 0)
      .map(m => {
        const sessions = (memberCounselingMap[m.id] || []).sort((a, b) => b.date.localeCompare(a.date));
        const last = sessions[0];
        return {
          id: m.id,
          name: m.name,
          district: m.district,
          category: m.category,
          position: m.position,
          family_relation: m.family_relation,
          bs: m.bs,
          church: m.church,
          parish: m.parish,
          salvation_date: m.salvation_date,
          member_status: m.member_status || 'member',
          counseling_count: sessions.length,
          last_counseling_date: last ? last.date : null,
          last_counseling_content: last ? last.content : null,
          last_counseling_tags: last ? last.tags : null,
          last_counseling_session_id: last ? last.session_id : null,
          all_sessions: sessions
        };
      });

    res.json(result);
  } catch (err) {
    console.error('GET /api/counseling error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 메모리 내 설정 캐시 (DB 생성 전 혹은 에러 발생 시 Fallback)
const inMemorySettings = {
  counseling_member_tags: ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'],
  counseling_evangelism_tags: ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원']
};

// GET /api/settings/:key — 설정 조회
app.get('/api/settings/:key', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const { key } = req.params;
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.warn(`[SETTINGS API] DB lookup failed for ${key}, fallback to memory:`, error.message);
      return res.json({ value: inMemorySettings[key] || null });
    }

    if (data && data.value !== undefined && data.value !== null) {
      return res.json({ value: data.value });
    }

    // DB에 없으면 인메모리 기본값
    return res.json({ value: inMemorySettings[key] || null });
  } catch (err) {
    console.error(`[SETTINGS API] Error GET /api/settings/${key}:`, err);
    return res.json({ value: inMemorySettings[key] || null });
  }
});

// PUT /api/settings/:key — 설정 저장
app.put('/api/settings/:key', express.json(), async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'value field is required' });
  }

  // 인메모리 캐시 갱신
  inMemorySettings[key] = value;

  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });

    if (error) {
      console.warn(`[SETTINGS API] DB upsert failed for ${key}:`, error.message);
      // DB 에러가 있더라도 메모리에는 저장했으므로 성공 응답(경고 포함) 반환
      return res.json({ success: true, warning: 'DB 저장 실패, 세션 메모리에 저장됨', value });
    }

    return res.json({ success: true, value });
  } catch (err) {
    console.error(`[SETTINGS API] Error PUT /api/settings/${key}:`, err);
    return res.json({ success: true, warning: err.message, value });
  }
});

// GET /api/counseling/:memberId — 특정 성도의 상담 이력 전체 (날짜 역순)
app.get('/api/counseling/:memberId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const { memberId } = req.params;
  try {
    const { data: memberData, error: memErr } = await supabase
      .from('members')
      .select('member_status')
      .eq('id', memberId)
      .maybeSingle();
    if (memErr) throw memErr;
    const memberStatus = memberData?.member_status || 'member';

    // meetings(type='상담') 기반 attendance
    // [2026-07-07 페이지네이션] 상담 일정이 1000건을 넘으면 조용히 잘려나가 특정 성도의
    // 오래된 상담 이력이 누락될 수 있으므로 fetchAllRows 사용.
    const counselingMeetings = await fetchAllRows((from, to) =>
      supabase
        .from('meetings')
        .select('id, title, date, memo')
        .eq('type', '상담')
        .range(from, to)
    );

    const meetingMap = {};
    (counselingMeetings || []).forEach(m => { meetingMap[m.id] = m; });
    const meetingIds = (counselingMeetings || []).map(m => m.id);

    let sessions = [];

    if (meetingIds.length > 0) {
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('meeting_id, testimony_snapshot, is_present')
        .eq('member_id', memberId)
        .in('meeting_id', meetingIds);
      if (attErr) throw attErr;

      (attData || []).forEach(a => {
        const meet = meetingMap[a.meeting_id];
        if (!meet) return;

        const parsed = parseCounselingContent(a.testimony_snapshot);
        const rawTitle = meet.title || '';
        const counseleeName = rawTitle.replace(/\s*개인상담\s*$/, '').trim();

        sessions.push({
          date: meet.date,
          content: parsed.content,
          tags: parsed.tags,
          source: 'meeting',
          session_id: `m_${a.meeting_id}`,
          meeting_id: a.meeting_id,
          name: counseleeName,
          memo: meet.memo || '',
          member_status: memberStatus
        });
      });
    }

    // member_records COUNSELING 병합
    const { data: cRecords, error: cRecErr } = await supabase
      .from('member_records')
      .select('id, date, remark')
      .eq('member_id', memberId)
      .eq('status', 'COUNSELING');
    if (cRecErr) throw cRecErr;

    (cRecords || []).forEach(r => {
      const parsed = parseCounselingContent(r.remark);
      
      sessions.push({
        date: r.date,
        content: parsed.content,
        tags: parsed.tags,
        source: 'record',
        session_id: `r_${r.id}`,
        record_id: r.id,
        member_status: memberStatus
      });
    });

    sessions.sort((a, b) => b.date.localeCompare(a.date));
    res.json(sessions);
  } catch (err) {
    console.error('GET /api/counseling/:memberId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/counseling — 새 상담 등록 (meetings + attendance 방식으로 저장 → 달력 자동 표시)
app.post('/api/counseling', async (req, res) => {
  const { member_id, name, date, start_time, end_time, content, tags, remark_memo, lead_target, counseling_method, church, parish, district, category, bs, member_status, is_salvation_checked, is_assign_checked } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수 항목입니다.' });
  if (!date) return res.status(400).json({ error: '날짜는 필수 항목입니다.' });

  try {
    let finalMemberId = member_id;

    // 1. 성도 조회 또는 신규 생성
    if (name.trim() === '익명' && !member_id) {
      const insertData = {
        name: name.trim(),
        church: church ? church.trim() : '교회정보없음',
        parish: parish ? parish.trim() : '교구정보없음',
        district: district ? district.trim() : '구역정보없음',
        category: category || '모름',
        bs: bs || 'S',
        status: 'active',
        member_status: member_status || 'member'
      };
      const { data: newMem, error: insErr } = await supabase
        .from('members').insert(insertData).select('id').single();
      if (insErr) throw insErr;
      finalMemberId = newMem.id;

      if (church || parish || district) {
        const remarkStr = `${church || '교회정보없음'} > ${parish || '교구정보없음'} > ${district || '구역정보없음'}`;
        await supabase.from('member_records').insert({ member_id: finalMemberId, date, status: 'CHURCH_IN', remark: remarkStr });
      }
    } else if (!finalMemberId) {
      const { data: existing, error: findErr } = await supabase
        .from('members').select('id').eq('name', name.trim()).eq('status', 'active');
      
      if (findErr) throw findErr;

      if (existing && existing.length > 0) {
        finalMemberId = existing[0].id;
      } else {
        const insertData = {
          name: name.trim(),
          church: church ? church.trim() : '교회정보없음',
          parish: parish ? parish.trim() : '교구정보없음',
          district: district ? district.trim() : '구역정보없음',
          category: category || '모름',
          bs: bs || 'S',
          status: 'active',
          member_status: member_status || 'member'
        };
        const { data: newMem, error: insErr } = await supabase
          .from('members').insert(insertData).select('id').single();
        if (insErr) throw insErr;
        finalMemberId = newMem.id;

        if (church || parish || district) {
          const remarkStr = `${church || '교회정보없음'} > ${parish || '교구정보없음'} > ${district || '구역정보없음'}`;
          await supabase.from('member_records').insert({ member_id: finalMemberId, date, status: 'CHURCH_IN', remark: remarkStr });
        }
      }
    } else {
      const updateFields = {};
      if (category) updateFields.category = category;
      if (bs) updateFields.bs = bs;
      if (Object.keys(updateFields).length > 0) {
        await supabase.from('members').update(updateFields).eq('id', finalMemberId);
      }
    }

    // 1-2. 구원받음 처리
    if (is_salvation_checked) {
      await supabase.from('member_records').insert({ member_id: finalMemberId, date, status: 'SALVATION', remark: '구원받음' });
      await supabase
        .from('members')
        .update({ member_status: 'member', status: 'active' })
        .eq('id', finalMemberId);
    }

    // 1-3. 교구/구역편입 처리
    if (is_assign_checked && (church || parish || district)) {
      const remarkStr = `${(church || '서울중앙교회').trim()} > ${(parish || '').trim()} > ${(district || '').trim()}`;
      await supabase.from('member_records').insert({ member_id: finalMemberId, date, status: 'CHURCH_IN', remark: remarkStr });
      
      await supabase
        .from('members')
        .update({ member_status: 'member', status: 'active' })
        .eq('id', finalMemberId);
      
      await syncMemberProfileFromRecords(finalMemberId);
    }

    // 2. meetings에 개인상담 일정 생성
    const meetingTitle = `${name} 개인상담`;
    const finalLead = lead_target ? lead_target.trim() : '';
    const finalMethod = counseling_method === '전화' ? '전화' : '대면';
    const finalMemo = `[lead:${finalLead}] [method:${finalMethod}] ${(remark_memo || '').trim()}`;

    // [2026-09-01] 개인상담도 시간을 입력했으면 meetings.start_time/end_time에 그대로 저장해
    // 달력에 "10:30 민공기 개인상담"처럼 시간이 표시되도록 한다(그동안은 이 값을 아예 받지 않아
    // 항상 종일 일정으로 저장됐음).
    const { data: newMeeting, error: meetErr } = await supabase
      .from('meetings')
      .insert({ title: meetingTitle, date, start_time: start_time || null, end_time: end_time || null, type: '상담', memo: finalMemo })
      .select('id').single();
    if (meetErr) throw meetErr;

    // 3. attendance에 해당 성도 testimony_snapshot으로 저장 (태그 + 내용)
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += content ? content.trim() : '';

    const { error: attErr } = await supabase
      .from('attendance')
      .insert({
        meeting_id: newMeeting.id,
        member_id: finalMemberId,
        is_present: 1,
        testimony_snapshot: fullContent || null,
        district_snapshot: district || null,
        category_snapshot: category || null
      });
    if (attErr) throw attErr;

    res.json({ success: true, member_id: finalMemberId, meeting_id: newMeeting.id });
  } catch (err) {
    console.error('POST /api/counseling error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/counseling/:sessionId — 상담 세션 수정 (및 심방/일반모임 → 개인상담 전환 지원)
app.put('/api/counseling/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { name, date, start_time, end_time, content, tags, remark_memo, lead_target, counseling_method, category, bs, member_status, member_id, is_salvation_checked, is_assign_checked, church, parish, district } = req.body;

  try {
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += content ? content.trim() : '';

    let memberId = member_id ? parseInt(member_id, 10) : null;

    // member_id가 없이 이름만 넘어온 경우(예: 심방 제목만 있던 일정을 개인상담으로 전환한 경우) 성도 조회 또는 생성
    if (!memberId && name && name.trim()) {
      const cleanName = name.trim();
      if (cleanName === '익명') {
        const { data: newMem, error: insErr } = await supabase
          .from('members')
          .insert({
            name: '익명',
            church: church ? church.trim() : '교회정보없음',
            parish: parish ? parish.trim() : '교구정보없음',
            district: district ? district.trim() : '구역정보없음',
            category: category || '모름',
            bs: bs || 'S',
            status: 'active',
            member_status: member_status || 'member'
          })
          .select('id')
          .single();
        if (!insErr && newMem) memberId = newMem.id;
      } else {
        const { data: existingMem } = await supabase
          .from('members')
          .select('id')
          .eq('name', cleanName)
          .eq('status', 'active');
        if (existingMem && existingMem.length > 0) {
          memberId = existingMem[0].id;
        } else {
          const { data: newMem, error: insErr } = await supabase
            .from('members')
            .insert({
              name: cleanName,
              church: church ? church.trim() : '교회정보없음',
              parish: parish ? parish.trim() : '교구정보없음',
              district: district ? district.trim() : '구역정보없음',
              category: category || '모름',
              bs: bs || 'S',
              status: 'active',
              member_status: member_status || 'member'
            })
            .select('id')
            .single();
          if (!insErr && newMem) memberId = newMem.id;
        }
      }
    }

    if (memberId) {
      const memberUpdates = {};
      if (category) memberUpdates.category = category;
      if (bs) memberUpdates.bs = bs;
      if (Object.keys(memberUpdates).length > 0) {
        await supabase.from('members').update(memberUpdates).eq('id', memberId);
      }

      if (is_salvation_checked) {
        await supabase.from('member_records').insert({ member_id: memberId, date, status: 'SALVATION', remark: '구원받음' });
        await supabase
          .from('members')
          .update({ member_status: 'member', status: 'active' })
          .eq('id', memberId);
      }

      if (is_assign_checked && (church || parish || district)) {
        const remarkStr = `${(church || '서울중앙교회').trim()} > ${(parish || '').trim()} > ${(district || '').trim()}`;
        await supabase.from('member_records').insert({ member_id: memberId, date, status: 'CHURCH_IN', remark: remarkStr });
        
        await supabase
          .from('members')
          .update({ member_status: 'member', status: 'active' })
          .eq('id', memberId);
          
        await syncMemberProfileFromRecords(memberId);
      } else if (!is_salvation_checked && member_status) {
        const { error: updErr } = await supabase.from('members').update({ member_status }).eq('id', memberId);
        if (updErr) {
          console.error('Error updating member status in PUT:', updErr);
          throw updErr;
        }
      }
    }

    if (sessionId.startsWith('m_')) {
      // meetings + attendance 방식
      const meetingId = sessionId.replace('m_', '');

      // 심방 등 다른 모임에서 개인상담으로 변경하는 경우에도 type='상담', title='OOO 개인상담', sermon_title=null로 정확히 전환
      let resolvedName = (name || '').trim();
      if (!resolvedName && memberId) {
        const { data: memRow } = await supabase.from('members').select('name').eq('id', memberId).maybeSingle();
        if (memRow?.name) resolvedName = memRow.name;
      }

      const meetUpdate = {
        type: '상담',
        date,
        start_time: start_time || null,
        end_time: end_time || null,
        sermon_title: null
      };
      if (resolvedName) {
        meetUpdate.title = `${resolvedName} 개인상담`;
      }

      const finalLead = lead_target ? lead_target.trim() : '';
      const finalMethod = counseling_method === '전화' ? '전화' : '대면';
      const finalMemo = `[lead:${finalLead}] [method:${finalMethod}] ${(remark_memo || '').trim()}`;
      meetUpdate.memo = finalMemo;

      const { error: meetUpdErr } = await supabase.from('meetings').update(meetUpdate).eq('id', meetingId);
      if (meetUpdErr) throw meetUpdErr;

      if (memberId) {
        // 기존에 다른 성도 출석 행이 있으면 정리 후 대상 성도 출석/상담내용 보장
        await supabase.from('attendance').delete().eq('meeting_id', meetingId).neq('member_id', memberId);
        const { data: existing } = await supabase.from('attendance')
          .select('id').eq('meeting_id', meetingId).eq('member_id', memberId).maybeSingle();
        if (existing) {
          await supabase.from('attendance').update({
            is_present: 1,
            testimony_snapshot: fullContent || null
          }).eq('id', existing.id);
        } else {
          const { data: memInfo } = await supabase.from('members').select('district, category').eq('id', memberId).maybeSingle();
          await supabase.from('attendance').insert({
            meeting_id: meetingId,
            member_id: memberId,
            is_present: 1,
            testimony_snapshot: fullContent || null,
            district_snapshot: district || memInfo?.district || null,
            category_snapshot: category || memInfo?.category || null
          });
        }
      }
    } else if (sessionId.startsWith('r_')) {
      // member_records 방식 (레거시)
      const recordId = sessionId.replace('r_', '');
      let remarkText = fullContent ? `[상담] ${fullContent}` : '[상담] 내용 없음';
      const finalLead = lead_target ? lead_target.trim() : '';
      const finalMethod = counseling_method === '전화' ? '전화' : '대면';
      const finalMemo = `[lead:${finalLead}] [method:${finalMethod}] ${(remark_memo || '').trim()}`;
      remarkText += ` (비고: ${finalMemo})`;
      await supabase.from('member_records').update({ date, remark: remarkText }).eq('id', recordId);
    }

    res.json({ success: true, member_id: memberId });
  } catch (err) {
    console.error('PUT /api/counseling/:sessionId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/counseling/:sessionId — 개별 상담 삭제
app.delete('/api/counseling/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    if (sessionId.startsWith('m_')) {
      // meetings + attendance 방식
      const meetingId = sessionId.replace('m_', '');
      
      // 1. attendance에서 해당 meeting_id 기록 삭제
      const { error: attErr } = await supabase
        .from('attendance')
        .delete()
        .eq('meeting_id', meetingId);
      if (attErr) throw attErr;

      // 2. meetings에서 해당 id 일정 삭제
      const { error: meetErr } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingId);
      if (meetErr) throw meetErr;

    } else if (sessionId.startsWith('r_')) {
      // member_records 방식 (레거시)
      const recordId = sessionId.replace('r_', '');
      const { error: recErr } = await supabase
        .from('member_records')
        .delete()
        .eq('id', recordId);
      if (recErr) throw recErr;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/counseling/:sessionId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/counseling/member/:memberId — 특정 성도의 모든 상담 이력 삭제
app.delete('/api/counseling/member/:memberId', async (req, res) => {
  const { memberId } = req.params;
  try {
    // 1. member_records 테이블에서 status='COUNSELING'인 레코드 일괄 삭제
    const { error: recErr } = await supabase
      .from('member_records')
      .delete()
      .eq('member_id', memberId)
      .eq('status', 'COUNSELING');
    if (recErr) throw recErr;

    // 2. meetings(type='상담')에 연계된 attendance 찾아서 해당 meetings 삭제
    // [2026-07-07 페이지네이션] 상담 일정이 1000건을 넘으면 일부가 삭제 대상에서 누락될 수 있음
    const meetings = await fetchAllRows((from, to) =>
      supabase
        .from('meetings')
        .select('id')
        .eq('type', '상담')
        .range(from, to)
    );

    const counselingMeetingIds = (meetings || []).map(m => m.id);

    if (counselingMeetingIds.length > 0) {
      // 해당 성도의 attendance 행 조회 (개인상담 일정만)
      const { data: attRows, error: attGetErr } = await supabase
        .from('attendance')
        .select('meeting_id')
        .eq('member_id', memberId)
        .in('meeting_id', counselingMeetingIds);
      if (attGetErr) throw attGetErr;

      const targetMeetingIds = (attRows || []).map(a => a.meeting_id);
      
      if (targetMeetingIds.length > 0) {
        // attendance 내역 삭제
        const { error: attDelErr } = await supabase
          .from('attendance')
          .delete()
          .eq('member_id', memberId)
          .in('meeting_id', targetMeetingIds);
        if (attDelErr) throw attDelErr;

        // 관련 meetings 일정 삭제
        const { error: meetDelErr } = await supabase
          .from('meetings')
          .delete()
          .in('id', targetMeetingIds);
        if (meetDelErr) throw meetDelErr;
      }
    }

    // 3. 프로필 소속 정보 동기화 (상담 기록 삭제에 따른 카운트 정합성 등)
    await syncMemberProfileFromRecords(memberId);

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/counseling/member/:memberId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// 심방 관리 전용 API (meetings + attendance 기반, /api/counseling과 동일한 패턴)
// 2026-08-29 심방관리 화면 UI를 상담관리와 동일한 구조로 개편하면서 신설.
// 심방은 성도의 집에 방문해 "설교"와 "상담"을 함께 하는 경우가 많아, testimony_snapshot에
// [설교] ... [상담] ... 두 구간으로 나누어 저장하고 parseVisitationContent()로 다시 분리해 돌려준다.
// 상담관리와 마찬가지로 meetings+attendance 방식을 그대로 쓰기 때문에 기존 출석 통계(달력, 출석
// 현황, 모임 현황)에 영향을 주지 않는다.
// ─────────────────────────────────────────────────────────

function parseVisitationContent(rawText) {
  let text = rawText || '';

  // 1. 해시태그(#\S+) 추출 (중복 제거)
  const tagRegex = /#\S+/g;
  const tagsFound = text.match(tagRegex) || [];
  const uniqueTags = Array.from(new Set(tagsFound));
  text = text.replace(tagRegex, '');

  // 2. [설교] ... / [상담] ... 구간 분리
  let sermon_content = '';
  let counseling_content = '';
  const sermonMatch = text.match(/\[설교\]([\s\S]*?)(?=\[상담\]|$)/);
  const counselingMatch = text.match(/\[상담\]([\s\S]*)$/);
  if (sermonMatch) sermon_content = sermonMatch[1].trim();
  if (counselingMatch) counseling_content = counselingMatch[1].trim();

  // 마커가 전혀 없는 데이터(예: 메인화면 일정등록 등 다른 경로로 만들어진 심방 기록)는
  // 전체 텍스트를 상담 내용 칸에 그대로 표시해 내용이 유실되지 않도록 한다.
  if (!sermonMatch && !counselingMatch && text.trim()) {
    counseling_content = text.trim();
  }

  return { tags: uniqueTags.join(' '), sermon_content, counseling_content };
}

// GET /api/visitation — 심방 이력이 있는 성도/전도대상 전체 목록
app.get('/api/visitation', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    // [2026-09-23 성능개선] members와 visitationMeetings는 서로 의존성이 없으므로
    // (/api/counseling과 동일하게) 동시에 요청한다. attendance는 visitationMeetingIds가
    // 있어야 조회할 수 있어 그 다음 단계로 남겨둔다. 결과·순서는 기존과 동일.
    const [members, visitationMeetings] = await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('members')
          .select('id, name, district, category, position, family_relation, bs, church, parish, salvation_date, member_status')
          .eq('status', 'active')
          .range(from, to)
      ),
      fetchAllRows((from, to) =>
        supabase
          .from('meetings')
          .select('id, title, date, memo, type')
          .eq('type', '심방')
          .range(from, to)
      )
    ]);
    const memberMap = {};
    (members || []).forEach(m => { memberMap[m.id] = m; });

    const visitationMeetingIds = (visitationMeetings || []).map(m => m.id);
    const meetingMap = {};
    (visitationMeetings || []).forEach(m => { meetingMap[m.id] = m; });

    let attRows = [];
    if (visitationMeetingIds.length > 0) {
      attRows = await fetchAllRows((from, to) =>
        supabase
          .from('attendance')
          .select('member_id, meeting_id, testimony_snapshot, is_present')
          .in('meeting_id', visitationMeetingIds)
          .range(from, to)
      );
    }

    const memberVisitationMap = {};
    attRows.forEach(a => {
      const meet = meetingMap[a.meeting_id];
      if (!meet) return;
      if (!memberVisitationMap[a.member_id]) memberVisitationMap[a.member_id] = [];
      const parsed = parseVisitationContent(a.testimony_snapshot);
      const parsedMemo = parseMemoField(meet.memo);
      memberVisitationMap[a.member_id].push({
        date: meet.date,
        sermon_content: parsed.sermon_content,
        counseling_content: parsed.counseling_content,
        tags: parsed.tags,
        source: 'meeting',
        session_id: `m_${a.meeting_id}`,
        meeting_id: a.meeting_id,
        is_present: a.is_present,
        member_status: memberMap[a.member_id]?.member_status || 'member',
        lead_target: parsedMemo.lead_target,
        remark_memo: parsedMemo.remark_memo
      });
    });

    const result = members
      .filter(m => memberVisitationMap[m.id] && memberVisitationMap[m.id].length > 0)
      .map(m => {
        const sessions = (memberVisitationMap[m.id] || []).sort((a, b) => b.date.localeCompare(a.date));
        const last = sessions[0];
        return {
          id: m.id,
          name: m.name,
          district: m.district,
          category: m.category,
          position: m.position,
          family_relation: m.family_relation,
          bs: m.bs,
          church: m.church,
          parish: m.parish,
          salvation_date: m.salvation_date,
          member_status: m.member_status || 'member',
          visitation_count: sessions.length,
          last_visitation_date: last ? last.date : null,
          last_visitation_sermon: last ? last.sermon_content : null,
          last_visitation_content: last ? last.counseling_content : null,
          last_visitation_tags: last ? last.tags : null,
          last_visitation_session_id: last ? last.session_id : null,
          all_sessions: sessions
        };
      });

    res.json(result);
  } catch (err) {
    console.error('GET /api/visitation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/visitation/:memberId — 특정 성도(또는 전도대상)의 심방 이력 전체 (날짜 역순)
app.get('/api/visitation/:memberId', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const { memberId } = req.params;
  try {
    const { data: memberData, error: memErr } = await supabase
      .from('members')
      .select('member_status')
      .eq('id', memberId)
      .maybeSingle();
    if (memErr) throw memErr;
    const memberStatus = memberData?.member_status || 'member';

    const visitationMeetings = await fetchAllRows((from, to) =>
      supabase
        .from('meetings')
        .select('id, title, date, memo')
        .eq('type', '심방')
        .range(from, to)
    );
    const meetingMap = {};
    (visitationMeetings || []).forEach(m => { meetingMap[m.id] = m; });
    const meetingIds = (visitationMeetings || []).map(m => m.id);

    let sessions = [];
    if (meetingIds.length > 0) {
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('meeting_id, testimony_snapshot, is_present')
        .eq('member_id', memberId)
        .in('meeting_id', meetingIds);
      if (attErr) throw attErr;

      (attData || []).forEach(a => {
        const meet = meetingMap[a.meeting_id];
        if (!meet) return;
        const parsed = parseVisitationContent(a.testimony_snapshot);
        const parsedMemo = parseMemoField(meet.memo);
        const rawTitle = meet.title || '';
        const visiteeName = rawTitle.replace(/\s*심방\s*$/, '').trim();

        sessions.push({
          date: meet.date,
          sermon_content: parsed.sermon_content,
          counseling_content: parsed.counseling_content,
          tags: parsed.tags,
          source: 'meeting',
          session_id: `m_${a.meeting_id}`,
          meeting_id: a.meeting_id,
          name: visiteeName,
          lead_target: parsedMemo.lead_target,
          remark_memo: parsedMemo.remark_memo,
          member_status: memberStatus
        });
      });
    }

    sessions.sort((a, b) => b.date.localeCompare(a.date));
    res.json(sessions);
  } catch (err) {
    console.error('GET /api/visitation/:memberId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/visitation — 새 심방 등록 (meetings + attendance 방식으로 저장 → 달력에도 자동 표시)
app.post('/api/visitation', async (req, res) => {
  const { member_id, name, date, sermon_content, counseling_content, tags, remark_memo, lead_target, church, parish, district, category, bs, member_status } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수 항목입니다.' });
  if (!date) return res.status(400).json({ error: '날짜는 필수 항목입니다.' });
  if (!(sermon_content && sermon_content.trim()) && !(counseling_content && counseling_content.trim())) {
    return res.status(400).json({ error: '설교 내용 또는 상담 내용 중 하나는 입력해야 합니다.' });
  }

  try {
    let finalMemberId = member_id;

    // 1. 성도 조회 또는 신규 생성 (상담관리와 동일 패턴 — 전도대상도 members 테이블에
    //    member_status='evangelism'으로 생성되어 심방 대상 등록이 가능함)
    if (!finalMemberId) {
      const { data: existing, error: findErr } = await supabase
        .from('members').select('id').eq('name', name.trim()).eq('status', 'active');
      if (findErr) throw findErr;

      if (existing && existing.length > 0) {
        finalMemberId = existing[0].id;
      } else {
        const insertData = {
          name: name.trim(),
          church: church ? church.trim() : '교회정보없음',
          parish: parish ? parish.trim() : '교구정보없음',
          district: district ? district.trim() : '구역정보없음',
          category: category || '모름',
          bs: bs || 'S',
          status: 'active',
          member_status: member_status || 'member'
        };
        const { data: newMem, error: insErr } = await supabase
          .from('members').insert(insertData).select('id').single();
        if (insErr) throw insErr;
        finalMemberId = newMem.id;

        if (church || parish || district) {
          const remarkStr = `${church || '교회정보없음'} > ${parish || '교구정보없음'} > ${district || '구역정보없음'}`;
          await supabase.from('member_records').insert({ member_id: finalMemberId, date, status: 'CHURCH_IN', remark: remarkStr });
        }
      }
    } else {
      const updateFields = {};
      if (category) updateFields.category = category;
      if (bs) updateFields.bs = bs;
      if (Object.keys(updateFields).length > 0) {
        await supabase.from('members').update(updateFields).eq('id', finalMemberId);
      }
    }

    // 2. meetings에 심방 일정 생성
    const meetingTitle = `${name} 심방`;
    const finalLead = lead_target ? lead_target.trim() : '';
    const finalMemo = `[lead:${finalLead}] ${(remark_memo || '').trim()}`;

    const { data: newMeeting, error: meetErr } = await supabase
      .from('meetings')
      .insert({ title: meetingTitle, date, type: '심방', memo: finalMemo })
      .select('id').single();
    if (meetErr) throw meetErr;

    // 3. attendance에 해당 성도 testimony_snapshot으로 저장 (태그 + [설교]/[상담] 내용)
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += `[설교] ${(sermon_content || '').trim()}\n[상담] ${(counseling_content || '').trim()}`;

    const { error: attErr } = await supabase
      .from('attendance')
      .insert({
        meeting_id: newMeeting.id,
        member_id: finalMemberId,
        is_present: 1,
        testimony_snapshot: fullContent || null,
        district_snapshot: district || null,
        category_snapshot: category || null
      });
    if (attErr) throw attErr;

    res.json({ success: true, member_id: finalMemberId, meeting_id: newMeeting.id });
  } catch (err) {
    console.error('POST /api/visitation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/visitation/:sessionId — 심방 세션 수정
app.put('/api/visitation/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { date, sermon_content, counseling_content, tags, remark_memo, lead_target, member_status, member_id, category, bs } = req.body;

  try {
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += `[설교] ${(sermon_content || '').trim()}\n[상담] ${(counseling_content || '').trim()}`;

    const memberId = member_id ? parseInt(member_id) : null;
    if (memberId) {
      const updateFields = {};
      if (member_status) updateFields.member_status = member_status;
      if (category) updateFields.category = category;
      if (bs) updateFields.bs = bs;
      if (Object.keys(updateFields).length > 0) {
        await supabase.from('members').update(updateFields).eq('id', memberId);
      }
    }

    if (sessionId.startsWith('m_')) {
      const meetingId = sessionId.replace('m_', '');
      const finalLead = lead_target ? lead_target.trim() : '';
      const finalMemo = `[lead:${finalLead}] ${(remark_memo || '').trim()}`;
      await supabase.from('meetings').update({ date, memo: finalMemo }).eq('id', meetingId);

      if (memberId) {
        const { data: existing } = await supabase.from('attendance')
          .select('id').eq('meeting_id', meetingId).eq('member_id', memberId).maybeSingle();
        if (existing) {
          await supabase.from('attendance').update({ testimony_snapshot: fullContent || null }).eq('id', existing.id);
        }
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT /api/visitation/:sessionId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/visitation/:sessionId — 개별 심방 기록 삭제
app.delete('/api/visitation/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    if (sessionId.startsWith('m_')) {
      const meetingId = sessionId.replace('m_', '');
      const { error: attErr } = await supabase.from('attendance').delete().eq('meeting_id', meetingId);
      if (attErr) throw attErr;
      const { error: meetErr } = await supabase.from('meetings').delete().eq('id', meetingId);
      if (meetErr) throw meetErr;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/visitation/:sessionId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/visitation/member/:memberId — 특정 성도의 모든 심방 이력 삭제
app.delete('/api/visitation/member/:memberId', async (req, res) => {
  const { memberId } = req.params;
  try {
    const meetings = await fetchAllRows((from, to) =>
      supabase.from('meetings').select('id').eq('type', '심방').range(from, to)
    );
    const visitationMeetingIds = (meetings || []).map(m => m.id);

    if (visitationMeetingIds.length > 0) {
      const { data: attRows, error: attGetErr } = await supabase
        .from('attendance')
        .select('meeting_id')
        .eq('member_id', memberId)
        .in('meeting_id', visitationMeetingIds);
      if (attGetErr) throw attGetErr;

      const targetMeetingIds = (attRows || []).map(a => a.meeting_id);
      if (targetMeetingIds.length > 0) {
        const { error: attDelErr } = await supabase
          .from('attendance').delete().eq('member_id', memberId).in('meeting_id', targetMeetingIds);
        if (attDelErr) throw attDelErr;

        const { error: meetDelErr } = await supabase
          .from('meetings').delete().in('id', targetMeetingIds);
        if (meetDelErr) throw meetDelErr;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/visitation/member/:memberId error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/members/filter', async (req, res) => {
    const { q } = req.query;
    try {
        // [2026-07-07 페이지네이션] 검색어가 넓으면(예: 흔한 성씨) 1000명을 넘을 수 있으므로
        // fetchAllRows 사용.
        const data = await fetchAllRows((from, to) =>
            supabase
                .from('members')
                .select('*')
                .ilike('name', `%${q}%`)
                .eq('status', 'active')
                .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
                .range(from, to)
        );
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/dashboard/attendance', async (req, res) => {
    const year = parseInt(req.query.year);
    if (!year) return res.status(400).json({ error: 'Year is required' });

    const startDate = `${year - 1}-12-01`;
    const endDate = `${year}-11-30`;

    try {
        // [2026-07-07 페이지네이션] 한 해 동안의 모임이 활발한 교회는 1년치 모임도 1000건을
        // 넘을 수 있고, 성도 수도 1000명을 넘을 수 있으므로 둘 다 fetchAllRows로 조회한다.
        // date만으로는 동률이 흔하므로 id를 타이브레이커로 추가.
        const meetings = await fetchAllRows((from, to) =>
            supabase
                .from('meetings')
                .select('*')
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: true })
                .order('id', { ascending: true })
                .range(from, to)
        );

        const members = await fetchAllRows((from, to) =>
            supabase
                .from('members')
                .select('id, name, category, bs, district, birth_year, position, church_service, family_relation')
                .eq('status', 'active')
                .neq('name', ANONYMOUS_COUNSELING_NAME)  // 익명 상담 기록용 행 제외(성도 아님)
                .range(from, to)
        );

        let allAttendance = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
            const { data: pageData, error: attErr } = await supabase
                .from('attendance')
                .select(`
                    id,
                    meeting_id,
                    member_id,
                    is_present,
                    testimony_snapshot,
                    district_snapshot,
                    category_snapshot,
                    meetings!inner(date)
                `)
                .gte('meetings.date', startDate)
                .lte('meetings.date', endDate)
                .range(page * pageSize, (page + 1) * pageSize - 1);
                
            if (attErr) throw attErr;

            allAttendance = allAttendance.concat(pageData || []);
            if (!pageData || pageData.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        }

        const membersWithAttendance = members.map(member => {
            const memberAttendance = {};
            allAttendance.filter(a => a.member_id === member.id).forEach(a => {
                memberAttendance[a.meeting_id] = {
                    is_present: a.is_present,
                    testimony_snapshot: a.testimony_snapshot
                };
            });
            return { ...member, attendance: memberAttendance };
        });

        // [2026-07-06] 프론트(dashboard.js/meeting_dashboard.js)가 서버와 동일한
        // 의무출석 판정(js/mandatory_meeting.js)을 쓸 수 있도록
        // 리더 소속 폴백과 직분 이력(모임 날짜 시점 임원 판정용)을 함께 내려준다.
        // (attendance-rates 집계와 동일한 데이터 기준 — 페이지마다 출석률이 다르게 나오던 버그 방지)
        const leaderProfile = await fetchLeaderChurchParish();

        let positionRecordsByMember = {};
        try {
            const positionRecordsRaw = await fetchAllRows((from, to) =>
                supabase
                    .from('member_records')
                    .select('id, member_id, date, status, remark')
                    .in('status', ['POSITION', 'POSITION_DISMISS'])
                    .range(from, to)
            );
            (positionRecordsRaw || []).forEach(r => {
                if (!positionRecordsByMember[r.member_id]) positionRecordsByMember[r.member_id] = [];
                positionRecordsByMember[r.member_id].push(r);
            });
        } catch (posErr) {
            console.error('Dashboard position records load failed:', posErr);
        }

        res.json({
            meetings: meetings || [],
            members: membersWithAttendance,
            leaderProfile: leaderProfile || null,
            positionRecords: positionRecordsByMember
        });
    } catch (err) {
        console.error('Dashboard attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sermon-stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        // [2026-07-07 페이지네이션] 필터 없이 전체 모임(설교 포함 전체 이력)을 조회하므로
        // 연차가 쌓이면 1000건을 넘어 오래된 설교가 조용히 누락될 수 있다. fetchAllRows로 전체 조회.
        const allMeetings = await fetchAllRows((from, to) =>
            supabase
                .from('meetings')
                .select('id, date, title, type, sermon_title, memo, church, start_time, end_time, leader_church_snapshot, leader_parish_snapshot, attendance(count)')
                .eq('attendance.is_present', 1)
                .order('date', { ascending: false })
                .order('id', { ascending: false })
                .range(from, to)
        );

        // Filter to match sermon_history.js logic exactly
        const excludedTypes = ['구원기념일', '교회행사', '심방', '상담', '개인상담'];
        const meetings = allMeetings.filter(m => {
            if (excludedTypes.includes(m.type)) return false;
            if (m.date >= today) return true; // Include all upcoming meetings regardless of sermon_title
            return m.type === '설교' || m.type === '외부설교' || (m.sermon_title && m.sermon_title.trim() !== '');
        });

        // 로컬 옵시디언 설교 스캔 (원고 존재 여부 검증 및 자동 매핑용)
        const obsidianSermons = scanObsidianSermons();
        const hasLocalVault = fs.existsSync(OBSIDIAN_SERMON_DIR);
        const validObsidianUris = new Set(obsidianSermons.map(s => s.obsidianUri));

        let bibleBooksCount = {};
        let keywordsCount = {};
        let matchedSermons = [];
        let obsidianMatchesCount = 0;

        meetings.forEach(meeting => {
            const title = (meeting.sermon_title || '').trim();
            let sermon_bible = '';
            let sermon_tags = '';
            let obsidian_uri = '';
            let cleanMemo = meeting.memo || '';
            
            if (cleanMemo.startsWith('{')) {
                const firstLine = cleanMemo.split(/\r?\n|\\n/)[0];
                try {
                    if (firstLine.endsWith('}')) {
                        const meta = JSON.parse(firstLine);
                        if (meta.bible !== undefined || meta.tags !== undefined || meta.obsidian_uri !== undefined) {
                            sermon_bible = meta.bible || '';
                            sermon_tags = meta.tags || '';
                            obsidian_uri = meta.obsidian_uri || '';
                            cleanMemo = cleanMemo.substring(firstLine.length).replace(/^(\r?\n|\\n)+/, '');
                        }
                    }
                } catch(e) {}
            }

            const obsMatch = cleanMemo.match(/\[obsidian:\s*(.*?)\]/);
            if (obsMatch) {
                if (!obsidian_uri) obsidian_uri = obsMatch[1].trim();
                cleanMemo = cleanMemo.replace(/\[obsidian:\s*.*?\]/g, '').trim();
            }

            // 로컬 볼트가 있는 환경에서 기존 obsidian_uri가 실제 파일과 맞지 않으면 초기화 후 재탐색
            if (hasLocalVault && obsidian_uri && !validObsidianUris.has(obsidian_uri)) {
                obsidian_uri = '';
            }

            // obsidian_uri가 아직 없거나 재탐색이 필요한 경우 스마트 매칭 시도
            if (!obsidian_uri && obsidianSermons.length > 0 && (title || meeting.title)) {
                const candidateMeeting = {
                    ...meeting,
                    sermon_bible,
                    sermon_tags
                };
                let bestSermon = null;
                let bestScore = 0;
                for (const s of obsidianSermons) {
                    const { score } = scoreObsidianMatch(s, candidateMeeting);
                    if (score > bestScore) {
                        bestScore = score;
                        bestSermon = s;
                    }
                }
                if (bestScore >= 45 && bestSermon) {
                    obsidian_uri = bestSermon.obsidianUri;
                    if (!sermon_bible && bestSermon.bible) {
                        sermon_bible = bestSermon.bibleBook || bestSermon.bible;
                    }
                    if (!sermon_tags && bestSermon.tags && bestSermon.tags.length > 0) {
                        sermon_tags = bestSermon.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
                    }
                }
            }

            if (obsidian_uri) obsidianMatchesCount++;

            matchedSermons.push({
                id: meeting.id,
                date: meeting.date,
                title: meeting.title || '',
                meeting_title: meeting.title || '',
                type: meeting.type,
                church: meeting.church || '',
                memo: cleanMemo,
                sermon_title: title,
                sermon_bible: sermon_bible || '',
                sermon_tags: sermon_tags || '',
                obsidian_uri: obsidian_uri || '',
                leader_church_snapshot: meeting.leader_church_snapshot || null,
                leader_parish_snapshot: meeting.leader_parish_snapshot || null,
                start_time: meeting.start_time,
                end_time: meeting.end_time,
                attendee_count: meeting.attendance && meeting.attendance.length > 0 ? meeting.attendance[0].count : 0
            });

            // Bible Counting (장절이 포함된 경우에도 표준 성경 권명으로 집계)
            if (sermon_bible) {
                const parsedRef = parseBibleReference(sermon_bible);
                const bookKey = parsedRef ? parsedRef.book : sermon_bible.split(/\s+/)[0].trim();
                if (bookKey) {
                    bibleBooksCount[bookKey] = (bibleBooksCount[bookKey] || 0) + 1;
                }
            }

            // Keyword Extraction: Only from explicit tags
            if (sermon_tags) {
                const words = sermon_tags.replace(/[#]/g, '').replace(/[^\w\s가-힣]/g, ' ').split(/\s+/);
                const stopWords = ['수', '있', '하', '것', '들', '그', '되', '이', '보', '않', '없', '나', '사람', '주', '아니', '등', '같', '우리', '때', '년', '가', '한', '지', '대하', '오', '말', '일', '그렇', '위하', '때문', '그것', '두', '말하', '알', '그러나', '받', '못하', '그런', '또', '문제', '더', '사회', '많', '그리고', '좋', '크', '따르', '중', '나오', '가지', '씨', '시키', '만들', '지금', '생각하', '그러', '속', '하나', '집', '살', '모르', '적', '월', '데', '자신', '안', '어떤', '내', '경우', '명', '생각', '시간', '그녀', '다시', '이런', '앞', '보이', '번', '나', '다른', '어떻', '여자', '개', '전', '들', '사실', '이렇', '점', '싶', '말', '정도', '좀', '원', '잘', '통하', '소리', '놓', '위해', '대한'];
                
                words.forEach(word => {
                    const cleanWord = word.trim();
                    if (cleanWord.length > 1 && !stopWords.includes(cleanWord) && isNaN(cleanWord)) {
                        keywordsCount[cleanWord] = (keywordsCount[cleanWord] || 0) + 1;
                    }
                });
            }
        });

        // Format for response
        const topKeywords = Object.entries(keywordsCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([text, weight]) => ({ text, weight }));

        const bibleDist = Object.entries(bibleBooksCount)
            .sort((a, b) => b[1] - a[1])
            .map(([book, count]) => ({ book, count }));

        res.json({
            matchedSermons,
            topKeywords,
            bibleDist,
            totalAnalyzed: meetings.length,
            obsidianMatches: obsidianMatchesCount
        });
    } catch (err) {
        console.error('Sermon stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 옵시디언(Obsidian) 설교 노트 연동 API
// ==========================================
const OBSIDIAN_SERMON_DIR = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG\\01 내 설교';
const OBSIDIAN_VAULT_NAME = 'KHG';


// ==========================================
// 옵시디언(Obsidian) 성경/설교 스마트 매칭 엔진
// 제목 규칙: [01~66 성경번호] [성경축약어] [장_절 (_는 콜론)] [구분코드: mcs|mssm|mss|ms|nbs] [설교제목] [기타: 날짜/모임/교회]
// ==========================================
const BIBLE_BOOK_NUM_MAP = {
    1: '창세기', 2: '출애굽기', 3: '레위기', 4: '민수기', 5: '신명기',
    6: '여호수아', 7: '사사기', 8: '룻기', 9: '사무엘상', 10: '사무엘하',
    11: '열왕기상', 12: '열왕기하', 13: '역대상', 14: '역대하', 15: '에스라',
    16: '느헤미야', 17: '에스더', 18: '욥기', 19: '시편', 20: '잠언',
    21: '전도서', 22: '아가', 23: '이사야', 24: '예레미야', 25: '예레미야애가',
    26: '에스겔', 27: '다니엘', 28: '호세아', 29: '요엘', 30: '아모스',
    31: '오바댜', 32: '요나', 33: '미가', 34: '나훔', 35: '하박국',
    36: '스바냐', 37: '학개', 38: '스가랴', 39: '말라기',
    40: '마태복음', 41: '마가복음', 42: '누가복음', 43: '요한복음', 44: '사도행전',
    45: '로마서', 46: '고린도전서', 47: '고린도후서', 48: '갈라디아서', 49: '에베소서',
    50: '빌립보서', 51: '골로새서', 52: '데살로니가전서', 53: '데살로니가후서',
    54: '디모데전서', 55: '디모데후서', 56: '디도서', 57: '빌레몬서', 58: '히브리서',
    59: '야고보서', 60: '베드로전서', 61: '베드로후서', 62: '요한1서', 63: '요한2서',
    64: '요한3서', 65: '유다서', 66: '요한계시록'
};

const BIBLE_BOOK_MAP = {
    '창': '창세기', '창세': '창세기', '창세기': '창세기',
    '출': '출애굽기', '출애': '출애굽기', '출애굽기': '출애굽기',
    '레': '레위기', '레위': '레위기', '레위기': '레위기',
    '민': '민수기', '민수': '민수기', '민수기': '민수기',
    '신': '신명기', '신명': '신명기', '신명기': '신명기',
    '수': '여호수아', '수아': '여호수아', '여호수아': '여호수아',
    '삿': '사사기', '사사': '사사기', '사사기': '사사기',
    '룻': '룻기', '룻기': '룻기',
    '삼상': '사무엘상', '사무엘상': '사무엘상',
    '삼하': '사무엘하', '사무엘하': '사무엘하',
    '왕상': '열왕기상', '열왕기상': '열왕기상',
    '왕하': '열왕기하', '열왕기하': '열왕기하',
    '대상': '역대상', '역대상': '역대상',
    '대하': '역대하', '역대하': '역대하',
    '스': '에스라', '에스라': '에스라',
    '느': '느헤미야', '느헤미야': '느헤미야',
    '에': '에스더', '더': '에스더', '에스더': '에스더',
    '욥': '욥기', '욥기': '욥기',
    '시': '시편', '시편': '시편',
    '잠': '잠언', '잠언': '잠언',
    '전': '전도서', '전도': '전도서', '전도서': '전도서',
    '아': '아가', '아가': '아가',
    '사': '이사야', '이사야': '이사야',
    '렘': '예레미야', '예레미야': '예레미야',
    '애': '예레미야애가', '예레미야애가': '예레미야애가',
    '겔': '에스겔', '에스겔': '에스겔',
    '단': '다니엘', '다니엘': '다니엘',
    '호': '호세아', '호세아': '호세아',
    '욜': '요엘', '요엘': '요엘',
    '암': '아모스', '아모스': '아모스',
    '옵': '오바댜', '오바댜': '오바댜',
    '욘': '요나', '요나': '요나',
    '미': '미가', '미가': '미가',
    '나': '나훔', '나훔': '나훔',
    '합': '하박국', '하박국': '하박국',
    '습': '스바냐', '스바냐': '스바냐',
    '학': '학개', '학개': '학개',
    '슥': '스가랴', '스가랴': '스가랴',
    '말': '말라기', '말라기': '말라기',
    '마': '마태복음', '마태': '마태복음', '마태복음': '마태복음',
    '막': '마가복음', '마가': '마가복음', '마가복음': '마가복음',
    '눅': '누가복음', '누가': '누가복음', '누가복음': '누가복음',
    '요': '요한복음', '요한': '요한복음', '요한복음': '요한복음',
    '행': '사도행전', '사도행전': '사도행전',
    '롬': '로마서', '로마서': '로마서',
    '고전': '고린도전서', '고린도전서': '고린도전서',
    '고후': '고린도후서', '고린도후서': '고린도후서',
    '갈': '갈라디아서', '갈라디아서': '갈라디아서',
    '엡': '에베소서', '에베소서': '에베소서',
    '빌': '빌립보서', '빌립보서': '빌립보서',
    '골': '골로새서', '골로새서': '골로새서',
    '살전': '데살로니가전서', '데살로니가전서': '데살로니가전서',
    '살후': '데살로니가후서', '데살로니가후서': '데살로니가후서',
    '딤전': '디모데전서', '디모데전서': '디모데전서',
    '딤후': '디모데후서', '디모데후서': '디모데후서',
    '딛': '디도서', '디도서': '디도서',
    '몬': '빌레몬서', '빌레몬서': '빌레몬서',
    '히': '히브리서', '히브리서': '히브리서',
    '약': '야고보서', '야고보서': '야고보서',
    '벧전': '베드로전서', '베드로전서': '베드로전서',
    '벧후': '베드로후서', '베드로후서': '베드로후서',
    '요일': '요한1서', '요한일서': '요한1서', '요한1서': '요한1서',
    '요이': '요한2서', '요한이서': '요한2서', '요한2서': '요한2서',
    '요삼': '요한3서', '요한삼서': '요한3서', '요한3서': '요한3서',
    '유': '유다서', '유다': '유다서', '유다서': '유다서',
    '계': '요한계시록', '계시록': '요한계시록', '요한계시록': '요한계시록'
};

function parseBibleReference(text) {
    if (!text) return null;
    const str = String(text).trim();

    // 1) "[01~66 번호] [성경축약어] [장_절]" 또는 "[성경축약어]_[장-절]" 형태 파싱
    const m = str.match(/(?:^|[^\w가-힣])(?:(0?[1-9]|[1-5]\d|6[0-6])[\s_]+)?([가-힣]{1,5})[\s_]*(\d{1,3})(?:[_:\-장]\s*(\d{1,3}(?:[~\-]\d{1,3})?))?/);
    if (m) {
        const num = m[1] ? parseInt(m[1], 10) : null;
        const stdBook = BIBLE_BOOK_MAP[m[2]] || (num ? BIBLE_BOOK_NUM_MAP[num] : null);
        if (stdBook) {
            const ch = parseInt(m[3], 10);
            const vs = m[4] ? m[4].replace(/_/g, ':') : '';
            return {
                bookNum: num,
                book: stdBook,
                chapter: ch,
                verse: vs,
                formatted: `${stdBook} ${ch}${vs ? ':' + vs : '장'}`
            };
        }
    }

    // 2) 장절 없이 성경 이름만 단독으로 적힌 경우 (예: "시편", "출애굽기", "골로새서")
    for (const [abbr, fullBook] of Object.entries(BIBLE_BOOK_MAP)) {
        if (str === fullBook || str === abbr || str.startsWith(fullBook + ' ')) {
            return {
                bookNum: null,
                book: fullBook,
                chapter: null,
                verse: '',
                formatted: fullBook
            };
        }
    }
    return null;
}

// 옵시디언 파일명 정밀 파서
// 형식: [성경번호 01~66] [성경축약어] [장_절] [구분코드: mcs|mssm|mss|ms|nbs] [설교제목] [기타: 날짜, 모임명, 교회명]
function parseObsidianFilename(rawFilename) {
    const base = String(rawFilename || '').replace(/\.md$/i, '').trim();
    let rest = base;

    let bookNum = null;
    let bookName = '';
    let chapter = null;
    let verse = '';
    let bibleFormatted = '';
    let categoryCode = ''; // mcs(소그룹), mssm(주일말씀), mss(교회학교), ms, nbs

    // 1. 앞부분: [번호] [성경축약어] [장_절 (복수 구절 포함)] 추출
    const headMatch = rest.match(/^(?:(0?[1-9]|[1-5]\d|6[0-6])[\s_]+)?([가-힣]{1,5})[\s_]+(\d{1,3}(?:[_\-:]\d{1,3}(?:[~\-]\d{1,3})?)?(?:\s*,\s*\d{1,3}(?:[_\-:]\d{1,3}(?:[~\-]\d{1,3})?)?)*)\s*(.*)$/);
    if (headMatch) {
        bookNum = headMatch[1] ? parseInt(headMatch[1], 10) : null;
        const abbr = headMatch[2];
        bookName = BIBLE_BOOK_MAP[abbr] || (bookNum ? BIBLE_BOOK_NUM_MAP[bookNum] : '');
        const chVerseRaw = headMatch[3].trim();
        rest = headMatch[4].trim();

        const firstCv = chVerseRaw.match(/^(\d{1,3})(?:[_\-:](\d{1,3}(?:[~\-]\d{1,3})?))?/);
        if (firstCv) {
            chapter = parseInt(firstCv[1], 10);
            verse = firstCv[2] || '';
        }
        const normalizedCv = chVerseRaw.replace(/_/g, ':');
        if (bookName) {
            bibleFormatted = `${bookName} ${normalizedCv}`;
        }
    } else {
        const fallbackB = parseBibleReference(base);
        if (fallbackB) {
            bookNum = fallbackB.bookNum;
            bookName = fallbackB.book;
            chapter = fallbackB.chapter;
            verse = fallbackB.verse;
            bibleFormatted = fallbackB.formatted;
        }
    }

    // 2. 제목별 구분 코드 추출 (mcs, mssm, mss, ms, nbs)
    const codeMatch = rest.match(/^(mssm|mcs|mss|nbs|ms)\b\s*(.*)$/i);
    if (codeMatch) {
        categoryCode = codeMatch[1].toLowerCase();
        rest = codeMatch[2].trim();
    } else {
        const inlineCode = base.match(/\b(mssm|mcs|mss|nbs|ms)\b/i);
        if (inlineCode) categoryCode = inlineCode[1].toLowerCase();
    }

    // 3. 날짜 및 연월 추출 (YYYY.MM.DD / YYMMDD / YYYY.MM)
    let fullDate = '';
    let yearMonth = '';
    const fullDateMatch = rest.match(/(202\d)[\.\-_](\d{1,2})[\.\-_](\d{1,2})/);
    if (fullDateMatch) {
        fullDate = `${fullDateMatch[1]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[3].padStart(2, '0')}`;
        yearMonth = fullDate.slice(0, 7);
    } else {
        const sixDigitMatch = rest.match(/(?:^|\s)(2\d)(\d{2})(\d{2})(?:\s|$)/);
        if (sixDigitMatch) {
            const yy = parseInt(sixDigitMatch[1], 10);
            const mm = parseInt(sixDigitMatch[2], 10);
            const dd = parseInt(sixDigitMatch[3], 10);
            if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                fullDate = `20${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
                yearMonth = fullDate.slice(0, 7);
            }
        }
        if (!yearMonth) {
            const ymMatch = rest.match(/(202\d)[\.\-_](\d{1,2})(?!\d)/);
            if (ymMatch) {
                yearMonth = `${ymMatch[1]}-${ymMatch[2].padStart(2, '0')}`;
            }
        }
    }

    // 4. 파일명 내 교회명 / 구역번호 / 모임 힌트 추출
    let churchHint = '';
    const churchMatch = rest.match(/([가-힣]{2,10}교회)/);
    if (churchMatch) churchHint = churchMatch[1];

    let districtHint = '';
    const distMatch = rest.match(/\b(5\d{2})\s*(구역모임|조모임|구역|조)?/);
    if (distMatch) districtHint = distMatch[1];

    let meetingHint = '';
    const meetHintMatch = rest.match(/(교구전체모임|전체조모임|교구임원모임|임원모임|구역모임|조모임|형제모임|청년모임|주일말씀|주일설교|수요말씀|고믿음\s*공과|공과|미선부|중고등부|청년부|시설부)/);
    if (meetHintMatch) meetingHint = meetHintMatch[1].replace(/\s+/g, '');

    // 5. 순수 설교 제목(coreTitle) 정제 (뒤쪽 날짜·모임명·교회명 제거)
    let coreTitle = rest
        .replace(/(202\d)[\.\-_]\d{1,2}[\.\-_]\d{1,2}/g, ' ')
        .replace(/(202\d)[\.\-_]\d{1,2}(?!\d)/g, ' ')
        .replace(/(?:^|\s)2\d{5}(?:\s|$)/g, ' ')
        .replace(/\b5\d{2}\s*(구역모임|조모임|구역|조)?/g, ' ')
        .replace(/[가-힣]{2,10}교회\s*(주일말씀|주일설교|수요말씀)?/g, ' ')
        .replace(/(교구전체모임|전체조모임|교구임원모임|임원모임|구역모임|조모임|형제모임|청년모임|주일말씀|주일설교|수요말씀|고믿음\s*공과|공과)/g, ' ')
        .replace(/[\.\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!coreTitle) coreTitle = rest.trim() || base;

    return {
        bookNum,
        bookName,
        chapter,
        verse,
        bibleFormatted,
        categoryCode,
        coreTitle,
        fullDate,
        yearMonth,
        churchHint,
        districtHint,
        meetingHint
    };
}

function normalizeTitleForCompare(str) {
    if (!str) return '';
    return String(str)
        .replace(/\([^)]*\)/g, ' ') // (중고등부), (미선부 오전) 등 괄호 부제 제거
        .replace(/[^\w가-힣]/g, '')
        .toLowerCase();
}

function extractKeywords(str) {
    if (!str) return [];
    const clean = str
        .replace(/202\d[\.\-_]\d{1,2}[\.\-_]\d{1,2}/g, ' ')
        .replace(/202\d[\.\-_]\d{1,2}/g, ' ')
        .replace(/\b(mssm|mcs|mss|nbs|ms|주일설교|주일말씀|외부설교|조모임|구역모임|교구임원모임|임원모임|전체|교회|주일|설교|말씀|공과|고믿음|미선부|중고등부)\b/gi, ' ')
        .replace(/[0-9_\-\.\:\(\)\[\]#~,]/g, ' ');
    const tokens = clean.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2);
    const stopWords = new Set(['대한', '정리', '가지', '의미', '어떻게', '생각', '우리', '오늘', '통해', '하라']);
    return tokens.filter(t => !stopWords.has(t));
}

function scoreObsidianMatch(sermon, meeting) {
    let score = 0;
    const reasons = [];

    // 모임 메모 내 bible 메타데이터도 추출
    let meetingBibleStr = meeting.sermon_bible || '';
    if (!meetingBibleStr && meeting.memo && String(meeting.memo).trim().startsWith('{')) {
        try {
            const firstLine = String(meeting.memo).trim().split(/\r?\n|\\n/)[0];
            if (firstLine.endsWith('}')) {
                const parsed = JSON.parse(firstLine);
                if (parsed.bible) meetingBibleStr = parsed.bible;
            }
        } catch (e) {}
    }

    // 0. 성경 본문 충돌 검사 (모임에 성경이 명시되어 있는데 원고 성경과 다르면 매칭 제외)
    const sBible = parseBibleReference(sermon.bible || sermon.filename);
    const mBibleFromField = parseBibleReference(meetingBibleStr + ' ' + (meeting.sermon_title || ''));
    if (sBible && mBibleFromField && sBible.book && mBibleFromField.book && sBible.book !== mBibleFromField.book) {
        return { score: 0, reasons: ['성경 본문 불일치'] };
    }

    // 1. 순수 설교 제목(coreTitle) 일치도 (최대 60점)
    let titleMatchScore = 0;
    const sCoreNorm = normalizeTitleForCompare(sermon.coreTitle || sermon.title);
    const mSermonNorm = normalizeTitleForCompare(meeting.sermon_title || '');
    const sFullNorm = normalizeTitleForCompare(sermon.filename ? sermon.filename.replace(/\.md$/i, '') : '');

    if (mSermonNorm && mSermonNorm.length >= 2) {
        if (sFullNorm && mSermonNorm.includes(sFullNorm)) {
            titleMatchScore = 60;
            score += 60;
            reasons.push(`원고파일명 직접포함(+60)`);
        } else if (sCoreNorm && sCoreNorm.length >= 2) {
            if (sCoreNorm === mSermonNorm) {
                titleMatchScore = 60;
                score += 60;
                reasons.push(`설교제목 완전일치(+60)`);
            } else if (sCoreNorm.length >= 4 && mSermonNorm.length >= 4 && (sCoreNorm.includes(mSermonNorm) || mSermonNorm.includes(sCoreNorm))) {
                titleMatchScore = 45;
                score += 45;
                reasons.push(`설교제목 핵심포함(+45)`);
            }
        }
    }

    // 2. 설교 제목 키워드 일치 (최대 35점 - 모임의 설교 제목 키워드 기준)
    const sKeywords = extractKeywords(sermon.coreTitle || sermon.title || sermon.filename);
    const mSermonKeywords = extractKeywords(meeting.sermon_title || '');
    if (sKeywords.length > 0 && mSermonKeywords.length > 0) {
        let matchCount = 0;
        for (const sk of sKeywords) {
            if (mSermonKeywords.some(mk => mk === sk || (mk.length >= 2 && sk.length >= 2 && (mk.includes(sk) || sk.includes(mk))))) {
                matchCount++;
            }
        }
        if (matchCount > 0) {
            const kwScore = Math.min(35, matchCount * 15);
            titleMatchScore = Math.max(titleMatchScore, kwScore);
            if (score < 60) {
                score += kwScore;
                reasons.push(`제목 키워드 ${matchCount}개 일치(+${kwScore})`);
            }
        }
    }

    // 모임에 설교 제목이 이미 입력되어 있는데, 원고 제목/키워드와 전혀 일치하지 않는 경우:
    // 날짜와 성경 본문이 동시에 정확히 일치하는 경우가 아니면 다른 설교이므로 매칭 제외
    if (mSermonNorm.length >= 2 && titleMatchScore === 0) {
        const isSameDateAndBible = (sermon.date && meeting.date && sermon.date === meeting.date) &&
                                   (sBible && mBibleFromField && sBible.book === mBibleFromField.book);
        if (!isSameDateAndBible) {
            return { score: 0, reasons: ['설교제목 불일치'] };
        }
    }
    // 모임에 설교 제목이 아예 없는 경우: 날짜가 정확히 일치하지 않으면 자동 매칭하지 않음
    if (mSermonNorm.length < 2) {
        if (!sermon.date || !meeting.date || sermon.date !== meeting.date) {
            return { score: 0, reasons: ['설교제목 미입력 및 날짜 불일치'] };
        }
    }

    // 3. 성경 본문(번호/축약어/장_절) 일치 (최대 45점)
    const mBible = mBibleFromField || parseBibleReference(meeting.title || '');
    if (sBible && mBible && sBible.book === mBible.book) {
        if (sBible.chapter && mBible.chapter && sBible.chapter === mBible.chapter) {
            score += 45;
            reasons.push(`성경 ${sBible.book} ${sBible.chapter}장 일치(+45)`);
        } else {
            score += 25;
            reasons.push(`성경 ${sBible.book} 일치(+25)`);
        }
    }

    // 4. 제목별 구분 코드(mcs / mssm / mss / nbs)와 모임 성격 일치 (최대 15점)
    const code = (sermon.categoryCode || '').toLowerCase();
    const mType = (meeting.type || '').trim();
    const mTitleAndSermon = `${meeting.title || ''} ${meeting.sermon_title || ''}`;
    if (code === 'mcs') {
        if (/구역모임|조모임|전체조모임|교구전체모임|교구임원모임|형제모임|청년모임/.test(mType)) {
            score += 12;
            reasons.push(`소그룹설교(mcs) 구분 일치(+12)`);
        }
    } else if (code === 'mssm' || code === 'ms') {
        if (mType === '외부설교' || (mType === '설교' && /주일|수요/.test(mTitleAndSermon))) {
            score += 12;
            reasons.push(`주일/대예배말씀(${code}) 구분 일치(+12)`);
        }
    } else if (code === 'mss') {
        if (mType === '설교' || /중고등부|미선부|청년부|공과|교회학교|고믿음/.test(mTitleAndSermon)) {
            score += 15;
            reasons.push(`교회학교말씀(mss) 구분 일치(+15)`);
        }
    }

    // 5. 교회명 일치 (최대 30점)
    const sChurchRaw = sermon.church || sermon.churchHint || '';
    if (sChurchRaw) {
        const cleanChurch = sChurchRaw.replace(/교회.*$/, '').trim();
        const mChurch = (meeting.church || '') + ' ' + (meeting.title || '');
        if (cleanChurch && cleanChurch.length >= 2 && mChurch.includes(cleanChurch)) {
            score += 30;
            reasons.push(`교회명(${cleanChurch}) 일치(+30)`);
        }
    }

    // 6. 날짜 및 연월 일치도 (최대 35점)
    if (sermon.date && meeting.date) {
        if (sermon.date === meeting.date) {
            score += 35;
            reasons.push(`날짜 완전일치(+35)`);
        } else {
            const diffDays = Math.abs((new Date(sermon.date) - new Date(meeting.date)) / (1000 * 60 * 60 * 24));
            if (diffDays <= 4) {
                score += 20;
                reasons.push(`날짜 근접(±${Math.round(diffDays)}일)(+20)`);
            } else if (diffDays <= 7) {
                score += 12;
                reasons.push(`날짜 근접(±${Math.round(diffDays)}일)(+12)`);
            } else if (diffDays <= 20 && code === 'mcs') {
                score += 8;
                reasons.push(`동일월 소그룹 순회설교(+8)`);
            }
        }
    } else if (sermon.yearMonth && meeting.date && meeting.date.startsWith(sermon.yearMonth)) {
        score += 12;
        reasons.push(`연월(${sermon.yearMonth}) 일치(+12)`);
    }

    // 7. 모임 구분 및 구역번호 힌트 일치 (최대 15점)
    const sTypeText = `${sermon.type || ''} ${sermon.filename || ''} ${sermon.district || ''} ${sermon.meetingHint || ''}`;
    const mTypeText = `${meeting.type || ''} ${meeting.title || ''} ${meeting.sermon_title || ''}`;
    if (sermon.districtHint && mTypeText.includes(sermon.districtHint)) {
        score += 10;
        reasons.push(`구역/조 번호(${sermon.districtHint}) 일치(+10)`);
    }
    ['조모임', '구역모임', '청년모임', '형제모임', '외부설교', '주일설교', '임원모임', '중고등부', '미선부'].forEach(t => {
        if (sTypeText.includes(t) && mTypeText.includes(t)) {
            score += 10;
            reasons.push(`모임구분(${t}) 일치(+10)`);
        }
    });

    return { score, reasons };
}

function scanObsidianSermons() {
    if (!fs.existsSync(OBSIDIAN_SERMON_DIR)) {
        console.warn('[OBSIDIAN SCAN] Directory does not exist:', OBSIDIAN_SERMON_DIR);
        return [];
    }

    function walk(dir) {
        let results = [];
        try {
            const list = fs.readdirSync(dir);
            for (const item of list) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    results = results.concat(walk(fullPath));
                } else if (item.endsWith('.md')) {
                    results.push(fullPath);
                }
            }
        } catch (e) {
            console.warn('[OBSIDIAN SCAN] Walk error on', dir, e.message);
        }
        return results;
    }

    const files = walk(OBSIDIAN_SERMON_DIR);
    const parsedList = [];

    for (const file of files) {
        try {
            const content = fs.readFileSync(file, 'utf8');
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            
            let meta = {};
            let curKey = null;
            if (fmMatch) {
                for (const line of fmMatch[1].split(/\r?\n/)) {
                    const kv = line.match(/^([\w가-힣,_\s]+):\s*(.*)$/);
                    if (kv) {
                        curKey = kv[1].trim();
                        meta[curKey] = kv[2].trim();
                    } else if (line.trim().startsWith('-') && curKey) {
                        if (!Array.isArray(meta[curKey])) {
                            meta[curKey] = meta[curKey] ? [meta[curKey]] : [];
                        }
                        meta[curKey].push(line.trim().replace(/^-\s*/, ''));
                    }
                }
            }

            const base = path.basename(file, '.md');
            const fnParsed = parseObsidianFilename(base);
            
            // 1. 날짜 추출 (프론트매터 -> 파일명 정밀 파서 순서)
            let date = meta['날짜'] || '';
            if (typeof date === 'string') {
                const dm = date.match(/(202\d)[\.\-_](\d{1,2})[\.\-_](\d{1,2})/);
                if (dm) date = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
                else date = '';
            }
            if (!date && fnParsed.fullDate) {
                date = fnParsed.fullDate;
            }

            // 2. 본문 및 제목 파싱
            let bible = meta['본문'] || '';
            const parsedB = parseBibleReference(bible) || (fnParsed.bookName ? {
                book: fnParsed.bookName,
                chapter: fnParsed.chapter,
                verse: fnParsed.verse,
                formatted: fnParsed.bibleFormatted || fnParsed.bookName
            } : parseBibleReference(base));

            if (parsedB) {
                bible = parsedB.formatted;
            }

            const title = fnParsed.coreTitle || base;

            // 3. 태그
            let tags = [];
            if (meta['tags']) {
                tags = Array.isArray(meta['tags']) ? meta['tags'] : [meta['tags']];
            }

            // 4. 설교 성격 / 모임 타입
            let type = meta['성격'] || '';
            if (Array.isArray(type)) type = type.join(', ');
            if (!type && fnParsed.categoryCode) {
                if (fnParsed.categoryCode === 'mcs') type = fnParsed.meetingHint || '소그룹설교';
                else if (fnParsed.categoryCode === 'mssm') type = '주일말씀';
                else if (fnParsed.categoryCode === 'mss') type = '교회학교';
            }

            // 5. 비고 (교회명 등)
            let church = meta['비고'] || fnParsed.churchHint || '';

            // 6. 구역/조
            let district = meta['조,구역'] || (fnParsed.districtHint ? `${fnParsed.districtHint}${fnParsed.meetingHint || ''}` : '');
            if (Array.isArray(district)) district = district.join(', ');

            // 옵시디언 딥링크 URI
            const vaultRoot = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG';
            const relPath = path.relative(vaultRoot, file).replace(/\\/g, '/');
            const obsidianUri = `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT_NAME)}&file=${encodeURIComponent(relPath)}`;

            // 목사님이 '비고', '성격', '날짜' 등에 동일 설교를 여러 번 한 이력을 기록해 둔 경우 지원
            const extraDates = [];
            const remarksText = String(church || '') + ' ' + String(type || '');
            const allDateMatches = [...remarksText.matchAll(/(202\d)[\.\-_](\d{1,2})[\.\-_](\d{1,2})/g)];
            for (const dm of allDateMatches) {
                const parsedD = `${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
                if (!extraDates.includes(parsedD)) extraDates.push(parsedD);
            }

            const entryDates = extraDates.length > 0 ? extraDates : [date || null];

            for (const d of entryDates) {
                parsedList.push({
                    file,
                    filename: path.basename(file),
                    obsidianUri,
                    date: d,
                    yearMonth: d ? d.slice(0, 7) : fnParsed.yearMonth,
                    title: title || base,
                    coreTitle: fnParsed.coreTitle || title || base,
                    bookNum: fnParsed.bookNum,
                    bibleBook: parsedB ? parsedB.book : fnParsed.bookName,
                    bible: bible || '',
                    categoryCode: fnParsed.categoryCode || '',
                    tags: tags.map(t => String(t).trim()).filter(Boolean),
                    type: type || '설교',
                    church: church || '',
                    churchHint: fnParsed.churchHint || '',
                    district: district || '',
                    districtHint: fnParsed.districtHint || '',
                    meetingHint: fnParsed.meetingHint || ''
                });
            }
        } catch (err) {
            console.warn('[OBSIDIAN PARSE ERROR]', file, err.message);
        }
    }

    return parsedList;
}

// GET /api/obsidian/sermons — 로컬 옵시디언 설교 목록 조회
app.get('/api/obsidian/sermons', (req, res) => {
    try {
        const sermons = scanObsidianSermons();
        res.json({
            success: true,
            total: sermons.length,
            sermons
        });
    } catch (e) {
        console.error('GET /api/obsidian/sermons error:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/obsidian/sync — 옵시디언 설교를 PMP meetings에 스마트 동기화
app.post('/api/obsidian/sync', express.json(), async (req, res) => {
    try {
        const sermons = scanObsidianSermons();
        if (!sermons || sermons.length === 0) {
            return res.status(400).json({
                success: false,
                error: '로컬 PC의 옵시디언 보관함 폴더에 접근할 수 없습니다. 원고 동기화는 볼트 폴더가 있는 로컬 PC 환경에서 실행해 주세요. 기존 링크는 안전하게 보존되었습니다.'
            });
        }
        
        // 전체 모임 목록 조회 (1000건 초과 대비 fetchAllRows 사용)
        const allMeetings = await fetchAllRows((from, to) =>
            supabase
                .from('meetings')
                .select('id, title, sermon_title, memo, date, church, type')
                .range(from, to)
        );

        let syncedCount = 0;
        let createdCount = 0;
        let updatedCount = 0;
        const syncLogs = [];
        const matchedSermonFiles = new Set();

        const excludedTypes = new Set(['구원기념일', '교회행사', '심방', '상담', '개인상담']);
        const validObsidianUris = new Set(sermons.map(s => s.obsidianUri));

        // 1단계: 기존 모임들(581/582/583 구역·조모임 등 동일 원고 다회 설교 포함)을 기준으로 최적 옵시디언 원고 매핑
        for (const m of allMeetings) {
            if (excludedTypes.has(m.type)) continue;

            // 기존 메모 파싱
            let cleanMemo = m.memo || '';
            let existingBible = '';
            let existingTags = '';
            let existingObsUri = '';

            if (cleanMemo.startsWith('{')) {
                const firstLine = cleanMemo.split(/\r?\n|\\n/)[0];
                try {
                    if (firstLine.endsWith('}')) {
                        const meta = JSON.parse(firstLine);
                        existingBible = meta.bible || '';
                        existingTags = meta.tags || '';
                        existingObsUri = meta.obsidian_uri || '';
                        cleanMemo = cleanMemo.substring(firstLine.length).replace(/^(\r?\n|\\n)+/, '');
                    }
                } catch(e) {}
            }
            cleanMemo = cleanMemo.replace(/\[obsidian:.*?\]/g, '').trim();

            const mWithMeta = { ...m, sermon_bible: existingBible, sermon_tags: existingTags };
            let bestSermon = null;
            let highestScore = 0;
            let bestReasons = [];

            for (const s of sermons) {
                const { score, reasons } = scoreObsidianMatch(s, mWithMeta);
                if (score > highestScore) {
                    highestScore = score;
                    bestSermon = s;
                    bestReasons = reasons;
                }
            }

            if (highestScore >= 45 && bestSermon) {
                matchedSermonFiles.add(bestSermon.filename);
                const sermonTagsStr = existingTags || (bestSermon.tags.length > 0 ? bestSermon.tags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ') : '');
                const finalBible = existingBible || bestSermon.bibleBook || bestSermon.bible || '';

                const memoMeta = {
                    bible: finalBible,
                    tags: sermonTagsStr,
                    obsidian_uri: bestSermon.obsidianUri,
                    obsidian_file: bestSermon.filename
                };
                const updatedMemo = cleanMemo ? `${JSON.stringify(memoMeta)}\n\n${cleanMemo}` : JSON.stringify(memoMeta);

                await supabase
                    .from('meetings')
                    .update({
                        sermon_title: m.sermon_title || bestSermon.coreTitle || bestSermon.title,
                        memo: updatedMemo
                    })
                    .eq('id', m.id);

                updatedCount++;
                syncedCount++;
                syncLogs.push({
                    file: bestSermon.filename,
                    meetingId: m.id,
                    meetingTitle: m.title,
                    action: 'updated',
                    score: highestScore,
                    reasons: bestReasons
                });
            } else if (existingObsUri) {
                // 매칭되는 옵시디언 설교 원고가 없는 모임에 남아있던 잘못된 링크를 정리하여 회색 원고 버튼으로 표시되게 함
                const memoMeta = (existingBible || existingTags)
                    ? JSON.stringify({ bible: existingBible, tags: existingTags })
                    : '';
                const updatedMemo = memoMeta
                    ? (cleanMemo ? `${memoMeta}\n\n${cleanMemo}` : memoMeta)
                    : cleanMemo;
                await supabase.from('meetings').update({ memo: updatedMemo }).eq('id', m.id);
            }
        }

        res.json({
            success: true,
            totalFiles: sermons.length,
            matchedCount: syncedCount,
            totalScanned: sermons.length,
            syncedCount,
            createdCount,
            updatedCount,
            logs: syncLogs
        });
    } catch (e) {
        console.error('POST /api/obsidian/sync error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ==========================================
// Gemini API 키 조회 및 DB 동기화 헬퍼 (PC & 모바일/Vercel 공통)
// ==========================================
let cachedDbGeminiKey = '';
async function resolveGeminiApiKey(req) {
    const clientKey = (req.headers['x-gemini-key'] || req.body?.geminiApiKey || '').trim();
    const envKey = (process.env.GEMINI_API_KEY || '').trim();

    // 1. 클라이언트에서 새 API 키를 직접 입력해 보낸 경우 DB에도 저장해 기기 간 공유
    if (clientKey && clientKey !== cachedDbGeminiKey) {
        cachedDbGeminiKey = clientKey;
        try {
            const { data: existing } = await supabase
                .from('member_records')
                .select('id')
                .eq('status', 'SYSTEM_GEMINI_KEY')
                .order('id', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (existing?.id) {
                await supabase.from('member_records').update({ remark: clientKey }).eq('id', existing.id);
            } else {
                await supabase.from('member_records').insert({
                    member_id: 289,
                    date: '2026-01-01',
                    status: 'SYSTEM_GEMINI_KEY',
                    remark: clientKey
                });
            }
        } catch (e) {
            console.warn('Gemini key DB sync error:', e.message);
        }
        return clientKey;
    }

    // 2. 서버 환경변수(.env)에 키가 있는 경우
    if (envKey) return envKey;

    // 3. 클라이언트 헤더/바디 키 또는 메모리 캐시가 있는 경우
    if (clientKey) return clientKey;
    if (cachedDbGeminiKey) return cachedDbGeminiKey;

    // 4. 모바일/Vercel 등 환경변수가 없는 경우 Supabase DB에 저장된 시스템 키 조회
    try {
        const { data } = await supabase
            .from('member_records')
            .select('remark')
            .eq('status', 'SYSTEM_GEMINI_KEY')
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (data?.remark) {
            cachedDbGeminiKey = data.remark.trim();
            return cachedDbGeminiKey;
        }
    } catch (e) {
        console.warn('Gemini key DB lookup error:', e.message);
    }

    return '';
}

// ==========================================
// Google Gemini AI 설교문 심층 분석 API
// ==========================================
app.post('/api/ai/analyze-sermon', express.json(), async (req, res) => {
    try {
        const { meetingId, sermonTitle, obsidianUri, memo, bible } = req.body;
        const apiKey = await resolveGeminiApiKey(req);
        if (!apiKey) {
            return res.status(401).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }

        let sermonContent = '';
        let sourceFileName = '';

        // 1. 옵시디언 로컬 원고 파일 찾기
        if (obsidianUri) {
            try {
                const urlObj = new URL(obsidianUri);
                const fileParam = urlObj.searchParams.get('file');
                if (fileParam) {
                    const vaultRoot = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG';
                    let candidatePath = path.join(vaultRoot, decodeURIComponent(fileParam));
                    if (!candidatePath.endsWith('.md')) candidatePath += '.md';
                    if (fs.existsSync(candidatePath)) {
                        sermonContent = fs.readFileSync(candidatePath, 'utf8');
                        sourceFileName = path.basename(candidatePath);
                    }
                }
            } catch(e) {}
        }

        // 2. obsidianUri로 못 찾았을 경우 제목으로 탐색
        if (!sermonContent && (sermonTitle || sourceFileName)) {
            const targetTitle = (sermonTitle || '').replace(/\.md$/, '').trim();
            const allFiles = scanObsidianSermons();
            const found = allFiles.find(f => {
                return f.filename.includes(targetTitle) || targetTitle.includes(f.title);
            });
            if (found && fs.existsSync(found.file)) {
                sermonContent = fs.readFileSync(found.file, 'utf8');
                sourceFileName = found.filename;
            }
        }

        // 3. 설교 본문 정제 (Frontmatter 제거, 최대 8500자 추출)
        let cleanText = sermonContent;
        if (cleanText) {
            cleanText = cleanText.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
            if (cleanText.length > 8500) {
                cleanText = cleanText.substring(0, 8500) + '\n\n...(이하 원고 생략)';
            }
        } else {
            cleanText = `제목: ${sermonTitle || '무제'}\n본문: ${bible || '미지정'}\n기록된 메모: ${memo || ''}`;
        }

        // 4. Gemini 프롬프트 구성
        const prompt = `
당신은 한국 복음주의 교회의 설교 분석 및 목회 전문 보조 AI입니다.
목사님의 설교문(원고)을 읽고 성도들의 영적 유익과 목회 현장에 실제 도움이 되도록 정밀하고 은혜롭게 분석해 주세요.

[설교 제목]: ${sermonTitle || ''}
[본문 성경]: ${bible || ''}

[설교 원고 내용]:
${cleanText}

반드시 아래 JSON 형식으로만 응답하고, 마크다운 코드블록(\`\`\`json)은 생략하거나 파싱 가능하도록 순수 JSON 문자열만 반환해 주세요:
{
  "one_line_summary": "이 설교가 성도들에게 주는 가장 핵심적인 단 한 줄 메시지",
  "three_point_summary": [
    "핵심 요약 1",
    "핵심 요약 2",
    "핵심 요약 3"
  ],
  "outline": [
    { "step": "서론", "point": "서론의 핵심 도입 및 문제 제기" },
    { "step": "본론 1", "point": "첫 번째 대지 핵심 교훈" },
    { "step": "본론 2", "point": "두 번째 대지 핵심 교훈" },
    { "step": "본론 3", "point": "세 번째 대지 핵심 교훈 (해당되는 경우)" },
    { "step": "결론", "point": "결론 및 성도의 결단과 위로" }
  ],
  "theological_points": ["핵심 신학/교리 키워드 2~4개 (예: 하나님의 은혜, 성결한 삶 등)"],
  "application_questions": [
    "구역/조모임/소그룹에서 성도들이 삶을 돌아보며 나눌 수 있는 실제적 질문 1",
    "삶의 적용 나눔 질문 2"
  ],
  "sermon_tone": "설교의 주된 어조 (예: 은혜와 위로, 영적 경각심, 성결과 헌신, 복음과 확신)",
  "recommended_tags": ["#추천태그1", "#추천태그2", "#추천태그3"]
}
`;

        const candidateModels = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
        let data = null;

        for (const modelName of candidateModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const apiRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });

                const resJson = await apiRes.json();
                const textPart = resJson.candidates?.[0]?.content?.parts?.find(p => p.text);
                if (textPart && textPart.text) {
                    let outText = textPart.text.trim();
                    outText = outText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    try {
                        data = JSON.parse(outText);
                        data.sourceFileName = sourceFileName || null;
                        data.hasOriginalFile = !!sermonContent;
                        break;
                    } catch(jsonErr) {
                        console.warn('JSON parse error from model response:', jsonErr);
                    }
                }
            } catch (err) {
                console.warn(`Model ${modelName} error:`, err.message);
            }
        }

        if (!data) {
            return res.status(500).json({ error: 'AI 분석 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
        }

        res.json({
            success: true,
            analysis: data
        });

    } catch (err) {
        console.error('AI Sermon analysis error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Google Gemini AI 상시 사역 비서 (스마트 어시스턴트) API
// ==========================================
app.post('/api/ai/assistant', express.json(), async (req, res) => {
    try {
        const { message, history = [], clientDate, clientTime } = req.body;
        const apiKey = await resolveGeminiApiKey(req);
        if (!apiKey) {
            return res.status(401).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }
        if (!message || !message.trim()) {
            return res.status(400).json({ error: '메시지를 입력해 주세요.' });
        }

        const nowKst = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
        const todayStr = clientDate || nowKst.toISOString().split('T')[0];
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const dayOfWeek = days[new Date(todayStr).getDay()];

        const leaderProfile = await fetchLeaderChurchParish().catch(() => null);

        // 최근 등록된 모임 10개
        const { data: recentMeetings } = await supabase
            .from('meetings')
            .select('id, title, date, type, sermon_title, start_time, end_time')
            .order('date', { ascending: false })
            .limit(10);

        // 메시지나 이전 대화에서 언급된 날짜(예: 10/11, 10월 11일 등) 감지하여 해당 날짜의 기존 모임들을 사전 조회
        let targetDateMeetings = [];
        let detectedDateStr = '';
        const recentHistoryText = (history && Array.isArray(history)) ? history.map(h => h.text || '').join(' ') : '';
        const combinedText = `${recentHistoryText} ${message}`;
        const dateMatch = combinedText.match(/(?:(\d{4})[.-/년]\s*)?(\d{1,2})[.-/월]\s*(\d{1,2})/);
        if (dateMatch) {
            const currentYear = new Date(todayStr).getFullYear();
            const y = dateMatch[1] || currentYear;
            const m = String(dateMatch[2]).padStart(2, '0');
            const d = String(dateMatch[3]).padStart(2, '0');
            detectedDateStr = `${y}-${m}-${d}`;
            const { data: foundMeetings } = await supabase
                .from('meetings')
                .select('id, title, date, type, sermon_title, start_time, end_time, memo')
                .eq('date', detectedDateStr);
            if (foundMeetings && foundMeetings.length > 0) {
                targetDateMeetings = foundMeetings;
            }
        }

        const historyContext = (history && Array.isArray(history) && history.length > 0)
            ? `[이전 대화 내역 (맥락 유지)]:
${history.map(h => `${h.role === 'user' ? '전도사님' : 'AI 비서'}: ${h.text}`).join('\n')}

`
            : '';

        const targetMeetingsContext = (targetDateMeetings.length > 0)
            ? `[언급된 날짜(${detectedDateStr})에 이미 등록되어 있는 모임 DB 현황]:
${targetDateMeetings.map(m => `- 모임ID: ${m.id} | 제목: "${m.title}" | 구분: ${m.type || '모임'} | 시간: ${m.start_time || '시간미정'}~${m.end_time || ''} | 현재설교제목: "${m.sermon_title || '미등록'}"`).join('\n')}

`
            : '';

        const prompt = `당신은 교회 목회 및 사역을 돕는 친절하고 유능한 "AI 사역 비서"입니다.
사용자는 강효근 전도사님(관리자)입니다.
현재 기준 일자: ${todayStr} (${dayOfWeek}요일)
관리자 소속: ${leaderProfile?.church || '서울중앙교회'} ${leaderProfile?.parish || '부곡교구'}
관리 구역: ${(leaderProfile?.managed_districts || ['581', '582', '583']).join(', ')}구역

${targetMeetingsContext}[최근 등록된 모임 10개]:
${(recentMeetings || []).map(m => `- [${m.date}] ${m.title} (${m.type || '모임'})${m.sermon_title ? ' | 설교: ' + m.sermon_title : ''}`).join('\n')}

${historyContext}사용자의 현재 요청: "${message}"

[지침]:
1. 사용자의 요청 의도와 이전 대화 맥락을 종합 분석하세요.
2. 아래 6가지 액션 중 가장 알맞은 하나를 식별하세요:
   - UPDATE_SERMON: 기존 모임의 설교 제목 등록/수정 요청
     * 예: "10/11 시설부 설교제목을 '믿음의 반석'으로 등록해줘", "어제 구역모임 설교제목 OO로 수정해줘"
     * 만약 사용자가 설교 제목 내용을 아직 주지 않고 "10/11 시설부 설교제목 등록해줘" 또는 "10/11은?"처럼 모임/날짜만 지정했다면:
       -> action은 "NONE"으로 두고, reply로 해당 날짜의 모임명을 짚으며 친절하게 어떤 설교 제목으로 등록할지 물어보세요!
          (예: "전도사님, 10월 11일(주일) 09:20 '시설부 말씀' 모임이 확인되었습니다. 어떤 설교 제목으로 등록해 드릴까요?")
     * 설교 제목이 주어졌다면:
       -> action: "UPDATE_SERMON"
       -> actionData: { "meetingId": 해당모임ID(숫자), "date": "YYYY-MM-DD", "title": "모임명", "sermon_title": "등록할 설교제목" }
   - CREATE_MEETING: 새로운 모임/일정 등록 요청 (예: "~에 구역모임 잡아줘", "내일 심방 일정 등록해줘")
     * 날짜 계산: 오늘이 ${todayStr}(${dayOfWeek}요일)임을 기준으로 YYYY-MM-DD를 정확히 계산.
     * 설교 제목이 함께 언급되었다면 actionData.sermon_title에 채워 넣으세요.
   - CHECK_ABSENTEES: 결석 성도, 교제/모임 잘 안 나오는 성도, 심방 필요한 장기 결석자 조회 요청
   - GET_STATS: 출석률, 모임 통계, 최근 참석 현황 질의
   - SEARCH_RECORDS: 특정 설교 제목, 본문, 특정 성도 상담, 과거 모임 검색 요청
   - NONE: 질문에 대한 답변, 확인 질문, 일반 목회 대화 등

3. 반드시 마크다운 코드블록(\`\`\`json) 없이 순수 JSON 형식으로만 응답해 주세요:
{
  "reply": "사용자에게 전할 정중하고 따뜻하며 명확한 한국어 답변 (마크다운 포맷 지원)",
  "action": "UPDATE_SERMON" | "CREATE_MEETING" | "CHECK_ABSENTEES" | "GET_STATS" | "SEARCH_RECORDS" | "NONE",
  "actionData": {
    "meetingId": 285,
    "title": "모임명",
    "date": "YYYY-MM-DD",
    "type": "모임 구분",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "sermon_title": "설교제목",
    "memo": "",
    "searchQuery": "검색어",
    "weeks": 3
  }
} `;

        const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
        let aiResult = null;

        for (const modelName of candidateModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const apiRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                const resJson = await apiRes.json();
                const textPart = resJson.candidates?.[0]?.content?.parts?.find(p => p.text);
                if (textPart && textPart.text) {
                    let outText = textPart.text.trim();
                    outText = outText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    aiResult = JSON.parse(outText);
                    break;
                }
            } catch(e) {
                console.warn(`Assistant model ${modelName} attempt failed:`, e.message);
            }
        }

        if (!aiResult) {
            return res.status(500).json({ error: 'AI 비서 응답 생성에 실패했습니다. 잠시 후 다시 말씀해 주세요.' });
        }

        let resultMeta = {};

        // 3. 액션 실행 (Server-Side Tool Execution)
        if (aiResult.action === 'UPDATE_SERMON' && aiResult.actionData?.sermon_title) {
            const mData = aiResult.actionData;
            let targetMeetingId = mData.meetingId;

            // meetingId가 없으면 날짜/제목으로 탐색
            if (!targetMeetingId && mData.date) {
                let q = supabase.from('meetings').select('id, title, date, sermon_title').eq('date', mData.date);
                if (mData.title) {
                    q = q.ilike('title', `%${mData.title.replace(/모임|말씀/g, '').trim()}%`);
                }
                const { data: matched } = await q.limit(1);
                if (matched && matched.length > 0) {
                    targetMeetingId = matched[0].id;
                }
            }

            if (targetMeetingId) {
                const { data: updated, error: updateErr } = await supabase
                    .from('meetings')
                    .update({ sermon_title: mData.sermon_title.trim() })
                    .eq('id', targetMeetingId)
                    .select('id, title, date, sermon_title')
                    .single();

                if (!updateErr && updated) {
                    resultMeta.updatedMeeting = updated;
                }
            }
        } else if (aiResult.action === 'CREATE_MEETING' && aiResult.actionData?.date && aiResult.actionData?.title) {
            const mData = aiResult.actionData;
            const insertRow = {
                title: mData.title,
                date: mData.date,
                end_date: mData.date,
                type: mData.type || mData.title,
                start_time: mData.start_time || null,
                end_time: mData.end_time || null,
                sermon_title: mData.sermon_title || null,
                memo: mData.memo || '',
                leader_church_snapshot: leaderProfile?.church || null,
                leader_parish_snapshot: leaderProfile?.parish || null
            };

            const { data: createdMeeting, error: createErr } = await supabase
                .from('meetings')
                .insert(insertRow)
                .select('id, title, date, start_time, end_time, type, sermon_title')
                .single();

            if (!createErr && createdMeeting) {
                resultMeta.createdMeeting = createdMeeting;
            }
        } else if (aiResult.action === 'CHECK_ABSENTEES') {
            const { data: recentActiveMeetings } = await supabase
                .from('meetings')
                .select('id, title, date, type')
                .neq('type', '심방')
                .neq('type', '설교')
                .neq('type', '외부설교')
                .neq('type', '상담')
                .lte('date', todayStr)
                .order('date', { ascending: false })
                .limit(4);

            if (recentActiveMeetings && recentActiveMeetings.length > 0) {
                const meetingIds = recentActiveMeetings.map(m => m.id);
                const { data: attList } = await supabase
                    .from('attendance')
                    .select('meeting_id, member_id, is_present, members(id, name, district, category)')
                    .in('meeting_id', meetingIds);

                const memberAttendanceMap = {};
                (attList || []).forEach(a => {
                    if (!a.members) return;
                    const mId = a.members.id;
                    if (!memberAttendanceMap[mId]) {
                        memberAttendanceMap[mId] = {
                            id: mId,
                            name: a.members.name,
                            district: a.members.district || '미지정',
                            category: a.members.category || '',
                            presentCount: 0,
                            totalMeetings: meetingIds.length
                        };
                    }
                    if (Number(a.is_present) === 1) {
                        memberAttendanceMap[mId].presentCount++;
                    }
                });

                const absentees = Object.values(memberAttendanceMap)
                    .filter(m => m.presentCount <= 1)
                    .sort((a, b) => a.presentCount - b.presentCount)
                    .slice(0, 10);

                resultMeta.absentees = absentees;
                resultMeta.meetingCount = recentActiveMeetings.length;
            }
        } else if (aiResult.action === 'GET_STATS') {
            const { data: statsMeetings } = await supabase
                .from('meetings')
                .select('id, title, date, type')
                .neq('type', '심방')
                .neq('type', '설교')
                .neq('type', '외부설교')
                .neq('type', '상담')
                .lte('date', todayStr)
                .order('date', { ascending: false })
                .limit(5);

            if (statsMeetings && statsMeetings.length > 0) {
                const { data: recentAtt } = await supabase
                    .from('attendance')
                    .select('meeting_id, is_present')
                    .in('meeting_id', statsMeetings.map(m => m.id))
                    .eq('is_present', 1);

                const counts = {};
                (recentAtt || []).forEach(a => {
                    counts[a.meeting_id] = (counts[a.meeting_id] || 0) + 1;
                });

                const summary = statsMeetings.map(m => ({
                    title: m.title,
                    date: m.date,
                    type: m.type,
                    attendees: counts[m.id] || 0
                }));

                resultMeta.statsSummary = summary;
            }
        } else if (aiResult.action === 'SEARCH_RECORDS' && aiResult.actionData?.searchQuery) {
            const q = aiResult.actionData.searchQuery.trim();
            const { data: searchResults } = await supabase
                .from('meetings')
                .select('id, title, date, sermon_title, type, memo')
                .or(`title.ilike.%${q}%,sermon_title.ilike.%${q}%,memo.ilike.%${q}%`)
                .order('date', { ascending: false })
                .limit(6);

            resultMeta.searchResults = searchResults || [];
        }

        res.json({
            success: true,
            reply: aiResult.reply,
            action: aiResult.action,
            actionData: aiResult.actionData,
            resultMeta
        });

    } catch (err) {
        console.error('AI Assistant API error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Google Gemini AI 전체 설교 흐름 종합 분석 API
// ==========================================
app.post('/api/ai/analyze-all-sermons', express.json(), async (req, res) => {
    try {
        const apiKey = await resolveGeminiApiKey(req);
        if (!apiKey) {
            return res.status(401).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }

        // 모임 현황 화면에서 선택한 모임 구분(type) 목록 — 비어 있으면 전체 설교 분석
        const scopeTypes = Array.isArray(req.body?.types)
            ? req.body.types.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim())
            : [];
        const isScoped = scopeTypes.length > 0;

        let sermonQuery = supabase
            .from('meetings')
            .select('id, title, date, type, sermon_title, memo')
            .not('sermon_title', 'is', null)
            .neq('sermon_title', '');
        if (isScoped) sermonQuery = sermonQuery.in('type', scopeTypes);

        const { data: rawSermonMeetings, error } = await sermonQuery
            .order('date', { ascending: false })
            .limit(isScoped ? 60 : 40);

        // "(미선부 오전)"처럼 괄호 안 메모만 있고 실제 설교 제목이 없는 자리표시 항목은 분석에서 제외
        const sermonMeetings = (rawSermonMeetings || [])
            .filter(m => (m.sermon_title || '').replace(/\([^)]*\)/g, '').trim().length > 0)
            .slice(0, 30);

        if (error || sermonMeetings.length === 0) {
            return res.status(404).json({ error: isScoped ? '선택한 모임에 분석할 설교 기록이 없습니다.' : '분석할 설교 기록이 없습니다.' });
        }

        const scopeLabel = scopeTypes.map(t => t === '설교' ? '내부설교' : t).join(', ');

        const sermonListText = sermonMeetings.map((m, idx) => {
            let bible = '';
            let tags = '';
            if (m.memo && m.memo.startsWith('{')) {
                try {
                    const meta = JSON.parse(m.memo.split('\n')[0]);
                    bible = meta.bible || '';
                    tags = meta.tags || '';
                } catch(e) {}
            }
            return `${idx + 1}. [${m.date}] ${m.sermon_title} (모임: ${m.title || '-'}, 구분: ${m.type || '설교'}, 본문: ${bible || '미지정'}, 태그: ${tags || '없음'})`;
        }).join('\n');

        const scopeIntro = isScoped
            ? `아래는 강효근 전도사님이 [${scopeLabel}] 모임에서 전하신 설교 목록 총 ${sermonMeetings.length}편입니다.
이 분석은 반드시 해당 모임(${scopeLabel})의 성격과 대상(예: 구역모임=구역 식구들, 조모임=자매님들, 형제모임=형제님들, 청년모임=청년들, 임원모임=교구 임원/일꾼 등)을 고려하여,
이 모임의 설교 흐름과 그 모임 구성원들에게 맞춘 시너지·향후 제안을 작성해 주세요.`
            : `아래는 강효근 전도사님이 최근 전하신 설교 목록 총 ${sermonMeetings.length}편입니다.`;

        const prompt = `당신은 깊은 영성과 성경적 통찰을 갖춘 목회 사역 분석가이자 설교 멘토 AI입니다.
${scopeIntro}

${sermonListText}

위 설교 흐름을 종합적으로 심층 분석하여, 전도사님의 사역을 격려하고 발전시킬 수 있는 종합 리포트를 작성해 주세요.

반드시 마크다운 코드블록(\`\`\`json) 없이 순수 JSON 형식으로만 응답해 주세요:
{
  "ministry_summary": "최근 설교 흐름의 전체적인 맥락과 중심 메시지를 요약하는 2~3문장의 총평",
  "scripture_coverage": {
    "testament_ratio": "구약 vs 신약 비중 (예: 구약 30%, 신약 70%)",
    "frequent_books": ["가장 많이 전한 성경 책 2~3권 (예: 요한계시록, 로마서 등)"],
    "analysis": "성경 본문 선택의 특징과 균형에 대한 평가"
  },
  "core_themes": [
    { "theme": "핵심 주제 1 (예: 첫사랑의 회복과 충성)", "description": "이 주제가 어떻게 반복 강조되었는지 설명" },
    { "theme": "핵심 주제 2 (예: 성도의 성결과 삶의 구별)", "description": "설명" },
    { "theme": "핵심 주제 3", "description": "설명" }
  ],
  "congregation_synergy": "설교가 성도들의 구역 생활, 교제, 봉사, 영적 성숙에 미치는 긍정적 영향 및 연계성 분석",
  "future_recommendations": [
    "향후 사역에서 다루면 좋을 성경 본문이나 주제 제안 1 (이유 포함)",
    "향후 추천 제안 2 (이유 포함)"
  ],
  "encouragement_message": "설교 사역을 감당하는 목회자를 향한 따뜻하고 힘이 되는 영적 격려와 축복의 말씀"
}`;

        const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
        let data = null;

        for (const modelName of candidateModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const apiRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                const resJson = await apiRes.json();
                const textPart = resJson.candidates?.[0]?.content?.parts?.find(p => p.text);
                if (textPart && textPart.text) {
                    let outText = textPart.text.trim();
                    outText = outText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    data = JSON.parse(outText);
                    break;
                }
            } catch(e) {
                console.warn(`All-sermons model ${modelName} failed:`, e.message);
            }
        }

        if (!data) {
            return res.status(500).json({ error: '전체 설교 종합 분석 생성에 실패했습니다.' });
        }

        res.json({
            success: true,
            sermonCount: sermonMeetings.length,
            analysis: data
        });

    } catch (err) {
        console.error('Analyze all sermons error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Google Gemini AI 상담 기록 심층/종합 분석 API
// ==========================================
app.post('/api/ai/analyze-counseling', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const apiKey = await resolveGeminiApiKey(req);
        if (!apiKey) {
            return res.status(401).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }

        const {
            targetLabel = '전체 상담',
            yearLabel = '전체 년도',
            stats = {},
            records = []
        } = req.body || {};

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(404).json({ error: '선택한 대상에 분석할 상담 기록이 없습니다.' });
        }

        const recordsText = records.slice(0, 60).map((r, idx) => {
            const statusStr = r.member_status === 'evangelism' ? '전도대상' : '성도';
            const genderStr = r.bs === 'B' ? (r.member_status === 'evangelism' ? '남자' : '형제') : (r.bs === 'S' ? (r.member_status === 'evangelism' ? '여자' : '자매') : '');
            const infoParts = [statusStr, r.church, r.parish, r.district, r.category, genderStr, r.position].filter(Boolean).join('/');
            return `${idx + 1}. [${r.date || '날짜미상'}] ${r.name || '익명'}(${infoParts}) | 방식:${r.method || '대면'} | 태그:${r.tags || '없음'}${r.lead_target ? ' | 인도/특징:' + r.lead_target : ''}\n   내용: ${r.content || '(내용 없음)'}${r.remark ? '\n   비고: ' + r.remark : ''}`;
        }).join('\n\n');

        const prompt = `당신은 한국 복음주의 교회의 목회 상담 및 전도 사역 분석 전문 AI입니다.
사용자는 강효근 전도사님(관리자)입니다.

[분석 대상 범위]: ${targetLabel} (${yearLabel})
[집계 요약]: 대상 인원 ${stats.personCount || 0}명 / 총 상담 건수 ${stats.sessionCount || records.length}건 (성도 ${stats.memberCount || 0}명, 전도대상 ${stats.evangelismCount || 0}명)
${stats.topTags ? `[주요 상담 태그]: ${stats.topTags}` : ''}

[상담 기록 데이터 (최근 ${Math.min(records.length, 60)}건)]:
${recordsText}

위 [${targetLabel}] 상담 기록들을 면밀히 읽고, 선택된 대상 집단(또는 개인)의 특성에 맞추어 목회적·영적 통찰과 실제적인 후속 상담/돌봄 전략을 담은 종합 분석 리포트를 작성해 주세요.

반드시 마크다운 코드블록(\`\`\`json) 없이 순수 JSON 형식으로만 응답해 주세요:
{
  "overall_summary": "선택한 대상(${targetLabel})의 전반적인 상담 흐름과 영적·마음 상태를 진단하는 2~3문장의 핵심 총평",
  "key_patterns": [
    { "title": "핵심 상담 주제/패턴 1", "description": "상담 기록에서 나타나는 구체적인 고민 양상과 특징 설명" },
    { "title": "핵심 상담 주제/패턴 2", "description": "구체적인 고민 양상과 특징 설명" },
    { "title": "핵심 상담 주제/패턴 3", "description": "구체적인 고민 양상과 특징 설명" }
  ],
  "spiritual_diagnosis": "대상자들의 신앙 단계(구원 확신 여부, 말씀 수용도, 교회 정착 및 교제 상태, 삶의 애로사항 등)에 대한 심층 진단",
  "care_priorities": [
    "우선적인 후속 상담·심방·기도가 필요한 중점 돌봄 포인트 1 (구체적 사례나 성도 유형 언급)",
    "중점 돌봄 포인트 2",
    "중점 돌봄 포인트 3"
  ],
  "action_strategies": [
    "향후 이 대상자들과의 상담·모임·전도에서 적용할 수 있는 구체적 목회 전략 1",
    "구체적 목회 및 코칭 전략 2",
    "구체적 목회 및 코칭 전략 3"
  ],
  "recommended_scriptures": [
    "이 대상자들에게 상담 시 권면하거나 함께 나누기 좋은 추천 성경 구절과 이유 1",
    "추천 성경 구절과 이유 2"
  ],
  "encouragement": "한 영혼을 귀히 여기며 상담 사역을 감당하시는 전도사님을 향한 따뜻한 격려와 축복의 메시지"
}`;

        const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-flash-latest'];
        let analysis = null;

        for (const modelName of candidateModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const apiRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                const resJson = await apiRes.json();
                const textPart = resJson.candidates?.[0]?.content?.parts?.find(p => p.text);
                if (textPart && textPart.text) {
                    let outText = textPart.text.trim();
                    outText = outText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
                    analysis = JSON.parse(outText);
                    break;
                }
            } catch (e) {
                console.warn(`Analyze counseling model ${modelName} failed:`, e.message);
            }
        }

        if (!analysis) {
            return res.status(500).json({ error: '상담 AI 분석 리포트 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
        }

        res.json({
            success: true,
            targetLabel,
            yearLabel,
            analyzedCount: records.length,
            analysis
        });
    } catch (err) {
        console.error('Analyze counseling error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// Google Gemini AI 상담/사역 보조 API
// ==========================================
const uploadAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/api/ai/parse-counseling', uploadAudio.single('audio'), async (req, res) => {
    try {
        const apiKey = await resolveGeminiApiKey(req);
        if (!apiKey) {
            return res.status(401).json({ error: 'NO_API_KEY', message: 'GEMINI_API_KEY가 설정되어 있지 않습니다.' });
        }

        const candidateModels = ['gemini-3.8-flash', 'gemini-3.5-flash'];
        let parts = [];

        // 1. 오디오 파일이 함께 전달된 경우 (멀티모달)
        if (req.file) {
            parts.push({
                inline_data: {
                    mime_type: req.file.mimetype || 'audio/webm',
                    data: req.file.buffer.toString('base64')
                }
            });
        }

        // 2. 텍스트 프롬프트
        const rawText = req.body.text || '';
        const systemPrompt = `
당신은 교회 목회 지원 시스템(PMP)의 전문 비서입니다.
제공된 상담/심방 관련 음성 또는 텍스트 내용을 듣고/읽고 핵심 내용을 구조화된 JSON 형태로 분석해 주세요.

[요청 사항]
1. name: 상담 대상자 이름 (알 수 없는 경우 빈 문자열)
2. member_status: 성도인지 전도대상(비신자/새가족/구도자)인지 판단 ("member" 또는 "evangelism")
3. counseling_method: 상담 형태 ("대면" 또는 "전화", 기본값 "대면")
4. lead_target: 인도자나 소개자, 또는 관련 모임/특징 (@이름 또는 #특징 형식, 예: "@김재선 #청년부")
5. tags: 상담 주제 해시태그 배열 (예: ["전도상담", "구원확신/의심", "진로", "이성", "죄", "자녀", "부부관계", "가족", "성경질문", "이단", "직장생활", "결혼", "병원심방"] 등)
6. content: 상담 본문 핵심 요약 (정중하고 정돈된 목회 어조, 2~4문장)
7. remark: 비고/기도제목/특이사항 (1~2문장)

반드시 아래 JSON 형식으로만 응답하고, 마크다운 코드블록(\`\`\`json)은 생략하거나 파싱 가능하도록 순수 JSON 문자열을 반환해 주세요.
{
  "name": "",
  "member_status": "member",
  "counseling_method": "대면",
  "lead_target": "",
  "tags": [],
  "content": "",
  "remark": ""
}
`;

        parts.push({
            text: systemPrompt + (rawText ? `\n[사용자 입력 텍스트]: ${rawText}` : '')
        });

        let data = null;
        let lastError = null;

        for (const modelName of candidateModels) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
                const apiRes = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts }] })
                });

                const resJson = await apiRes.json();
                if (resJson.candidates && resJson.candidates[0]?.content?.parts?.[0]?.text) {
                    data = resJson;
                    break;
                } else {
                    lastError = resJson;
                    console.warn(`Gemini model ${modelName} returned non-candidate response:`, resJson?.error?.message || resJson);
                }
            } catch (err) {
                lastError = err;
                console.warn(`Gemini model ${modelName} call failed:`, err.message);
            }
        }

        if (!data || !data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            console.error('All Gemini model calls failed:', JSON.stringify(lastError));
            return res.status(500).json({ error: '제미나이 응답을 받지 못했습니다.', raw: lastError });
        }

        let replyText = data.candidates[0].content.parts[0].text.trim();
        // ```json ... ``` 제거
        replyText = replyText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/i, '').trim();

        let parsedJson;
        try {
            parsedJson = JSON.parse(replyText);
        } catch (pe) {
            console.warn('JSON parse error from Gemini reply:', replyText);
            parsedJson = {
                content: replyText,
                tags: [],
                counseling_method: '대면',
                member_status: 'member'
            };
        }

        res.json({
            success: true,
            data: parsedJson
        });
    } catch (err) {
        console.error('POST /api/ai/parse-counseling error:', err);
        res.status(500).json({ error: err.message });
    }
});

// iCalendar (.ics) 날짜 변환 헬퍼 함수
function formatICSDate(dateStr, timeStr, adjustToUTC = true) {
  if (!dateStr) return '';
  // dateStr: YYYY-MM-DD
  const cleanDate = dateStr.replace(/-/g, '');
  if (!timeStr) {
    // 종일 일정 포맷 (VALUE=DATE)
    return cleanDate;
  }

  // timeStr: HH:MM 또는 HH:MM:SS
  const parts = timeStr.split(':');
  const hh = parts[0].padStart(2, '0');
  const mm = parts[1].padStart(2, '0');
  const ss = (parts[2] || '00').padStart(2, '0');

  if (!adjustToUTC) {
    return `${cleanDate}T${hh}${mm}${ss}`;
  }

  // KST (UTC+9) -> UTC 변환
  const dt = new Date(`${dateStr}T${hh}:${mm}:${ss}+09:00`);
  if (isNaN(dt.getTime())) {
    return `${cleanDate}T${hh}${mm}${ss}`; // 변환 에러 시 로컬 타임으로 폴백
  }
  
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const min = String(dt.getUTCMinutes()).padStart(2, '0');
  const sec = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${sec}Z`;
}

// 1. GET /api/calendar/feed — iCalendar (.ics) 피드 제공 API
app.get('/api/calendar/feed', async (req, res) => {
  try {
    // 보안: 이 피드에는 상담/심방 메모 등 민감한 개인정보가 포함되므로
    // 관리자 설정에서 발급한 토큰이 일치할 때만 응답한다.
    // (컬럼이 아직 없거나 토큰이 아직 발급되지 않은 과도기에는 열어두되 경고 로그만 남긴다.)
    try {
      const { data: adminRow, error: tokenErr } = await supabase
        .from('members')
        .select('calendar_feed_token')
        .eq('name', '강효근')
        .single();
      const requiredToken = !tokenErr && adminRow ? adminRow.calendar_feed_token : null;
      if (requiredToken) {
        if (req.query.token !== requiredToken) {
          return res.status(403).send('Forbidden: invalid or missing token. 관리자 설정 화면에서 올바른 캘린더 연동 URL을 다시 복사해주세요.');
        }
      } else {
        console.warn('[calendar/feed] 경고: calendar_feed_token이 아직 발급되지 않아 이 피드가 토큰 없이 열려 있습니다. 관리자 설정 화면을 한 번 방문하면 자동 발급됩니다.');
      }
    } catch (guardErr) {
      console.warn('[calendar/feed] 토큰 검증 중 오류(열어둔 채로 진행):', guardErr.message);
    }

    // 최근 6개월 ~ 향후 6개월의 모임 일정을 조회
    const today = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(today.getMonth() - 6);
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(today.getMonth() + 6);

    const startLimit = sixMonthsAgo.toISOString().split('T')[0];
    const endLimit = sixMonthsLater.toISOString().split('T')[0];

    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('*')
      .gte('date', startLimit)
      .lte('date', endLimit)
      .order('date', { ascending: true });

    if (error) throw error;

    let icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ChurchApp//CalendarFeed//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:교회 모임 및 상담 일정',
      'X-WR-TIMEZONE:Asia/Seoul'
    ];

    (meetings || []).forEach(meeting => {
      const isAllDay = !meeting.start_time;
      const startICS = formatICSDate(meeting.date, meeting.start_time, !isAllDay);
      
      let endICS = '';
      if (meeting.end_date || meeting.end_time) {
        endICS = formatICSDate(meeting.end_date || meeting.date, meeting.end_time || meeting.start_time, !isAllDay);
      } else {
        if (isAllDay) {
          // 종일 일정의 종료일은 다음 날이어야 표준 캘린더에서 당일 하루 종일로 정상 렌더링됨
          const nextDay = new Date(meeting.date);
          nextDay.setDate(nextDay.getDate() + 1);
          const y = nextDay.getFullYear();
          const m = String(nextDay.getMonth() + 1).padStart(2, '0');
          const d = String(nextDay.getDate()).padStart(2, '0');
          endICS = `${y}${m}${d}`;
        } else {
          // 시간 일정이 있는데 종료 시간이 없으면 시작 시각 기준 1시간 뒤로 임시 설정
          const startTimeParts = meeting.start_time.split(':');
          const hh = parseInt(startTimeParts[0]);
          const mm = parseInt(startTimeParts[1]);
          const dt = new Date(`${meeting.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
          dt.setHours(dt.getHours() + 1);
          
          const y = dt.getUTCFullYear();
          const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const d = String(dt.getUTCDate()).padStart(2, '0');
          const h = String(dt.getUTCHours()).padStart(2, '0');
          const min = String(dt.getUTCMinutes()).padStart(2, '0');
          const sec = String(dt.getUTCSeconds()).padStart(2, '0');
          endICS = `${y}${m}${d}T${h}${min}${sec}Z`;
        }
      }

      // 제목 가공 (상담/심방 카테고리 접두어 부여)
      let summary = meeting.title || '모임';
      if (meeting.type === '상담') summary = `[상담] ${summary}`;
      if (meeting.type === '심방') summary = `[심방] ${summary}`;

      // 메모 줄바꿈 문자 정제 (RFC 5545 이스케이프)
      let description = (meeting.memo || '').trim()
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');

      if (meeting.sermon_title) {
        description = `설교: ${meeting.sermon_title}\\n${description}`;
      }

      icsLines.push('BEGIN:VEVENT');
      icsLines.push(`UID:meeting_${meeting.id}@church-app`);
      icsLines.push(`DTSTAMP:${formatICSDate(new Date().toISOString().split('T')[0], '00:00:00', true)}`);
      
      if (isAllDay) {
        icsLines.push(`DTSTART;VALUE=DATE:${startICS}`);
        icsLines.push(`DTEND;VALUE=DATE:${endICS}`);
      } else {
        icsLines.push(`DTSTART:${startICS}`);
        icsLines.push(`DTEND:${endICS}`);
      }
      
      icsLines.push(`SUMMARY:${summary}`);
      if (description) {
        icsLines.push(`DESCRIPTION:${description}`);
      }
      icsLines.push('END:VEVENT');
    });

    icsLines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=meetings.ics');
    res.send(icsLines.join('\r\n'));
  } catch (err) {
    console.error('ICS Feed Error:', err);
    res.status(500).send('Error generating calendar feed');
  }
});

// 2. GET /api/cron/daily-reminders — 일일 일정 아침 텔레그램 알림 API
app.get('/api/cron/daily-reminders', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  // 헤더 또는 쿼리 파라미터 보안 검증
  const requestToken = authHeader ? authHeader.replace('Bearer ', '') : req.query.key;
  if (!cronSecret || requestToken !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 한국 시간(KST, UTC+9) 오늘 날짜 구하기 (YYYY-MM-DD)
    const kstOffset = 9 * 60 * 60 * 1000;
    const todayKST = new Date(Date.now() + kstOffset).toISOString().split('T')[0];

    // 오늘 날짜에 해당하는 모든 모임 조회
    const { data: meetings, error } = await supabase
      .from('meetings')
      .select('*')
      .eq('date', todayKST)
      .order('start_time', { ascending: true });

    if (error) throw error;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.warn('Telegram bot credentials are not configured in environment.');
      return res.json({ success: true, message: 'Telegram credentials missing, skipped sending.' });
    }

    if (!meetings || meetings.length === 0) {
      // 예정된 일정이 없는 날은 발송하지 않거나 스킵
      return res.json({ success: true, message: 'No events scheduled for today.' });
    }

    // 텔레그램 메시지 조립
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const dayOfWeek = weekDays[new Date(todayKST).getDay()];
    
    let messageText = `🔔 *[서울중앙교회] 오늘의 일정 안내*\n\n`;
    messageText += `📅 *날짜*: ${todayKST} (${dayOfWeek})\n\n`;
    messageText += `✍️ *예정된 모임/상담 (총 ${meetings.length}건)*\n`;

    meetings.forEach((m, idx) => {
      const timeStr = m.start_time ? `🕒 ${m.start_time.slice(0, 5)}` : '📅 종일';
      let typeLabel = m.type || '모임';
      if (m.type === '상담') typeLabel = '상담';
      if (m.type === '심방') typeLabel = '심방';
      
      messageText += `${idx + 1}. *[${typeLabel}]* ${m.title} (${timeStr})\n`;
      if (m.sermon_title) {
        messageText += `    └ 📖설교: ${m.sermon_title}\n`;
      }
    });

    messageText += `\n오늘 하루도 힘내세요! 🙏`;

    // Telegram API 호출
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown'
      })
    });

    const resData = await response.json();
    if (!resData.ok) {
      throw new Error(`Telegram API Error: ${resData.description}`);
    }

    res.json({ success: true, message: 'Notification sent successfully.', count: meetings.length });
  } catch (err) {
    console.error('Daily Reminders Cron Error:', err);
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
export default app;