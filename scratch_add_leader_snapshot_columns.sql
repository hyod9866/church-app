-- meetings 테이블에 "생성 시점 관리자 소속 스냅샷" 컬럼 추가 + 기존 데이터 백필
-- Supabase SQL Editor에서 실행하세요.
--
-- 목적: 강효근(관리자)이 나중에 다른 교구/교회로 발령 나서 admin_settings를 바꿔도,
--       과거에 만들어진 교구전체모임의 "대상자 판정"과 "출석률 계산"이 그 모임이
--       만들어졌을 때의 소속 기준으로 그대로 유지되도록 하기 위함.

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS leader_church_snapshot text;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS leader_parish_snapshot text;

-- 백필: 지금까지는 강효근 소속 변경 이력이 없었으므로, 현재 값으로 채우면
-- 지금까지 만들어진 모든 과거 모임에 대해 정확합니다.
UPDATE meetings
SET leader_church_snapshot = (SELECT church FROM members WHERE name = '강효근' LIMIT 1),
    leader_parish_snapshot = (SELECT parish FROM members WHERE name = '강효근' LIMIT 1)
WHERE leader_church_snapshot IS NULL;
