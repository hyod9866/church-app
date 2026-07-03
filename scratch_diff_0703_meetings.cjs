// 2026-07-03 교구전체모임 중복 행(id=212, 213) 참석자 비교 스크립트 (읽기 전용, 데이터 변경 없음)
// 실행: node scratch_diff_0703_meetings.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const ID_A = 212;
const ID_B = 213;

(async () => {
  const [attA, attB, meetingA, meetingB] = await Promise.all([
    supabase.from('attendance').select('member_id, is_present, testimony_snapshot').eq('meeting_id', ID_A),
    supabase.from('attendance').select('member_id, is_present, testimony_snapshot').eq('meeting_id', ID_B),
    supabase.from('meetings').select('*').eq('id', ID_A).single(),
    supabase.from('meetings').select('*').eq('id', ID_B).single(),
  ]);
  if (attA.error) throw attA.error;
  if (attB.error) throw attB.error;

  const { data: members } = await supabase.from('members').select('id, name');
  const nameOf = {};
  (members || []).forEach(m => { nameOf[m.id] = m.name; });

  const mapA = new Map((attA.data || []).map(r => [r.member_id, r]));
  const mapB = new Map((attB.data || []).map(r => [r.member_id, r]));

  const allIds = new Set([...mapA.keys(), ...mapB.keys()]);

  let onlyA = [], onlyB = [], bothPresent = [], neitherRelevant = 0, conflictTestimony = [];

  for (const id of allIds) {
    const a = mapA.get(id);
    const b = mapB.get(id);
    const aPresent = a && Number(a.is_present) === 1;
    const bPresent = b && Number(b.is_present) === 1;
    const nm = nameOf[id] || `id${id}`;

    if (aPresent && !bPresent) onlyA.push(nm);
    else if (bPresent && !aPresent) onlyB.push(nm);
    else if (aPresent && bPresent) {
      bothPresent.push(nm);
      const tA = (a.testimony_snapshot || '').trim();
      const tB = (b.testimony_snapshot || '').trim();
      if (tA && tB && tA !== tB) conflictTestimony.push({ nm, tA, tB });
    } else {
      neitherRelevant++;
    }
  }

  console.log(`\n=== 모임 정보 ===`);
  console.log(`[id=${ID_A}] created 여부 확인용 필드 전체:`, JSON.stringify(meetingA.data));
  console.log(`[id=${ID_B}] created 여부 확인용 필드 전체:`, JSON.stringify(meetingB.data));

  console.log(`\n=== 참석자 비교 (총 대상자 ${allIds.size}명) ===`);
  console.log(`- id ${ID_A}에만 참석 체크됨: ${onlyA.length}명`);
  console.log(`  ${onlyA.join(', ') || '(없음)'}`);
  console.log(`- id ${ID_B}에만 참석 체크됨: ${onlyB.length}명`);
  console.log(`  ${onlyB.join(', ') || '(없음)'}`);
  console.log(`- 양쪽 다 참석 체크됨(중복): ${bothPresent.length}명`);
  console.log(`  ${bothPresent.join(', ') || '(없음)'}`);
  console.log(`- 둘 다 결석/미체크: ${neitherRelevant}명`);

  if (conflictTestimony.length > 0) {
    console.log(`\n⚠ 간증/특이사항이 양쪽에 서로 다르게 적힌 사람 (${conflictTestimony.length}명) — 병합 시 수동 확인 필요:`);
    conflictTestimony.forEach(c => {
      console.log(`  - ${c.nm}: [A]${c.tA}  vs  [B]${c.tB}`);
    });
  } else {
    console.log(`\n간증/특이사항 충돌 없음 (자동 병합 가능)`);
  }

  const unionPresent = onlyA.length + onlyB.length + bothPresent.length;
  console.log(`\n=== 결론 ===`);
  console.log(`두 행을 합치면 실제 순수 참석 인원(합집합) = ${unionPresent}명`);
  console.log(`(현재 화면에는 A=${[...mapA.values()].filter(r=>Number(r.is_present)===1).length}명, B=${[...mapB.values()].filter(r=>Number(r.is_present)===1).length}명으로 따로 표시되고 있음)`);
})().catch(e => { console.error(e); process.exit(1); });
