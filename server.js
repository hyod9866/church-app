import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import multer from 'multer';
import * as csv from 'fast-csv';
import iconv from 'iconv-lite';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

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
    url === '/api/run-migration-temp' || 
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
function getSymmetricRelation(relation) {
    if (relation.includes('남편')) return '아내';
    if (relation.includes('아내')) return '남편';
    if (relation.includes('부모')) return '자녀';
    if (relation.includes('자녀')) return '부모';
    return '기타';
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
        .select('id, name, bs, family_id, family_relation')
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
              r = getSymmetricRelation(inputMap[targetCore] || '기타');
            } else {
              const myRelToTarget = inputMap[targetCore] || '기타';
              const myRelToOther = inputMap[otherCore] || '기타';
              if (myRelToTarget.includes('남편') || myRelToTarget.includes('아내')) r = myRelToOther;
              else if (myRelToOther.includes('남편') || myRelToOther.includes('아내')) r = getSymmetricRelation(myRelToTarget);
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
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = generateToken({ email });
    res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    return res.json({ success: true });
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
  // 30일 유효한 생체인식 전용 서명 토큰 발급
  const token = generateToken({ email, biometric: true }, 30 * 24 * 60 * 60 * 1000);
  return res.json({ success: true, token });
});

app.post('/api/login-biometric', (req, res) => {
  const { email, token } = req.body;
  if (!email || !token) {
    return res.status(400).json({ error: '이메일 또는 생체인식 토큰이 없습니다.' });
  }
  const payload = verifyToken(token);
  if (payload && payload.email === email && payload.biometric === true) {
    const loginToken = generateToken({ email });
    res.setHeader('Set-Cookie', `auth_token=${loginToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
    return res.json({ success: true });
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

app.get('/api/run-migration-temp', async (req, res) => {
  const { Client } = pg;
  
  const clientDirect = new Client({
    host: '2406:da12:557:f802:f78e:4591:9fd3:4ad7',
    port: 5432,
    user: 'postgres',
    password: 'qhrdmaemfrh1!',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  const clientPooler = new Client({
    host: 'aws-0-ap-northeast-2.pooler.supabase.com',
    port: 6543,
    user: 'postgres.castdxotoypktiusslpk',
    password: 'qhrdmaemfrh1!',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  let logs = [];
  let success = false;

  try {
    logs.push("Trying Direct IPv6 connection to db.castdxotoypktiusslpk.supabase.co:5432...");
    await clientDirect.connect();
    logs.push("Successfully connected via Direct IPv6 connection!");
    
    const checkRes = await clientDirect.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='parishes' AND column_name='parish_no'
    `);
    
    if (checkRes.rows.length === 0) {
      logs.push("parish_no does not exist. Adding column...");
      await clientDirect.query("ALTER TABLE parishes ADD COLUMN parish_no INTEGER;");
      logs.push("Column parish_no added successfully.");
    } else {
      logs.push("Column parish_no already exists.");
    }

    const checkChRes = await clientDirect.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='churches' AND column_name='address'
    `);
    if (checkChRes.rows.length === 0) {
      logs.push("churches address does not exist. Adding column...");
      await clientDirect.query("ALTER TABLE churches ADD COLUMN address TEXT;");
      logs.push("Column address added to churches successfully.");
    } else {
      logs.push("Column address in churches already exists.");
    }

    const checkMeetRes = await clientDirect.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='meetings' AND column_name='start_time'
    `);
    if (checkMeetRes.rows.length === 0) {
      logs.push("meetings start_time does not exist. Adding column...");
      await clientDirect.query("ALTER TABLE meetings ADD COLUMN start_time TEXT;");
      logs.push("Column start_time added to meetings successfully.");
    } else {
      logs.push("Column start_time in meetings already exists.");
    }

    const checkMeetEndRes = await clientDirect.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='meetings' AND column_name='end_time'
    `);
    if (checkMeetEndRes.rows.length === 0) {
      logs.push("meetings end_time does not exist. Adding column...");
      await clientDirect.query("ALTER TABLE meetings ADD COLUMN end_time TEXT;");
      logs.push("Column end_time added to meetings successfully.");
    } else {
      logs.push("Column end_time in meetings already exists.");
    }

    const checkMemStatusRes = await clientDirect.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='members' AND column_name='member_status'
    `);
    if (checkMemStatusRes.rows.length === 0) {
      logs.push("members member_status does not exist. Adding column...");
      await clientDirect.query("ALTER TABLE members ADD COLUMN member_status VARCHAR(50) DEFAULT 'member';");
      logs.push("Column member_status added to members successfully.");
    } else {
      logs.push("Column member_status in members already exists.");
    }

    logs.push("Reloading schema cache...");
    await clientDirect.query("NOTIFY pgrst, 'reload schema';");
    logs.push("Schema cache reloaded successfully!");
    
    await clientDirect.end();
    success = true;
  } catch (directErr) {
    logs.push(`Direct connection failed: ${directErr.message}`);
    logs.push("Trying Pooler IPv4 connection to aws-0-ap-northeast-2.pooler.supabase.com:6543...");
    try {
      await clientPooler.connect();
      logs.push("Successfully connected via Pooler IPv4 connection!");
      
      const checkRes = await clientPooler.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='parishes' AND column_name='parish_no'
      `);
      
      if (checkRes.rows.length === 0) {
        logs.push("parish_no does not exist. Adding column...");
        await clientPooler.query("ALTER TABLE parishes ADD COLUMN parish_no INTEGER;");
        logs.push("Column parish_no added successfully.");
      } else {
        logs.push("Column parish_no already exists.");
      }

      const checkChRes = await clientPooler.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='churches' AND column_name='address'
      `);
      if (checkChRes.rows.length === 0) {
        logs.push("churches address does not exist. Adding column...");
        await clientPooler.query("ALTER TABLE churches ADD COLUMN address TEXT;");
        logs.push("Column address added to churches successfully.");
      } else {
        logs.push("Column address in churches already exists.");
      }

      const checkMeetRes = await clientPooler.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='meetings' AND column_name='start_time'
      `);
      if (checkMeetRes.rows.length === 0) {
        logs.push("meetings start_time does not exist. Adding column...");
        await clientPooler.query("ALTER TABLE meetings ADD COLUMN start_time TEXT;");
        logs.push("Column start_time added to meetings successfully.");
      } else {
        logs.push("Column start_time in meetings already exists.");
      }

      const checkMeetEndRes = await clientPooler.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='meetings' AND column_name='end_time'
      `);
      if (checkMeetEndRes.rows.length === 0) {
        logs.push("meetings end_time does not exist. Adding column...");
        await clientPooler.query("ALTER TABLE meetings ADD COLUMN end_time TEXT;");
        logs.push("Column end_time added to meetings successfully.");
      } else {
        logs.push("Column end_time in meetings already exists.");
      }

      const checkMemStatusPoolerRes = await clientPooler.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='members' AND column_name='member_status'
      `);
      if (checkMemStatusPoolerRes.rows.length === 0) {
        logs.push("members member_status does not exist. Adding column...");
        await clientPooler.query("ALTER TABLE members ADD COLUMN member_status VARCHAR(50) DEFAULT 'member';");
        logs.push("Column member_status added to members successfully.");
      } else {
        logs.push("Column member_status in members already exists.");
      }

      logs.push("Reloading schema cache...");
      await clientPooler.query("NOTIFY pgrst, 'reload schema';");
      logs.push("Schema cache reloaded successfully!");

      await clientPooler.end();
      success = true;
    } catch (poolerErr) {
      logs.push(`Pooler connection failed: ${poolerErr.message}`);
    }
  }

  res.json({
    success,
    logs
  });
});

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
      let query = supabase.from('members').select('*');

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
      .select('church, parish, district, managed_districts')
      .eq('name', '강효근')
      .single();

    // managed_districts 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
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

    res.json({ ...row, districts });
  } catch (err) {
    console.error('Failed to get default profile:', err);
    res.json({ church: '서울중앙교회', parish: '부곡교구', district: '581구역', districts: [] });
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

    let { data: meetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, type, date, leader_church_snapshot, leader_parish_snapshot')
      .neq('type', '심방')
      .neq('type', '설교')
      .neq('type', '외부설교')
      .lte('date', today);

    // leader_*_snapshot 컬럼이 아직 없는 DB(마이그레이션 전)에서도 동작하도록 재시도
    if (meetErr && /leader_church_snapshot|leader_parish_snapshot/i.test(meetErr.message || '')) {
      const retry = await supabase
        .from('meetings')
        .select('id, type, date')
        .neq('type', '심방')
        .neq('type', '설교')
        .neq('type', '외부설교')
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

    // 소속 교회/교구/구역 + 직분/부서 변경 감지를 위해 "수정 전" 값을 먼저 조회
    // (반드시 update()보다 먼저 실행해야 함 — update 이후에 조회하면 이미 새 값으로 덮어써진 뒤라
    //  "변경 전"과 "변경 후"를 비교하는 것이 아니라 새 값끼리 비교하는 꼴이 되어 오작동할 수 있음)
    const { data: oldMemberBeforeUpdate, error: getOldErr } = await supabase
      .from('members')
      .select('church, parish, district, position, church_service')
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

    syncFamilyLinks(id, b.name, b.bs, b.family_relation, fid, async (err, finalFid) => {
      if (err) console.error('syncFamilyLinks error:', err);
      
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
    }, familyRelationIds);
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
          .not('church', 'eq', '');
      
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
    const meetings = await fetchAllRows((from, to) =>
      supabase
        .from('meetings')
        .select('*')
        .order('date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to)
    );

    // ⚠ 페이지네이션 없이 조회하면 PostgREST 기본 1000행 제한에 걸려 참석 데이터가 잘려나가고,
    // 그 결과 일부 모임의 참석 인원이 실제와 다르게(대개 0명으로) 표시되는 버그가 있었다.
    // fetchAllRows로 전체 페이지를 끝까지 가져와 집계한다.
    const presentAttendance = await fetchAllRows((from, to) =>
      supabase
        .from('attendance')
        .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present, members(district)')
        .eq('is_present', 1)
        .range(from, to)
    );

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
      let cleanMemo = m.memo || '';
      
      if (cleanMemo.startsWith('{')) {
          const firstLine = cleanMemo.split(/\r?\n|\\n/)[0];
          try {
              if (firstLine.endsWith('}')) {
                  const meta = JSON.parse(firstLine);
                  if (meta.bible !== undefined || meta.tags !== undefined) {
                      sermon_bible = meta.bible || '';
                      sermon_tags = meta.tags || '';
                      cleanMemo = cleanMemo.substring(firstLine.length).replace(/^(\r?\n|\\n)+/, '');
                  }
              }
          } catch(e) {}
      }

      return {
        ...m,
        memo: cleanMemo,
        sermon_bible,
        sermon_tags,
        attendee_count: countMap[m.id] || 0,
        testimony_count: testimonyCountMap[m.id] || 0,
        district_attendees: districtCountMap[m.id] || {},
        district_testimonies: districtTestimonyCountMap[m.id] || {}
      };
    });

    // [2026-07-07 페이지네이션] 구원기념일 대상자 조회도 전체 성도 수에 비례해 1000명을
    // 넘을 수 있으므로 fetchAllRows로 전체 페이지 조회.
    const members = await fetchAllRows((from, to) =>
      supabase
        .from('members')
        .select('id, name, salvation_date, bs, position')
        .not('salvation_date', 'is', null)
        .neq('salvation_date', '')
        .neq('status', 'inactive')
        .range(from, to)
    );

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
  const { title, date, end_date, type, sermon_title, memo, church, start_time, end_time, sermon_bible, sermon_tags } = req.body;
  try {
    let finalMemo = memo || '';
    if (sermon_bible || sermon_tags) {
        const meta = { bible: sermon_bible || '', tags: sermon_tags || '' };
        finalMemo = JSON.stringify(meta) + '\\n\\n' + finalMemo;
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
  const { visitation_note } = req.body;
  try {
    const { error } = await supabase
      .from('members')
      .update({ visitation_note })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ status: 'success' });
  } catch (err) {
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

  const leadMatch = text.match(/^\[lead:(.*?)\]\s*/s);
  if (leadMatch) {
    lead_target = leadMatch[1].trim();
    text = text.slice(leadMatch[0].length);
  }

  const methodMatch = text.match(/^\[method:(.*?)\]\s*/s);
  if (methodMatch) {
    counseling_method = methodMatch[1].trim();
    text = text.slice(methodMatch[0].length);
  }

  return {
    lead_target,
    // 기존 데이터에는 [method:...] 이 없으므로 대면을 기본값으로 둔다
    counseling_method: counseling_method || '대면',
    remark_memo: text.trim()
  };
}

// GET /api/counseling — 상담 이력이 있는 성도 목록 (달력 개인상담 + member_records COUNSELING 통합)
app.get('/api/counseling', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    // 1. members 전체 조회
    // [2026-07-07 페이지네이션] 성도 1000명을 넘으면 조용히 잘려나가 "상담 이력이 있는 성도"
    // 목록에서 뒤쪽 성도가 통째로 누락될 수 있으므로 fetchAllRows 사용.
    const members = await fetchAllRows((from, to) =>
      supabase
        .from('members')
        .select('id, name, district, category, position, family_relation, bs, church, parish, salvation_date, member_status')
        .eq('status', 'active')
        .range(from, to)
    );

    const memberMap = {};
    (members || []).forEach(m => { memberMap[m.id] = m; });

    // 2. meetings(type='상담') 조회 — 상담 건수가 누적되어 1000건을 넘어도 누락되지 않도록 페이지네이션
    const counselingMeetings = await fetchAllRows((from, to) =>
      supabase
        .from('meetings')
        .select('id, title, date, memo, type')
        .eq('type', '상담')
        .range(from, to)
    );

    const counselingMeetingIds = (counselingMeetings || []).map(m => m.id);
    const meetingMap = {};
    (counselingMeetings || []).forEach(m => { meetingMap[m.id] = m; });

    // 3. 해당 meetings의 attendance 조회 (모든 성도 포함 - is_present 무관)
    // 상담 건수가 늘어나 1000행을 넘어도 누락되지 않도록 페이지네이션 조회
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

    // 4. member_records COUNSELING 조회 (기존 레거시 데이터) — 역시 1000건 초과 대비 페이지네이션
    const cRecords = await fetchAllRows((from, to) =>
      supabase
        .from('member_records')
        .select('member_id, date, remark, id')
        .eq('status', 'COUNSELING')
        .range(from, to)
    );

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
  const { member_id, name, date, content, tags, remark_memo, lead_target, counseling_method, church, parish, district, category, bs, member_status, is_salvation_checked, is_assign_checked } = req.body;
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

    const { data: newMeeting, error: meetErr } = await supabase
      .from('meetings')
      .insert({ title: meetingTitle, date, type: '상담', memo: finalMemo })
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

// PUT /api/counseling/:sessionId — 상담 세션 수정
app.put('/api/counseling/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const { date, content, tags, remark_memo, lead_target, counseling_method, member_status, member_id, is_salvation_checked, is_assign_checked, church, parish, district } = req.body;

  try {
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += content ? content.trim() : '';

    const memberId = member_id ? parseInt(member_id) : null;
    if (memberId) {
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
        const { data: updRes, error: updErr } = await supabase.from('members').update({ member_status }).eq('id', memberId).select();
        if (updErr) {
          console.error('Error updating member status in PUT:', updErr);
          throw updErr;
        }
        console.log('Successfully updated member status in PUT:', updRes);
      }
    }

    if (sessionId.startsWith('m_')) {
      // meetings + attendance 방식
      const meetingId = sessionId.replace('m_', '');

      const meetUpdate = { date };
      const finalLead = lead_target ? lead_target.trim() : '';
      const finalMethod = counseling_method === '전화' ? '전화' : '대면';
      const finalMemo = `[lead:${finalLead}] [method:${finalMethod}] ${(remark_memo || '').trim()}`;
      meetUpdate.memo = finalMemo;
      await supabase.from('meetings').update(meetUpdate).eq('id', meetingId);
      if (memberId) {
        const { data: existing } = await supabase.from('attendance')
          .select('id').eq('meeting_id', meetingId).eq('member_id', memberId).maybeSingle();
        if (existing) {
          await supabase.from('attendance').update({ testimony_snapshot: fullContent || null }).eq('id', existing.id);
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

    res.json({ success: true });
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
                .select('id, date, title, type, sermon_title, memo, start_time, end_time, attendance(count)')
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

        let bibleBooksCount = {};
        let keywordsCount = {};
        let matchedSermons = [];

        meetings.forEach(meeting => {
            const title = (meeting.sermon_title || '').trim();
            let sermon_bible = '';
            let sermon_tags = '';
            let cleanMemo = meeting.memo || '';
            
            if (cleanMemo.startsWith('{')) {
                const firstLine = cleanMemo.split(/\r?\n|\\n/)[0];
                try {
                    if (firstLine.endsWith('}')) {
                        const meta = JSON.parse(firstLine);
                        if (meta.bible !== undefined || meta.tags !== undefined) {
                            sermon_bible = meta.bible || '';
                            sermon_tags = meta.tags || '';
                        }
                    }
                } catch(e) {}
            }

            matchedSermons.push({
                id: meeting.id,
                date: meeting.date,
                meeting_title: meeting.title || '',
                type: meeting.type,
                sermon_title: title,
                sermon_bible: sermon_bible || '',
                sermon_tags: sermon_tags || '',
                start_time: meeting.start_time,
                end_time: meeting.end_time,
                attendee_count: meeting.attendance && meeting.attendance.length > 0 ? meeting.attendance[0].count : 0
            });

            // Bible Counting
            if (sermon_bible) {
                bibleBooksCount[sermon_bible] = (bibleBooksCount[sermon_bible] || 0) + 1;
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
            obsidianMatches: 0 // Not using obsidian anymore
        });
    } catch (err) {
        console.error('Sermon stats error:', err);
        res.status(500).json({ error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
export default app;