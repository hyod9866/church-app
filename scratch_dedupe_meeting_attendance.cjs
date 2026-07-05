// 하나의 모임(meeting_id) 안에서 같은 회원이 출석행을 2개 이상 가진 경우를 회원당 1행으로 병합
// 기본값 = 미리보기(DRY RUN)만 수행, 실제로 DB를 바꾸지 않습니다.
//
// 사용법:
//   node scratch_dedupe_meeting_attendance.cjs <meeting_id>            (미리보기)
//   node scratch_dedupe_meeting_attendance.cjs <meeting_id> --apply    (실제 반영)
//
// 병합 규칙: 같은 회원의 여러 행 중 하나라도 참석(1)이면 참석으로, 간증/스냅샷은 값이 있는 것을 우선 사용.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MEETING_ID = Number(process.argv[2]);
const APPLY = process.argv.includes('--apply');

if (!MEETING_ID) {
  console.error('사용법: node scratch_dedupe_meeting_attendance.cjs <meeting_id> [--apply]');
  process.exit(1);
}

(async () => {
  const [att, members, meeting] = await Promise.all([
    supabase.from('attendance').select('*').eq('meeting_id', MEETING_ID),
    supabase.from('members').select('id, name'),
    supabase.from('meetings').select('id, date, title, type').eq('id', MEETING_ID).single(),
  ]);
  if (att.error) throw att.error;

  console.log(`대상 모임: [id=${MEETING_ID}] ${meeting.data?.date} ${meeting.data?.title} (${meeting.data?.type})`);
  console.log(`기존 출석행 수: ${att.data.length}개`);

  const nameOf = {};
  (members.data || []).forEach(m => { nameOf[m.id] = m.name; });

  const byMember = {};
  att.data.forEach(r => {
    (byMember[r.member_id] = byMember[r.member_id] || []).push(r);
  });

  const dupCount = Object.values(byMember).filter(rows => rows.length > 1).length;
  console.log(`중복(2개 이상) 회원 수: ${dupCount}명`);

  const mergedRows = Object.entries(byMember).map(([memberId, rows]) => {
    const present = rows.some(r => Number(r.is_present) === 1) ? 1 : 0;
    const testimony = rows.map(r => (r.testimony_snapshot || '').trim()).find(t => t) || null;
    const district_snapshot = rows.map(r => r.district_snapshot).find(Boolean) || null;
    const category_snapshot = rows.map(r => r.category_snapshot).find(Boolean) || null;
    return {
      meeting_id: MEETING_ID,
      member_id: Number(memberId),
      is_present: present,
      testimony_snapshot: testimony,
      district_snapshot,
      category_snapshot,
    };
  });

  const presentCount = mergedRows.filter(r => r.is_present === 1).length;

  console.log(`\n=== 병합 계획 ===`);
  console.log(`병합 후 회원 수: ${mergedRows.length}명 (기존 ${att.data.length}행 → ${mergedRows.length}행)`);
  console.log(`병합 후 참석 인원: ${presentCount}명`);
  console.log(`\n참석자 명단:`);
  console.log(mergedRows.filter(r => r.is_present === 1).map(r => nameOf[r.member_id] || r.member_id).join(', '));

  if (!APPLY) {
    console.log(`\n⚠ 미리보기 모드입니다. 실제로 반영하지 않았습니다.`);
    console.log(`위 내용이 맞으면 아래 명령으로 실제 반영하세요:`);
    console.log(`  node scratch_dedupe_meeting_attendance.cjs ${MEETING_ID} --apply`);
    return;
  }

  console.log(`\n실제 반영을 시작합니다...`);

  const del = await supabase.from('attendance').delete().eq('meeting_id', MEETING_ID);
  if (del.error) throw del.error;

  const ins = await supabase.from('attendance').insert(mergedRows);
  if (ins.error) throw ins.error;

  console.log(`✓ 완료: meeting_id=${MEETING_ID} 에 ${mergedRows.length}행(참석 ${presentCount}명)으로 정리됨.`);
})().catch(e => { console.error(e); process.exit(1); });
