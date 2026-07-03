// leader_church_snapshot/leader_parish_snapshot 백필 결과 확인 (읽기 전용)
// 실행: node scratch_check_leader_snapshot.cjs
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  const { data: all, error } = await supabase
    .from('meetings')
    .select('id, type, date, leader_church_snapshot, leader_parish_snapshot');
  if (error) throw error;

  const withSnap = all.filter(m => m.leader_church_snapshot);
  const withoutSnap = all.filter(m => !m.leader_church_snapshot);

  console.log(`전체 모임: ${all.length}건`);
  console.log(`스냅샷 채워짐: ${withSnap.length}건`);
  console.log(`스냅샷 없음: ${withoutSnap.length}건`);

  if (withSnap.length > 0) {
    const sample = withSnap.slice(0, 3);
    console.log('\n샘플 (최대 3건):');
    sample.forEach(m => console.log(`  [id=${m.id}] ${m.date} ${m.type} → ${m.leader_church_snapshot} / ${m.leader_parish_snapshot}`));
  }

  if (withoutSnap.length > 0) {
    console.log(`\n⚠ 스냅샷 없는 모임 ${withoutSnap.length}건이 남아있습니다 (백필 SQL이 일부만 적용됐거나, 이후 새로 생성됐지만 컬럼 추가 전이었을 수 있음).`);
    console.log('샘플:', withoutSnap.slice(0, 5).map(m => `id=${m.id}(${m.date})`).join(', '));
  } else {
    console.log('\n✓ 모든 모임에 스냅샷이 채워져 있습니다.');
  }
})().catch(e => { console.error(e); process.exit(1); });
