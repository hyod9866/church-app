-- ============================================================
-- 출석(attendance) 중복 행 정리 + 재발 방지 UNIQUE 제약 추가
-- 작성일: 2026-07-06
--
-- 배경:
--   같은 (모임, 성도) 조합의 출석 행이 2개 이상 생기는 버그가 반복돼
--   참석 인원 집계가 부풀려지는 문제가 있었다 (scratch_dedupe_*,
--   scratch_scan_all_dup_attendance.cjs 로 그때그때 정리해 왔음).
--   원인은 toggle API의 경쟁 조건 + DB 제약 부재. 서버 코드는
--   2026-07-06에 upsert/업데이트 우선 방식으로 수정했고,
--   이 마이그레이션이 DB 차원에서 재발을 원천 차단한다.
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 Run
--   (한 트랜잭션으로 실행되므로 중간에 실패하면 아무것도 바뀌지 않음)
--
-- 병합 규칙 (기존 scratch_dedupe_meeting_attendance.cjs와 동일):
--   같은 성도의 여러 행 중 → 참석(is_present=1) 행 우선,
--   간증(testimony_snapshot)이 있는 행 우선, 그 다음 id가 큰(최신) 행 유지
-- ============================================================

BEGIN;

-- 0) 안전 백업: 이번에 삭제될 중복 행을 백업 테이블에 보관
--    (문제가 없다고 확인되면 나중에 DROP TABLE attendance_dedupe_backup_20260706; 로 정리)
CREATE TABLE IF NOT EXISTS attendance_dedupe_backup_20260706 AS
SELECT a.*
FROM attendance a
WHERE EXISTS (
  SELECT 1 FROM attendance b
  WHERE b.meeting_id = a.meeting_id
    AND b.member_id  = a.member_id
    AND b.id <> a.id
);

-- 1) 중복 정리: (meeting_id, member_id)당 대표 행 1개만 남기고 삭제
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY meeting_id, member_id
           ORDER BY COALESCE(is_present, 0) DESC,
                    (testimony_snapshot IS NOT NULL AND btrim(testimony_snapshot) <> '') DESC,
                    id DESC
         ) AS rn
  FROM attendance
)
DELETE FROM attendance
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) 재발 방지: 같은 (모임, 성도) 조합은 DB가 두 번 다시 허용하지 않음
--    서버의 upsert(onConflict: 'meeting_id,member_id')도 이 제약을 사용한다
ALTER TABLE attendance
  ADD CONSTRAINT attendance_meeting_member_uniq UNIQUE (meeting_id, member_id);

COMMIT;

-- ============================================================
-- (선택) 실행 후 검증 — 결과가 0행이어야 정상:
--
-- SELECT meeting_id, member_id, COUNT(*)
-- FROM attendance
-- GROUP BY meeting_id, member_id
-- HAVING COUNT(*) > 1;
--
-- 삭제된 행 수 확인:
-- SELECT COUNT(*) FROM attendance_dedupe_backup_20260706;
-- ============================================================
