// 582구역모임(김국영b, 박규희s 댁) 2026-01-16 건: 목록엔 "(0)", 상세엔 "23명"으로 다르게 보이는 원인 조사 (읽기 전용)
// 실행: node scratch_582_0116.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  // 1) 같은 제목/날짜로 중복된 모임 레코드가 있는지 확인
  const { data: meetings, error: mErr } = await supabase
    .from('meetings')
    .select('*')
    .eq('date', '2026-01-16')
    .ilike('title', '%582구역모임%');
  if (mErr) throw mErr;

  console.log(`=== 2026-01-16 "582구역모임" 관련 meetings 레코드: ${meetings.length}건 ===`);
  meetings.forEach(m => {
    console.log(`  id=${m.id}  title="${m.title}"  type=${m.type}  created_at=${m.created_at || '(없음)'}`);
  });

  // 2) 각 후보 모임 id의 attendance 실제 저장 상태 확인
  for (const m of meetings) {
    const { data: rows, error } = await supabase
      .from('attendance')
      .select('id, member_id, is_present, testimony_snapshot, members(name)')
      .eq('meeting_id', m.id);
    if (error) throw error;
    const present = rows.filter(r => Number(r.is_present) === 1);
    console.log(`\n  --- meeting_id=${m.id} 출석 테이블 ---`);
    console.log(`  전체 출석행: ${rows.length}개, 참석(is_present=1): ${present.length}명`);
    if (present.length > 0) {
      console.log('  참석자:', present.map(r => r.members?.name || `id${r.member_id}`).join(', '));
    }
  }

  // 3) 서버가 실제 내려주는 값(/api/meetings 목록 attendee_count 계산과 동일 로직) 재현
  const { data: allMeetings } = await supabase.from('meetings').select('id, title, date, type').eq('date', '2026-01-16');
  const { data: presentAtt } = await supabase.from('attendance').select('meeting_id, is_present').eq('is_present', 1);
  const countMap = {};
  (presentAtt || []).forEach(a => { countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1; });
  console.log('\n=== 서버 attendee_count 재현 (목록에 표시되는 숫자) ===');
  allMeetings.filter(m => (m.title || '').includes('582구역모임')).forEach(m => {
    console.log(`  id=${m.id} "${m.title}" → attendee_count=${countMap[m.id] || 0}`);
  });
})().catch(e => { console.error(e); process.exit(1); });
