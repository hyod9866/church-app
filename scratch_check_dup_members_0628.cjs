// 6/28 기도모임(id=143) 출석자 명단에서, 같은 이름이 서로 다른 member_id로 두 번 나오는지 확인 (읽기 전용)
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const MEETING_ID = Number(process.argv[2] || 143);

(async () => {
  const { data: att, error } = await supabase
    .from('attendance')
    .select('member_id, is_present')
    .eq('meeting_id', MEETING_ID);
  if (error) throw error;

  const memberIds = [...new Set(att.map(a => a.member_id))];
  const { data: members } = await supabase
    .from('members')
    .select('id, name, church, parish, district, member_status')
    .in('id', memberIds);

  const byName = {};
  (members || []).forEach(m => {
    (byName[m.name] = byName[m.name] || []).push(m);
  });

  const dupNames = Object.entries(byName).filter(([, arr]) => arr.length > 1);
  console.log(`이 모임 출석행에 연결된 회원 수(고유 id): ${memberIds.length}명`);
  console.log(`그 중 같은 이름이 서로 다른 id로 여러 번 존재하는 이름: ${dupNames.length}개`);
  dupNames.slice(0, 20).forEach(([name, arr]) => {
    console.log(`- ${name}: id=[${arr.map(m => m.id).join(', ')}]`);
    arr.forEach(m => console.log(`    id=${m.id} church=${m.church} parish=${m.parish} district=${m.district} status=${m.member_status}`));
  });

  // 전체 members 테이블에서도 이름 중복이 있는지 (부곡교구 한정 아니고 전체)
  const { data: allMembers } = await supabase.from('members').select('id, name');
  const allByName = {};
  (allMembers || []).forEach(m => { (allByName[m.name] = allByName[m.name] || []).push(m.id); });
  const allDup = Object.entries(allByName).filter(([, ids]) => ids.length > 1);
  console.log(`\n전체 members 테이블 기준, 이름이 중복되는 경우: ${allDup.length}개 (동명이인일 수도 있음, 참고용)`);
})().catch(e => { console.error(e); process.exit(1); });
