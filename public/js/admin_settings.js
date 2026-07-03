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

    districtsInput.addEventListener('input', renderChips);
    saveBtn.addEventListener('click', save);

    loadDatalists();
    load();
})();
