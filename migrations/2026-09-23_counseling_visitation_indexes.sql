-- ============================================================
-- 상담관리/심방관리 화면 조회 성능 개선용 인덱스 추가
-- 작성일: 2026-09-23
--
-- 배경:
--   counseling_history.html(상담 관리)이 느리다는 문의로 확인해보니,
--   페이지가 열릴 때 부르는 GET /api/counseling 하나가 매번 1.1~1.3초
--   걸리고 있었다. 서버 코드(server.js) 쪽은 이미 서로 관계없는
--   조회들을 순서대로 기다리지 않고 동시에 요청하도록 고쳤고
--   (/api/counseling, /api/visitation 둘 다), 이 마이그레이션은 그
--   각각의 조회 자체를 더 빠르게 만들기 위한 것.
--
--   특히 meetings.type("상담"/"심방" 등)과 member_records.member_id /
--   member_records.status("COUNSELING"/"POSITION" 등)는 server.js에서
--   가장 자주 필터로 쓰이는 조합인데 인덱스가 없어 매번 테이블 전체를
--   훑고 있었다.
--
--   2026-09-22_perf_indexes.sql과 마찬가지로 기존 데이터나 로직은
--   전혀 건드리지 않고 인덱스만 추가하므로 결과값에는 영향이 없다.
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 Run
--   (IF NOT EXISTS를 써서 이미 있으면 건너뛰므로 여러 번 실행해도 안전함)
-- ============================================================

-- 1) 모임 종류별 조회(상담/심방/구역모임/조모임 등)가 GET /api/meetings,
--    /api/counseling, /api/visitation, 모임현황 집계 등 거의 전 화면에서 쓰인다.
CREATE INDEX IF NOT EXISTS idx_meetings_type
  ON meetings (type);

-- 2) member_records는 특정 성도 한 명의 기록을 모을 때(member_id) 또는
--    특정 종류(status = COUNSELING / POSITION / POSITION_DISMISS 등)를
--    모을 때 필터링하는 경우가 대부분이다.
CREATE INDEX IF NOT EXISTS idx_member_records_member_id
  ON member_records (member_id);

CREATE INDEX IF NOT EXISTS idx_member_records_status
  ON member_records (status);

-- ============================================================
-- (선택) 실행 후 확인 — 아래 쿼리로 방금 만든 인덱스가 보이면 정상:
--
-- SELECT indexname FROM pg_indexes
-- WHERE tablename IN ('meetings','member_records')
--   AND indexname LIKE 'idx_%'
-- ORDER BY indexname;
-- ============================================================
