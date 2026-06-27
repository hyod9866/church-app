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

async function syncFamilyLinks(memberId, memberName, memberBs, familyRelation, providedFid, callback) {
  if (!familyRelation) return callback(null, providedFid);
  const entries = familyRelation.split(',').map(s => s.trim()).filter(s => s);
  const inputMap = {}; // 핵심 성명 -> 관계 태그
  entries.forEach(e => { 
    const m = e.match(/^(.+?)\((.+?)\)$/); 
    if (m) inputMap[m[1].trim().replace(/[DBS P]$/i, '').trim()] = m[2]; 
  });
  
  const familyCoreNames = Object.keys(inputMap);
  if (familyCoreNames.length === 0) return callback(null, providedFid);

  const myNameCore = memberName.trim().replace(/[DBS P]$/i, '').trim();
  const allCoreNames = [myNameCore, ...familyCoreNames];

  try {
    // active 성도를 모두 가져온 뒤 메모리에서 정규화된 이름으로 매칭
    const { data: activeMembers, error } = await supabase
      .from('members')
      .select('id, name, bs, family_id, family_relation')
      .eq('status', 'active');

    if (error) throw error;

    const groupMembers = activeMembers.filter(m => {
      const coreName = m.name.trim().replace(/[DBS P]$/i, '').trim();
      return allCoreNames.includes(coreName);
    });

    const meId = parseInt(memberId);
    let fid = (providedFid && providedFid !== 'null' && providedFid !== '') ? parseInt(providedFid) : null;
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
    let currentPosition = [];
    let currentService = [];

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
    const { data: rows, error } = await supabase
      .from('members')
      .select('id');
      
    if (error) throw error;
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
    
    const { q, gender, category, district, status: st, parish, church, marital_status } = req.query;
    let query = supabase.from('members').select('*');
    
    if (st === 'inactive') {
      query = query.eq('status', 'inactive');
    } else if (st === 'all' || st === '전체') {
      // 전체 조회
    } else {
      query = query.eq('status', 'active');
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
    if (parish && parish !== '전체') {
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
    
    query = query.order('district', { ascending: true }).order('name', { ascending: true });
    
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Search members error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 강효근 성도의 기본 소속 정보 조회 API (디폴트 필터값용)
app.get('/api/users/default-profile', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('church, parish, district')
      .eq('name', '강효근')
      .single();
      
    if (error) throw error;
    res.json(data || { church: '서울중앙교회', parish: '부곡교구', district: '581구역' });
  } catch (err) {
    console.error('Failed to get default profile:', err);
    res.json({ church: '서울중앙교회', parish: '부곡교구', district: '581구역' });
  }
});

function isMandatoryMeeting(member, meeting) {
  const mType = meeting.type || '';
  const mDistMatch = mType.match(/\d+/);
  const mDistNum = mDistMatch ? mDistMatch[0] : null;
  const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

  if (mType.includes('조모임')) {
    if (member.category === '청년회' && member.bs === 'S') return false;
    if (member.bs === 'B') return false;
  }

  if (mType.includes('구역모임')) {
    if (!mDistNum || mDistNum === memDistNum) return true;
  }

  if (mType.includes('조모임')) {
    if (!mDistNum || mDistNum === memDistNum) return true;
  }

  if (mType.includes('교구전체모임')) return true;
  if (mType.includes('교구형제모임') && member.bs === 'B') return true;
  if (mType.includes('교구임원모임') && (member.position || '').trim() !== '') return true;
  if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

  return false;
}

app.get('/api/members/attendance-rates', async (req, res) => {
  try {
    const today = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const { data: meetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, type, date')
      .neq('type', '심방')
      .neq('type', '설교')
      .neq('type', '외부설교')
      .lte('date', today);
    if (meetErr) throw meetErr;

    const meetingMap = {};
    meetings.forEach(m => {
      meetingMap[m.id] = m;
    });

    const { data: members, error: memErr } = await supabase
      .from('members')
      .select('id, name, category, bs, district, position');
    if (memErr) throw memErr;

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
          date: mt.date
        });
      }
    });

    const rates = {};
    members.forEach(member => {
      const atts = memberAtts[member.id] || [];
      const filtered = atts.filter(h => {
        return isMandatoryMeeting(member, h) || h.is_present;
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
    const { data: attendanceData, error: attError } = await supabase
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
      
    if (attError) throw attError;
    
    const history = attendanceData.map(a => ({
      meeting_id: a.meeting_id,
      title: a.meetings?.title || '',
      date: a.meetings?.date || '',
      type: a.meetings?.type || '',
      memo: a.meetings?.memo || '',
      is_present: a.is_present,
      testimony_snapshot: a.testimony_snapshot
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
    
    res.json({ member, history, family });
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
      try {
        await syncMemberProfileFromRecords(newId);
      } catch (syncErr) {
        console.error('Initial sync error:', syncErr);
      }
      res.json({ id: newId, family_id: finalFid });
    });
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

    const { error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', id);
      
    if (error) throw error;

    // 소속 교회/교구/구역 변경 감지 및 자동 인적기록 생성
    try {
      const { data: oldMember, error: getOldErr } = await supabase
        .from('members')
        .select('church, parish, district')
        .eq('id', id)
        .single();

      if (!getOldErr && oldMember) {
        const todayStr = new Date().toISOString().split('T')[0];
        const autoRecords = [];

        if (oldMember.church !== b.church) {
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
          if (oldMember.parish !== b.parish) {
            autoRecords.push({
              member_id: id,
              date: todayStr,
              status: 'PARISH_MOVE',
              remark: b.parish || ''
            });
          }
          if (oldMember.district !== b.district) {
            autoRecords.push({
              member_id: id,
              date: todayStr,
              status: 'DISTRICT',
              remark: b.district || ''
            });
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
    });
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
  const { date, status, remark } = req.body;
  try {
    const { data: row, error: findError } = await supabase
      .from('member_records')
      .select('member_id')
      .eq('id', id)
      .single();
      
    if (findError || !row) return res.status(500).json({ error: 'Record not found' });
    const memberId = row.member_id;
    
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
      const { error } = await supabase
          .from('churches')
          .update({ name, address })
          .eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase
          .from('parishes')
          .update({ name, parish_no: parish_no ? parseInt(parish_no) : null })
          .eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase
          .from('districts')
          .update({ name })
          .eq('id', id);
      if (error) throw error;
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
    const { data: meetings, error: meetErr } = await supabase
      .from('meetings')
      .select('*')
      .order('date', { ascending: false });
    if (meetErr) throw meetErr;

    const { data: presentAttendance, error: attErr } = await supabase
      .from('attendance')
      .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present, members(district)')
      .eq('is_present', 1);
    if (attErr) throw attErr;

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

    const { data: members, error: memErr } = await supabase
      .from('members')
      .select('id, name, salvation_date, bs, position')
      .not('salvation_date', 'is', null)
      .neq('salvation_date', '')
      .neq('status', 'inactive');
      
    if (memErr) throw memErr;

    const anniversaries = [];
    const years = [2024, 2025, 2026, 2027, 2028];
    
    if (members) {
      members.forEach(member => {
        const dateParts = member.salvation_date.split('-');
        if (dateParts.length === 3) {
          const month = dateParts[1];
          const day = dateParts[2];
          
          let suffix = member.bs === 'B' ? 'B' : (member.bs === 'S' ? 'S' : '');
          if (member.position && member.position.includes('집사')) {
            suffix = 'D';
          }
          
          years.forEach(year => {
            anniversaries.push({
              id: `salvation-${member.id}-${year}`,
              title: `🎂 ${member.name}${suffix}`,
              date: `${year}-${month}-${day}`,
              type: '구원기념일',
              sermon_title: '',
              attendee_count: 0
            });
          });
        }
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

    const { data, error } = await supabase
      .from('meetings')
      .insert({ title, date, end_date: end_date || null, type, sermon_title: sermon_title || null, memo: finalMemo, church, start_time: start_time || null, end_time: end_time || null })
      .select('id')
      .single();
      
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
          category
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
      category: a.members?.category || ''
    }));
    
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance', async (req, res) => {
  const { meeting_id, attendance_data } = req.body;
  try {
    const { error: deleteErr } = await supabase
      .from('attendance')
      .delete()
      .eq('meeting_id', meeting_id);
      
    if (deleteErr) throw deleteErr;

    if (attendance_data && attendance_data.length > 0) {
      const insertRows = attendance_data.map(d => ({
        meeting_id,
        member_id: d.member_id,
        is_present: d.is_present || 0,
        testimony_snapshot: d.testimony_snapshot || null,
        district_snapshot: d.district_snapshot || null,
        category_snapshot: d.category_snapshot || null
      }));

      const { error: insertErr } = await supabase
        .from('attendance')
        .insert(insertRows);
        
      if (insertErr) throw insertErr;
    }

    res.json({ status: 'success' });
  } catch (err) {
    console.error('Attendance save error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendance/toggle', async (req, res) => {
  const { member_id, meeting_id, is_present } = req.body;
  try {
    const { data: existing, error: selectErr } = await supabase
      .from('attendance')
      .select('id')
      .eq('meeting_id', meeting_id)
      .eq('member_id', member_id)
      .maybeSingle();

    if (selectErr) throw selectErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('attendance')
        .update({ is_present: is_present ? 1 : 0 })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
    } else {
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
          is_present: is_present ? 1 : 0,
          district_snapshot: member?.district || null,
          category_snapshot: member?.category || null
        });
      if (insertErr) throw insertErr;
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
    const { data: existing, error: selectErr } = await supabase
      .from('attendance')
      .select('id')
      .eq('meeting_id', meeting_id)
      .eq('member_id', member_id)
      .maybeSingle();

    if (selectErr) throw selectErr;

    if (existing) {
      const { error: updateErr } = await supabase
        .from('attendance')
        .update({ testimony_snapshot: testimony || null })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;
    } else {
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
          is_present: 0,
          testimony_snapshot: testimony || null,
          district_snapshot: member?.district || null,
          category_snapshot: member?.category || null
        });
      if (insertErr) throw insertErr;
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
        const { data: members, error: memErr } = await supabase
            .from('members')
            .select('id, name, district, category, position, family_relation')
            .eq('status', 'active');
        if (memErr) throw memErr;

        const { data: meetings, error: meetErr } = await supabase
            .from('meetings')
            .select('id, title, date, sermon_title, memo, type')
            .in('type', ['심방', '상담']);
        if (meetErr) throw meetErr;

        const { data: cRecords, error: cRecErr } = await supabase
            .from('member_records')
            .select('member_id, date, status, remark')
            .eq('status', 'COUNSELING');
        if (cRecErr) throw cRecErr;

        const meetingMap = {};
        if (meetings) {
          meetings.forEach(m => { meetingMap[m.id] = m; });
        }
        const meetingIds = (meetings || []).map(m => m.id);

        let attendance = [];
        if (meetingIds.length > 0) {
            const { data: attData, error: attErr } = await supabase
                .from('attendance')
                .select('member_id, meeting_id, is_present')
                .eq('is_present', 1)
                .in('meeting_id', meetingIds);
            if (attErr) throw attErr;
            attendance = attData || [];
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

// GET /api/counseling — 상담 이력이 있는 성도 목록 (달력 개인상담 + member_records COUNSELING 통합)
app.get('/api/counseling', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  try {
    // 1. members 전체 조회
    const { data: members, error: memErr } = await supabase
      .from('members')
      .select('id, name, district, category, position, family_relation, bs, church, parish, salvation_date')
      .eq('status', 'active');
    if (memErr) throw memErr;

    // 2. meetings(type='상담') 조회
    const { data: counselingMeetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, title, date, memo, type')
      .eq('type', '상담');
    if (meetErr) throw meetErr;

    const counselingMeetingIds = (counselingMeetings || []).map(m => m.id);
    const meetingMap = {};
    (counselingMeetings || []).forEach(m => { meetingMap[m.id] = m; });

    // 3. 해당 meetings의 attendance 조회 (모든 성도 포함 - is_present 무관)
    let attRows = [];
    if (counselingMeetingIds.length > 0) {
      const { data: attData, error: attErr } = await supabase
        .from('attendance')
        .select('member_id, meeting_id, testimony_snapshot, is_present')
        .in('meeting_id', counselingMeetingIds);
      if (attErr) throw attErr;
      attRows = attData || [];
    }

    // 4. member_records COUNSELING 조회 (기존 레거시 데이터)
    const { data: cRecords, error: cRecErr } = await supabase
      .from('member_records')
      .select('member_id, date, remark, id')
      .eq('status', 'COUNSELING');
    if (cRecErr) throw cRecErr;

    // 5. memberId별로 상담 세션 수집
    const memberCounselingMap = {}; // memberId → [{ date, content, source, session_id }]

    // meetings 기반 (달력 개인상담)
    attRows.forEach(a => {
      const meet = meetingMap[a.meeting_id];
      if (!meet) return;
      if (!memberCounselingMap[a.member_id]) memberCounselingMap[a.member_id] = [];
      
      const parsed = parseCounselingContent(a.testimony_snapshot);
      
      memberCounselingMap[a.member_id].push({
        date: meet.date,
        content: parsed.content,
        tags: parsed.tags,
        source: 'meeting',
        session_id: `m_${a.meeting_id}`,
        meeting_id: a.meeting_id,
        is_present: a.is_present
      });
    });

    // member_records 기반 (레거시 상담 등록)
    (cRecords || []).forEach(r => {
      if (!memberCounselingMap[r.member_id]) memberCounselingMap[r.member_id] = [];
      
      const parsed = parseCounselingContent(r.remark);
      
      memberCounselingMap[r.member_id].push({
        date: r.date,
        content: parsed.content,
        tags: parsed.tags,
        source: 'record',
        session_id: `r_${r.id}`,
        record_id: r.id
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
    // meetings(type='상담') 기반 attendance
    const { data: counselingMeetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, title, date, memo')
      .eq('type', '상담');
    if (meetErr) throw meetErr;

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
          memo: meet.memo || ''
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
        record_id: r.id
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
  const { member_id, name, date, content, tags, remark_memo, church, parish, district, category, bs, member_status } = req.body;
  if (!name) return res.status(400).json({ error: '이름은 필수 항목입니다.' });
  if (!date) return res.status(400).json({ error: '날짜는 필수 항목입니다.' });

  try {
    let finalMemberId = member_id;

    // 1. 성도 조회 또는 신규 생성
    if (!finalMemberId) {
      if (name.trim() === '익명') {
        const { data: existingAnon, error: findErr } = await supabase
          .from('members')
          .select('id')
          .eq('name', '익명')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (findErr) throw findErr;
        if (existingAnon) {
          finalMemberId = existingAnon.id;
        }
      }

      if (!finalMemberId) {
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
      // 기존 성도 — 소속/구분 정보 업데이트 (입력값 있는 경우)
      const updateFields = {};
      if (category) updateFields.category = category;
      if (bs) updateFields.bs = bs;
      if (Object.keys(updateFields).length > 0) {
        await supabase.from('members').update(updateFields).eq('id', finalMemberId);
      }
    }

    // 2. meetings에 개인상담 일정 생성
    const meetingTitle = `${name} 개인상담`;
    let finalMemo = '';
    if (remark_memo && remark_memo.trim()) finalMemo = remark_memo.trim();

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
  const { date, content, tags, remark_memo, member_status, member_id } = req.body;

  try {
    let fullContent = '';
    if (tags && tags.trim()) fullContent = tags.trim() + '\n';
    fullContent += content ? content.trim() : '';

    const memberId = member_id ? parseInt(member_id) : null;
    if (memberId && member_status) {
      await supabase.from('members').update({ member_status }).eq('id', memberId);
    }

    if (sessionId.startsWith('m_')) {
      // meetings + attendance 방식
      const meetingId = sessionId.replace('m_', '');

      const meetUpdate = { date };
      if (remark_memo !== undefined) meetUpdate.memo = remark_memo;
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
      const remarkText = fullContent ? `[상담] ${fullContent}` : '[상담] 내용 없음';
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
    const { data: meetings, error: meetGetErr } = await supabase
      .from('meetings')
      .select('id')
      .eq('type', '상담');
    if (meetGetErr) throw meetGetErr;

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
        const { data, error } = await supabase
            .from('members')
            .select('*')
            .ilike('name', `%${q}%`)
            .eq('status', 'active');
        if (error) throw error;
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
        const { data: meetings, error: meetErr } = await supabase
            .from('meetings')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });
        if (meetErr) throw meetErr;

        const { data: members, error: memErr } = await supabase
            .from('members')
            .select('id, name, category, bs, district, birth_year, position, church_service, family_relation')
            .eq('status', 'active');
        if (memErr) throw memErr;

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

        res.json({ meetings: meetings || [], members: membersWithAttendance });
    } catch (err) {
        console.error('Dashboard attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/sermon-stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const { data: allMeetings, error } = await supabase
            .from('meetings')
            .select('id, date, title, type, sermon_title, memo, start_time, end_time, attendance(count)')
            .eq('attendance.is_present', 1)
            .order('date', { ascending: false });

        if (error) throw error;

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