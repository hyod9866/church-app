// 범용 중복 모임 병합 스크립트
// 기본값 = 미리보기(DRY RUN)만 수행, 실제로 DB를 바꾸지 않습니다.
//
// 사용법:
//   node scratch_merge_dup.cjs <남길 id> <지울 id>            (미리보기)
//   node scratch_merge_dup.cjs <남길 id> <지울 id> --apply    (실제 반영)
//
// 계획:
//   1) KEEP_ID, REMOVE_ID 각 모임의 출석 데이터를 회원별로 모아 "하나라도 참석=1이면 참석"으로 병합
//   2) KEEP_ID의 기존 출석행을 모두 지우고, 병합된(회원당 1행) 행만 다시 넣음
//   3) REMOVE_ID의 출석행 전체와 REMOVE_ID 모임 자체를 삭제
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const KEEP_ID = Number(process.argv[2]);
const REMOVE_ID = Number(process.argv[3]);
const APPLY = process.argv.includes('--apply');

if (!KEEP_ID || !REMOVE_ID) {
  console.error('사용법: node scratch_merge_dup.cjs <남길 id> <지울 id> [--apply]');
  process.exit(1);
}

(async () => {
  const [attKeep, attRemove, members, meetingKeep, meetingRemove] = await Promise.all([
    supabase.from('attendance').select('*').eq('meeting_id', KEEP_ID),
    supabase.from('attendance').select('*').eq('meeting_id', REMOVE_ID),
    supabase.from('members').select('id, name'),
    supabase.from('meetings').select('id, date, title, type').eq('id', KEEP_ID).single(),
    supabase.from('meetings').select('id, date, title, type').eq('id', REMOVE_ID).single(),
  ]);
  if (attKeep.error) throw attKeep.error;
  if (attRemove.error) throw attRemove.error;

  console.log(`남길 모임:  [id=${KEEP_ID}] ${meetingKeep.data?.date} ${meetingKeep.data?.title}`);
  console.log(`지울 모임:  [id=${REMOVE_ID}] ${meetingRemove.data?.date} ${meetingRemove.data?.title}`);

  const nameOf = {};
  (members.data || []).forEach(m => { nameOf[m.id] = m.name; });

  // 회원별로 두 모임의 모든 행(중복 포함)을 모아 병합
  const byMember = {};
  [...attKeep.data, ...attRemove.data].forEach(r => {
    const list = (byMember[r.member_id] = byMember[r.member_id] || []);
    list.push(r);
  });

  const mergedRows = Object.entries(byMember).map(([memberId, rows]) => {
    const present = rows.some(r => Number(r.is_present) === 1) ? 1 : 0;
    const testimony = rows.map(r => (r.testimony_snapshot || '').trim()).find(t => t) || null;
    const district_snapshot = rows.map(r => r.district_snapshot).find(Boolean) || null;
    const category_snapshot = rows.map(r => r.category_snapshot).find(Boolean) || null;
    return {
      meeting_id: KEEP_ID,
      member_id: Number(memberId),
      is_present: present,
      testimony_snapshot: testimony,
      district_snapshot,
      category_snapshot,
    };
  });

  const presentCount = mergedRows.filter(r => r.is_present === 1).length;

  console.log(`\n=== 병합 계획 ===`);
  console.log(`대상 회원 수: ${mergedRows.length}명`);
  console.log(`병합 후 참석 인원: ${presentCount}명`);
  console.log(`\n참석자 명단:`);
  console.log(mergedRows.filter(r => r.is_present === 1).map(r => nameOf[r.member_id] || r.member_id).join(', '));

  console.log(`\n작업 내용:`);
  console.log(`1) attendance: meeting_id=${KEEP_ID} 기존 ${attKeep.data.length}행 삭제 → 병합된 ${mergedRows.length}행 새로 삽입`);
  console.log(`2) attendance: meeting_id=${REMOVE_ID} 기존 ${attRemove.data.length}행 전체 삭제`);
  console.log(`3) meetings: id=${REMOVE_ID} 행 삭제`);

  if (!APPLY) {
    console.log(`\n⚠ 미리보기 모드입니다. 실제로 반영하지 않았습니다.`);
    console.log(`위 내용이 맞으면 아래 명령으로 실제 반영하세요:`);
    console.log(`  node scratch_merge_dup.cjs ${KEEP_ID} ${REMOVE_ID} --apply`);
    return;
  }

  console.log(`\n실제 반영을 시작합니다...`);

  const del1 = await supabase.from('attendance').delete().eq('meeting_id', KEEP_ID);
  if (del1.error) throw del1.error;

  const ins1 = await supabase.from('attendance').insert(mergedRows);
  if (ins1.error) throw ins1.error;

  const del2 = await supabase.from('attendance').delete().eq('meeting_id', REMOVE_ID);
  if (del2.error) throw del2.error;

  const del3 = await supabase.from('meetings').delete().eq('id', REMOVE_ID);
  if (del3.error) throw del3.error;

  console.log(`✓ 완료: meeting_id=${KEEP_ID} 에 ${mergedRows.length}행(참석 ${presentCount}명)으로 정리됨. meeting_id=${REMOVE_ID} 삭제됨.`);
})().catch(e => { console.error(e); process.exit(1); });
