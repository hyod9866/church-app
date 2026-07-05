// 전체 모임 대상, 같은 모임 안에서 같은 회원이 출석행을 2개 이상 갖고 있는 경우를 전부 스캔 (읽기 전용)
// 실행: node scratch_scan_all_dup_attendance.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PAGE_SIZE = 1000;

async function fetchAllAttendance() {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('attendance')
      .select('meeting_id, member_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all = all.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

(async () => {
  const { data: meetings, error: mErr } = await supabase
    .from('meetings')
    .select('id, date, title, type')
    .order('id', { ascending: true });
  if (mErr) throw mErr;

  console.log(`전체 모임 수: ${meetings.length}건. 출석 데이터 스캔 중 (페이지 단위로 전체 조회)...`);

  const allAtt = await fetchAllAttendance();
  console.log(`전체 출석행 수: ${allAtt.length}개`);

  const byMeeting = {};
  allAtt.forEach(a => {
    (byMeeting[a.meeting_id] = byMeeting[a.meeting_id] || []).push(a.member_id);
  });

  const meetingById = {};
  meetings.forEach(m => { meetingById[m.id] = m; });

  const problems = [];
  Object.entries(byMeeting).forEach(([meetingId, memberIds]) => {
    const counts = {};
    memberIds.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
    const dupMembers = Object.entries(counts).filter(([, c]) => c > 1);
    if (dupMembers.length > 0) {
      const m = meetingById[meetingId];
      problems.push({
        meetingId: Number(meetingId),
        date: m ? m.date : '?',
        title: m ? m.title : '(모임 정보 없음, 삭제된 모임일 수 있음)',
        type: m ? m.type : '?',
        totalRows: memberIds.length,
        distinctMembers: Object.keys(counts).length,
        dupMemberCount: dupMembers.length,
      });
    }
  });

  problems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  console.log(`\n=== 중복 출석행이 있는 모임: ${problems.length}건 ===`);
  problems.forEach(p => {
    console.log(`[id=${p.meetingId}] ${p.date} ${p.title} (${p.type}) — 출석행 ${p.totalRows}개 / 실제회원 ${p.distinctMembers}명 / 중복된 회원 ${p.dupMemberCount}명`);
  });

  if (problems.length === 0) {
    console.log('중복 출석행이 있는 모임이 없습니다.');
  } else {
    console.log('\n위 목록의 각 id에 대해 아래처럼 정리할 수 있습니다:');
    console.log('  node scratch_dedupe_meeting_attendance.cjs <meeting_id>            (미리보기)');
    console.log('  node scratch_dedupe_meeting_attendance.cjs <meeting_id> --apply    (실제 반영)');
  }
})().catch(e => { console.error(e); process.exit(1); });
