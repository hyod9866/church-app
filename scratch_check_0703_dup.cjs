// 2026-07-03 교구전체모임 중복 생성 진단 스크립트
// 실행: node scratch_check_0703_dup.cjs
// 같은 날짜의 교구전체모임 행들과 각 행의 출석 데이터(전체/참석)를 보여줘서
// 어느 행이 오늘 체크분(정상)이고 어느 행이 덮어써진/중복 행인지 판별한다.
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const TARGET_DATE = process.argv[2] || '2026-07-03';

(async () => {
  // 1) 해당 날짜의 교구전체모임 행
  const { data: meetings, error } = await supabase
    .from('meetings')
    .select('*')
    .eq('type', '교구전체모임')
    .eq('date', TARGET_DATE)
    .order('id', { ascending: true });
  if (error) throw error;

  console.log(`\n=== ${TARGET_DATE} 교구전체모임: ${meetings.length}건 ===`);
  for (const m of meetings) {
    const { data: att } = await supabase
      .from('attendance')
      .select('member_id, is_present')
      .eq('meeting_id', m.id);
    const total = (att || []).length;
    const present = (att || []).filter(a => Number(a.is_present) === 1).length;
    const memoHead = (m.memo || '').split('\n')[0];
    console.log(`\n[id=${m.id}] ${m.title} | ${m.start_time || ''}~${m.end_time || ''}`);
    console.log(`  출석행: ${total}개 (참석 ${present}명)`);
    console.log(`  memo: ${memoHead.substring(0, 200) || '(없음)'}`);
    if (m.created_at) console.log(`  created_at: ${m.created_at}`);
  }

  // 2) 반복(부모) 교구전체모임 행 — exdates에 대상 날짜가 빠졌는지 확인
  const { data: parents } = await supabase
    .from('meetings')
    .select('id, date, title, memo')
    .eq('type', '교구전체모임')
    .like('memo', '%__RECURRING__%');
  console.log(`\n=== 반복 설정된 교구전체모임 부모 행: ${(parents || []).length}건 ===`);
  for (const p of parents || []) {
    const metaLine = (p.memo || '').split('\n')[0].replace('__RECURRING__:', '');
    let meta = null;
    try { meta = JSON.parse(metaLine); } catch (e) {}
    const ex = meta && meta.exdates ? String(meta.exdates) : '';
    console.log(`[id=${p.id}] 시작=${p.date} | ${p.title}`);
    console.log(`  rrule=${meta ? meta.rrule_type : '?'} 종료=${meta ? meta.rrule_end_date : '?'}`);
    console.log(`  exdates에 ${TARGET_DATE} 포함: ${ex.includes(TARGET_DATE) ? 'O' : 'X'}  (전체: ${ex || '없음'})`);
  }

  // 3) 최근 2주 교구전체모임 전체 (수정으로 정체가 바뀐 행 추적용)
  const { data: recent } = await supabase
    .from('meetings')
    .select('id, date, title, start_time')
    .eq('type', '교구전체모임')
    .gte('date', '2026-06-19')
    .order('date', { ascending: true });
  console.log(`\n=== 최근 교구전체모임 (2026-06-19 이후) ===`);
  (recent || []).forEach(r => console.log(`[id=${r.id}] ${r.date} ${r.start_time || ''} | ${r.title}`));

  console.log('\n판별 가이드:');
  console.log('- 참석 수가 오늘 실제 체크 인원(≈18)과 일치하는 행이 정상 행입니다.');
  console.log('- 출석행이 비정상적으로 많은(≈126) 행은 과거 데이터가 쌓였거나 다른 모임이 덮어써진 행일 가능성이 큽니다.');
  console.log('- 중복 행 삭제 전, 위 목록에서 과거 주차 모임이 사라진 것이 없는지(id 재사용/덮어쓰기) 확인하세요.');
})().catch(e => { console.error(e); process.exit(1); });
