// [2026-08-23] 1회성 점검/수정 스크립트
//
// 배경: "송찬미" 성도가 실제로는 상담/심방 기록이 전혀 없고 봉사부서·교구 직책까지 있는
// 정식 성도인데, member_status 컬럼이 'evangelism'(전도대상)으로 잘못 저장되어 있어
// 검색·필터에서 전도대상으로 표시되는 문제가 발견됐다.
// server.js 전체를 확인한 결과 member_status를 'evangelism'으로 쓰는 경로는
// 상담 등록/수정(POST·PUT /api/counseling) 단 한 곳뿐이었는데, 이 사람은 상담 기록이
// 없으므로 그 경로로 이렇게 됐을 가능성은 낮다. 다만 "송찬미"라는 이름을 가진 사람이
// 실제로는 2명 이상(동명이인)이고, 그중 진짜 전도대상인 사람과 화면에서 확인한 정식
// 성도가 서로 다른 레코드일 가능성도 배제할 수 없어 이 스크립트는 그 경우도 함께 확인한다.
//
// 동작:
//   1) 이름이 정확히 "송찬미"인 members 행을 전부 조회해서 화면에 보여준다.
//      (여기서 2건 이상 나오면 동명이인이 실제로 존재한다는 뜻이므로, 안전을 위해
//       아무것도 수정하지 않고 목록만 출력하고 종료한다.)
//   2) 정확히 1건이고 member_status가 'evangelism'일 때만 'member'로 되돌린다.
//
// 실행 방법 (church-app 폴더에서):
//   node scratch_fix_song_chanmi_status.mjs

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL / SUPABASE_KEY 를 .env에서 찾지 못했습니다. church-app 폴더에서 실행했는지 확인해주세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const TARGET_NAME = '송찬미';

async function main() {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, status, member_status, church, parish, district, category, position, church_service, salvation_date, testimony')
    .eq('name', TARGET_NAME);

  if (error) {
    console.error('조회 실패:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(`"${TARGET_NAME}" 이름의 성도를 찾지 못했습니다.`);
    return;
  }

  console.log(`"${TARGET_NAME}" 이름으로 ${data.length}건 조회됨:\n`);
  data.forEach(m => {
    console.log(`  id=${m.id}  status=${m.status}  member_status=${m.member_status}`);
    console.log(`    교회=${m.church || '-'}  교구=${m.parish || '-'}  구역=${m.district || '-'}  소속회=${m.category || '-'}`);
    console.log(`    직분=${m.position || '-'}  봉사부서=${m.church_service || '-'}  구원일=${m.salvation_date || '-'}`);
    console.log('');
  });

  if (data.length > 1) {
    console.log('⚠ 같은 이름이 2건 이상입니다. 동명이인일 수 있어 안전을 위해 아무 것도 수정하지 않았습니다.');
    console.log('  위 목록에서 실제로 잘못된 id가 어느 것인지 확인한 뒤 알려주시면 그 id만 정확히 고쳐드리겠습니다.');
    return;
  }

  const target = data[0];
  if (target.member_status !== 'evangelism') {
    console.log(`member_status가 이미 '${target.member_status}'이라 수정할 필요가 없습니다.`);
    return;
  }

  const { error: updErr } = await supabase
    .from('members')
    .update({ member_status: 'member' })
    .eq('id', target.id);

  if (updErr) {
    console.error('업데이트 실패:', updErr);
    process.exit(1);
  }

  console.log(`✅ id=${target.id} (${target.name}) member_status를 'evangelism' → 'member'로 수정했습니다.`);
}

main();
