import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import multer from 'multer';
import * as csv from 'fast-csv';
import iconv from 'iconv-lite';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

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

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

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

app.use(express.static(dirname(fileURLToPath(import.meta.url)) + '/public'));
app.use(express.json());

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
        const { error: updateErr } = await supabase
          .from('members')
          .update({ family_id: task.family_id, family_relation: task.family_relation })
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

    let currentChurch = '서울중앙교회';
    let currentParish = '부곡교구'; // Always start from '부곡교구' to handle future migrations correctly
    let currentDistrict = member.district || '미배정';
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
                currentStatus = 'inactive'; // Transfer out
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
    
    // Sync all members' profile records in parallel
    await Promise.all(rows.map(row => syncMemberProfileFromRecords(row.id)));
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

app.get('/api/members/search', async (req, res) => {
  try {
    // [성능 개선 및 Cloudflare 522 타임아웃 방지] 
    // 성도 등록/수정/삭제 시 개별 프로필 동기화가 이미 수행되므로, 검색 API를 호출할 때마다 전체 성도를 동기화하는 무거운 로직은 제외합니다.
    // await syncAllMembersProfilePromise();
    
    const { q, gender, category, district, status: st, parish } = req.query;
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

app.get('/api/members/:id/history', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: attendanceData, error: attError } = await supabase
      .from('attendance')
      .select(`
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
      church: b.church || '서울중앙교회',
      parish: b.parish || '부곡교구'
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
      parish: b.parish
    };

    const { error } = await supabase
      .from('members')
      .update(updateData)
      .eq('id', id);
      
    if (error) throw error;
    
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
app.get('/api/churches', async (req, res) => {
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
  if (!church_id) return res.status(400).json({ error: 'church_id is required' });
  try {
      const { data, error } = await supabase
          .from('parishes')
          .select('*')
          .eq('church_id', church_id)
          .order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.get('/api/districts', async (req, res) => {
  const { parish_id } = req.query;
  if (!parish_id) return res.status(400).json({ error: 'parish_id is required' });
  try {
      const { data, error } = await supabase
          .from('districts')
          .select('*')
          .eq('parish_id', parish_id)
          .order('name', { ascending: true });
      if (error) throw error;
      res.json(data || []);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

// Create Church
app.post('/api/churches', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      const { data, error } = await supabase
          .from('churches')
          .insert({ name })
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
  const { name } = req.body;
  const { id } = req.params;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
      const { error } = await supabase
          .from('churches')
          .update({ name })
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
      .select('meeting_id')
      .eq('is_present', 1);
    if (attErr) throw attErr;

    const countMap = {};
    if (presentAttendance) {
      presentAttendance.forEach(a => {
        countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1;
      });
    }

    const rows = meetings.map(m => ({
      ...m,
      attendee_count: countMap[m.id] || 0
    }));

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
  const { title, date, end_date, type, sermon_title, memo, church } = req.body;
  try {
    const { data, error } = await supabase
      .from('meetings')
      .insert({ title, date, end_date: end_date || null, type, sermon_title, memo, church })
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

app.put('/api/meetings/:id', async (req, res) => {
  const { title, date, end_date, type, sermon_title, memo, church } = req.body;
  try {
    const { error } = await supabase
      .from('meetings')
      .update({ title, date, end_date: end_date || null, type, sermon_title, memo, church })
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
            .select('id, title, date, sermon_title, memo')
            .eq('type', '심방');
        if (meetErr) throw meetErr;

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

        const result = members.map(m => {
            const visits = memberVisitations[m.id] || [];
            visits.sort((a, b) => b.date.localeCompare(a.date));

            const lastVisit = visits[0];
            return {
                id: m.id,
                name: m.name,
                district: m.district,
                category: m.category,
                position: m.position,
                family_relation: m.family_relation,
                last_visitation: lastVisit ? lastVisit.date : null,
                total_count: visits.length,
                last_sermon: lastVisit ? lastVisit.sermon_title : null,
                last_memo: lastVisit ? lastVisit.memo : null
            };
        });

        res.json(result);
    } catch (err) {
        console.error('Visitation status error:', err);
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

        const { data: attendance, error: attErr } = await supabase
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
            .lte('meetings.date', endDate);
            
        if (attErr) throw attErr;

        const membersWithAttendance = members.map(member => {
            const memberAttendance = {};
            if (attendance) {
              attendance.filter(a => a.member_id === member.id).forEach(a => {
                  memberAttendance[a.meeting_id] = {
                      is_present: a.is_present,
                      testimony_snapshot: a.testimony_snapshot
                  };
              });
            }
            return { ...member, attendance: memberAttendance };
        });

        res.json({ meetings: meetings || [], members: membersWithAttendance });
    } catch (err) {
        console.error('Dashboard attendance error:', err);
        res.status(500).json({ error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
export default app;