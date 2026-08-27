// [2026-08-27] 게스트(조회 전용) 계정으로 로그인했을 때, 화면 상단에 안내 배너를 띄운다.
// 실제 데이터 보호는 server.js의 checkAuth가 게스트의 쓰기 요청(POST/PUT/PATCH/DELETE)을
// 전부 403으로 막아주므로 이 배너는 "지금 조회 전용 모드다"라는 걸 눈에 띄게 알려주는
// 보조 UX 장치일 뿐이다 — 이 스크립트가 실패하거나 로드가 안 돼도 서버 쪽 차단은 그대로 유지된다.
(function () {
    fetch('/api/session')
        .then(res => res.ok ? res.json() : null)
        .then(session => {
            if (!session || session.role !== 'guest') return;

            const banner = document.createElement('div');
            banner.id = 'guestModeBanner';
            banner.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
                'background:linear-gradient(90deg,#334155,#1e293b)',
                'color:#f1f5f9', 'font-size:12px', 'font-weight:800',
                'text-align:center', 'padding:6px 12px',
                'box-shadow:0 2px 8px rgba(0,0,0,0.25)',
                'letter-spacing:0.02em'
            ].join(';');
            banner.textContent = '🔒 게스트 모드 · 조회 전용입니다 (등록·수정·삭제는 관리자 계정으로 로그인해 주세요)';
            document.body.prepend(banner);

            // 배너에 가려지는 콘텐츠가 없도록 body 상단에 여백 확보
            const spacer = document.createElement('div');
            spacer.style.cssText = 'height:30px;flex-shrink:0;';
            banner.after(spacer);
        })
        .catch(() => { /* 세션 조회 실패 시 조용히 무시 — 배너는 보조 기능일 뿐 */ });
})();
