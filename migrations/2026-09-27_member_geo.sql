-- ============================================================
-- 성도 분포 지도: 성도 주소 → 좌표 저장 칸 추가
-- 작성일: 2026-09-27
--
-- 배경:
--   "성도 분포" 메뉴(지도)에서 성도가 사는 곳을 표시하려면 주소를 좌표로 바꿔야 한다.
--   서버가 카카오로 한 번 변환해서 여기에 저장하고, 주소가 바뀐 성도만 다시 변환한다.
--   geo_address = 좌표를 만들 때 쓴 주소. 지금 주소(address)와 다르면 "변환 대기"로 본다.
--   기존 데이터는 건드리지 않고 칸만 추가한다.
--
-- 실행 방법:
--   Supabase 대시보드 → SQL Editor → 아래 전체를 붙여넣고 Run (여러 번 실행해도 안전)
-- ============================================================

ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_lat double precision;
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_lon double precision;
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_precision text;     -- exact(건물) / near(도로·아파트) / approx(동 중심) / fail(못 찾음)
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_address text;       -- 좌표를 만들 때 쓴 주소
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_dong text;          -- 동·읍·면 (지역별 집계용)
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_apt text;           -- 아파트·건물명
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_matched text;       -- 카카오가 찾아준 주소(확인용)
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_region text;        -- 시·군이 없는 주소에 붙인 기본 지역
ALTER TABLE members ADD COLUMN IF NOT EXISTS geo_updated_at timestamptz;

-- ============================================================
-- (선택) 실행 후 확인 — 9가 나오면 정상:
-- SELECT COUNT(*) FROM information_schema.columns
-- WHERE table_name = 'members' AND column_name LIKE 'geo\_%';
-- ============================================================
