-- 구글 캘린더 연동(ICS 피드) 보호용 토큰 컬럼 추가
-- /api/calendar/feed 는 상담·심방 메모 등 민감정보를 포함하므로,
-- 이 토큰이 없으면 누구나 URL만 알면 접근할 수 있었다.
-- 관리자 설정 화면(admin_settings.html)에서 최초 조회 시 자동으로 값이 채워진다.

ALTER TABLE members ADD COLUMN IF NOT EXISTS calendar_feed_token text;
