// 모임 대시보드 차트 값 검증 스크립트 (읽기 전용)
// 대시보드(meeting_dashboard.js)와 동일한 규칙으로 월별 그래프 값을 재계산하고,
// 각 값이 어떤 모임들의 합인지 + 중복 출석행 여부를 보여준다.
// 실행: node scratch_chart_audit.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const YEAR = 2026;

(async () => {
  const { data: meetings, error: mErr } = await supabase
    .from('meetings')
    .select('id, title, type, date')
    .gte('date', `${YEAR}-01-01`)
    .lte('date', `${YEAR}-12-31`)
    .order('date', { ascending: true });
  if (mErr) throw mErr;

  const { data: att, error: aErr } = await supabase
    .from('attendance')
    .select('id, meeting_id, member_id, is_present, district_snapshot, members(district, name)')
    .eq('is_present', 1);
  if (aErr) throw aErr;

  // 모임별 출석 집계 (서버 GET /api/meetings와 동일: 행 단위 카운트)
  const byMeeting = {};
  (att || []).forEach(a => {
    if (Number(a.is_present) !== 1) return;
    const m = (byMeeting[a.meeting_id] = byMeeting[a.meeting_id] || { rows: 0, members: new Set(), dupMembers: new Set(), dist: {} });
    m.rows++;
    if (m.members.has(a.member_id)) m.dupMembers.add(a.member_id);
    m.members.add(a.member_id);
    let dist = (a.district_snapshot || (a.members && a.members.district) || '').replace('구역', '').trim();
    dist = dist ? `${dist}구역` : '미지정';
    m.dist[dist] = (m.dist[dist] || 0) + 1;
  });

  // 차트 분류 (meeting_dashboard.js와 동일 규칙)
  const chartOf = (m) => {
    const t = m.type || '', title = m.title || '';
    if (t.includes('교구전체모임')) {
      if (title.includes('조')) return ['조모임 차트', true];
      if (title.includes('구역')) return ['구역모임 차트', true];
      return [null, false];
    }
    if (t.includes('전체조모임')) return ['조모임 차트', true];
    if (t.includes('구역모임')) return ['구역모임 차트', false];
    if (t.includes('조모임')) return ['조모임 차트', false];
    if (t.includes('형제모임')) return ['형제모임 차트', true];
    if (t.includes('청년모임')) return ['청년모임 차트', true];
    return [null, false];
  };

  // 월별 시리즈 합산 (차트가 그리는 값 재현)
  const monthly = {}; // "차트|시리즈|월" -> { sum, list }
  (meetings || []).forEach(m => {
    const [chart, breakdown] = chartOf(m);
    if (!chart) return;
    const info = byMeeting[m.id] || { rows: 0, members: new Set(), dupMembers: new Set(), dist: {} };
    const month = m.date.slice(0, 7);

    const seriesMap = {};
    if (breakdown) {
      // 구역별 분배 (통합 모임 / 형제·청년)
      Object.entries(info.dist).forEach(([d, c]) => { seriesMap[d.replace('구역', '')] = c; });
    } else {
      const s = (m.type || '').replace(/(구역모임|조모임)/, '').trim() || '전체';
      seriesMap[s] = info.rows;
    }

    Object.entries(seriesMap).forEach(([series, count]) => {
      const key = `${chart}|${series}|${month}`;
      const bucket = (monthly[key] = monthly[key] || { sum: 0, list: [] });
      bucket.sum += count;
      bucket.list.push({
        id: m.id, date: m.date, type: m.type, title: m.title,
        count, rows: info.rows, uniq: info.members.size, dup: info.dupMembers.size
      });
    });
  });

  // 출력
  const keys = Object.keys(monthly).sort();
  let prevChart = '';
  let problems = 0;
  keys.forEach(k => {
    const [chart, series, month] = k.split('|');
    if (chart !== prevChart) { console.log(`\n════════ ${chart} ════════`); prevChart = chart; }
    const v = monthly[k];
    const flags = [];
    if (v.list.length > 1) { flags.push(`⚠ 같은 달 ${v.list.length}개 모임 "합산"됨`); problems++; }
    if (v.list.some(x => x.dup > 0)) { flags.push('⚠ 회원당 중복 출석행 존재'); problems++; }
    console.log(`${month} [${series}] 그래프 표시값 = ${v.sum}명 ${flags.join('  ')}`);
    v.list.forEach(x => {
      const dupStr = x.dup ? ` / ⚠중복회원 ${x.dup}명` : '';
      console.log(`    · ${x.date}  id=${x.id}  ${x.type}  "${x.title}"  → 이 모임 기여분 ${x.count}명 (전체 출석행 ${x.rows} / 고유 인원 ${x.uniq}${dupStr})`);
    });
  });

  console.log(`\n검사 완료: 의심 항목 ${problems}건 (⚠ 표시 참조)`);
  console.log('※ "합산" 표시 = 그래프가 그 달의 여러 모임 출석을 더해서 보여주는 값 (실제 1회 모임 인원과 다르게 보이는 주원인)');
})().catch(e => { console.error(e); process.exit(1); });
