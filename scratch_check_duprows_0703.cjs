// 2026-07-03 교구전체모임(id=212, 213) 각 모임 "내부"에 회원당 출석행이 중복 저장됐는지 확인 (읽기 전용)
// 실행: node scratch_check_duprows_0703.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const IDS = [212, 213];

(async () => {
  const { data: members } = await supabase.from('members').select('id, name');
  const nameOf = {};
  (members || []).forEach(m => { nameOf[m.id] = m.name; });

  for (const meetingId of IDS) {
    const { data: rows, error } = await supabase
      .from('attendance')
      .select('id, member_id, is_present, testimony_snapshot')
      .eq('meeting_id', meetingId)
      .order('member_id', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;

    console.log(`\n=== meeting_id=${meetingId}: 총 ${rows.length}개 출석행 ===`);

    const byMember = {};
    rows.forEach(r => {
      (byMember[r.member_id] = byMember[r.member_id] || []).push(r);
    });

    const distinctMembers = Object.keys(byMember).length;
    console.log(`고유 회원 수: ${distinctMembers}명 (행/회원 평균 = ${(rows.length / distinctMembers).toFixed(2)})`);

    // 중복(회원당 2행 이상) 목록
    const dupEntries = Object.entries(byMember).filter(([, list]) => list.length > 1);
    console.log(`중복 저장된 회원 수: ${dupEntries.length}명`);
    if (dupEntries.length > 0) {
      console.log('상세 (최대 15명만 표시):');
      dupEntries.slice(0, 15).forEach(([mid, list]) => {
        const nm = nameOf[mid] || `id${mid}`;
        const presentFlags = list.map(r => `[attId=${r.id}, present=${r.is_present}]`).join(' ');
        console.log(`  - ${nm}: ${presentFlags}`);
      });
      if (dupEntries.length > 15) console.log(`  ... 외 ${dupEntries.length - 15}명 더`);
    }

    // "OR 병합" 기준 참석자 수 (중복 행 중 하나라도 present=1이면 참석 처리)
    const orPresentCount = Object.values(byMember).filter(list => list.some(r => Number(r.is_present) === 1)).length;
    console.log(`OR 기준 실제 참석자 수 (중복 행 중 하나라도 참석=1): ${orPresentCount}명`);
  }
})().catch(e => { console.error(e); process.exit(1); });
