// 수정한 fetchAllRows 로직이 실제로 meeting_id=16(582구역모임, 2026-01-16)을
// 정확히 23명으로 집계하는지 실제 DB에 대해 재현 검증 (읽기 전용, DB에 아무 것도 쓰지 않음)
// 실행: node scratch_verify_fix.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

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

(async () => {
  const presentAttendance = await fetchAllRows((from, to) =>
    supabase
      .from('attendance')
      .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present, members(district)')
      .eq('is_present', 1)
      .range(from, to)
  );

  console.log(`수정 후 fetchAllRows로 가져온 총 참석행: ${presentAttendance.length}개 (수정 전엔 1000개에서 잘렸음)`);

  const countMap = {};
  presentAttendance.forEach(a => {
    countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1;
  });

  console.log(`\nmeeting_id=16 (582구역모임, 2026-01-16) 재계산 결과: ${countMap[16] || 0}명`);
  console.log(countMap[16] === 23 ? '✅ 기대값(23명)과 일치 — 수정 확인됨' : '❌ 여전히 불일치');

  // 아까 확인했던 다른 "0명으로 보이던" 모임들도 같이 재확인
  const { data: suspects } = await supabase
    .from('meetings')
    .select('id, title, date, type')
    .in('id', [16, 29]); // 582구역모임 1/16, 582구역모임 2/27 (앞서 audit에서 0명으로 나왔던 것들)
  (suspects || []).forEach(m => {
    console.log(`  id=${m.id} "${m.title}" (${m.date}) → 재계산된 참석 인원: ${countMap[m.id] || 0}명`);
  });
})().catch(e => { console.error(e); process.exit(1); });
