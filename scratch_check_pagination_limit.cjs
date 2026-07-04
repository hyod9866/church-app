// 가설 검증: server.js의 GET /api/meetings가 attendance 테이블 전체를
// .eq('is_present', 1) 만으로(페이지네이션/limit 없이) 조회하는데,
// Supabase/PostgREST 기본 응답 행 수 제한(보통 1000행)에 걸려 일부가
// "조용히" 잘려나가는 게 아닌지 확인한다. (읽기 전용)
// 실행: node scratch_check_pagination_limit.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  // 1) 서버와 동일한 쿼리 (limit/range 없음) — 몇 행이 돌아오는지
  const { data: noLimit, error: e1 } = await supabase
    .from('attendance')
    .select('meeting_id, is_present')
    .eq('is_present', 1);
  if (e1) throw e1;
  console.log(`서버와 동일한 쿼리(제한 없음) 결과 행 수: ${noLimit.length}`);

  // 2) count 옵션으로 실제 전체 행 수(서버 응답 제한과 무관한 진짜 총계) 확인
  const { count, error: e2 } = await supabase
    .from('attendance')
    .select('id', { count: 'exact', head: true })
    .eq('is_present', 1);
  if (e2) throw e2;
  console.log(`실제 전체 참석(is_present=1) 행 수 (count exact): ${count}`);

  if (count !== noLimit.length) {
    console.log(`\n⚠ 불일치 발견! 쿼리가 ${count - noLimit.length}행을 누락했습니다.`);
    console.log('→ Supabase/PostgREST 기본 응답 행 수 제한(기본 1000행)에 의해');
    console.log('   서버가 전체 출석 데이터를 못 가져오고 있을 가능성이 매우 높습니다.');
  } else {
    console.log('\n일치함 — 페이지네이션 문제는 아닙니다.');
  }

  // 3) meeting_id=16이 잘려나간 행에 포함되는지 직접 확인
  const has16 = noLimit.some(r => r.meeting_id === 16);
  console.log(`\n제한 없음 쿼리 결과에 meeting_id=16 포함 여부: ${has16 ? '포함됨' : '누락됨'}`);

  // 4) 페이지네이션(.range)으로 전체를 나눠 가져오면 몇 행이 나오는지 (진짜 총계 재확인)
  let all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data: page, error: e3 } = await supabase
      .from('attendance')
      .select('meeting_id, is_present')
      .eq('is_present', 1)
      .range(from, from + pageSize - 1);
    if (e3) throw e3;
    all = all.concat(page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  console.log(`\n.range()로 전체 페이지 수집한 행 수: ${all.length}`);
  console.log(`.range() 결과에 meeting_id=16 포함 여부: ${all.some(r => r.meeting_id === 16) ? '포함됨' : '누락됨'}`);
})().catch(e => { console.error(e); process.exit(1); });
