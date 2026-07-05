import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const mapping = [
  { name: '인덕원교구', code: 110, count: 3 },
  { name: '관양교구', code: 120, count: 3 },
  { name: '비산교구', code: 130, count: 4 },
  { name: '평촌교구', code: 140, count: 5 },
  { name: '석수교구', code: 150, count: 5 },
  { name: '벌말교구', code: 160, count: 3 },
  { name: '과천교구', code: 170, count: 4 },
  { name: '포일교구', code: 180, count: 3 },
  { name: '청계교구', code: 190, count: 3 },
  { name: '봉천교구', code: 210, count: 4 },
  { name: '금천교구', code: 240, count: 3 },
  { name: '신림교구', code: 250, count: 2 },
  { name: '서림교구', code: 260, count: 3 },
  { name: '강남교구', code: 330, count: 4 },
  { name: '서초교구', code: 340, count: 3 },
  { name: '사당교구', code: 350, count: 3 },
  { name: '동작교구', code: 360, count: 4 },
  { name: '양재교구', code: 370, count: 3 },
  { name: '서현교구', code: 420, count: 3 },
  { name: '수지교구', code: 430, count: 4 },
  { name: '미금교구', code: 440, count: 4 },
  { name: '판교교구', code: 450, count: 3 },
  { name: '만안교구', code: 510, count: 3 },
  { name: '산본교구', code: 520, count: 4 },
  { name: '군포교구', code: 530, count: 3 },
  { name: '의왕교구', code: 540, count: 3 },
  { name: '내손교구', code: 550, count: 3 },
  { name: '백운교구', code: 560, count: 3 },
  { name: '호계교구', code: 570, count: 3 },
  { name: '부곡교구', code: 580, count: 3 },
  { name: '송정교구', code: 590, count: 3 }
];

async function run() {
  console.log('1. 서울중앙교회(church_id: 1) 교구 목록을 조회합니다...');
  const { data: dbParishes, error: pErr } = await supabase
    .from('parishes')
    .select('*')
    .eq('church_id', 1);

  if (pErr) {
    console.error('교구 조회 실패:', pErr);
    return;
  }

  console.log(`조회 완료: ${dbParishes.length}개 교구`);

  // 1. 교구 parish_no 업데이트
  console.log('2. 교구 코드를 업데이트합니다...');
  for (const item of mapping) {
    const matched = dbParishes.find(p => p.name === item.name);
    if (!matched) {
      console.warn(`경고: DB에 [${item.name}]이(가) 존재하지 않습니다. 건너뜁니다.`);
      continue;
    }

    const { error: uErr } = await supabase
      .from('parishes')
      .update({ parish_no: item.code })
      .eq('id', matched.id);

    if (uErr) {
      console.error(`[${item.name}] 코드 업데이트 실패:`, uErr);
    } else {
      console.log(`[${item.name}] -> 코드 ${item.code} 업데이트 완료`);
    }
  }

  // 최신 교구 정보 다시 로드
  const { data: updatedParishes } = await supabase
    .from('parishes')
    .select('*')
    .eq('church_id', 1);

  // 2. 구역 데이터 생성 및 기존 구역 정리
  console.log('3. 구역 데이터 삽입 및 정리를 진행합니다...');
  
  for (const item of mapping) {
    const matched = updatedParishes.find(p => p.name === item.name);
    if (!matched) continue;

    // 해당 교구의 기존 구역들 가져오기
    const { data: existingDistricts, error: dErr } = await supabase
      .from('districts')
      .select('*')
      .eq('parish_id', matched.id);

    if (dErr) {
      console.error(`[${item.name}] 기존 구역 조회 실패:`, dErr);
      continue;
    }

    // 타겟 구역명 배열 생성 (예: ['111구역', '112구역', '113구역'])
    const targetNames = [];
    const baseCode = Math.floor(item.code / 10); // 110 -> 11, 580 -> 58
    for (let i = 1; i <= item.count; i++) {
      targetNames.push(`${baseCode}${i}구역`);
    }

    // 기존 구역 중 이름이 다른 것 삭제 (예: 인덕원교구의 '111' 같은 예전 포맷 제거)
    const toDelete = existingDistricts.filter(d => !targetNames.includes(d.name));
    if (toDelete.length > 0) {
      const deleteIds = toDelete.map(d => d.id);
      console.log(`[${item.name}] 예전 포맷 구역 제거 중:`, toDelete.map(d => d.name));
      const { error: delErr } = await supabase
        .from('districts')
        .delete()
        .in('id', deleteIds);
      if (delErr) console.error('기존 구역 삭제 오류:', delErr);
    }

    // 필요한 구역 추가
    for (const tName of targetNames) {
      const alreadyExists = existingDistricts.some(d => d.name === tName);
      if (!alreadyExists) {
        const { error: insErr } = await supabase
          .from('districts')
          .insert({
            parish_id: matched.id,
            name: tName
          });
        if (insErr) {
          console.error(`[${item.name}] 구역 [${tName}] 추가 실패:`, insErr);
        } else {
          console.log(`[${item.name}] 구역 [${tName}] 추가 완료`);
        }
      }
    }
  }

  console.log('모든 작업이 성공적으로 완료되었습니다!');
}

run();
