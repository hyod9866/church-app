document.addEventListener('DOMContentLoaded', () => {
    

    // 인도대상 / 모임 / 특징을 해시태그 칩으로 렌더링
    //  - @이름  → 인도대상 (클릭 시 해당 인물 이력 열림, 앰버 칩)
    //  - #무엇  → 모임/특징 (회색 칩)
    //  - 접두사 없는 값 → 회색 칩 (구버전 '모임' 데이터 호환)
    function buildLeadChips(leadTarget, size) {
        const raw = (leadTarget || '').trim();
        if (!raw) return '';
        const px = size === 'md' ? 'text-[10px] px-2' : 'text-[9px] px-1.5';
        const tokens = raw.split(/\s+/).filter(Boolean);
        return tokens.map(tok => {
            if (tok.startsWith('@')) {
                const name = tok.slice(1).trim();
                if (!name) return '';
                const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<span class="${px} py-0.5 rounded border font-black cursor-pointer hover:underline bg-amber-50 dark:bg-amber-955/20 text-amber-800 dark:text-amber-350 border-amber-200/80 dark:border-amber-900/50" onclick="event.stopPropagation(); openMemberHistoryModalByName('${safe}')">🤝 ${name}</span>`;
            }
            const name = tok.startsWith('#') ? tok.slice(1).trim() : tok.trim();
            if (!name) return '';
            return `<span class="${px} py-0.5 rounded border font-bold bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-450 border-slate-200 dark:border-slate-700/60">#${name}</span>`;
        }).filter(Boolean).join(' ');
    }

    const counselingList = document.getElementById('counselingList');
    const sortOption = document.getElementById('sortOption');
    const counselingCount = document.getElementById('counselingCount');

    let allStatus = [];
    let currentMemberData = null;
    let filterYearMonth = null; // 'YYYY-MM'

    // 대상 및 소속 분포 인터랙티브 필터 상태
    let filterMemberStatus = null;   // 'member' | 'evangelism'
    let filterMemberGender = null;   // 'B' | 'S' (성도 성별)
    let filterEvangelismGender = null; // 'B' | 'S' (전도대상 성별)
    let filterChurch = null;         // 'seoul' | 'other'
    let filterMemberCategory = null; // '봉사회' | '어머니회' | '청년회' | '은장회' | '모름'
    let filterEvangelismCategory = null; // '봉사회' | '어머니회' | '청년회' | '은장회' | '모름'
    let filterCounselingMethod = null; // '대면' | '전화'
    let filterYear = ''; // '' = 전체 년도, 'YYYY' = 해당 연도

    // 선택된 연도로 데이터를 좁힌다. year가 ''(전체)면 원본 그대로 반환.
    // year가 지정되면 각 인물의 all_sessions를 해당 연도 세션만 남기고,
    // 그 연도에 세션이 없는 인물은 제외한다. last_counseling_* 도 해당 연도 기준으로 재계산.
    function scopeDataByYear(list, year) {
        if (!year) return list;
        const out = [];
        (list || []).forEach(m => {
            const sessions = (Array.isArray(m.all_sessions) ? m.all_sessions : [])
                .filter(s => s.date && s.date.substring(0, 4) === year);
            if (!sessions.length) return;
            const sorted = [...sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
            const last = sorted[0];
            out.push({
                ...m,
                all_sessions: sessions,
                counseling_count: sessions.length,
                last_counseling_date: last ? last.date : null,
                last_counseling_content: last ? last.content : null,
                last_counseling_tags: last ? last.tags : null,
                last_counseling_session_id: last ? last.session_id : null
            });
        });
        return out;
    }

    // 상단 전역 연도 셀렉트 옵션 구성 (데이터가 있는 연도 + '전체 년도')
    function initGlobalYearSelect() {
        const sel = document.getElementById('globalYearSelect');
        if (!sel) return;
        const yearSet = new Set();
        (allStatus || []).forEach(m => {
            (Array.isArray(m.all_sessions) ? m.all_sessions : []).forEach(s => {
                if (s.date && /^\d{4}-\d{2}/.test(s.date)) yearSet.add(s.date.substring(0, 4));
            });
        });
        const years = Array.from(yearSet).sort((a, b) => b.localeCompare(a)); // 내림차순
        sel.innerHTML = `<option value="">전체 년도</option>` + years.map(y => `<option value="${y}">${y}년</option>`).join('');
        if (!sel.dataset.bound) {
            // 최초 로드 기본값: 올해(데이터 있으면), 없으면 전체
            const currentYear = String(new Date().getFullYear());
            filterYear = years.includes(currentYear) ? currentYear : '';
            sel.addEventListener('change', () => {
                filterYear = sel.value;
                applyGlobalYear();
            });
            sel.dataset.bound = '1';
        } else {
            // 데이터 새로고침 시 사용자가 고른 연도 유지 (데이터에 없으면 전체)
            filterYear = years.includes(filterYear) ? filterYear : '';
        }
        sel.value = filterYear;
    }

    // 전역 연도 필터 적용 — 분포/그래프/주제/카운트(대시보드)와 상담자 목록을 함께 갱신
    function applyGlobalYear() {
        const scoped = scopeDataByYear(allStatus, filterYear);
        updateDashboard(scoped);
        applyFilters();
    }
    // ──────────────────────────────────────────────────
    // 데이터 로드 (신규 /api/counseling 사용)
    // ──────────────────────────────────────────────────
    async function loadStatus() {
        try {
            const response = await fetch('/api/counseling?_t=' + Date.now(), { cache: 'no-store' });
            allStatus = await response.json();
            initGlobalYearSelect();
            applyGlobalYear();
        } catch (error) {
            console.error('Error loading counseling status:', error);
            if (counselingList) counselingList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const sort = sortOption ? sortOption.value : 'last_counseling';
        const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

        // 전역 연도 필터로 좁힌 데이터를 기준으로 목록을 필터링한다
        const base = scopeDataByYear(allStatus, filterYear);
        let filtered = base.filter(s => {
            const isMember = s.member_status !== 'evangelism';

            // 1. 월별 필터
            if (filterYearMonth) {
                const sessions = Array.isArray(s.all_sessions) ? s.all_sessions : [];
                const hasSessionInMonth = sessions.some(session => session.date && session.date.startsWith(filterYearMonth));
                if (!hasSessionInMonth) return false;
            }

            // 2. 신분 필터 (성도 vs 전도대상)
            if (filterMemberStatus) {
                if (filterMemberStatus === 'member' && !isMember) return false;
                if (filterMemberStatus === 'evangelism' && isMember) return false;
            }

            // 3. 성도 성별 필터
            if (filterMemberGender) {
                if (!isMember || s.bs !== filterMemberGender) return false;
            }

            // 4. 전도대상 성별 필터
            if (filterEvangelismGender) {
                if (isMember || s.bs !== filterEvangelismGender) return false;
            }

            // 5. 소속 교회 필터
            if (filterChurch) {
                const isSeoul = s.church === '서울중앙교회';
                if (filterChurch === 'seoul' && !isSeoul) return false;
                if (filterChurch === 'other' && isSeoul) return false;
            }

            // 6. 소속회 필터 (성도)
            if (filterMemberCategory) {
                if (!isMember) return false;
                const cat = s.category || '모름';
                const normCat = ['봉사회', '어머니회', '청년회', '은장회'].includes(cat) ? cat : '모름';
                if (normCat !== filterMemberCategory) return false;
            }

            // 7. 소속회 필터 (전도대상)
            if (filterEvangelismCategory) {
                if (isMember) return false;
                const cat = s.category || '모름';
                const normCat = ['봉사회', '어머니회', '청년회', '은장회'].includes(cat) ? cat : '모름';
                if (normCat !== filterEvangelismCategory) return false;
            }

            // 8. 대면 vs 전화상담 유형 필터 (최근 상담 기록의 유형 기준)
            if (filterCounselingMethod) {
                const sessions = Array.isArray(s.all_sessions) ? s.all_sessions : [];
                // 만약 월별 필터가 켜져 있으면 해당 월에 진행된 세션 중 해당 유형이 있는지 검사하고,
                // 그렇지 않으면 전체 세션 중 하나라도 해당 유형이 있는지 검사합니다.
                const hasMatchingMethod = sessions.some(sess => {
                    const matchesMonth = !filterYearMonth || (sess.date && sess.date.startsWith(filterYearMonth));
                    const matchesMethod = sess.counseling_method === filterCounselingMethod;
                    return matchesMonth && matchesMethod;
                });
                if (!hasMatchingMethod) return false;
            }

            // 9. 텍스트 검색 쿼리 필터
            if (query) {
                const nameMatch = (s.name || '').toLowerCase().includes(query);
                const dateMatch = (s.last_counseling_date || '').includes(query);
                const contentMatch = (s.last_counseling_content || '').toLowerCase().includes(query);
                const tagsMatch = (s.last_counseling_tags || '').toLowerCase().includes(query);
                const positionMatch = (s.position || '').toLowerCase().includes(query);
                const categoryMatch = (s.category || '').toLowerCase().includes(query);
                const districtTextMatch = (s.district || '').toLowerCase().includes(query);
                // 인도대상(@이름) / 모임·특징(#태그) 검색 — 전체 상담 세션의 lead_target 대상
                // @, # 접두사와 무관하게 매칭되도록 원문을 그대로 훑는다 ("@홍길동".includes("홍길동") = true)
                const searchSessions = Array.isArray(s.all_sessions) ? s.all_sessions : [];
                const leadMatch = searchSessions.some(sess => (sess.lead_target || '').toLowerCase().includes(query));
                if (!nameMatch && !dateMatch && !contentMatch && !tagsMatch && !positionMatch && !categoryMatch && !districtTextMatch && !leadMatch) return false;
            }
            return true;
        });

        // 필터링된 데이터를 바탕으로 대시보드 통계 및 상담주제 업데이트 (차트 제외)
        updateDashboardStatisticsOnly(filtered);
        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'last_counseling') {
                if (!a.last_counseling_date) return 1;
                if (!b.last_counseling_date) return -1;
                return new Date(b.last_counseling_date) - new Date(a.last_counseling_date);
            }
            if (sort === 'oldest_counseling') {
                if (!a.last_counseling_date) return -1;
                if (!b.last_counseling_date) return 1;
                return new Date(a.last_counseling_date) - new Date(b.last_counseling_date);
            }
            if (sort === 'count') return b.counseling_count - a.counseling_count;
            return 0;
        });

        renderList(filtered);
    }

    function renderTagBadge(tagsStr, memberStatus) {
        if (!tagsStr || !tagsStr.trim()) return '';
        const tags = tagsStr.trim().split(/\s+/).filter(t => t.startsWith('#'));
        if (!tags.length) return '';
        const isEv = memberStatus === 'evangelism';
        const cls = isEv
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-700/40'
            : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-700/40';
        return `<div class="flex flex-wrap gap-1 mt-1.5">${tags.map(t =>
            `<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${cls} border">${t}</span>`
        ).join('')}</div>`;
    }

    // ── 인라인 수정 편집기를 카드에 주입 ──────────────────────
    function attachInlineEditToCard(card, loadStatusFn) {
        const editBtn = card.querySelector('.edit-counsel-session-btn');
        if (!editBtn) return;
        editBtn.addEventListener('click', (e) => {
            if (card.querySelector('.counsel-edit-textarea')) return;
            const sessionId = card.dataset.sessionId;
            const memberId  = card.dataset.memberId;
            const currentDate = card.dataset.date || '';
            const currentTags = card.dataset.tags || '';
            const currentStatus = card.dataset.memberStatus || 'member';
            const currentMemo = card.dataset.remarkMemo || '';
            const currentLeadTarget = card.dataset.leadTarget || '';
            const currentCounselingMethod = card.dataset.counselingMethod || '대면';
            const currentCategory = card.dataset.category || '모름';
            const currentBs = card.dataset.bs || '';
            const bodyArea = card.querySelector('.counsel-session-body');
            const remarkTextPara = bodyArea ? bodyArea.querySelector('.counsel-content-text') : null;
            const currentRemark = remarkTextPara ? remarkTextPara.textContent.replace(/^📝\s*/, '').trim() : '';

            const memberTags = ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'];
            const evangelismTags = ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원'];

            if (bodyArea) bodyArea.innerHTML = `
                <div class="flex flex-col gap-2 w-full mt-2">
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 날짜</label>
                            <input type="date" class="counsel-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                        </div>
                        <div class="flex-1">
                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">대상자 상태</label>
                            <div class="inline-edit-status-group flex gap-1">
                                <button type="button" data-status="member" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">성도</button>
                                <button type="button" data-status="evangelism" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'evangelism' ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">전도대상</button>
                            </div>
                            <input type="hidden" class="counsel-edit-status" value="${currentStatus}">
                        </div>
                    </div>
                    <!-- 소속 및 성별 선택 -->
                    <div class="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/50 space-y-2 mt-1">
                        <div>
                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">소속</span>
                            <div class="inline-edit-category-group flex flex-wrap gap-1">
                                ${['봉사회', '청년회', '어머니회', '은장회', '모름'].map(c => `
                                    <button type="button" data-category="${c}" class="inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${currentCategory === c ? 'bg-indigo-650 border-indigo-650 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${c}</button>
                                `).join('')}
                            </div>
                            <input type="hidden" class="counsel-edit-category" value="${currentCategory}">
                        </div>
                        <div>
                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">성별</span>
                            <div class="inline-edit-bs-group flex gap-1">
                                <button type="button" data-bs="B" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'B' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${currentStatus === 'evangelism' ? '남자' : '형제'}</button>
                                <button type="button" data-bs="S" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'S' ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">${currentStatus === 'evangelism' ? '여자' : '자매'}</button>
                            </div>
                            <input type="hidden" class="counsel-edit-bs" value="${currentBs}">
                        </div>
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 방법</label>
                        <div class="inline-edit-method-group flex gap-1">
                            <button type="button" data-method="대면" class="inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentCounselingMethod === '대면' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">🤝 대면</button>
                            <button type="button" data-method="전화" class="inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentCounselingMethod === '전화' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">📞 전화</button>
                        </div>
                        <input type="hidden" class="counsel-edit-method" value="${currentCounselingMethod}">
                    </div>
                    <div class="edit-tags-container bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/50 dark:border-indigo-900/20 mt-1">
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">상담 주제 태그</label>
                        <div class="edit-tags-presets flex flex-wrap gap-1 mb-2"></div>
                        <div class="flex gap-1 items-center mb-2">
                            <input type="text" class="inline-custom-tag-input flex-1 border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="직접 태그 입력...">
                            <button type="button" class="inline-add-tag-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-700 text-indigo-650 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 whitespace-nowrap">+ 추가</button>
                        </div>
                        <div class="inline-tags-preview flex flex-wrap gap-1 min-h-[16px]"></div>
                        <input type="hidden" class="counsel-edit-tags" value="${currentTags}">
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 내용</label>
                        <textarea class="counsel-edit-textarea w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="3">${currentRemark}</textarea>
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">인도대상 / 모임</label>
                        <input type="text" class="counsel-edit-lead-target w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentLeadTarget}" placeholder="@인도대상 #모임 #특징 (여러 개 가능)">
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">비고 / 기타 메모</label>
                        <input type="text" class="counsel-edit-memo w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentMemo}" placeholder="비고 및 특이사항 입력...">
                    </div>
                    <div class="flex justify-end gap-1.5 mt-1">
                        <button type="button" class="save-counsel-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                        <button type="button" class="cancel-counsel-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                    </div>
                </div>
            `;
            editBtn.style.display = 'none';

            let activeTags = new Set(currentTags.split(/\s+/).filter(t => t.startsWith('#')).map(t => t.slice(1)));
            let selectedStatus = currentStatus;

            function updateEditPresetTags(status) {
                const presetsContainer = bodyArea.querySelector('.edit-tags-presets');
                if (!presetsContainer) return;
                
                const tagsList = status === 'evangelism' ? evangelismTags : memberTags;
                presetsContainer.innerHTML = tagsList.map(t => {
                    const isSelected = activeTags.has(t);
                    const cls = isSelected 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60';
                    return `<button type="button" data-tag="${t}" class="inline-edit-tag-btn px-2 py-0.5 rounded text-[10px] font-bold transition-all ${cls}">${t}</button>`;
                }).join('');
            }

            function updateInlineTags() {
                const tagsVal = Array.from(activeTags).map(t => `#${t}`).join(' ');
                bodyArea.querySelector('.counsel-edit-tags').value = tagsVal;
                const preview = bodyArea.querySelector('.inline-tags-preview');
                preview.innerHTML = Array.from(activeTags).map(t => `
                    <span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white" data-tag="${t}">
                        #${t}<button type="button" class="inline-remove-tag-btn hover:text-indigo-200 font-bold ml-1 leading-none">&times;</button>
                    </span>`).join('');
                bodyArea.querySelectorAll('.inline-edit-tag-btn').forEach(b => {
                    const t = b.dataset.tag;
                    if (activeTags.has(t)) {
                        b.classList.add('bg-indigo-600','text-white','border-indigo-600'); b.classList.remove('bg-white','dark:bg-slate-800','text-indigo-600','dark:text-indigo-400');
                    } else {
                        b.classList.remove('bg-indigo-600','text-white','border-indigo-600'); b.classList.add('bg-white','dark:bg-slate-800','text-indigo-600','dark:text-indigo-400');
                    }
                });
            }
            updateEditPresetTags(selectedStatus);
            updateInlineTags();

            bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectedStatus = btn.dataset.status;
                    bodyArea.querySelector('.counsel-edit-status').value = selectedStatus;
                    bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(b => {
                        const bStatus = b.dataset.status;
                        const isActive = bStatus === selectedStatus;
                        b.className = `inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                            isActive 
                                ? (bStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'
                        }`;
                    });

                    // 성별 레이블 동적 변경 (성도 -> 형제/자매, 전도대상 -> 남자/여자)
                    const bsButtons = bodyArea.querySelectorAll('.inline-edit-bs-btn');
                    if (bsButtons.length >= 2) {
                        if (selectedStatus === 'evangelism') {
                            bsButtons[0].textContent = '남자';
                            bsButtons[1].textContent = '여자';
                        } else {
                            bsButtons[0].textContent = '형제';
                            bsButtons[1].textContent = '자매';
                        }
                    }

                    updateEditPresetTags(selectedStatus);
                    updateInlineTags();
                });
            });

            // 소속회 버튼 토글
            bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const newCat = btn.dataset.category;
                    bodyArea.querySelector('.counsel-edit-category').value = newCat;
                    bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(b => {
                        const isActive = b.dataset.category === newCat;
                        b.className = `inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                            isActive
                                ? 'bg-indigo-650 border-indigo-650 text-white'
                                : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                        }`;
                    });
                });
            });

            // 성별 버튼 토글
            bodyArea.querySelectorAll('.inline-edit-bs-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const newBs = btn.dataset.bs;
                    bodyArea.querySelector('.counsel-edit-bs').value = newBs;
                    bodyArea.querySelectorAll('.inline-edit-bs-btn').forEach(b => {
                        const isActive = b.dataset.bs === newBs;
                        b.className = `inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                            isActive
                                ? (newBs === 'B' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-pink-500 border-pink-500 text-white')
                                : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                        }`;
                    });
                });
            });

            // 대면/전화 상담 방법 버튼 토글
            bodyArea.querySelectorAll('.inline-edit-method-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const newMethod = btn.dataset.method;
                    bodyArea.querySelector('.counsel-edit-method').value = newMethod;
                    bodyArea.querySelectorAll('.inline-edit-method-btn').forEach(b => {
                        const isActive = b.dataset.method === newMethod;
                        b.className = `inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                            isActive
                                ? (b.dataset.method === '대면' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-amber-500 border-amber-500 text-white')
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                        }`;
                    });
                });
            });

            bodyArea.querySelector('.edit-tags-presets').addEventListener('click', ev => {
                const b = ev.target.closest('.inline-edit-tag-btn'); if (!b) return;
                activeTags.has(b.dataset.tag) ? activeTags.delete(b.dataset.tag) : activeTags.add(b.dataset.tag);
                updateInlineTags();
            });
            const addBtn = bodyArea.querySelector('.inline-add-tag-btn');
            const custInput = bodyArea.querySelector('.inline-custom-tag-input');
            const doAddTag = () => { let v = custInput.value.trim(); if (!v) return; if (v.startsWith('#')) v = v.slice(1); if (v) { activeTags.add(v); custInput.value = ''; updateInlineTags(); } };
            addBtn.addEventListener('click', doAddTag);
            custInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); doAddTag(); } });
            bodyArea.querySelector('.inline-tags-preview').addEventListener('click', ev => {
                const rb = ev.target.closest('.inline-remove-tag-btn'); if (!rb) return;
                const t = rb.closest('[data-tag]').dataset.tag; activeTags.delete(t); updateInlineTags();
            });

            bodyArea.querySelector('.cancel-counsel-btn').addEventListener('click', () => loadStatusFn());
            bodyArea.querySelector('.save-counsel-btn').addEventListener('click', async () => {
                const newDate = bodyArea.querySelector('.counsel-edit-date').value;
                const newContent = bodyArea.querySelector('.counsel-edit-textarea').value.trim();
                const newTags = bodyArea.querySelector('.counsel-edit-tags').value.trim();
                const newStatus = bodyArea.querySelector('.counsel-edit-status').value;
                const newMemo = bodyArea.querySelector('.counsel-edit-memo').value.trim();
                const newLeadTarget = bodyArea.querySelector('.counsel-edit-lead-target').value.trim();
                const newMethod = bodyArea.querySelector('.counsel-edit-method')?.value || '대면';
                if (!newDate) return alert('날짜를 입력해주세요.');
                const saveBtn = bodyArea.querySelector('.save-counsel-btn');
                saveBtn.disabled = true; saveBtn.textContent = '저장중...';
                const newCategory = bodyArea.querySelector('.counsel-edit-category').value;
                const newBs = bodyArea.querySelector('.counsel-edit-bs').value;
                try {
                    const res = await fetch(`/api/counseling/${sessionId}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            date: newDate,
                            content: newContent,
                            tags: newTags,
                            member_status: newStatus,
                            remark_memo: newMemo,
                            lead_target: newLeadTarget,
                            counseling_method: newMethod,
                            category: newCategory,
                            bs: newBs,
                            member_id: parseInt(memberId)
                        })
                    });
                    if (res.ok) { loadStatusFn(); } else { alert('수정에 실패했습니다.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; }
                } catch (err) { console.error(err); alert('서버 오류로 인해 실패했습니다.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            });
        });

        // 삭제 버튼
        const delBtn = card.querySelector('.delete-counsel-session-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                const sessionId = card.dataset.sessionId;
                if (!sessionId) return;
                if (confirm('정말 이 상담 기록을 영구 삭제하시겠습니까?')) {
                    try {
                        const res = await fetch(`/api/counseling/${sessionId}?member_id=${memberId}`, { method: 'DELETE' });
                        if (res.ok) { loadStatusFn(); } else { alert('삭제에 실패했습니다.'); }
                    } catch (err) { console.error(err); alert('서버 오류로 인해 삭제에 실패했습니다.'); }
                }
            });
        }
    }

    // ── 세션 하나를 렌더하는 헬퍼 ───────────────────────────
    function renderSessionCard(session, member, isLatest) {
        const memberId = typeof member === 'object' ? member.id : member;
        const category = typeof member === 'object' ? (member.category || '모름') : '모름';
        const bs = typeof member === 'object' ? (member.bs || '') : '';

        const isEv = session.member_status === 'evangelism';
        const methodBadge = session.counseling_method && session.counseling_method !== '대면'
            ? `<span class="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-700/40">${session.counseling_method}</span>`
            : '';
        const memberBadge = isEv
            ? `<span class="text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200/60">전도대상</span>`
            : '';
        const tagsHtml = renderTagBadge(session.tags || '', session.member_status);
        const latestLabel = isLatest ? `<span class="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded">최근</span>` : '';

        const sessionLeadHtml = buildLeadChips(session.lead_target, 'sm');

        return `
            <div class="counsel-session-card mt-2 p-2.5 bg-gray-50 dark:bg-[#0B0F19] rounded-lg border border-gray-100 dark:border-slate-800 text-xs relative"
                 data-session-id="${session.session_id || ''}"
                 data-member-id="${memberId}"
                 data-date="${session.date || ''}"
                 data-tags="${session.tags || ''}"
                 data-member-status="${session.member_status || 'member'}"
                 data-lead-target="${session.lead_target || ''}"
                 data-remark-memo="${session.remark_memo || ''}"
                 data-counseling-method="${session.counseling_method || '대면'}"
                 data-category="${category}"
                 data-bs="${bs}">
                <div class="flex items-center flex-wrap gap-1.5 mb-1 pr-20">
                    ${latestLabel}
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">${session.date || ''}</span>
                    ${methodBadge}
                    ${memberBadge}
                    ${sessionLeadHtml}
                </div>
                <div class="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" class="edit-counsel-session-btn text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                        <i class="fa-regular fa-pen-to-square"></i> 수정
                    </button>
                    <button type="button" class="delete-counsel-session-btn text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                        <i class="fa-regular fa-trash-can"></i> 삭제
                    </button>
                </div>
                <div class="counsel-session-body">
                    ${tagsHtml}
                    ${session.content ? `<div class="counsel-content-text text-slate-800 dark:text-slate-250 font-black mt-1 pr-10">📝 ${session.content}</div>` : ''}
                    ${session.remark_memo ? `<div class="counsel-remark-text bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-350 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 text-[11px] font-bold mt-2">📌 비고: ${session.remark_memo}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ── 사람별 상담 이력 접기/펼치기 ─────────────────────────────────────
    window.toggleMemberSessions = function(btn) {
        const card = btn.closest('.counseling-person-card');
        const wrapper = card.querySelector('.member-sessions-wrapper');
        const icon = btn.querySelector('i');
        if (!wrapper) return;

        const containers = wrapper.querySelectorAll('.specific-session-container');
        
        // Find if we are currently hiding any sessions (if so, we want to expand all)
        const anyHidden = Array.from(containers).some(c => c.classList.contains('hidden')) || wrapper.classList.contains('hidden');

        if (anyHidden) {
            // Expand all
            wrapper.classList.remove('hidden');
            containers.forEach(c => c.classList.remove('hidden'));
            if (icon) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
        } else {
            // Collapse all
            wrapper.classList.add('hidden');
            containers.forEach(c => c.classList.add('hidden'));
            if (icon) {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        }
    };

    window.toggleSpecificSession = function(btn, sessionId) {
        const card = btn.closest('.counseling-person-card');
        const wrapper = card.querySelector('.member-sessions-wrapper');
        if (!wrapper) return;

        wrapper.classList.remove('hidden');
        const targetContainer = wrapper.querySelector(`.specific-session-container[data-session-id="${sessionId}"]`);
        if (targetContainer) {
            targetContainer.classList.toggle('hidden');
        }

        const visibleContainers = wrapper.querySelectorAll('.specific-session-container:not(.hidden)');
        if (visibleContainers.length === 0) {
            wrapper.classList.add('hidden');
        }

        const totalContainers = wrapper.querySelectorAll('.specific-session-container');
        const icon = card.querySelector('button[onclick^="toggleMemberSessions"] i');
        if (icon) {
            if (visibleContainers.length === totalContainers.length) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        }
    };

    function renderList(data) {
        if (counselingCount) counselingCount.textContent = `총 ${data.length}명 상담 대상자`;

        if (!counselingList) return;
        if (data.length === 0) {
            counselingList.innerHTML = '<p class="text-gray-500 dark:text-slate-400 text-center py-20 font-medium">상담 이력이 존재하는 대상자가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        counselingList.innerHTML = data.map(member => {
            const sessions = Array.isArray(member.all_sessions) ? member.all_sessions : [];
            const latestSession = sessions[0] || null;

            let daysDiffHtml = '';
            if (latestSession && latestSession.date) {
                const lastDate = new Date(latestSession.date);
                lastDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                daysDiffHtml = `<span class="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-650 dark:text-indigo-400 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40 font-bold">${daysDiff}일 전(최근 상담)</span>`;
            }

            const allSessionsHtml = sessions.map((s, idx) => {
                const isLatest = idx === 0;
                // If filterYearMonth is active and this session matches, or if no filter but we normally hide, 
                // we check if it matches the current filterMonth to auto-expand.
                const matchesFilter = filterYearMonth && s.date && s.date.startsWith(filterYearMonth);
                const hiddenClass = matchesFilter ? '' : 'hidden';
                return `
                    <div class="specific-session-container ${hiddenClass}" data-session-id="${s.session_id}">
                        ${renderSessionCard(s, member, isLatest)}
                    </div>
                `;
            }).join('');

            // 교회명, 교구, 구역 존재 유무에 따라 유연한 소속 텍스트 생성
            const parts = [];
            const churchName = member.church || '';
            const parishName = member.parish || '';
            const districtName = member.district || '';

            if (churchName && churchName !== '서울중앙교회') {
                parts.push(churchName); // 서울중앙교회 외 타교회인 경우 명시적으로 노출
            }

            const hasParish = parishName && !parishName.includes('정보없음') && parishName !== '교구 미지정';
            const hasDistrict = districtName && !districtName.includes('정보없음') && districtName !== '구역 미정';

            if (hasParish && hasDistrict) {
                // 교구와 구역이 둘 다 제대로 입력된 경우
                const pText = parishName.includes('교구') ? parishName : parishName + '교구';
                const dText = districtName.includes('구역') ? districtName : districtName + '구역';
                parts.push(`${pText} ${dText}`);
            } else {
                // 교구나 구역 중 하나라도 없거나 빈 값인 경우, 빈 구역 정보 대신 교회명을 추가(기존에 서울중앙교회라 생략되었어도 여기서 표시)
                if (churchName) {
                    if (!parts.includes(churchName)) {
                        parts.push(churchName);
                    }
                }
            }

            if (member.category) parts.push(member.category);
            
            // 전도대상의 성별(bs) 표기 방식 구분: 전도대상은 '남자/여자', 성도는 '형제/자매'
            const isEv = (member.member_status === 'evangelism');
            let bsLabel = '';
            if (member.bs === 'B') {
                bsLabel = isEv ? '남자' : '형제';
            } else if (member.bs === 'S') {
                bsLabel = isEv ? '여자' : '자매';
            }
            if (bsLabel) parts.push(bsLabel);

            const displayInfoText = parts.join(' · ');

            const latestLeadTarget = latestSession && latestSession.lead_target ? latestSession.lead_target : '';
            const leadTargetHtml = buildLeadChips(latestLeadTarget, 'md');

            const hasSessions = sessions.length > 0;
            // If filtering, chevron should start pointing up since we auto-expand the wrapper
            const chevronIconClass = filterYearMonth ? 'fa-chevron-up' : 'fa-chevron-down';
            const toggleButtonHtml = hasSessions ? `
                <button type="button" onclick="toggleMemberSessions(this)" class="text-gray-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors cursor-pointer focus:outline-none flex items-center justify-center w-5 h-5">
                    <i class="fa-solid ${chevronIconClass} transition-transform duration-200 text-sm"></i>
                </button>
            ` : '';

            const dateButtonsHtml = sessions.length > 0 ? `
                <div class="flex gap-1.5 flex-wrap mt-1.5 items-center">
                    <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-0.5">상담이력:</span>
                    ${sessions.map(s => `
                        <button type="button" onclick="toggleSpecificSession(this, '${s.session_id}')" class="px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-100 dark:border-slate-800 bg-indigo-50/60 dark:bg-slate-800/60 text-indigo-650 dark:text-slate-350 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white transition-colors cursor-pointer">
                            ${s.date}
                        </button>
                    `).join('')}
                </div>
            ` : '';

            const isEvangelismTarget = (latestSession && latestSession.member_status === 'evangelism') || (member.member_status === 'evangelism');
            const nameColorClass = isEvangelismTarget 
                ? 'text-orange-600 dark:text-orange-400 italic font-black' 
                : 'text-indigo-650 dark:text-indigo-400 font-black';

            // Wrapper is open if filterYearMonth is active
            const wrapperHiddenClass = filterYearMonth ? '' : 'hidden';

            return `
                <div class="counseling-person-card bg-white dark:bg-[#131B2E] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex items-start p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline cursor-pointer transition-colors ${nameColorClass}">${member.name}</span>
                            ${toggleButtonHtml}
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded font-bold">${displayInfoText}</span>
                            ${leadTargetHtml}
                            ${daysDiffHtml}
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${dateButtonsHtml}
                        <div class="member-sessions-wrapper w-full mt-2 ${wrapperHiddenClass}">
                            ${allSessionsHtml}
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 상담 <span class="text-indigo-600 dark:text-indigo-400 font-black">${member.counseling_count}</span>회</div>
                        <div class="flex flex-col gap-1">
                            <button onclick="openNewCounselingWithMember('${member.name}', ${member.id}, '${member.category || ''}', '${member.bs || ''}')"
                                    class="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                추가 상담 등록
                            </button>
                            <button onclick="deleteMemberAllCounseling('${member.name}', ${member.id})"
                                    class="border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-rose-600 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                상담 이력 전체 삭제
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 인라인 수정/삭제 이벤트 연결
        counselingList.querySelectorAll('.counsel-session-card').forEach(card => {
            attachInlineEditToCard(card, loadStatus);
        });
    }

    window.deleteMemberAllCounseling = async function(name, memberId) {
        const msg = `${name} 성도의 모든 상담 기록(달력 일정 및 직접 등록된 기록)이 영구 삭제되며, 상담 목록에서 완전히 제외됩니다.\n\n정말 삭제하시겠습니까?`;
        if (confirm(msg)) {
            try {
                const res = await fetch(`/api/counseling/member/${memberId}`, { method: 'DELETE' });
                if (res.ok) {
                    loadStatus();
                } else {
                    alert('전체 삭제에 실패했습니다.');
                }
            } catch (err) {
                console.error(err);
                alert('서버 오류로 인해 삭제에 실패했습니다.');
            }
        }
    };

    if (sortOption) sortOption.addEventListener('change', applyFilters);
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    // ──────────────────────────────────────────────────
    // Member Detail Modal (상담 이력 탭: meetings+records 병합)
    // ──────────────────────────────────────────────────
    // RECORD_STATUS_MAP은 공용 member-edit.js가 window.RECORD_STATUS_MAP으로 노출 (COUNSELING 상태 포함)

    

    

    window.openMemberHistoryModal = async function(id) {
        try {
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="counseling"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const [historyRes, recRes, counselingRes] = await Promise.all([
                fetch(`/api/members/${id}/history?_t=` + Date.now(), { cache: 'no-store' }),
                fetch(`/api/members/${id}/records?_t=` + Date.now(), { cache: 'no-store' }),
                fetch(`/api/counseling/${id}?_t=` + Date.now(), { cache: 'no-store' })
            ]);
            const { member, history, family, leaderProfile } = await historyRes.json();
            const records = await recRes.json();
            const counselingSessions = await counselingRes.json();
            currentMemberData = member;
            
            let calculatedPosArray = [];
            let calculatedSvcArray = [];
            
            const todayStr = new Date().toISOString().split('T')[0];
            [...records].filter(rec => rec.date <= todayStr).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(rec => {
                if (rec.status === 'POSITION') {
                    const newPos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
                    calculatedPosArray = Array.from(new Set([...calculatedPosArray, ...newPos]));
                } else if (rec.status === 'POSITION_DISMISS') {
                    const removePos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
                    calculatedPosArray = calculatedPosArray.filter(p => !removePos.includes(p));
                } else if (rec.status === 'SERVICE') {
                    const newSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
                    calculatedSvcArray = Array.from(new Set([...calculatedSvcArray, ...newSvc]));
                } else if (rec.status === 'SERVICE_DISMISS') {
                    const removeSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
                    calculatedSvcArray = calculatedSvcArray.filter(s => !removeSvc.includes(s));
                }
            });
            
            const finalCalculatedSvc = calculatedSvcArray.length ? calculatedSvcArray.join(', ') : '없음';
            const memberBasicInfo = document.getElementById('memberBasicInfo');
            if (memberBasicInfo) {
                memberBasicInfo.innerHTML = window.renderMemberProfileHeader(member, family, calculatedPosArray, finalCalculatedSvc);
            }

            // 출석 히스토리 탭 (공용 member-profile.js가 규칙+화면을 모두 그림)
            window.renderAttendanceTab(id, member, history, leaderProfile);

            // 심방 기록 탭
            const visMemos = history.filter(h => h.type === '심방');
            const visSec = document.getElementById('visitationHistorySection'), visList = document.getElementById('visitationMemoList');
            if (visMemos.length) {
                if (visSec) visSec.classList.remove('hidden');
                if (visList) {
                    visList.innerHTML = visMemos.map(h => {
                        const memoVal = h.memo ? h.memo.trim() : '';
                        const testimonyVal = h.testimony_snapshot ? h.testimony_snapshot.trim() : '';
                        let contentHTML = '';
                        if (memoVal) contentHTML += `<div class="mb-2 bg-white/60 p-2.5 rounded-lg border border-slate-100"><span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">✍️ 메모</span><p class="text-xs text-slate-700 whitespace-pre-wrap font-bold leading-relaxed">${memoVal}</p></div>`;
                        if (testimonyVal) contentHTML += `<div class="bg-blue-50/50 border-blue-100/30 p-2.5 rounded-lg border"><span class="block text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">🎙️ 심방 간증</span><p class="text-xs text-blue-900 whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p></div>`;
                        if (!memoVal && !testimonyVal) contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">기록된 상세 내용이 없습니다.</p>`;
                        return `<div class="bg-teal-50 border-teal-100 dark:bg-slate-800/40 dark:border-slate-700/60 p-4 rounded-xl border shadow-sm flex flex-col gap-2"><div class="text-xs font-black text-teal-805 border-teal-200/30 dark:text-slate-350 dark:border-slate-700/30 border-b pb-1"><span>📅 ${h.date} 심방 기록</span></div>${contentHTML}</div>`;
                    }).join('');
                }
            } else {
                if (visList) visList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">심방 기록이 없습니다.</p>';
            }

            // ★ 상담 기록 탭 (meetings + records 병합 표시)
            const counselingMemoList = document.getElementById('counselingMemoList');
            if (counselingMemoList) {
                if (counselingSessions.length) {
                    counselingMemoList.innerHTML = counselingSessions.map(s => {
                        const isEv = s.member_status === 'evangelism';
                        const tagsHtml = s.tags ? s.tags.trim().split(/\s+/).filter(t => t.startsWith('#'))
                            .map(t => {
                                const cls = isEv 
                                    ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-750 dark:text-orange-300 border-orange-200/60 dark:border-orange-700/40'
                                    : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-700/40';
                                return `<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${cls} border">${t}</span>`;
                            })
                            .join('') : '';
                        const sourceLabel = s.source === 'meeting' 
                            ? '<span class="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">달력</span>' 
                            : '<span class="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold">직접등록</span>';
                        const memberBadge = isEv 
                            ? '<span class="text-[9px] bg-orange-105 dark:bg-orange-950/30 text-orange-600 dark:text-orange-450 px-1.5 py-0.5 rounded font-bold border border-orange-200/60">전도대상</span>'
                            : '';
                        const sessionLeadHtml = buildLeadChips(s.lead_target, 'sm');

                        return `
                            <div class="counsel-card bg-indigo-50 dark:bg-[#131B2E] border border-indigo-100 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col gap-2" data-session-id="${s.session_id}" data-member-id="${id}" data-tags="${s.tags || ''}" data-member-status="${s.member_status || 'member'}" data-remark-memo="${s.remark_memo || ''}" data-lead-target="${s.lead_target || ''}" data-category="${member.category || '모름'}" data-bs="${member.bs || ''}">
                                <div class="text-xs font-black text-indigo-800 dark:text-indigo-400 border-b dark:border-slate-800 pb-1.5 flex justify-between items-center">
                                    <div class="flex items-center flex-wrap gap-2">
                                        <span class="counsel-date-text">📅 ${s.date} 개인 상담</span>
                                        ${sourceLabel}
                                        ${memberBadge}
                                        ${sessionLeadHtml}
                                    </div>
                                    <div class="flex items-center gap-1.5">
                                        <button type="button" class="edit-counsel-btn text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer">
                                            <i class="fa-regular fa-pen-to-square"></i> 수정
                                        </button>
                                        <button type="button" class="delete-counsel-btn text-rose-600 dark:text-rose-450 hover:text-rose-800 dark:hover:text-rose-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer">
                                            <i class="fa-regular fa-trash-can"></i> 삭제
                                        </button>
                                    </div>
                                </div>
                                ${tagsHtml ? `<div class="flex flex-wrap gap-1">${tagsHtml}</div>` : ''}
                <div class="counsel-body-area bg-white/60 dark:bg-[#0B0F19] p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                    <p class="counsel-remark-text text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-bold leading-relaxed">${s.content || '(내용 없음)'}</p>
                                    ${s.remark_memo ? `<div class="counsel-remark-text bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-350 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 text-[11px] font-bold mt-2">📌 비고: ${s.remark_memo}</div>` : ''}
                                </div>
                            </div>
                        `;
                    }).join('');

                    // 수정 버튼 이벤트 연결
                    counselingMemoList.querySelectorAll('.counsel-card').forEach(card => {
                        const sessionId = card.dataset.sessionId;
                        const memberId = card.dataset.memberId;
                        const currentTags = card.dataset.tags || '';
                        const currentStatus = card.dataset.memberStatus || 'member';
                        const editBtn = card.querySelector('.edit-counsel-btn');
                        const deleteBtn = card.querySelector('.delete-counsel-btn');
                        const bodyArea = card.querySelector('.counsel-body-area');

                        if (deleteBtn) {
                            deleteBtn.addEventListener('click', async () => {
                                if (confirm('정말 이 상담 기록을 영구 삭제하시겠습니까?')) {
                                    try {
                                        const res = await fetch(`/api/counseling/${sessionId}?member_id=${memberId}`, { method: 'DELETE' });
                                        if (res.ok) {
                                            openMemberHistoryModal(id);
                                            loadStatus();
                                        } else {
                                            alert('삭제에 실패했습니다.');
                                        }
                                    } catch (err) {
                                        console.error(err);
                                        alert('서버 오류로 인해 삭제에 실패했습니다.');
                                    }
                                }
                            });
                        }

                        editBtn.addEventListener('click', () => {
                            if (card.querySelector('.counsel-edit-textarea')) return;
                            const dateTextSpan = card.querySelector('.counsel-date-text');
                            const currentDateMatch = (dateTextSpan.textContent || '').match(/\d{4}-\d{2}-\d{2}/);
                            const currentDate = currentDateMatch ? currentDateMatch[0] : '';
                            const remarkTextPara = card.querySelector('.counsel-remark-text');
                            const currentRemark = remarkTextPara.textContent.trim();
                            const currentMemo = card.dataset.remarkMemo || '';
                            const currentLeadTarget = card.dataset.leadTarget || '';
                            const currentCounselingMethod = card.dataset.counselingMethod || '대면';
                            const currentCategory = card.dataset.category || '모름';
                            const currentBs = card.dataset.bs || '';

                            const memberTags = ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'];
                            const evangelismTags = ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원'];

                            bodyArea.innerHTML = `
                                <div class="flex flex-col gap-2 w-full">
                                    <div class="flex gap-4">
                                        <div class="flex-1">
                                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 날짜</label>
                                            <input type="date" class="counsel-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                                        </div>
                                        <div class="flex-1">
                                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">대상자 상태</label>
                                            <div class="inline-edit-status-group flex gap-1">
                                                <button type="button" data-status="member" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">성도</button>
                                                <button type="button" data-status="evangelism" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'evangelism' ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">전도대상</button>
                                            </div>
                                            <input type="hidden" class="counsel-edit-status" value="${currentStatus}">
                                        </div>
                                    </div>
                                    <!-- 소속 및 성별 선택 -->
                                    <div class="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/50 space-y-2 mt-1">
                                        <div>
                                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">소속</span>
                                            <div class="inline-edit-category-group flex flex-wrap gap-1">
                                                ${['봉사회', '청년회', '어머니회', '은장회', '모름'].map(c => `
                                                    <button type="button" data-category="${c}" class="inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${currentCategory === c ? 'bg-indigo-650 border-indigo-650 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${c}</button>
                                                `).join('')}
                                            </div>
                                            <input type="hidden" class="counsel-edit-category" value="${currentCategory}">
                                        </div>
                                        <div>
                                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">성별</span>
                                            <div class="inline-edit-bs-group flex gap-1">
                                                <button type="button" data-bs="B" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'B' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${currentStatus === 'evangelism' ? '남자' : '형제'}</button>
                                                <button type="button" data-bs="S" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'S' ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">${currentStatus === 'evangelism' ? '여자' : '자매'}</button>
                                            </div>
                                            <input type="hidden" class="counsel-edit-bs" value="${currentBs}">
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 방법</label>
                                        <div class="inline-edit-method-group flex gap-1">
                                            <button type="button" data-method="대면" class="inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentCounselingMethod === '대면' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">🤝 대면</button>
                                            <button type="button" data-method="전화" class="inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentCounselingMethod === '전화' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">📞 전화</button>
                                        </div>
                                        <input type="hidden" class="counsel-edit-method" value="${currentCounselingMethod}">
                                    </div>
                                    <div class="edit-tags-container bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/50 dark:border-indigo-900/20 mt-1">
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">상담 주제 태그 (클릭하여 토글 / 직접 입력 추가 가능)</label>
                                        <div class="edit-tags-presets flex flex-wrap gap-1 mb-2"></div>
                                        <div class="flex gap-1 items-center mb-2">
                                            <input type="text" class="inline-custom-tag-input flex-1 border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="직접 태그 입력 추가...">
                                            <button type="button" class="inline-add-tag-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-700 text-indigo-650 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 whitespace-nowrap">+ 추가</button>
                                        </div>
                                        <div class="inline-tags-preview flex flex-wrap gap-1 min-h-[16px]"></div>
                                        <input type="hidden" class="counsel-edit-tags" value="${currentTags}">
                                    </div>
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 내용</label>
                                        <textarea class="counsel-edit-textarea w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="4">${currentRemark === '(내용 없음)' ? '' : currentRemark}</textarea>
                                    </div>
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">인도대상 / 모임</label>
                                        <input type="text" class="counsel-edit-lead-target w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentLeadTarget}" placeholder="@인도대상 #모임 #특징 (여러 개 가능)">
                                    </div>
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">비고 / 기타 메모</label>
                                        <input type="text" class="counsel-edit-memo w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentMemo}" placeholder="비고 및 특이사항 입력...">
                                    </div>
                                    <div class="flex justify-end gap-1.5 mt-1">
                                        <button type="button" class="save-counsel-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                                        <button type="button" class="cancel-counsel-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                                    </div>
                                </div>
                            `;

                            // 태그 상태 관리
                            let activeTags = new Set(currentTags.split(/\s+/).filter(t => t.startsWith('#')).map(t => t.substring(1)));
                            let selectedStatus = currentStatus;

                            function updateModalPresetTags(status) {
                                const presetsContainer = bodyArea.querySelector('.edit-tags-presets');
                                if (!presetsContainer) return;
                                
                                const tagsList = status === 'evangelism' ? evangelismTags : memberTags;
                                presetsContainer.innerHTML = tagsList.map(t => {
                                    const isSelected = activeTags.has(t);
                                    const cls = isSelected 
                                        ? 'bg-indigo-600 text-white border-indigo-600' 
                                        : 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60';
                                    return `<button type="button" data-tag="${t}" class="inline-edit-tag-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${cls}">${t}</button>`;
                                }).join('');
                            }

                            function updateModalEditTags() {
                                const tagsVal = Array.from(activeTags).map(t => `#${t}`).join(' ');
                                bodyArea.querySelector('.counsel-edit-tags').value = tagsVal;

                                const preview = bodyArea.querySelector('.inline-tags-preview');
                                preview.innerHTML = Array.from(activeTags).map(t => `
                                    <span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white animate-fade-in" data-tag="${t}">
                                        #${t}
                                        <button type="button" class="inline-remove-tag-btn hover:text-indigo-200 transition-colors font-bold ml-1 leading-none">&times;</button>
                                    </span>
                                `).join('');

                                bodyArea.querySelectorAll('.inline-edit-tag-btn').forEach(btn => {
                                    const t = btn.dataset.tag;
                                    if (activeTags.has(t)) {
                                        btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-indigo-650', 'dark:text-indigo-400');
                                        btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600', 'dark:text-white');
                                    } else {
                                        btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600', 'dark:text-white');
                                        btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-650', 'dark:text-indigo-400');
                                    }
                                });
                            }

                            // 초기 태그 및 프리셋 렌더링
                            updateModalPresetTags(selectedStatus);
                            updateModalEditTags();

                            // 대상자 상태 버튼 클릭 이벤트
                            bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    selectedStatus = btn.dataset.status;
                                    bodyArea.querySelector('.counsel-edit-status').value = selectedStatus;
                                    bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(b => {
                                        const bStatus = b.dataset.status;
                                        const isActive = bStatus === selectedStatus;
                                        b.className = `inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                                            isActive 
                                                ? (bStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'
                                        }`;
                                    });

                                    // 성별 레이블 동적 변경 (성도 -> 형제/자매, 전도대상 -> 남자/여자)
                                    const bsButtons = bodyArea.querySelectorAll('.inline-edit-bs-btn');
                                    if (bsButtons.length >= 2) {
                                        if (selectedStatus === 'evangelism') {
                                            bsButtons[0].textContent = '남자';
                                            bsButtons[1].textContent = '여자';
                                        } else {
                                            bsButtons[0].textContent = '형제';
                                            bsButtons[1].textContent = '자매';
                                        }
                                    }

                                    updateModalPresetTags(selectedStatus);
                                    updateModalEditTags();
                                });
                            });

                            // 소속회 버튼 토글
                            bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const newCat = btn.dataset.category;
                                    bodyArea.querySelector('.counsel-edit-category').value = newCat;
                                    bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(b => {
                                        const isActive = b.dataset.category === newCat;
                                        b.className = `inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                                            isActive
                                                ? 'bg-indigo-650 border-indigo-650 text-white'
                                                : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                        }`;
                                    });
                                });
                            });

                            // 성별 버튼 토글
                            bodyArea.querySelectorAll('.inline-edit-bs-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const newBs = btn.dataset.bs;
                                    bodyArea.querySelector('.counsel-edit-bs').value = newBs;
                                    bodyArea.querySelectorAll('.inline-edit-bs-btn').forEach(b => {
                                        const isActive = b.dataset.bs === newBs;
                                        b.className = `inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                                            isActive
                                                ? (newBs === 'B' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-pink-500 border-pink-500 text-white')
                                                : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                        }`;
                                    });
                                });
                            });

                            // 대면/전화 방법 버튼 토글
                            bodyArea.querySelectorAll('.inline-edit-method-btn').forEach(btn => {
                                btn.addEventListener('click', () => {
                                    const newMethod = btn.dataset.method;
                                    bodyArea.querySelector('.counsel-edit-method').value = newMethod;
                                    bodyArea.querySelectorAll('.inline-edit-method-btn').forEach(b => {
                                        const isActive = b.dataset.method === newMethod;
                                        b.className = `inline-edit-method-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                                            isActive
                                                ? (b.dataset.method === '대면' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-amber-500 border-amber-500 text-white')
                                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                        }`;
                                    });
                                });
                            });

                            // 프리셋 클릭
                            bodyArea.querySelector('.edit-tags-presets').addEventListener('click', (ev) => {
                                const btn = ev.target.closest('.inline-edit-tag-btn');
                                if (!btn) return;
                                const tag = btn.dataset.tag;
                                if (activeTags.has(tag)) {
                                    activeTags.delete(tag);
                                } else {
                                    activeTags.add(tag);
                                }
                                updateModalEditTags();
                            });

                            // 직접 입력 추가
                            const addTagBtn = bodyArea.querySelector('.inline-add-tag-btn');
                            const customInput = bodyArea.querySelector('.inline-custom-tag-input');
                            const performAddCustomTag = () => {
                                let val = customInput.value.trim();
                                if (!val) return;
                                if (val.startsWith('#')) val = val.substring(1);
                                if (val) {
                                    activeTags.add(val);
                                    customInput.value = '';
                                    updateModalEditTags();
                                }
                            };

                            addTagBtn.addEventListener('click', performAddCustomTag);
                            customInput.addEventListener('keydown', (ev) => {
                                if (ev.key === 'Enter') {
                                    ev.preventDefault();
                                    performAddCustomTag();
                                }
                            });

                            // 프리뷰 개별 삭제
                            bodyArea.querySelector('.inline-tags-preview').addEventListener('click', (ev) => {
                                const removeBtn = ev.target.closest('.inline-remove-tag-btn');
                                if (!removeBtn) return;
                                const span = removeBtn.closest('[data-tag]');
                                const tag = span.dataset.tag;
                                activeTags.delete(tag);
                                updateModalEditTags();
                            });

                            const saveBtn = bodyArea.querySelector('.save-counsel-btn');
                            const cancelBtn = bodyArea.querySelector('.cancel-counsel-btn');

                            cancelBtn.addEventListener('click', () => { openMemberHistoryModal(id); });

                            saveBtn.addEventListener('click', async () => {
                                const newDate = bodyArea.querySelector('.counsel-edit-date').value;
                                const newContent = bodyArea.querySelector('.counsel-edit-textarea').value.trim();
                                const newTags = bodyArea.querySelector('.counsel-edit-tags').value.trim();
                                if (!newDate) return alert('날짜를 입력해주세요.');
                                saveBtn.disabled = true;
                                saveBtn.textContent = '저장중...';
                                try {
                                    const newCategory = bodyArea.querySelector('.counsel-edit-category').value;
                                    const newBs = bodyArea.querySelector('.counsel-edit-bs').value;
                                    const res = await fetch(`/api/counseling/${sessionId}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            date: newDate,
                                            content: newContent,
                                            tags: newTags,
                                            member_status: selectedStatus,
                                            counseling_method: bodyArea.querySelector('.counsel-edit-method')?.value || '대면',
                                            category: newCategory,
                                            bs: newBs,
                                            member_id: parseInt(memberId)
                                        })
                                    });
                                    if (res.ok) {
                                        openMemberHistoryModal(id);
                                        loadStatus();
                                    } else {
                                        alert('수정에 실패했습니다.');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = '저장';
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert('서버 오류로 인해 실패했습니다.');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = '저장';
                                }
                            });
                        });
                    });
                } else {
                    counselingMemoList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">상담 기록이 없습니다.</p>';
                }
            }

            // 인적사항 기록 탭
            const recordTableBody = document.getElementById('recordTableBody');
            if (recordTableBody) {
                recordTableBody.innerHTML = records.length ? records.map(r => `
                    <tr class="text-[12px] border-b border-gray-50 hover:bg-gray-50 transition">
                        <td class="p-2 text-gray-500">${r.date}</td>
                        <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border">${RECORD_STATUS_MAP[r.status] || r.status}</span></td>
                        <td class="p-2 text-gray-700 font-bold">${r.remark || ''}</td>
                    </tr>
                `).join('') : '<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs italic">기록이 없습니다.</td></tr>';
            }
            
            const timelineContainer = document.getElementById('timelineContainer');
            if (timelineContainer) {
                if (records.length > 0) {
                    timelineContainer.classList.remove('hidden');
                    timelineContainer.innerHTML = `
                        <div class="relative border-l-2 border-slate-100 ml-4 my-2 space-y-6">
                            ${records.map(r => {
                                let colorClass = 'bg-blue-500';
                                let iconClass = 'fa-info-circle';
                                let textBg = 'bg-blue-50 text-blue-800 border-blue-100/50';
                                const status = r.status || '';
                                if (status === 'POSITION') { colorClass = 'bg-emerald-500'; iconClass = 'fa-award'; textBg = 'bg-emerald-50 text-emerald-800 border-emerald-100/50'; }
                                else if (status === 'POSITION_DISMISS') { colorClass = 'bg-rose-500'; iconClass = 'fa-user-slash'; textBg = 'bg-rose-50 text-rose-800 border-rose-100/50'; }
                                else if (status === 'SERVICE') { colorClass = 'bg-teal-500'; iconClass = 'fa-hand-holding-heart'; textBg = 'bg-teal-50 text-teal-800 border-teal-100/50'; }
                                else if (status === 'SERVICE_DISMISS') { colorClass = 'bg-orange-500'; iconClass = 'fa-times-circle'; textBg = 'bg-orange-50/70 text-orange-800 border-orange-100/50'; }
                                else if (status.includes('MOVE') || status.includes('IN') || status === 'TRANSFER') { colorClass = 'bg-blue-500'; iconClass = 'fa-route'; textBg = 'bg-blue-50 text-blue-800 border-blue-100/50'; }
                                else if (status === 'FELLOWSHIP') { colorClass = 'bg-amber-500'; iconClass = 'fa-users'; textBg = 'bg-amber-50 text-amber-800 border-amber-100/50'; }
                                return `
                                    <div class="relative pl-8">
                                        <div class="absolute -left-[11px] top-1 w-5 h-5 ${colorClass} rounded-full border-2 border-white shadow flex items-center justify-center text-white text-[9px]"><i class="fa-solid ${iconClass}"></i></div>
                                        <div class="text-[10px] font-black text-slate-400 mb-0.5">${r.date}</div>
                                        <div class="text-xs font-black text-slate-800 mb-1">${RECORD_STATUS_MAP[r.status] || r.status}</div>
                                        <div class="text-xs font-bold ${textBg} px-2.5 py-1.5 rounded-xl border inline-block max-w-full break-all shadow-sm">${r.remark || '-'}</div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
                } else {
                    timelineContainer.classList.add('hidden');
                }
            }

            const memberHistoryModal = document.getElementById('memberHistoryModal');
            if (memberHistoryModal) memberHistoryModal.classList.remove('hidden');
        } catch (e) { console.error(e); }
    };

    // 탭 이벤트 바인딩
    document.querySelectorAll('.member-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');
            document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
            const targetContent = document.getElementById(`tabContent_${btn.dataset.tab}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const closeHistoryModal = document.getElementById('closeHistoryModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    if (closeHistoryModal) closeHistoryModal.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    if (closeHistoryModalBtn) closeHistoryModalBtn.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));

    ;

    ;

    window.openMemberHistoryModalByName = async function(name) {
        try {
            const res = await fetch(`/api/members/filter?q=${encodeURIComponent(name)}`);
            const suggestions = await res.json();
            const matched = suggestions.find(s => s.name.trim() === name.trim());
            if (matched) {
                openMemberHistoryModal(matched.id);
            } else {
                alert(`'${name}' 성도 정보를 찾을 수 없습니다.`);
            }
        } catch (e) {
            console.error(e);
            alert('성도 정보를 조회하는 중 오류가 발생했습니다.');
        }
    };

    loadStatus();

    // ──────────────────────────────────────────────────
    // 새 상담 등록 모달 로직
    // ──────────────────────────────────────────────────
    const newCounselingModal = document.getElementById('newCounselingModal');
    const openNewCounselingBtn = document.getElementById('openNewCounselingBtn');
    const closeNewCounselingModal = document.getElementById('closeNewCounselingModal');
    const cancelNewCounselingBtn = document.getElementById('cancelNewCounselingBtn');
    const saveNewCounselingBtn = document.getElementById('saveNewCounselingBtn');

    const counselingName = document.getElementById('counselingName');
    const counselingNameSuggestions = document.getElementById('counselingNameSuggestions');
    const counselingMemberId = document.getElementById('counselingMemberId');
    const newMemberBadgeContainer = document.getElementById('newMemberBadgeContainer');

    const counselingChurchId = document.getElementById('counselingChurchId');
    const counselingChurchInput = document.getElementById('counselingChurchInput');
    const counselingChurchSuggestions = document.getElementById('counselingChurchSuggestions');
    const counselingParish = document.getElementById('counselingParish');
    const counselingDistrict = document.getElementById('counselingDistrict');

    let allChurches = [];

    // ── 태그 상태 관리 ──
    let selectedTags = new Set();

    function updatePresetTags(status) {
        const btnGroup = document.getElementById('counselingTagsBtnGroup');
        if (!btnGroup) return;

        const memberTags = ['전도상담', '구원확신/의심', '진로', '이성', '죄', '자녀', '부부관계', '가족', '성경질문', '이단', '직장생활', '결혼'];
        const evangelismTags = ['전도상담', '성경', '인생', '하나님', '1일차 전체', '2일차 전체', '3일차 전체', '4일차 전체', '성경강연회', '구원'];

        const tags = (status === 'evangelism') ? evangelismTags : memberTags;

        btnGroup.innerHTML = tags.map(t => {
            const isSelected = selectedTags.has(t);
            const activeClasses = 'bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-600';
            const inactiveClasses = 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60';
            const cls = isSelected ? activeClasses : inactiveClasses;
            return `<button type="button" data-tag="${t}" class="counsel-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 dark:hover:bg-indigo-600 dark:hover:text-white transition-all ${cls}">#${t}</button>`;
        }).join('');

        // 성별 버튼 라벨 변경 (성도: 형제/자매, 전도대상: 남자/여자)
        const bsBtnB = document.querySelector('#bsBtnGroup button[data-val="B"]');
        const bsBtnS = document.querySelector('#bsBtnGroup button[data-val="S"]');
        if (bsBtnB && bsBtnS) {
            if (status === 'evangelism') {
                bsBtnB.textContent = '남자';
                bsBtnS.textContent = '여자';
            } else {
                bsBtnB.textContent = '형제';
                bsBtnS.textContent = '자매';
            }
        }
    }

    function updateTagsPreview() {
        const preview = document.getElementById('selectedTagsPreview');
        const hiddenInput = document.getElementById('counselingTagsValue');
        if (!preview || !hiddenInput) return;
        
        if (selectedTags.size === 0) {
            preview.innerHTML = '';
            hiddenInput.value = '';
            return;
        }
        
        const tagsArr = Array.from(selectedTags);
        const tagsStr = tagsArr.map(t => `#${t}`).join(' ');
        hiddenInput.value = tagsStr;
        preview.innerHTML = tagsArr.map(t => `
            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-indigo-600 text-white">
                #${t}
                <button type="button" onclick="removeTag('${t}')" class="hover:text-indigo-200 transition-colors leading-none">&times;</button>
            </span>
        `).join('');
    }

    window.removeTag = function(tag) {
        selectedTags.delete(tag);
        // 해당 프리셋 버튼 토글 해제
        document.querySelectorAll('.counsel-tag-btn').forEach(btn => {
            if (btn.dataset.tag === tag) {
                btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600');
                btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
            }
        });
        updateTagsPreview();
    };

    // 프리셋 태그 버튼 클릭
    document.getElementById('counselingTagsBtnGroup')?.addEventListener('click', e => {
        const btn = e.target.closest('.counsel-tag-btn');
        if (!btn) return;
        const tag = btn.dataset.tag;
        if (selectedTags.has(tag)) {
            selectedTags.delete(tag);
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600');
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        } else {
            selectedTags.add(tag);
            btn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600');
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        }
        updateTagsPreview();
    });

    // 직접 입력 태그 추가
    document.getElementById('addCustomTagBtn')?.addEventListener('click', () => {
        const input = document.getElementById('counselingTagCustomInput');
        const val = (input.value || '').trim().replace(/^#+/, '');
        if (!val) return;
        selectedTags.add(val);
        input.value = '';
        updateTagsPreview();
    });
    document.getElementById('counselingTagCustomInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('addCustomTagBtn')?.click();
        }
    });

    // ── 성도 구분 버튼 그룹 ──
    function initGroupBtns(groupId, hiddenId, activeClass) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.addEventListener('click', e => {
            const btn = e.target.closest('button[data-val]');
            if (!btn) return;
            group.querySelectorAll('button[data-val]').forEach(b => {
                b.className = b.className
                    .replace(/border-indigo-\S+/g, '')
                    .replace(/border-blue-\S+/g, '')
                    .replace(/border-emerald-\S+/g, '')
                    .replace(/border-orange-\S+/g, '')
                    .replace(/text-indigo-\S+/g, '')
                    .replace(/text-blue-\S+/g, '')
                    .replace(/text-emerald-\S+/g, '')
                    .replace(/text-orange-\S+/g, '')
                    .replace(/bg-indigo-\S+/g, '')
                    .replace(/bg-blue-\S+/g, '')
                    .replace(/bg-emerald-\S+/g, '')
                    .replace(/bg-orange-\S+/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                b.classList.remove('ring-2', 'ring-offset-1', 'ring-indigo-400', 'ring-blue-400', 'ring-emerald-400');
                b.classList.add('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
            });
            btn.classList.remove('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
            btn.classList.add('ring-2', 'ring-offset-1');
            if (groupId === 'bsBtnGroup') {
                const isB = btn.dataset.val === 'B';
                btn.classList.add(isB ? 'border-blue-500' : 'border-pink-400', isB ? 'text-blue-700' : 'text-pink-700', isB ? 'dark:text-blue-300' : 'dark:text-pink-300', isB ? 'bg-blue-50' : 'bg-pink-50', isB ? 'dark:bg-blue-950/30' : 'dark:bg-pink-950/30', isB ? 'ring-blue-400' : 'ring-pink-400');
            } else if (groupId === 'memberStatusBtnGroup') {
                const isMember = btn.dataset.val === 'member';
                btn.classList.add(isMember ? 'border-emerald-400' : 'border-orange-400', isMember ? 'text-emerald-700' : 'text-orange-700', isMember ? 'dark:text-emerald-300' : 'dark:text-orange-300', isMember ? 'bg-emerald-50' : 'bg-orange-50', isMember ? 'dark:bg-emerald-950/30' : 'dark:bg-orange-950/30', isMember ? 'ring-emerald-400' : 'ring-orange-400');
                updatePresetTags(btn.dataset.val);
            } else {
                btn.classList.add('border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300', 'bg-indigo-50', 'dark:bg-indigo-950/30', 'ring-indigo-400');
            }
            const hidden = document.getElementById(hiddenId);
            if (hidden) hidden.value = btn.dataset.val;
        });
    }

    initGroupBtns('categoryBtnGroup', 'counselingCategory', 'indigo');
    initGroupBtns('bsBtnGroup', 'counselingBs', 'blue');
    initGroupBtns('memberStatusBtnGroup', 'counselingMemberStatus', 'emerald');

    // 상담 방식 버튼
    document.querySelectorAll('.counsel-method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.counsel-method-btn').forEach(b => {
                b.classList.remove('border-emerald-300','dark:border-emerald-800/60','bg-emerald-50','dark:bg-emerald-950/30','text-emerald-700','dark:text-emerald-400',
                    'border-amber-300','dark:border-amber-800/60','bg-amber-50','dark:bg-amber-950/30','text-amber-700','dark:text-amber-400');
                b.classList.add('border-slate-200','dark:border-slate-600','bg-white','dark:bg-slate-700','text-slate-600','dark:text-slate-300');
            });
            btn.classList.remove('border-slate-200','dark:border-slate-600','bg-white','dark:bg-slate-700','text-slate-600','dark:text-slate-300');
            if (btn.dataset.val === '전화') {
                btn.classList.add('border-amber-300','dark:border-amber-800/60','bg-amber-50','dark:bg-amber-950/30','text-amber-700','dark:text-amber-400');
            } else {
                btn.classList.add('border-emerald-300','dark:border-emerald-800/60','bg-emerald-50','dark:bg-emerald-950/30','text-emerald-700','dark:text-emerald-400');
            }
            const hidden = document.getElementById('counselingMethod');
            if (hidden) hidden.value = btn.dataset.val;
        });
    });

    // 익명 체크박스
    const anonymousCheck = document.getElementById('anonymousCheck');
    if (anonymousCheck && counselingName) {
        anonymousCheck.addEventListener('change', () => {
            if (anonymousCheck.checked) {
                counselingName.value = '익명';
                counselingName.disabled = true;
            } else {
                counselingName.value = '';
                counselingName.disabled = false;
                counselingName.focus();
            }
        });
    }

    function setGroupBtn(groupId, hiddenId, val) {
        const group = document.getElementById(groupId);
        if (!group) return;
        const btn = group.querySelector(`button[data-val="${val}"]`);
        if (btn) btn.click();
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = val;
    }

    function resetModal() {
        document.getElementById('newCounselingForm')?.reset();
        if (counselingMemberId) counselingMemberId.value = '';
        if (counselingChurchId) counselingChurchId.value = '';
        if (newMemberBadgeContainer) newMemberBadgeContainer.classList.add('hidden');
        if (counselingNameSuggestions) counselingNameSuggestions.classList.add('hidden');
        if (counselingChurchSuggestions) counselingChurchSuggestions.classList.add('hidden');
        document.getElementById('counselingDate').value = new Date().toISOString().split('T')[0];
        if (counselingParish) { counselingParish.innerHTML = '<option value="">교구 선택</option>'; counselingParish.disabled = true; }
        if (counselingDistrict) { counselingDistrict.innerHTML = '<option value="">구역 선택</option>'; counselingDistrict.disabled = true; }
        // 태그 초기화
        selectedTags = new Set();
        updateTagsPreview();
        document.querySelectorAll('.counsel-tag-btn').forEach(btn => {
            btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'dark:bg-indigo-600');
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-indigo-600', 'dark:text-indigo-400');
        });
        // 구분 버튼 초기화
        document.querySelectorAll('.category-btn, .bs-btn, .member-status-btn').forEach(btn => {
            btn.classList.remove('ring-2', 'ring-offset-1', 'border-indigo-400', 'text-indigo-700', 'dark:text-indigo-300', 'bg-indigo-50', 'dark:bg-indigo-950/30', 'ring-indigo-400', 'border-blue-500', 'text-blue-700', 'dark:text-blue-300', 'bg-blue-50', 'dark:bg-blue-950/30', 'ring-blue-400', 'border-pink-400', 'text-pink-700', 'dark:text-pink-300', 'bg-pink-50', 'dark:bg-pink-950/30', 'ring-pink-400', 'border-emerald-400', 'text-emerald-700', 'dark:text-emerald-300', 'bg-emerald-50', 'dark:bg-emerald-950/30', 'ring-emerald-400', 'border-orange-400', 'text-orange-700', 'dark:text-orange-300', 'bg-orange-50', 'dark:bg-orange-950/30', 'ring-orange-400');
            btn.classList.add('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
        });
        document.getElementById('counselingCategory').value = '';
        document.getElementById('counselingBs').value = '';
        document.getElementById('counselingMemberStatus').value = 'member';
        // 기본 상태: 성도 버튼 활성화
        const memberBtn = document.querySelector('#memberStatusBtnGroup button[data-val="member"]');
        if (memberBtn) memberBtn.click();
        // 익명 체크박스 초기화
        const anonCk = document.getElementById('anonymousCheck');
        if (anonCk) { anonCk.checked = false; }
        const cnInput = document.getElementById('counselingName');
        if (cnInput) { cnInput.disabled = false; }
        // 상담 방식 초기화 → 대면
        const methodHidden = document.getElementById('counselingMethod');
        if (methodHidden) methodHidden.value = '대면';
        document.querySelectorAll('.counsel-method-btn').forEach(b => {
            b.classList.remove('border-emerald-300','dark:border-emerald-800/60','bg-emerald-50','dark:bg-emerald-950/30','text-emerald-700','dark:text-emerald-400',
                'border-amber-300','dark:border-amber-800/60','bg-amber-50','dark:bg-amber-950/30','text-amber-700','dark:text-amber-400');
            b.classList.add('border-slate-200','dark:border-slate-600','bg-white','dark:bg-slate-700','text-slate-600','dark:text-slate-300');
        });
        const daemyeonBtn = document.querySelector('.counsel-method-btn[data-val="대면"]');
        if (daemyeonBtn) {
            daemyeonBtn.classList.remove('border-slate-200','dark:border-slate-600','bg-white','dark:bg-slate-700','text-slate-600','dark:text-slate-300');
            daemyeonBtn.classList.add('border-emerald-300','dark:border-emerald-800/60','bg-emerald-50','dark:bg-emerald-950/30','text-emerald-700','dark:text-emerald-400');
        }
    }

    window.openNewCounselingWithMember = (memberName, memberId, category, bs) => {
        resetModal();
        setTimeout(async () => {
            if (counselingName) counselingName.value = memberName;
            if (counselingMemberId) counselingMemberId.value = memberId;
            if (newMemberBadgeContainer) newMemberBadgeContainer.classList.add('hidden');
            // 소속/성별 자동 채우기
            if (category) setGroupBtn('categoryBtnGroup', 'counselingCategory', category);
            if (bs) setGroupBtn('bsBtnGroup', 'counselingBs', bs);

            const targetMember = allStatus.find(s => s.id === memberId);
            if (targetMember) {
                const isMember = targetMember.member_status !== 'evangelism';
                const statusVal = isMember ? 'member' : 'evangelism';
                setGroupBtn('memberStatusBtnGroup', 'counselingMemberStatus', statusVal);
            }

            if (targetMember && targetMember.church && targetMember.church !== '교회정보없음') {
                if (counselingChurchInput) counselingChurchInput.value = targetMember.church;
                const matchedChurch = allChurches.find(c => c.name.trim() === targetMember.church.trim());
                if (matchedChurch) {
                    if (counselingChurchId) counselingChurchId.value = matchedChurch.id;
                    await loadParishes(matchedChurch.id);
                    if (targetMember.parish && targetMember.parish !== '교구정보없음') {
                        if (counselingParish) counselingParish.value = targetMember.parish;
                        const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;
                        if (parishId) {
                            await loadDistricts(parishId);
                            if (targetMember.district && targetMember.district !== '구역정보없음' && counselingDistrict) {
                                counselingDistrict.value = targetMember.district;
                            }
                        }
                    }
                }
            }
        }, 100);
        newCounselingModal.classList.remove('hidden');
    };

    if (openNewCounselingBtn) {
        openNewCounselingBtn.addEventListener('click', async () => {
            resetModal();
            await loadChurches();
            newCounselingModal.classList.remove('hidden');
        });
    }

    const closeNewCounseling = () => {
        newCounselingModal.classList.add('hidden');
        if (counselingNameSuggestions) counselingNameSuggestions.classList.add('hidden');
        if (counselingChurchSuggestions) counselingChurchSuggestions.classList.add('hidden');
    };

    if (closeNewCounselingModal) closeNewCounselingModal.addEventListener('click', closeNewCounseling);
    if (cancelNewCounselingBtn) cancelNewCounselingBtn.addEventListener('click', closeNewCounseling);

    async function loadChurches() {
        try {
            const res = await fetch('/api/churches/all');
            allChurches = await res.json();
        } catch (e) { console.error('Error loading churches:', e); }
    }

    let activeChurchIndex = -1;
    let activeNameIndex = -1;

    if (counselingChurchInput) {
        counselingChurchInput.addEventListener('input', () => {
            const val = counselingChurchInput.value.trim().toLowerCase();
            if (counselingChurchId) counselingChurchId.value = '';
            if (counselingParish) { counselingParish.innerHTML = '<option value="">교구 선택</option>'; counselingParish.disabled = true; }
            if (counselingDistrict) { counselingDistrict.innerHTML = '<option value="">구역 선택</option>'; counselingDistrict.disabled = true; }
            activeChurchIndex = -1;
            if (!val) { if (counselingChurchSuggestions) counselingChurchSuggestions.classList.add('hidden'); return; }
            const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
            if (counselingChurchSuggestions) {
                if (filtered.length > 0) {
                    counselingChurchSuggestions.innerHTML = filtered.map((c, i) => `
                        <div class="church-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 transition-colors" 
                             data-id="${c.id}" data-name="${c.name}" data-index="${i}">${c.name}</div>
                    `).join('');
                    counselingChurchSuggestions.classList.remove('hidden');
                } else {
                    counselingChurchSuggestions.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">검색 결과가 없습니다.</div>';
                    counselingChurchSuggestions.classList.remove('hidden');
                }
            }
        });

        counselingChurchInput.addEventListener('keydown', async (e) => {
            if (!counselingChurchSuggestions || counselingChurchSuggestions.classList.contains('hidden')) return;
            const items = counselingChurchSuggestions.querySelectorAll('.church-search-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeChurchIndex = (activeChurchIndex + 1) % items.length;
                updateActiveChurchHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeChurchIndex = (activeChurchIndex - 1 + items.length) % items.length;
                updateActiveChurchHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const indexToSelect = activeChurchIndex >= 0 ? activeChurchIndex : 0;
                if (items[indexToSelect]) {
                    selectChurchItem(items[indexToSelect]);
                }
            } else if (e.key === 'Escape') {
                counselingChurchSuggestions.classList.add('hidden');
            } else if (e.key === 'Tab') {
                // If suggestions are visible, select the current active one (or first one) and close
                const indexToSelect = activeChurchIndex >= 0 ? activeChurchIndex : 0;
                if (items[indexToSelect]) {
                    selectChurchItem(items[indexToSelect]);
                }
            }
        });
    }

    function updateActiveChurchHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === activeChurchIndex) {
                item.classList.add('bg-indigo-50', 'dark:bg-slate-700', 'text-indigo-800', 'dark:text-white');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-indigo-50', 'dark:bg-slate-700', 'text-indigo-800', 'dark:text-white');
            }
        });
    }

    async function selectChurchItem(item) {
        counselingChurchInput.value = item.dataset.name;
        counselingChurchId.value = item.dataset.id;
        counselingChurchSuggestions.classList.add('hidden');
        await loadParishes(item.dataset.id);
        // Move focus to next input
        if (counselingParish) {
            counselingParish.focus();
        }
    }

    if (counselingChurchSuggestions) {
        counselingChurchSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.church-search-item');
            if (!item) return;
            selectChurchItem(item);
        });
    }

    async function loadParishes(churchId) {
        if (counselingParish) { counselingParish.innerHTML = '<option value="">교구 선택</option>'; }
        if (counselingDistrict) { counselingDistrict.innerHTML = '<option value="">구역 선택</option>'; counselingDistrict.disabled = true; }
        if (!churchId) { if (counselingParish) counselingParish.disabled = true; return; }
        try {
            const res = await fetch(`/api/parishes?church_id=${churchId}`);
            const parishes = await res.json();
            if (counselingParish) {
                counselingParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
                counselingParish.disabled = false;
            }
        } catch (e) { console.error(e); }
    }

    async function loadDistricts(parishId) {
        if (counselingDistrict) { counselingDistrict.innerHTML = '<option value="">구역 선택</option>'; }
        if (!parishId) { if (counselingDistrict) counselingDistrict.disabled = true; return; }
        try {
            const res = await fetch(`/api/districts?parish_id=${parishId}`);
            const districts = await res.json();
            if (counselingDistrict) {
                counselingDistrict.innerHTML = '<option value="">구역 선택</option>' + districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
                counselingDistrict.disabled = false;
            }
        } catch (e) { console.error(e); }
    }

    if (counselingParish) {
        counselingParish.addEventListener('change', async () => {
            const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
            await loadDistricts(selectedOpt.dataset.id);
        });
    }

    if (counselingName) {
        counselingName.addEventListener('input', async () => {
            const val = counselingName.value.trim();
            activeNameIndex = -1;
            if (!val) {
                if (counselingNameSuggestions) counselingNameSuggestions.classList.add('hidden');
                if (counselingMemberId) counselingMemberId.value = '';
                if (newMemberBadgeContainer) newMemberBadgeContainer.classList.add('hidden');
                return;
            }
            try {
                const res = await fetch(`/api/members/filter?q=${encodeURIComponent(val)}`);
                const suggestions = await res.json();
                if (counselingNameSuggestions) {
                    if (suggestions.length > 0) {
                        counselingNameSuggestions.innerHTML = suggestions.map((s, i) => `
                            <div class="name-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 flex justify-between items-center transition-colors" 
                                 data-id="${s.id}" data-name="${s.name}" data-church="${s.church || ''}" data-parish="${s.parish || ''}" data-district="${s.district || ''}" data-category="${s.category || ''}" data-bs="${s.bs || ''}" data-index="${i}">
                                <span>${s.name} <span class="text-xs font-medium text-slate-400">(${s.position || '성도'})</span></span>
                                <span class="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded font-bold">${s.church || '교회정보없음'}</span>
                            </div>
                        `).join('');
                        counselingNameSuggestions.classList.remove('hidden');
                    } else {
                        counselingNameSuggestions.classList.add('hidden');
                    }
                }
                const exactMatch = suggestions.find(s => s.name === val);
                if (!exactMatch) {
                    if (counselingMemberId) counselingMemberId.value = '';
                    if (newMemberBadgeContainer) newMemberBadgeContainer.classList.remove('hidden');
                } else {
                    if (newMemberBadgeContainer) newMemberBadgeContainer.classList.add('hidden');
                }
            } catch (e) { console.error(e); }
        });

        counselingName.addEventListener('keydown', async (e) => {
            if (!counselingNameSuggestions || counselingNameSuggestions.classList.contains('hidden')) return;
            const items = counselingNameSuggestions.querySelectorAll('.name-search-item');
            if (items.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeNameIndex = (activeNameIndex + 1) % items.length;
                updateActiveNameHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeNameIndex = (activeNameIndex - 1 + items.length) % items.length;
                updateActiveNameHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const indexToSelect = activeNameIndex >= 0 ? activeNameIndex : 0;
                if (items[indexToSelect]) {
                    selectNameItem(items[indexToSelect]);
                }
            } else if (e.key === 'Escape') {
                counselingNameSuggestions.classList.add('hidden');
            } else if (e.key === 'Tab') {
                const indexToSelect = activeNameIndex >= 0 ? activeNameIndex : 0;
                if (items[indexToSelect]) {
                    selectNameItem(items[indexToSelect]);
                }
            }
        });
    }

    function updateActiveNameHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === activeNameIndex) {
                item.classList.add('bg-indigo-50', 'dark:bg-slate-700', 'text-indigo-800', 'dark:text-white');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('bg-indigo-50', 'dark:bg-slate-700', 'text-indigo-800', 'dark:text-white');
            }
        });
    }

    async function selectNameItem(item) {
        const { id, name, church, parish, district, category, bs } = item.dataset;
        if (counselingName) counselingName.value = name;
        if (counselingMemberId) counselingMemberId.value = id;
        if (counselingNameSuggestions) counselingNameSuggestions.classList.add('hidden');
        if (newMemberBadgeContainer) newMemberBadgeContainer.classList.add('hidden');
        // 소속/성별 자동 채우기
        if (category) setGroupBtn('categoryBtnGroup', 'counselingCategory', category);
        if (bs) setGroupBtn('bsBtnGroup', 'counselingBs', bs);
        if (church && church !== '교회정보없음') {
            await loadChurches();
            if (counselingChurchInput) counselingChurchInput.value = church;
            const matchedChurch = allChurches.find(c => c.name.trim() === church.trim());
            const churchId = matchedChurch ? matchedChurch.id : null;
            if (counselingChurchId) counselingChurchId.value = churchId || '';
            if (churchId) {
                await loadParishes(churchId);
                setTimeout(async () => {
                    if (parish && parish !== '교구정보없음' && counselingParish) {
                        counselingParish.value = parish;
                        const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;
                        if (parishId) {
                            await loadDistricts(parishId);
                            setTimeout(() => {
                                if (district && district !== '구역정보없음' && counselingDistrict) counselingDistrict.value = district;
                            }, 300);
                        }
                    }
                }, 300);
            }
        }
        // Move focus to next input
        if (counselingChurchInput) {
            counselingChurchInput.focus();
        }
    }

    if (counselingNameSuggestions) {
        counselingNameSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.name-search-item');
            if (!item) return;
            selectNameItem(item);
        });
    }

    document.addEventListener('click', (e) => {
        if (counselingName && counselingNameSuggestions && !counselingName.contains(e.target) && !counselingNameSuggestions.contains(e.target)) {
            counselingNameSuggestions.classList.add('hidden');
        }
        if (counselingChurchInput && counselingChurchSuggestions && !counselingChurchInput.contains(e.target) && !counselingChurchSuggestions.contains(e.target)) {
            counselingChurchSuggestions.classList.add('hidden');
        }
    });

    if (saveNewCounselingBtn) {
        saveNewCounselingBtn.addEventListener('click', async () => {
            const name = counselingName ? counselingName.value.trim() : '';
            const memberId = counselingMemberId ? counselingMemberId.value : '';
            const church = counselingChurchInput ? counselingChurchInput.value.trim() : '';
            const parish = counselingParish ? counselingParish.value : '';
            const district = counselingDistrict ? counselingDistrict.value : '';
            const date = document.getElementById('counselingDate').value;
            const content = document.getElementById('counselingMemoContent').value.trim();
            const remark_memo = document.getElementById('counselingRemark').value.trim();
            const lead_target = document.getElementById('counselingLeadTarget')?.value.trim() || '';
            const tagsValue = document.getElementById('counselingTagsValue').value;
            const category = document.getElementById('counselingCategory').value;
            const bs = document.getElementById('counselingBs').value;
            const member_status = document.getElementById('counselingMemberStatus').value;
            const counseling_method = document.getElementById('counselingMethod')?.value || '대면';

            if (!name) return alert('상담 대상자 이름을 입력하세요.');
            if (!date) return alert('상담 날짜를 입력하세요.');
            if (!content) return alert('상담 내용을 입력하세요.');

            saveNewCounselingBtn.disabled = true;
            saveNewCounselingBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 저장 중...';

            try {
                const res = await fetch('/api/counseling', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        member_id: memberId ? parseInt(memberId) : null,
                        name, date, content,
                        tags: tagsValue || null,
                        remark_memo: remark_memo || null,
                        lead_target: lead_target || null,
                        church: church || null,
                        parish: parish || null,
                        district: district || null,
                        category: category || null,
                        bs: bs || null,
                        member_status: member_status || 'member',
                        counseling_method: counseling_method || '대면'
                    })
                });

                if (!res.ok) throw new Error('상담 기록 저장 실패');
                closeNewCounseling();
                loadStatus();
            } catch (err) {
                console.error(err);
                alert('상담 기록 저장 중 오류가 발생했습니다.');
            } finally {
                saveNewCounselingBtn.disabled = false;
                saveNewCounselingBtn.innerHTML = '<i class="fa-solid fa-check"></i> 상담 저장하기';
            }
        });
    }


    // 성도 정보 수정(#memberAddModal)은 공용 member-edit.js가 전담.
    // 기존엔 여기서 축소판 모달(#counselEditMemberModal, 8개 필드만)을 썼으나
    // 다른 화면과 동일한 전체 기능(교회/교구/구역, 가족연결, 인적사항 기록)으로 통일함.
    if (window.MemberEditModule) {
        window.MemberEditModule.init({
            getMember: () => currentMemberData,
            setMember: (m) => { currentMemberData = m; },
            refreshList: () => { if (typeof loadStatus === 'function') loadStatus(); },
            refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
        });
    }

    // ──────────────────────────────────────────────────
    // 대시보드 업데이트 & 접기/펼치기 토글 로직
    // ──────────────────────────────────────────────────

    // 태그 탭 상태
    let dashTagTab = 'member'; // 'member' | 'evangelism'
    let dashTagData = { member: [], evangelism: [] };
    let trendChartInstance = null;
    let trendMonthly = { member: {}, evangelism: {} }; // 전체 세션을 'YYYY-MM'으로 집계 (allStatus 기준)
    let trendYears = []; // 데이터가 있는 연도(오름차순)

    // 전역 연도 필터에 따라 추이 그래프를 렌더링
    //  - 특정 연도: 그 해 1~12월
    //  - 전체 년도(''): 연도별 합계
    function renderTrend() {
        const titleEl = document.getElementById('trendTitleYear');
        if (filterYear) {
            if (titleEl) titleEl.textContent = `${filterYear}년`;
            const months = [];
            for (let m = 1; m <= 12; m++) months.push(`${filterYear}-${String(m).padStart(2, '0')}`);
            renderTrendChart(
                months,
                months.map(m => trendMonthly.member[m] || 0),
                months.map(m => trendMonthly.evangelism[m] || 0)
            );
        } else {
            if (titleEl) titleEl.textContent = '전체';
            const years = trendYears;
            const sumYear = (grp, y) => Object.keys(trendMonthly[grp])
                .filter(ym => ym.substring(0, 4) === y)
                .reduce((acc, ym) => acc + trendMonthly[grp][ym], 0);
            renderTrendChart(
                years.map(y => `${y}-01`),
                years.map(y => sumYear('member', y)),
                years.map(y => sumYear('evangelism', y)),
                years.map(y => `${y}년`)
            );
        }
    }

    function renderTopTags() {
        const renderList = (tab, containerId) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            const list = dashTagData[tab] || [];
            if (list.length === 0) {
                container.innerHTML = `<p class="text-slate-400 italic text-[11px] text-center py-6">주제 정보가 없습니다.</p>`;
                return;
            }
            const maxCount = list[0].count || 1;
            const barColor = tab === 'member' ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-orange-500 dark:bg-orange-400';
            const countColor = tab === 'member' ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400';
            const tagColor = tab === 'member' ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400';
            container.innerHTML = list.slice(0, 10).map(item => {
                const pct = Math.round((item.count / maxCount) * 100);
                return `
                    <div class="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" onclick="openTagDetailsModal('${item.tag}', '${tab}')">
                        <span class="${tagColor} font-extrabold text-[11px] w-20 shrink-0 truncate" title="#${item.tag}">#${item.tag}</span>
                        <div class="flex-1 min-w-0 bg-slate-100 dark:bg-slate-800/80 h-2 rounded-full overflow-hidden">
                            <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${pct}%; min-width: 4px;"></div>
                        </div>
                        <span class="${countColor} font-black text-[11px] w-8 text-right shrink-0">${item.count}건</span>
                    </div>
                `;
            }).join('');
        };

        renderList('member', 'topTagsMemberContainer');
        renderList('evangelism', 'topTagsEvangelismContainer');
    }

    window.openTagDetailsModal = function(tag, status) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = `#${tag}`;
            applyFilters();
            
            // 모든 검색 결과 카드의 상담 이력을 자동으로 펼침
            document.querySelectorAll('.counseling-person-card').forEach(card => {
                const wrapper = card.querySelector('.member-sessions-wrapper');
                if (wrapper) {
                    wrapper.classList.remove('hidden');
                    wrapper.querySelectorAll('.specific-session-container').forEach(c => c.classList.remove('hidden'));
                }
                const icon = card.querySelector('.fa-chevron-down');
                if (icon) {
                    icon.style.transform = 'rotate(180deg)';
                }
            });

            // 필터/검색 영역으로 스크롤 이동
            const filtersDiv = searchInput.closest('div').parentElement;
            if (filtersDiv) {
                filtersDiv.scrollIntoView({ behavior: 'smooth' });
            }
        }
    };

    function renderTrendChart(months, memberData, evData, labelsOverride) {
        const ctx = document.getElementById('counselingTrendChart')?.getContext('2d');
        if (!ctx) return;

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        const isDark = document.documentElement.classList.contains('dark');
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        trendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labelsOverride || months.map(m => {
                    const [y, mm] = m.split('-');
                    return `${parseInt(mm)}월`;
                }),
                datasets: [
                    {
                        label: '성도 상담',
                        data: memberData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#3b82f6',
                        pointRadius: 3.5,
                        tension: 0.35,
                        fill: true
                    },
                    {
                        label: '전도대상 상담',
                        data: evData,
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        borderWidth: 2.5,
                        pointBackgroundColor: '#f59e0b',
                        pointRadius: 3.5,
                        tension: 0.35,
                        fill: true
                    }
                ]
            },
            options: {
                onClick: (event, elements) => {
                    const chart = trendChartInstance;
                    const activePoints = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true);
                    if (activePoints && activePoints.length > 0) {
                        const index = activePoints[0].index;
                        const clickedYm = months[index];
                        if (clickedYm) {
                            filterYearMonth = clickedYm;
                            applyFilters();
                            const searchInput = document.getElementById('searchInput');
                            if (searchInput) {
                                const filtersDiv = searchInput.closest('div').parentElement;
                                if (filtersDiv) {
                                    filtersDiv.scrollIntoView({ behavior: 'smooth' });
                                }
                            }
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    const chart = trendChartInstance;
                    const points = chart.getElementsAtEventForMode(event, 'index', { intersect: false }, true);
                    event.native.target.style.cursor = (points && points.length > 0) ? 'pointer' : 'default';
                },
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor,
                            boxWidth: 12,
                            font: { weight: 'bold', size: 10 }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { weight: 'bold', size: 10 } }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { weight: 'bold', size: 10 },
                            stepSize: 1,
                            precision: 0
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    function updateDashboard(data) {
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        if (!data || data.length === 0) {
            setEl('totalHeaderCount', '0');
            setEl('monthlyHeaderCount', '0');
            setEl('memberTargetRatioText', '성도 0명 / 전도 0명');
            setEl('memberGenderRatioText', '형제 0명 / 자매 0명');
            setEl('evangelismGenderRatioText', '남자 0명 / 여자 0명');
            setEl('churchRatioText', '서울중앙 0명 / 타교회 0명');
            setEl('counselingMethodRatioText', '대면 0건 / 전화 0건');
            ['memberRatioBar','targetRatioBar','memberBrotherRatioBar','memberSisterRatioBar',
             'evangelismMaleRatioBar','evangelismFemaleRatioBar','seoulChurchRatioBar','otherChurchRatioBar',
             'memberBongsaRatioBar','memberEomeoniRatioBar','memberCheongnyeonRatioBar','memberEunjangRatioBar','memberUnknownRatioBar',
             'evangelismBongsaRatioBar','evangelismEomeoniRatioBar','evangelismCheongnyeonRatioBar','evangelismEunjangRatioBar','evangelismUnknownRatioBar',
             'methodFaceRatioBar', 'methodPhoneRatioBar'
            ].forEach(id => {
                const el = document.getElementById(id); if (el) { el.style.width = '0%'; el.textContent = ''; }
            });
            if (trendChartInstance) {
                trendChartInstance.destroy();
                trendChartInstance = null;
            }
            dashTagData = { member: [], evangelism: [] };
            renderTopTags();
            return;
        }

        const now = new Date();
        const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        let totalCount = 0, monthlyCount = 0;
        let memberTotalCount = 0, memberMonthlyCount = 0;
        let evTotalCount = 0, evMonthlyCount = 0;
        data.forEach(member => {
            const isMember = member.member_status !== 'evangelism';
            const sessions = Array.isArray(member.all_sessions) ? member.all_sessions : [];
            sessions.forEach(s => {
                totalCount++;
                if (isMember) memberTotalCount++;
                else evTotalCount++;

                if (s.date && s.date.startsWith(currentYM)) {
                    monthlyCount++;
                    if (isMember) memberMonthlyCount++;
                    else evMonthlyCount++;
                }
            });
        });

        setEl('totalHeaderCount', `${totalCount}`);
        setEl('monthlyHeaderCount', `${monthlyCount}`);

        // 헤더 버튼 타이틀 속성에 툴팁 제공
        const btnFilterTotal = document.getElementById('btnFilterTotal');
        if (btnFilterTotal) btnFilterTotal.title = `성도 ${memberTotalCount}건 / 전도대상 ${evTotalCount}건`;
        const btnFilterMonthly = document.getElementById('btnFilterMonthly');
        if (btnFilterMonthly) btnFilterMonthly.title = `성도 ${memberMonthlyCount}건 / 전도대상 ${evMonthlyCount}건`;

        // 2. 성도 vs 전도대상 인원 수 및 비율
        const totalPeople = data.length || 1;
        const memberCount = data.filter(s => s.member_status !== 'evangelism').length;
        const targetCount = totalPeople - memberCount;
        const memberPct = Math.round((memberCount / totalPeople) * 100);
        const targetPct = 100 - memberPct;

        setEl('memberTargetRatioText', `성도 ${memberCount}명 / 전도 ${targetCount}명`);

        const updateRatioBar = (id, pct, label) => {
            const bar = document.getElementById(id);
            if (bar) {
                bar.style.width = `${pct}%`;
                bar.textContent = pct >= 12 ? `${label} ${pct}%` : (pct >= 8 ? `${pct}%` : '');
            }
        };
        updateRatioBar('memberRatioBar', memberPct, '성도');
        updateRatioBar('targetRatioBar', targetPct, '전도대상');

        // 3. 성도 성별 (형제 vs 자매)
        const memberBrothers = data.filter(s => s.member_status !== 'evangelism' && s.bs === 'B').length;
        const memberSisters = memberCount - memberBrothers;
        const memberBroPct = memberCount > 0 ? Math.round((memberBrothers / memberCount) * 100) : 0;
        const memberSisPct = memberCount > 0 ? 100 - memberBroPct : 0;
        setEl('memberGenderRatioText', `형제 ${memberBrothers}명 / 자매 ${memberSisters}명`);
        updateRatioBar('memberBrotherRatioBar', memberBroPct, '형제');
        updateRatioBar('memberSisterRatioBar', memberSisPct, '자매');

        // 4. 전도대상 성별 (남자 vs 여자)
        const evMales = data.filter(s => s.member_status === 'evangelism' && s.bs === 'B').length;
        const evFemales = targetCount - evMales;
        const evMalePct = targetCount > 0 ? Math.round((evMales / targetCount) * 100) : 0;
        const evFemalePct = targetCount > 0 ? 100 - evMalePct : 0;
        setEl('evangelismGenderRatioText', `남자 ${evMales}명 / 여자 ${evFemales}명`);
        updateRatioBar('evangelismMaleRatioBar', evMalePct, '남자');
        updateRatioBar('evangelismFemaleRatioBar', evFemalePct, '여자');

        // 5. 서울중앙 vs 타교회/모름
        const seoulCount = data.filter(s => s.church === '서울중앙교회').length;
        const otherCount = totalPeople - seoulCount;
        const seoulPct = Math.round((seoulCount / totalPeople) * 100);
        const otherPct = 100 - seoulPct;

        setEl('churchRatioText', `서울중앙 ${seoulCount}명 / 타교회 ${otherCount}명`);
        updateRatioBar('seoulChurchRatioBar', seoulPct, '서울중앙');
        updateRatioBar('otherChurchRatioBar', otherPct, '타교회/모름');

        // 5-2. 대면 vs 전화상담 현황 — "사람(명)" 기준으로 집계
        // (다른 분포들과 동일하게 인원수 기준으로 통일. 한 사람이 대면+전화 둘 다 있으면 양쪽 모두에 카운팅)
        let faceCount = 0;
        let phoneCount = 0;
        data.forEach(m => {
            const sessions = Array.isArray(m.all_sessions) ? m.all_sessions : [];
            const hasFace = sessions.some(sess => sess.counseling_method === '대면');
            const hasPhone = sessions.some(sess => sess.counseling_method === '전화');
            if (hasFace) faceCount++;
            if (hasPhone) phoneCount++;
        });
        // 비율은 전체 인원 대비(대면만 or 전화만 진행한 비율)로 표시
        const totalForMethod = totalPeople || 1;
        const facePct = Math.round((faceCount / totalForMethod) * 100);
        const phonePct = Math.round((phoneCount / totalForMethod) * 100);
        setEl('counselingMethodRatioText', `대면 ${faceCount}명 / 전화 ${phoneCount}명`);
        updateRatioBar('methodFaceRatioBar', facePct, '대면');
        updateRatioBar('methodPhoneRatioBar', phonePct, '전화');

        // 6. 성도 및 전도대상 각각의 소속회 분포 계산
        const memberCat = { '봉사회': 0, '어머니회': 0, '청년회': 0, '은장회': 0, '모름': 0 };
        const evCat = { '봉사회': 0, '어머니회': 0, '청년회': 0, '은장회': 0, '모름': 0 };
        let memberTotal = 0;
        let evTotal = 0;

        data.forEach(s => {
            const isMember = s.member_status !== 'evangelism';
            const cat = s.category || '모름';
            const normalizedCat = ['봉사회', '어머니회', '청년회', '은장회'].includes(cat) ? cat : '모름';
            if (isMember) {
                memberCat[normalizedCat]++;
                memberTotal++;
            } else {
                evCat[normalizedCat]++;
                evTotal++;
            }
        });

        const updateStackedBar = (prefix, counts, total) => {
            const denom = total || 1;
            const cats = ['Bongsa', 'Eomeoni', 'Cheongnyeon', 'Eunjang', 'Unknown'];
            const labels = ['봉사회', '어머니회', '청년회', '은장회', '모름'];
            const keys = ['봉사회', '어머니회', '청년회', '은장회', '모름'];
            
            cats.forEach((c, idx) => {
                const count = counts[keys[idx]] || 0;
                const pct = Math.round((count / denom) * 100);
                const bar = document.getElementById(`${prefix}${c}RatioBar`);
                if (bar) {
                    bar.style.width = `${pct}%`;
                    bar.textContent = pct >= 18 ? `${labels[idx].substring(0,2)} ${pct}%` : (pct >= 8 ? `${pct}%` : '');
                    bar.title = `${labels[idx]}: ${count}명 (${pct}%)`;
                }
            });
        };
        updateStackedBar('member', memberCat, memberTotal);
        updateStackedBar('evangelism', evCat, evTotal);
        
        setEl('memberCategoryRatioText', `성도 총 ${memberTotal}명`);
        setEl('evangelismCategoryRatioText', `전도대상 총 ${evTotal}명`);

        // 성도 및 전도대상의 상담주제 태그 실시간 집계
        const memberTagCounts = {}, evangelismTagCounts = {};
        data.forEach(m => {
            const isMember = m.member_status !== 'evangelism';
            const bucket = isMember ? memberTagCounts : evangelismTagCounts;
            const sessions = Array.isArray(m.all_sessions) ? m.all_sessions : [];
            sessions.forEach(s => {
                if (!s.tags) return;
                s.tags.split(/\s+/).filter(t => t.startsWith('#')).forEach(t => {
                    const tag = t.substring(1);
                    if (tag) bucket[tag] = (bucket[tag] || 0) + 1;
                });
            });
        });

        const toSorted = obj => Object.entries(obj).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
        dashTagData = { member: toSorted(memberTagCounts), evangelism: toSorted(evangelismTagCounts) };
        renderTopTags();

        // 6. 월별 추이 데이터 계산 — 그래프는 항상 '전체 데이터(allStatus)'를 기준으로 집계하고,
        //    보여주는 범위(특정 연도 / 전체 연도별)는 filterYear로 renderTrend()에서 결정한다.
        trendMonthly = { member: {}, evangelism: {} };
        const yearSet = new Set();
        (allStatus || []).forEach(member => {
            const isMember = member.member_status !== 'evangelism';
            const group = isMember ? 'member' : 'evangelism';
            const sessions = Array.isArray(member.all_sessions) ? member.all_sessions : [];
            sessions.forEach(s => {
                if (!s.date) return;
                const ym = s.date.substring(0, 7); // "YYYY-MM"
                if (!/^\d{4}-\d{2}$/.test(ym)) return;
                trendMonthly[group][ym] = (trendMonthly[group][ym] || 0) + 1;
                yearSet.add(s.date.substring(0, 4));
            });
        });
        trendYears = Array.from(yearSet).sort((a, b) => a.localeCompare(b)); // 오름차순 (x축)

        renderTrend();
    }

    // 필터링 적용 시 대시보드 그래프 외 기타 상담주제 등의 수치만 갱신하기 위한 함수
    function updateDashboardStatisticsOnly(data) {
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        // 1. 성도 및 전도대상의 상담주제 태그 실시간 집계
        const memberTagCounts = {}, evangelismTagCounts = {};
        data.forEach(m => {
            const isMember = m.member_status !== 'evangelism';
            const bucket = isMember ? memberTagCounts : evangelismTagCounts;
            const sessions = Array.isArray(m.all_sessions) ? m.all_sessions : [];
            sessions.forEach(s => {
                if (!s.tags) return;
                s.tags.split(/\s+/).filter(t => t.startsWith('#')).forEach(t => {
                    const tag = t.substring(1);
                    if (tag) bucket[tag] = (bucket[tag] || 0) + 1;
                });
            });
        });

        const toSorted = obj => Object.entries(obj).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
        dashTagData = { member: toSorted(memberTagCounts), evangelism: toSorted(evangelismTagCounts) };
        renderTopTags();
    }


    // 대시보드 접기/펼치기 토글
    const toggleDashboardBtn = document.getElementById('toggleDashboardBtn');
    const counselingDashboard = document.getElementById('counselingDashboard');
    const dashboardToggleText = document.getElementById('dashboardToggleText');
    const dashboardToggleIcon = document.getElementById('dashboardToggleIcon');

    if (toggleDashboardBtn && counselingDashboard) {
        // 초기 상태 로드
        const isCollapsed = localStorage.getItem('counseling_dashboard_collapsed') === 'true';
        if (isCollapsed) {
            counselingDashboard.style.display = 'none';
            const trendCard = document.getElementById('counselingTrendCard');
            if (trendCard) trendCard.style.display = 'none';
            if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 펼치기';
            if (dashboardToggleIcon) {
                dashboardToggleIcon.classList.remove('fa-chevron-up');
                dashboardToggleIcon.classList.add('fa-chevron-down');
            }
        }

        toggleDashboardBtn.addEventListener('click', () => {
            const isCurrentlyHidden = counselingDashboard.style.display === 'none';
            const trendCard = document.getElementById('counselingTrendCard');
            if (!isCurrentlyHidden) {
                counselingDashboard.style.display = 'none';
                if (trendCard) trendCard.style.display = 'none';
                if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 펼치기';
                if (dashboardToggleIcon) {
                    dashboardToggleIcon.classList.remove('fa-chevron-up');
                    dashboardToggleIcon.classList.add('fa-chevron-down');
                }
                localStorage.setItem('counseling_dashboard_collapsed', 'true');
            } else {
                counselingDashboard.style.display = '';
                if (trendCard) trendCard.style.display = '';
                if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 접기';
                if (dashboardToggleIcon) {
                    dashboardToggleIcon.classList.remove('fa-chevron-down');
                    dashboardToggleIcon.classList.add('fa-chevron-up');
                }
                localStorage.setItem('counseling_dashboard_collapsed', 'false');
            }
        });
    }

    // 당월 상담 / 누적 상담 필터 카드 이벤트 바인딩
    const pageFilterMonthlyBtn = document.getElementById('btnFilterMonthly');
    const pageFilterTotalBtn = document.getElementById('btnFilterTotal');
    if (pageFilterMonthlyBtn) {
        pageFilterMonthlyBtn.addEventListener('click', () => {
            const now = new Date();
            const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            if (filterYearMonth === ym) {
                filterYearMonth = null;
            } else {
                filterYearMonth = ym;
            }
            applyFilters();
        });
    }
    if (pageFilterTotalBtn) {
        pageFilterTotalBtn.addEventListener('click', () => {
            filterYearMonth = null;
            applyFilters();
        });
    }

    // 분포 차트 클릭 시 실시간 필터 적용 이벤트 헬퍼
    const setupRatioToggle = (elementId, barIds, getFilterVal, setFilterFn) => {
        const wrapper = document.getElementById(elementId);
        if (!wrapper) return;

        wrapper.addEventListener('click', (e) => {
            const bar = e.target.closest('[id$="Bar"]');
            if (!bar) return;

            const isClickedBar = barIds.includes(bar.id);
            if (!isClickedBar) return;

            const clickedVal = getFilterVal(bar.id);
            
            // setFilterFn의 결과값(현재 필터가 활성화 상태인지 해제 상태인지)을 확인
            const activeVal = setFilterFn(clickedVal);

            // 시각적 피드백 효과를 위해 wrapper 내부의 바들에 스타일 적용
            barIds.forEach(id => {
                const b = document.getElementById(id);
                if (b) {
                    if (activeVal && b.id === bar.id) {
                        b.style.boxShadow = '0 0 0 2.5px rgba(99, 102, 241, 0.95)';
                        b.style.zIndex = '10';
                    } else {
                        b.style.boxShadow = 'none';
                        b.style.zIndex = '1';
                    }
                }
            });

            applyFilters();
        });
    };

    // 1. 성도 vs 전도대상 토글 필터
    setupRatioToggle('btnFilterMemberStatus', ['memberRatioBar', 'targetRatioBar'], 
        (id) => id === 'memberRatioBar' ? 'member' : 'evangelism',
        (val) => {
            const isSame = filterMemberStatus === val;
            filterMemberStatus = isSame ? null : val;
            if (isSame) {
                document.getElementById('memberRatioBar').style.boxShadow = 'none';
                document.getElementById('targetRatioBar').style.boxShadow = 'none';
            }
            return filterMemberStatus;
        }
    );

    // 2. 성도 성별 토글 필터
    setupRatioToggle('btnFilterMemberGender', ['memberBrotherRatioBar', 'memberSisterRatioBar'],
        (id) => id === 'memberBrotherRatioBar' ? 'B' : 'S',
        (val) => {
            const isSame = filterMemberGender === val;
            filterMemberGender = isSame ? null : val;
            if (isSame) {
                document.getElementById('memberBrotherRatioBar').style.boxShadow = 'none';
                document.getElementById('memberSisterRatioBar').style.boxShadow = 'none';
            }
            return filterMemberGender;
        }
    );

    // 3. 전도대상 성별 토글 필터
    setupRatioToggle('btnFilterEvangelismGender', ['evangelismMaleRatioBar', 'evangelismFemaleRatioBar'],
        (id) => id === 'evangelismMaleRatioBar' ? 'B' : 'S',
        (val) => {
            const isSame = filterEvangelismGender === val;
            filterEvangelismGender = isSame ? null : val;
            if (isSame) {
                document.getElementById('evangelismMaleRatioBar').style.boxShadow = 'none';
                document.getElementById('evangelismFemaleRatioBar').style.boxShadow = 'none';
            }
            return filterEvangelismGender;
        }
    );

    // 4. 서울중앙 vs 타교회 토글 필터
    setupRatioToggle('btnFilterChurch', ['seoulChurchRatioBar', 'otherChurchRatioBar'],
        (id) => id === 'seoulChurchRatioBar' ? 'seoul' : 'other',
        (val) => {
            const isSame = filterChurch === val;
            filterChurch = isSame ? null : val;
            if (isSame) {
                document.getElementById('seoulChurchRatioBar').style.boxShadow = 'none';
                document.getElementById('otherChurchRatioBar').style.boxShadow = 'none';
            }
            return filterChurch;
        }
    );

    // 5. 성도 소속회 토글 필터
    const memberCatBarIds = ['memberBongsaRatioBar', 'memberEomeoniRatioBar', 'memberCheongnyeonRatioBar', 'memberEunjangRatioBar', 'memberUnknownRatioBar'];
    const memberCatKeys = ['봉사회', '어머니회', '청년회', '은장회', '모름'];
    setupRatioToggle('btnFilterMemberCategory', memberCatBarIds,
        (id) => {
            const idx = memberCatBarIds.indexOf(id);
            return memberCatKeys[idx];
        },
        (val) => {
            const isSame = filterMemberCategory === val;
            filterMemberCategory = isSame ? null : val;
            if (isSame) {
                memberCatBarIds.forEach(id => {
                    const b = document.getElementById(id);
                    if (b) b.style.boxShadow = 'none';
                });
            }
            return filterMemberCategory;
        }
    );

    // 6. 전도대상 소속회 토글 필터
    const evCatBarIds = ['evangelismBongsaRatioBar', 'evangelismEomeoniRatioBar', 'evangelismCheongnyeonRatioBar', 'evangelismEunjangRatioBar', 'evangelismUnknownRatioBar'];
    const evCatKeys = ['봉사회', '어머니회', '청년회', '은장회', '모름'];
    setupRatioToggle('btnFilterEvangelismCategory', evCatBarIds,
        (id) => {
            const idx = evCatBarIds.indexOf(id);
            return evCatKeys[idx];
        },
        (val) => {
            const isSame = filterEvangelismCategory === val;
            filterEvangelismCategory = isSame ? null : val;
            if (isSame) {
                evCatBarIds.forEach(id => {
                    const b = document.getElementById(id);
                    if (b) b.style.boxShadow = 'none';
                });
            }
            return filterEvangelismCategory;
        }
    );

    // 7. 대면 vs 전화상담 토글 필터
    setupRatioToggle('btnFilterCounselingMethod', ['methodFaceRatioBar', 'methodPhoneRatioBar'],
        (id) => id === 'methodFaceRatioBar' ? '대면' : '전화',
        (val) => {
            const isSame = filterCounselingMethod === val;
            filterCounselingMethod = isSame ? null : val;
            if (isSame) {
                document.getElementById('methodFaceRatioBar').style.boxShadow = 'none';
                document.getElementById('methodPhoneRatioBar').style.boxShadow = 'none';
            }
            return filterCounselingMethod;
        }
    );
});
