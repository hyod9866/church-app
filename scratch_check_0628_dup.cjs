// 2026-06-28 기도모임(8시) 중복 생성 진단 스크립트
// 실행: node scratch_check_0628_dup.cjs
// 같은 날짜/제목의 모임 행들과 각 행의 출석 데이터(전체/참석)를 보여줘서
// 몇 개가 중복인지, 어느 행이 남아야 할지 판별한다.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const TARGET_DATE = process.argv[2] || '2026-06-28';
const TITLE_LIKE = process.argv[3] || '기도모임';

(async () => {
  // 1) 해당 날짜에 제목이 일치하는 모임 행 전부
  const { data: meetings, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('date', TARGET_DATE)
    .ilike('title', `%${TITLE_LIKE}%`)
    .order('id', { ascending: true });
  if (error) throw error;

  console.log(`\n=== ${TARGET_DATE} "${TITLE_LIKE}" 포함 모임: ${meetings.length}건 ===`);
  for (const m of meetings) {
    const { data: att } = await supabase
      .from('attendance')
      .select('member_id, is_present')
      .eq('meeting_id', m.id);
    const total = (att || []).length;
    const present = (att || []).filter(a => Number(a.is_present) === 1).length;
    console.log(`\n[id=${m.id}] ${m.title} | type=${m.type} | ${m.start_time || ''}~${m.end_time || ''}`);
    console.log(`  출석행: ${total}개 (참석 ${present}명)`);
    if (m.created_at) console.log(`  created_at: ${m.created_at}`);
    if (m.leader_church_snapshot) console.log(`  snapshot: ${m.leader_church_snapshot}/${m.leader_parish_snapshot}`);
  }

  if (meetings.length >= 2) {
    console.log('\n=== 회원별 출석 비교 (중복 모임 간 겹치는 회원이 있는지) ===');
    const ids = meetings.map(m => m.id);
    const { data: allAtt } = await supabase
      .from('attendance')
      .select('meeting_id, member_id, is_present')
      .in('meeting_id', ids);
    const { data: members } = await supabase.from('members').select('id, name');
    const nameOf = {};
    (members || []).forEach(mm => { nameOf[mm.id] = mm.name; });

    const byMember = {};
    (allAtt || []).forEach(a => {
      const list = (byMember[a.member_id] = byMember[a.member_id] || []);
      list.push(a);
    });
    const overlapping = Object.entries(byMember).filter(([, rows]) => rows.length > 1);
    console.log(`총 회원 수(출석행 기준 distinct): ${Object.keys(byMember).length}명`);
    console.log(`두 모임 모두에 출석행이 존재하는 회원: ${overlapping.length}명`);
    if (overlapping.length > 0) {
      console.log('샘플(최대 10명):', overlapping.slice(0, 10).map(([mid]) => nameOf[mid] || mid).join(', '));
    }
  }

  console.log('\n판별 가이드:');
  console.log('- 두 행 모두에 겹치는 회원이 많다면, 화면에 "총 참석" 인원이 두 배로 보이는 이유가 이 중복 모임 때문일 가능성이 큽니다.');
  console.log('- 어느 id를 남기고 어느 id를 지울지 정하면, scratch_merge_dup.cjs로 병합할 수 있습니다.');
})().catch(e => { console.error(e); process.exit(1); });
