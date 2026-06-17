const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
                currentStatus = 'active'; // 버그 패치된 로직 적용! (inactive가 아닌 active 유지)
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
    console.log(`Sync success for member ${memberId}. Church: ${currentChurch}, Status: ${currentStatus}`);
}

async function run() {
  // 김경민 성도 ID가 285인 성도와 284인 성도 모두를 동기화해준다.
  try {
    await syncMemberProfileFromRecords(285);
    await syncMemberProfileFromRecords(284);
  } catch (err) {
    console.error(err);
  }
}

run();
