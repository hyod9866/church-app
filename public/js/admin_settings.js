// 관리자 설정 화면 (강효근 관리 교회/교구/구역)
// - GET  /api/users/default-profile : { church, parish, district, managed_districts, districts: [...] }
// - PUT  /api/users/default-profile : { church?, parish?, managed_districts? }
// 신규 일정의 번호 드롭다운과 교구전체모임 대상 범위가 이 설정을 따른다.
(function () {
    const churchInput = document.getElementById('adminChurch');
    const parishInput = document.getElementById('adminParish');
    const districtsInput = document.getElementById('adminDistricts');
    const preview = document.getElementById('districtsPreview');
    const saveBtn = document.getElementById('saveAdminSettings');
    const statusEl = document.getElementById('adminSaveStatus');
    const currentPreview = document.getElementById('currentPreview');
    const migrationNotice = document.getElementById('migrationNotice');
    const calendarFeedUrlInput = document.getElementById('calendarFeedUrl');
    const copyCalendarUrlBtn = document.getElementById('copyCalendarUrl');
    const calendarUrlStatus = document.getElementById('calendarUrlStatus');
    const regenerateCalendarTokenBtn = document.getElementById('regenerateCalendarToken');
    const calendarMigrationNotice = document.getElementById('calendarMigrationNotice');

    // [2026-08-27] 로그인 계정 관리 (관리자 아이디/비밀번호 + 게스트 조회 전용 계정)
    const adminNewLoginId = document.getElementById('adminNewLoginId');
    const adminNewPassword = document.getElementById('adminNewPassword');
    const adminCurrentPassword = document.getElementById('adminCurrentPassword');
    const adminCredStatus = document.getElementById('adminCredStatus');
    const saveAdminCredBtn = document.getElementById('saveAdminCred');
    const guestEnabledToggle = document.getElementById('guestEnabledToggle');
    const guestLoginIdInput = document.getElementById('guestLoginId');
    const guestNewPassword = document.getElementById('guestNewPassword');
    const guestCredStatus = document.getElementById('guestCredStatus');
    const saveGuestCredBtn = document.getElementById('saveGuestCred');
    const loginSettingsMigrationNotice = document.getElementById('loginSettingsMigrationNotice');

    function renderCalendarFeed(profile) {
        if (!calendarFeedUrlInput) return;
        if (!profile || profile.calendar_migration_needed) {
            calendarFeedUrlInput.value = '';
            calendarUrlStatus.textContent = '';
            if (calendarMigrationNotice) calendarMigrationNotice.classList.remove('hidden');
            return;
        }
        if (calendarMigrationNotice) calendarMigrationNotice.classList.add('hidden');
        if (!profile.calendar_feed_token) {
            calendarFeedUrlInput.value = '';
            calendarUrlStatus.textContent = '토큰 발급에 실패했습니다. 새로고침해 주세요.';
            calendarUrlStatus.className = 'text-[11px] text-red-500 mt-1';
            return;
        }
        const url = `${window.location.origin}/api/calendar/feed?token=${profile.calendar_feed_token}`;
        calendarFeedUrlInput.value = url;
        calendarUrlStatus.textContent = '';
    }

    async function copyCalendarUrl() {
        const url = calendarFeedUrlInput ? calendarFeedUrlInput.value : '';
        if (!url) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
            } else {
                calendarFeedUrlInput.removeAttribute('readonly');
                calendarFeedUrlInput.select();
                document.execCommand('copy');
                calendarFeedUrlInput.setAttribute('readonly', 'readonly');
            }
            calendarUrlStatus.textContent = '✓ 복사되었습니다.';
            calendarUrlStatus.className = 'text-[11px] text-emerald-600 dark:text-emerald-400 mt-1';
        } catch (e) {
            console.error(e);
            calendarUrlStatus.textContent = '복사에 실패했습니다. 직접 선택해서 복사해주세요.';
            calendarUrlStatus.className = 'text-[11px] text-red-500 mt-1';
        }
    }

    async function regenerateCalendarToken() {
        if (!window.confirm('URL을 재발급하면 기존에 구글 캘린더에 연동된 링크는 더 이상 갱신되지 않습니다. 계속할까요?')) return;
        try {
            const res = await fetch('/api/users/regenerate-calendar-token', { method: 'POST' });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || `재발급 실패 (HTTP ${res.status})`);
            renderCalendarFeed({ calendar_feed_token: body.calendar_feed_token });
            calendarUrlStatus.textContent = '✓ 새 URL이 발급되었습니다. 구글 캘린더에 다시 등록해주세요.';
            calendarUrlStatus.className = 'text-[11px] text-emerald-600 dark:text-emerald-400 mt-1';
        } catch (e) {
            console.error(e);
            window.alert('재발급에 실패했습니다: ' + e.message);
        }
    }

    function parseDistricts(str) {
        return String(str || '')
            .split(/[,\s/]+/)
            .map(s => s.replace(/[^0-9]/g, ''))
            .filter(Boolean);
    }

    function renderChips() {
        const nums = parseDistricts(districtsInput.value);
        preview.innerHTML = nums.length
            ? nums.map((n, i) => `
                <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black border
                    ${i === 0
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/30'}">
                    ${n}${i === 0 ? ' (기본)' : ''}
                </span>`).join('')
            : '<span class="text-[11px] text-slate-400 italic">직접 지정된 구역 없음 → 교구의 구역 목록 자동 사용</span>';
    }

    async function loadDatalists() {
        try {
            const [churchRes, parishRes] = await Promise.all([
                fetch('/api/churches/all').then(r => r.ok ? r.json() : []).catch(() => []),
                fetch('/api/parishes').then(r => r.ok ? r.json() : []).catch(() => [])
            ]);
            const churchList = document.getElementById('churchOptions');
            const parishList = document.getElementById('parishOptions');
            if (churchList) churchList.innerHTML = (churchRes || []).map(c => `<option value="${c.name}"></option>`).join('');
            if (parishList) parishList.innerHTML = (parishRes || []).map(p => `<option value="${p.name}"></option>`).join('');
        } catch (e) {
            console.warn('datalist load failed:', e);
        }
    }

    function renderCurrent(profile) {
        if (!profile) {
            currentPreview.innerHTML = '<p class="text-red-500 font-bold">설정을 불러오지 못했습니다.</p>';
            return;
        }
        const nums = Array.isArray(profile.districts) ? profile.districts : [];
        const usingManaged = parseDistricts(profile.managed_districts).length > 0;
        const isSeoulCentral = (profile.church || '').trim() === '서울중앙교회';
        const scope = profile.church
            ? (isSeoulCentral && profile.parish ? `${profile.church} + ${profile.parish}` : `${profile.church} 전체`)
            : '(교회 미설정)';
        currentPreview.innerHTML = `
            <p>· 번호 드롭다운: <b>${nums.length ? nums.join(' / ') : '없음'}</b>
               <span class="text-slate-400">(출처: ${usingManaged ? '관리 구역 목록 직접 지정' : '교구 조직 데이터 자동'})</span></p>
            <p>· 기본 모임 구분: <b>${nums.length ? nums[0] + '구역모임' : '구역모임'}</b></p>
            <p>· 교구전체모임 대상: <b>${scope}</b> 성도</p>`;
    }

    async function load() {
        try {
            const res = await fetch('/api/users/default-profile');
            const profile = res.ok ? await res.json() : null;
            if (profile) {
                churchInput.value = profile.church || '';
                parishInput.value = profile.parish || '';
                districtsInput.value = profile.managed_districts || '';
            }
            renderChips();
            renderCurrent(profile);
            renderCalendarFeed(profile);
        } catch (e) {
            console.error(e);
            renderCurrent(null);
        }
    }

    async function save() {
        statusEl.textContent = '저장 중...';
        statusEl.className = 'text-xs font-bold text-slate-400';
        migrationNotice.classList.add('hidden');

        // 입력 정규화: "581구역, 582" → "581,582"
        const normalized = parseDistricts(districtsInput.value).join(',');

        try {
            const res = await fetch('/api/users/default-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    church: churchInput.value.trim(),
                    parish: parishInput.value.trim(),
                    managed_districts: normalized
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if ((body.error || '').includes('managed_districts')) {
                    migrationNotice.classList.remove('hidden');
                }
                throw new Error(body.error || `저장 실패 (HTTP ${res.status})`);
            }
            districtsInput.value = body.managed_districts || normalized;
            renderChips();
            statusEl.textContent = '✓ 저장되었습니다. 일정 등록 화면에 바로 반영됩니다.';
            statusEl.className = 'text-xs font-bold text-emerald-600 dark:text-emerald-400';
            // 다른 탭/모듈의 캐시 무효화용 (동일 탭에서 index로 돌아갈 때 대비)
            try { localStorage.setItem('adminSettingsUpdatedAt', String(Date.now())); } catch (e) {}
            await load();
        } catch (e) {
            console.error(e);
            statusEl.textContent = '✗ ' + e.message;
            statusEl.className = 'text-xs font-bold text-red-500';
        }
    }

    // [2026-08-27] 로그인 계정 설정 로드/저장 — GET/PUT /api/users/login-settings
    // 비밀번호 자체는 절대 서버에서 내려주지 않으므로(해시조차 응답 안 함), 화면에는 아이디/게스트 허용
    // 여부만 채워두고 비밀번호 입력칸은 항상 빈 상태로 시작한다("바꾸고 싶을 때만 입력").
    async function loadLoginSettings() {
        try {
            const res = await fetch('/api/users/login-settings');
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || `불러오기 실패 (HTTP ${res.status})`);

            if (loginSettingsMigrationNotice) {
                loginSettingsMigrationNotice.classList.toggle('hidden', !body.migration_needed);
            }
            if (adminNewLoginId) adminNewLoginId.placeholder = body.login_id ? `현재: ${body.login_id}` : '변경하지 않으려면 비워두세요';
            if (guestLoginIdInput) guestLoginIdInput.value = body.guest_login_id || 'guest';
            if (guestEnabledToggle) guestEnabledToggle.checked = body.guest_enabled !== false;
        } catch (e) {
            console.error(e);
        }
    }

    async function saveAdminCred() {
        const newLoginId = adminNewLoginId.value.trim();
        const newPassword = adminNewPassword.value;
        const currentPassword = adminCurrentPassword.value;

        if (!newLoginId && !newPassword) {
            adminCredStatus.textContent = '아이디 또는 비밀번호 중 하나 이상 입력해 주세요.';
            adminCredStatus.className = 'text-xs font-bold text-red-500';
            return;
        }
        if (!currentPassword) {
            adminCredStatus.textContent = '본인 확인을 위해 현재 비밀번호를 입력해 주세요.';
            adminCredStatus.className = 'text-xs font-bold text-red-500';
            return;
        }
        if (newPassword && newPassword.length < 4) {
            adminCredStatus.textContent = '새 비밀번호는 4자 이상이어야 합니다.';
            adminCredStatus.className = 'text-xs font-bold text-red-500';
            return;
        }

        adminCredStatus.textContent = '저장 중...';
        adminCredStatus.className = 'text-xs font-bold text-slate-400';
        loginSettingsMigrationNotice.classList.add('hidden');

        try {
            const res = await fetch('/api/users/login-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_login_id: newLoginId || undefined,
                    new_password: newPassword || undefined
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if ((body.error || '').includes('컬럼')) loginSettingsMigrationNotice.classList.remove('hidden');
                throw new Error(body.error || `저장 실패 (HTTP ${res.status})`);
            }
            adminCredStatus.textContent = '✓ 저장되었습니다. 다음 로그인부터 새 정보로 로그인해 주세요.';
            adminCredStatus.className = 'text-xs font-bold text-emerald-600 dark:text-emerald-400';
            adminNewLoginId.value = '';
            adminNewPassword.value = '';
            adminCurrentPassword.value = '';
            await loadLoginSettings();
        } catch (e) {
            console.error(e);
            adminCredStatus.textContent = '✗ ' + e.message;
            adminCredStatus.className = 'text-xs font-bold text-red-500';
        }
    }

    async function saveGuestCred() {
        const guestLoginId = guestLoginIdInput.value.trim();
        const newGuestPassword = guestNewPassword.value;
        const guestEnabled = guestEnabledToggle.checked;

        if (!guestLoginId) {
            guestCredStatus.textContent = '게스트 아이디를 입력해 주세요.';
            guestCredStatus.className = 'text-xs font-bold text-red-500';
            return;
        }
        if (newGuestPassword && newGuestPassword.length < 4) {
            guestCredStatus.textContent = '게스트 비밀번호는 4자 이상이어야 합니다.';
            guestCredStatus.className = 'text-xs font-bold text-red-500';
            return;
        }

        guestCredStatus.textContent = '저장 중...';
        guestCredStatus.className = 'text-xs font-bold text-slate-400';
        loginSettingsMigrationNotice.classList.add('hidden');

        try {
            const res = await fetch('/api/users/login-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    guest_login_id: guestLoginId,
                    new_guest_password: newGuestPassword || undefined,
                    guest_enabled: guestEnabled
                })
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) {
                if ((body.error || '').includes('컬럼')) loginSettingsMigrationNotice.classList.remove('hidden');
                throw new Error(body.error || `저장 실패 (HTTP ${res.status})`);
            }
            guestCredStatus.textContent = '✓ 저장되었습니다.';
            guestCredStatus.className = 'text-xs font-bold text-emerald-600 dark:text-emerald-400';
            guestNewPassword.value = '';
            await loadLoginSettings();
        } catch (e) {
            console.error(e);
            guestCredStatus.textContent = '✗ ' + e.message;
            guestCredStatus.className = 'text-xs font-bold text-red-500';
        }
    }

    if (saveAdminCredBtn) saveAdminCredBtn.addEventListener('click', saveAdminCred);
    if (saveGuestCredBtn) saveGuestCredBtn.addEventListener('click', saveGuestCred);

    districtsInput.addEventListener('input', renderChips);
    saveBtn.addEventListener('click', save);
    if (copyCalendarUrlBtn) copyCalendarUrlBtn.addEventListener('click', copyCalendarUrl);
    if (regenerateCalendarTokenBtn) regenerateCalendarTokenBtn.addEventListener('click', regenerateCalendarToken);

    loadDatalists();
    load();
    loadLoginSettings();
})();
