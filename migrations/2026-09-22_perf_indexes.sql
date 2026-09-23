-- ============================================================
-- 조회 성능 개선용 인덱스 추가
-- 작성일: 2026-09-22
--
-- 배경:
--   "달력/모임현황 로딩이 느리다"는 문의로 확인해보니, 가장 무거운
--   /api/meetings 한 번 호출에 2~4초가 걸리고 있었다. 원인 중 하나가
--   meetings(정렬 대상 date), attendance(is_present=1 필터, member_id
--   조회), members(salvation_date/status/district 필터) 같이 자주 쓰는
--   조건들에 인덱스가 없어 매번 테이블 전체를 훑고 있었던 것.
--   (server.js에서 이 컬럼들로 필터하는 곳이 50곳 넘게 있음)
--
--   서버 코드 쪽은 별도로 meetings/attendance/members 세 조회를
--   순서대로 기다리지 않고 동시에 요청하도록 고쳤고(app.js/server.js
--   배포 시 함께 반영됨), 이 마이그레이션은 그 각각의 조회 자체를
--   더 빠르게 만들기 위한 것이다. 기존 데이터나 로직은 전혀 건드리지
--   않고 인덱스만 추가하므로 결과값에는 영향이 없다.
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 Run
--   (IF NOT EXISTS를 써서 이미 있으면 건너뛰므로 여러 번 실행해도 안전함)
--
-- 주의:
--   CREATE INDEX는 짧게나마 테이블에 쓰기 잠금을 걸 수 있다. 지금
--   테이블 크기(수백~수천 행)에서는 보통 1초 미만이지만, 혹시 모르니
--   출석 체크 등 한창 입력 중인 시간대는 피해서 실행하는 걸 권장.
-- ============================================================

-- 1) 모임 목록을 항상 date DESC, id DESC로 정렬해서 가져오므로
--    (/api/meetings 등) 그 순서 그대로의 복합 인덱스를 추가.
CREATE INDEX IF NOT EXISTS idx_meetings_date_id
  ON meetings (date DESC, id DESC);

-- 2) "참석자만" 조회하는 쿼리(WHERE is_present = 1)가 여러 API에서
--    반복적으로 쓰인다. is_present=1인 행만 모아두는 부분 인덱스.
CREATE INDEX IF NOT EXISTS idx_attendance_present_meeting
  ON attendance (meeting_id)
  WHERE is_present = 1;

-- 3) 성도 한 명의 출석/상담/심방 이력을 모을 때 member_id로 조회.
CREATE INDEX IF NOT EXISTS idx_attendance_member
  ON attendance (member_id);

-- 4) 구원기념일 목록: salvation_date가 있는 성도만 추려서 월/일로 묶음.
CREATE INDEX IF NOT EXISTS idx_members_salvation_date
  ON members (salvation_date)
  WHERE salvation_date IS NOT NULL AND salvation_date <> '';

-- 5) 재적/활동 상태(status)로 거르는 조회가 성도 검색 전반에 쓰임.
CREATE INDEX IF NOT EXISTS idx_members_status
  ON members (status);

-- 6) 구역(district)별 조회/집계.
CREATE INDEX IF NOT EXISTS idx_members_district
  ON members (district);

-- ============================================================
-- (선택) 실행 후 확인 — 아래 쿼리로 방금 만든 인덱스가 보이면 정상:
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('meetings','attendance','members')
--   AND indexname LIKE 'idx_%'
-- ORDER BY indexname;
-- ============================================================
