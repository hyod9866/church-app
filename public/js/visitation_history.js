document.addEventListener('DOMContentLoaded', () => {

    // ──────────────────────────────────────────────────
    // 심방 태그 프리셋 관리 (상담관리의 CounselingTagManager와 동일한 방식이지만,
    // 심방 전용 설정 키(visitation_member_tags / visitation_evangelism_tags)로 서버(/api/settings)에 저장한다.
    // 2026-08-29 심방관리 UI를 상담관리와 동일한 구조로 개편하면서 신설.
    // ──────────────────────────────────────────────────
    const VisitationTagManager = {
        cache: { memberTags: null, evangelismTags: null },
        defaultMemberTags: ['안부', '기도제목', '가정사', '신앙상담', '건강', '직장', '자녀문제', '축복기도', '구원상담', '전도'],
        defaultEvangelismTags: ['안부', '복음전도', '기도제목', '가정사', '건강', '구원초청', '생활고민', '관계형성'],
        async getMemberTags() {
            try {
                const res = await fetch('/api/settings/visitation_member_tags');
                const { value } = await res.json();
                this.cache.memberTags = (Array.isArray(value) && value.length) ? value : this.defaultMemberTags;
            } catch (e) {
                console.error(e);
                if (!this.cache.memberTags) this.cache.memberTags = this.defaultMemberTags;
            }
            return this.cache.memberTags;
        },
        async getEvangelismTags() {
            try {
                const res = await fetch('/api/settings/visitation_evangelism_tags');
                const { value } = await res.json();
                this.cache.evangelismTags = (Array.isArray(value) && value.length) ? value : this.defaultEvangelismTags;
            } catch (e) {
                console.error(e);
                if (!this.cache.evangelismTags) this.cache.evangelismTags = this.defaultEvangelismTags;
            }
            return this.cache.evangelismTags;
        },
        async saveMemberTags(tags) {
            this.cache.memberTags = tags;
            try {
                await fetch('/api/settings/visitation_member_tags', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: tags })
                });
            } catch (e) { console.error(e); }
            window.dispatchEvent(new CustomEvent('visitationTagsUpdated'));
        },
        async saveEvangelismTags(tags) {
            this.cache.evangelismTags = tags;
            try {
                await fetch('/api/settings/visitation_evangelism_tags', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: tags })
                });
            } catch (e) { console.error(e); }
            window.dispatchEvent(new CustomEvent('visitationTagsUpdated'));
        }
    };
    window.VisitationTagManager = VisitationTagManager;

    function getDynamicTagsSync(status) {
        return status === 'evangelism'
            ? (VisitationTagManager.cache.evangelismTags || VisitationTagManager.defaultEvangelismTags)
            : (VisitationTagManager.cache.memberTags || VisitationTagManager.defaultMemberTags);
    }

    // 미리 태그 로딩
    VisitationTagManager.getMemberTags();
    VisitationTagManager.getEvangelismTags();

    window.addEventListener('visitationTagsUpdated', () => {
        const status = document.getElementById('visitationMemberStatus')?.value || 'member';
        if (typeof updateVisitationPresetTags === 'function') updateVisitationPresetTags(status);
    });

    function cleanSystemTags(text) {
        if (!text) return '';
        return text.replace(/\[lead:\s*.*?\]/g, '').replace(/\s+/g, ' ').trim();
    }

    // 인도대상 / 모임 / 특징을 해시태그 칩으로 렌더링 (상담관리와 동일 규칙)
    //  - @이름  → 인도대상 (클릭 시 해당 인물 이력 열림, 앰버 칩)
    //  - #무엇  → 모임/특징 (회색 칩)
    function buildLeadChips(leadTarget, size) {
        const raw = (leadTarget || '').trim();
        if (!raw) return '';
        const px = size === 'md' ? 'text-[10px] px-2' : 'text-[9px] px-1.5';
        const tokens = raw.split(/\s+/).filter(Boolean);
        return tokens.map(tok => {
            if (tok.startsWith('@')) {
                const name = tok.slice(1).trim();
                if (!name) return '';
                if (name === '구원받음') {
                    return `<span class="${px} py-0.5 rounded border font-black bg-pink-50 dark:bg-pink-950/20 text-pink-600 dark:text-pink-400 border-pink-200/80 dark:border-pink-900/50">🩷 ${name}</span>`;
                }
                const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return `<span class="${px} py-0.5 rounded border font-black cursor-pointer hover:underline bg-amber-50 dark:bg-amber-955/20 text-amber-800 dark:text-amber-350 border-amber-200/80 dark:border-amber-900/50" onclick="event.stopPropagation(); openMemberHistoryModalByName('${safe}')">🤝 ${name}</span>`;
            }
            const name = tok.startsWith('#') ? tok.slice(1).trim() : tok.trim();
            if (!name) return '';
            return `<span class="${px} py-0.5 rounded border font-bold bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-450 border-slate-200 dark:border-slate-700/60">#${name}</span>`;
        }).filter(Boolean).join(' ');
    }

    function renderTagBadge(tagsStr, memberStatus) {
        if (!tagsStr || !tagsStr.trim()) return '';
        const tags = tagsStr.trim().split(/\s+/).filter(t => t.startsWith('#'));
        if (!tags.length) return '';
        const isEv = memberStatus === 'evangelism';
        const cls = isEv
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-700/40'
            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200/60 dark:border-blue-700/40';
        return `<div class="flex flex-wrap gap-1 mt-1.5">${tags.map(t =>
            `<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${cls} border">${t}</span>`
        ).join('')}</div>`;
    }

    const visitationList = document.getElementById('visitationList');
    const districtFilter = document.getElementById('districtFilter');
    const sortOption = document.getElementById('sortOption');
    const visitationCount = document.getElementById('visitationCount');

    let allStatus = [];
    let currentMemberData = null;

    // ──────────────────────────────────────────────────
    // 목록 로드 & 필터링 (신규 /api/visitation 사용 — 상담관리와 동일한 구조)
    // ──────────────────────────────────────────────────
    async function loadStatus() {
        try {
            const response = await fetch('/api/visitation?_t=' + Date.now(), { cache: 'no-store' });
            allStatus = await response.json();
            applyFilters();
        } catch (error) {
            console.error('Error loading visitation status:', error);
            if (visitationList) visitationList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const district = districtFilter ? districtFilter.value : '전체';
        const sort = sortOption ? sortOption.value : 'last_visitation';
        const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

        let filtered = allStatus.filter(s => {
            // 1. 구역 필터링
            if (district !== '전체') {
                const memberDistNum = String(s.district || '').replace(/[^0-9]/g, '');
                const filterDistNum = String(district).replace(/[^0-9]/g, '');
                if (memberDistNum !== filterDistNum || memberDistNum === '') return false;
            }

            // 2. 통합 검색 필터링
            if (query) {
                const nameMatch = (s.name || '').toLowerCase().includes(query);
                const dateMatch = (s.last_visitation_date || '').includes(query);
                const sermonMatch = (s.last_visitation_sermon || '').toLowerCase().includes(query);
                const contentMatch = (s.last_visitation_content || '').toLowerCase().includes(query);
                const tagsMatch = (s.last_visitation_tags || '').toLowerCase().includes(query);
                const positionMatch = (s.position || '').toLowerCase().includes(query);
                const categoryMatch = (s.category || '').toLowerCase().includes(query);
                const districtTextMatch = (s.district || '').toLowerCase().includes(query);
                const searchSessions = Array.isArray(s.all_sessions) ? s.all_sessions : [];
                const leadMatch = searchSessions.some(sess => (sess.lead_target || '').toLowerCase().includes(query));

                if (!nameMatch && !dateMatch && !sermonMatch && !contentMatch && !tagsMatch && !positionMatch && !categoryMatch && !districtTextMatch && !leadMatch) {
                    return false;
                }
            }

            return true;
        });

        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'last_visitation') {
                if (!a.last_visitation_date) return 1;
                if (!b.last_visitation_date) return -1;
                return new Date(b.last_visitation_date) - new Date(a.last_visitation_date);
            }
            if (sort === 'oldest') {
                if (!a.last_visitation_date) return -1;
                if (!b.last_visitation_date) return 1;
                return new Date(a.last_visitation_date) - new Date(b.last_visitation_date);
            }
            if (sort === 'count') return b.visitation_count - a.visitation_count;
            return 0;
        });

        renderList(filtered);
    }

    // ── 심방 주제 태그 표시 헬퍼는 위쪽 renderTagBadge / buildLeadChips 참고 ──

    // ── 인라인 수정 편집기를 리스트의 심방 세션 카드에 주입 ──────────────────────
    function attachInlineEditToCard(card, loadStatusFn) {
        const editBtn = card.querySelector('.edit-visit-session-btn');
        if (!editBtn) return;
        editBtn.addEventListener('click', () => {
            if (card.querySelector('.visit-edit-textarea-sermon')) return;
            const sessionId = card.dataset.sessionId;
            const memberId = card.dataset.memberId;
            const currentDate = card.dataset.date || '';
            const currentTags = card.dataset.tags || '';
            const currentStatus = card.dataset.memberStatus || 'member';
            const currentMemo = card.dataset.remarkMemo || '';
            const currentLeadTarget = card.dataset.leadTarget || '';
            const currentCategory = card.dataset.category || '모름';
            const currentBs = card.dataset.bs || '';
            const currentSermon = card.dataset.sermonContent || '';
            const currentCounsel = card.dataset.counselingContent || '';

            const bodyArea = card.querySelector('.visit-session-body');

            const memberTags = getDynamicTagsSync('member');
            const evangelismTags = getDynamicTagsSync('evangelism');

            if (bodyArea) bodyArea.innerHTML = `
                <div class="flex flex-col gap-2 w-full mt-2">
                    <div class="flex gap-4">
                        <div class="flex-1">
                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">심방 날짜</label>
                            <input type="date" class="visit-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                        </div>
                        <div class="flex-1">
                            <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">대상자 상태</label>
                            <div class="inline-edit-status-group flex gap-1">
                                <button type="button" data-status="member" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">성도</button>
                                <button type="button" data-status="evangelism" class="inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentStatus === 'evangelism' ? 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400' : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">전도대상</button>
                            </div>
                            <input type="hidden" class="visit-edit-status" value="${currentStatus}">
                        </div>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/50 space-y-2 mt-1">
                        <div>
                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">소속</span>
                            <div class="inline-edit-category-group flex flex-wrap gap-1">
                                ${['봉사회', '청년회', '어머니회', '은장회', '모름'].map(c => `
                                    <button type="button" data-category="${c}" class="inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${currentCategory === c ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${c}</button>
                                `).join('')}
                            </div>
                            <input type="hidden" class="visit-edit-category" value="${currentCategory}">
                        </div>
                        <div>
                            <span class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">성별</span>
                            <div class="inline-edit-bs-group flex gap-1">
                                <button type="button" data-bs="B" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'B' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}">${currentStatus === 'evangelism' ? '남자' : '형제'}</button>
                                <button type="button" data-bs="S" class="inline-edit-bs-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${currentBs === 'S' ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'}">${currentStatus === 'evangelism' ? '여자' : '자매'}</button>
                            </div>
                            <input type="hidden" class="visit-edit-bs" value="${currentBs}">
                        </div>
                    </div>
                    <div class="edit-tags-container bg-blue-50/30 dark:bg-blue-950/10 rounded-xl p-3 border border-blue-100/50 dark:border-blue-900/20 mt-1">
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">심방 주제 태그</label>
                        <div class="edit-tags-presets flex flex-wrap gap-1 mb-2"></div>
                        <div class="flex gap-1 items-center mb-2">
                            <input type="text" class="inline-custom-tag-input flex-1 border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="직접 태그 입력...">
                            <button type="button" class="inline-add-tag-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-700 text-blue-650 dark:text-blue-300 border border-blue-200 dark:border-blue-700 whitespace-nowrap">+ 추가</button>
                        </div>
                        <div class="inline-tags-preview flex flex-wrap gap-1 min-h-[16px]"></div>
                        <input type="hidden" class="visit-edit-tags" value="${currentTags}">
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">설교 내용</label>
                        <textarea class="visit-edit-textarea-sermon w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="3">${currentSermon}</textarea>
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 내용</label>
                        <textarea class="visit-edit-textarea-counsel w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="3">${currentCounsel}</textarea>
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">인도대상 / 모임</label>
                        <input type="text" class="visit-edit-lead-target w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentLeadTarget}" placeholder="@인도대상 #모임 #특징 (여러 개 가능)">
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">비고 / 기타 메모</label>
                        <input type="text" class="visit-edit-memo w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentMemo}" placeholder="비고 및 특이사항 입력...">
                    </div>
                    <div class="flex justify-end gap-1.5 mt-1">
                        <button type="button" class="save-visit-btn bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                        <button type="button" class="cancel-visit-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
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
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60';
                    return `<button type="button" data-tag="${t}" class="inline-edit-tag-btn px-2 py-0.5 rounded text-[10px] font-bold transition-all ${cls}">${t}</button>`;
                }).join('');
            }

            function updateInlineTags() {
                const tagsVal = Array.from(activeTags).map(t => `#${t}`).join(' ');
                bodyArea.querySelector('.visit-edit-tags').value = tagsVal;
                const preview = bodyArea.querySelector('.inline-tags-preview');
                preview.innerHTML = Array.from(activeTags).map(t => `
                    <span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-600 text-white" data-tag="${t}">
                        #${t}<button type="button" class="inline-remove-tag-btn hover:text-blue-200 font-bold ml-1 leading-none">&times;</button>
                    </span>`).join('');
                bodyArea.querySelectorAll('.inline-edit-tag-btn').forEach(b => {
                    const t = b.dataset.tag;
                    if (activeTags.has(t)) {
                        b.classList.add('bg-blue-600', 'text-white', 'border-blue-600'); b.classList.remove('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400');
                    } else {
                        b.classList.remove('bg-blue-600', 'text-white', 'border-blue-600'); b.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400');
                    }
                });
            }
            updateEditPresetTags(selectedStatus);
            updateInlineTags();

            bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    selectedStatus = btn.dataset.status;
                    bodyArea.querySelector('.visit-edit-status').value = selectedStatus;
                    bodyArea.querySelectorAll('.inline-edit-status-btn').forEach(b => {
                        const bStatus = b.dataset.status;
                        const isActive = bStatus === selectedStatus;
                        b.className = `inline-edit-status-btn flex-1 py-1 rounded text-[10px] font-bold border transition-all ${
                            isActive
                                ? (bStatus === 'member' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800/60 dark:text-emerald-400 ring-2 ring-offset-1 ring-emerald-400' : 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-950/30 dark:border-orange-800/60 dark:text-orange-400 ring-2 ring-offset-1 ring-orange-400')
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-350'
                        }`;
                    });
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

            bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const newCat = btn.dataset.category;
                    bodyArea.querySelector('.visit-edit-category').value = newCat;
                    bodyArea.querySelectorAll('.inline-edit-category-btn').forEach(b => {
                        const isActive = b.dataset.category === newCat;
                        b.className = `inline-edit-category-btn px-2 py-0.5 rounded text-[10px] font-bold border transition-all ${
                            isActive ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-650 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                        }`;
                    });
                });
            });

            bodyArea.querySelectorAll('.inline-edit-bs-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const newBs = btn.dataset.bs;
                    bodyArea.querySelector('.visit-edit-bs').value = newBs;
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

            bodyArea.querySelector('.cancel-visit-btn').addEventListener('click', () => loadStatusFn());
            bodyArea.querySelector('.save-visit-btn').addEventListener('click', async () => {
                const newDate = bodyArea.querySelector('.visit-edit-date').value;
                const newSermon = bodyArea.querySelector('.visit-edit-textarea-sermon').value.trim();
                const newCounsel = bodyArea.querySelector('.visit-edit-textarea-counsel').value.trim();
                const newTags = bodyArea.querySelector('.visit-edit-tags').value.trim();
                const newStatus = bodyArea.querySelector('.visit-edit-status').value;
                const newMemo = bodyArea.querySelector('.visit-edit-memo').value.trim();
                const newLeadTarget = bodyArea.querySelector('.visit-edit-lead-target').value.trim();
                if (!newDate) return alert('날짜를 입력해주세요.');
                if (!newSermon && !newCounsel) return alert('설교 내용 또는 상담 내용 중 하나는 입력해주세요.');
                const saveBtn = bodyArea.querySelector('.save-visit-btn');
                saveBtn.disabled = true; saveBtn.textContent = '저장중...';
                const newCategory = bodyArea.querySelector('.visit-edit-category').value;
                const newBs = bodyArea.querySelector('.visit-edit-bs').value;
                try {
                    const res = await fetch(`/api/visitation/${sessionId}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            date: newDate,
                            sermon_content: newSermon,
                            counseling_content: newCounsel,
                            tags: newTags,
                            member_status: newStatus,
                            remark_memo: newMemo,
                            lead_target: newLeadTarget,
                            category: newCategory,
                            bs: newBs,
                            member_id: parseInt(memberId)
                        })
                    });
                    if (res.ok) { loadStatusFn(); } else { alert('수정에 실패했습니다.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; }
                } catch (err) { console.error(err); alert('서버 오류로 인해 실패했습니다.'); saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            });
        });

        const delBtn = card.querySelector('.delete-visit-session-btn');
        if (delBtn) {
            delBtn.addEventListener('click', async () => {
                const sessionId = card.dataset.sessionId;
                if (!sessionId) return;
                if (confirm('정말 이 심방 기록을 영구 삭제하시겠습니까?')) {
                    try {
                        const res = await fetch(`/api/visitation/${sessionId}`, { method: 'DELETE' });
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
        const memberBadge = isEv
            ? `<span class="text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200/60">전도대상</span>`
            : '';
        const tagsHtml = renderTagBadge(session.tags || '', session.member_status);
        const latestLabel = isLatest ? `<span class="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded">최근</span>` : '';
        const sessionLeadHtml = buildLeadChips(session.lead_target, 'sm');

        return `
            <div class="visit-session-card mt-2 p-2.5 bg-gray-50 dark:bg-[#0B0F19] rounded-lg border border-gray-100 dark:border-slate-800 text-xs relative"
                 data-session-id="${session.session_id || ''}"
                 data-member-id="${memberId}"
                 data-date="${session.date || ''}"
                 data-tags="${session.tags || ''}"
                 data-member-status="${session.member_status || 'member'}"
                 data-lead-target="${session.lead_target || ''}"
                 data-remark-memo="${session.remark_memo || ''}"
                 data-category="${category}"
                 data-bs="${bs}"
                 data-sermon-content="${(session.sermon_content || '').replace(/"/g, '&quot;')}"
                 data-counseling-content="${(session.counseling_content || '').replace(/"/g, '&quot;')}">
                <div class="flex items-center flex-wrap gap-1.5 mb-1 pr-20">
                    ${latestLabel}
                    <span class="font-bold text-blue-600 dark:text-blue-400">${session.date || ''}</span>
                    ${memberBadge}
                    ${sessionLeadHtml}
                </div>
                <div class="absolute right-2 top-2 flex gap-1.5">
                    <button type="button" class="edit-visit-session-btn text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                        <i class="fa-regular fa-pen-to-square"></i> 수정
                    </button>
                    <button type="button" class="delete-visit-session-btn text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 transition-colors flex items-center gap-0.5 cursor-pointer">
                        <i class="fa-regular fa-trash-can"></i> 삭제
                    </button>
                </div>
                <div class="visit-session-body">
                    ${tagsHtml}
                    ${session.sermon_content ? `<div class="visit-sermon-text text-slate-800 dark:text-slate-250 font-black mt-1 pr-10">📖 설교: ${session.sermon_content}</div>` : ''}
                    ${session.counseling_content ? `<div class="visit-counsel-text text-slate-800 dark:text-slate-250 font-black mt-1 pr-10">💬 상담: ${session.counseling_content}</div>` : ''}
                    ${session.remark_memo && cleanSystemTags(session.remark_memo) ? `<div class="visit-remark-text bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-350 p-2.5 rounded-lg border border-slate-200/60 dark:border-slate-800/60 text-[11px] font-bold mt-2">📌 비고: ${cleanSystemTags(session.remark_memo)}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ── 사람별 심방 이력 접기/펼치기 ─────────────────────────────────────
    window.toggleMemberSessions = function(btn) {
        const card = btn.closest('.visitation-person-card');
        const wrapper = card.querySelector('.member-sessions-wrapper');
        const icon = btn.querySelector('i');
        if (!wrapper) return;

        const containers = wrapper.querySelectorAll('.specific-session-container');
        const anyHidden = Array.from(containers).some(c => c.classList.contains('hidden')) || wrapper.classList.contains('hidden');

        if (anyHidden) {
            wrapper.classList.remove('hidden');
            containers.forEach(c => c.classList.remove('hidden'));
            if (icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        } else {
            wrapper.classList.add('hidden');
            containers.forEach(c => c.classList.add('hidden'));
            if (icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
        }
    };

    window.toggleSpecificSession = function(btn, sessionId) {
        const card = btn.closest('.visitation-person-card');
        const wrapper = card.querySelector('.member-sessions-wrapper');
        if (!wrapper) return;

        wrapper.classList.remove('hidden');
        const targetContainer = wrapper.querySelector(`.specific-session-container[data-session-id="${sessionId}"]`);
        if (targetContainer) targetContainer.classList.toggle('hidden');

        const visibleContainers = wrapper.querySelectorAll('.specific-session-container:not(.hidden)');
        if (visibleContainers.length === 0) wrapper.classList.add('hidden');

        const totalContainers = wrapper.querySelectorAll('.specific-session-container');
        const icon = card.querySelector('button[onclick^="toggleMemberSessions"] i');
        if (icon) {
            if (visibleContainers.length === totalContainers.length) {
                icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up');
            } else {
                icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down');
            }
        }
    };

    function renderList(data) {
        if (visitationCount) visitationCount.textContent = `총 ${data.length}명 심방 대상자`;

        if (!visitationList) return;
        if (data.length === 0) {
            visitationList.innerHTML = '<p class="text-gray-500 dark:text-slate-400 text-center py-20 font-medium">심방 이력이 존재하는 대상자가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        visitationList.innerHTML = data.map(member => {
            const sessions = Array.isArray(member.all_sessions) ? member.all_sessions : [];
            const latestSession = sessions[0] || null;

            let daysDiffHtml = '';
            if (latestSession && latestSession.date) {
                const lastDate = new Date(latestSession.date);
                lastDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                daysDiffHtml = `<span class="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-blue-650 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-900/40 font-bold">${daysDiff}일 전(최근 심방)</span>`;
            }

            const allSessionsHtml = sessions.map(s => `
                <div class="specific-session-container hidden" data-session-id="${s.session_id}">
                    ${renderSessionCard(s, member, sessions[0] === s)}
                </div>
            `).join('');

            const parts = [];
            const churchName = member.church || '';
            const parishName = member.parish || '';
            const districtName = member.district || '';

            if (churchName && churchName !== '서울중앙교회') parts.push(churchName);

            const hasParish = parishName && !parishName.includes('정보없음') && parishName !== '교구 미지정';
            const hasDistrict = districtName && !districtName.includes('정보없음') && districtName !== '구역 미정';

            if (hasParish && hasDistrict) {
                const pText = parishName.includes('교구') ? parishName : parishName + '교구';
                const dText = districtName.includes('구역') ? districtName : districtName + '구역';
                parts.push(`${pText} ${dText}`);
            } else if (churchName && !parts.includes(churchName)) {
                parts.push(churchName);
            }

            if (member.category) parts.push(member.category);

            const isEv = (member.member_status === 'evangelism');
            let bsLabel = '';
            if (member.bs === 'B') bsLabel = isEv ? '남자' : '형제';
            else if (member.bs === 'S') bsLabel = isEv ? '여자' : '자매';
            if (bsLabel) parts.push(bsLabel);

            const displayInfoText = parts.join(' · ');

            const latestLeadTarget = latestSession && latestSession.lead_target ? latestSession.lead_target : '';
            const leadTargetHtml = buildLeadChips(latestLeadTarget, 'md');

            const hasSessions = sessions.length > 0;
            const toggleButtonHtml = hasSessions ? `
                <button type="button" onclick="toggleMemberSessions(this)" class="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer focus:outline-none flex items-center justify-center w-5 h-5">
                    <i class="fa-solid fa-chevron-down transition-transform duration-200 text-sm"></i>
                </button>
            ` : '';

            const dateButtonsHtml = sessions.length > 0 ? `
                <div class="flex gap-1.5 flex-wrap mt-1.5 items-center">
                    <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 mr-0.5">심방이력:</span>
                    ${sessions.map(s => `
                        <button type="button" onclick="toggleSpecificSession(this, '${s.session_id}')" class="px-2 py-0.5 rounded text-[10px] font-bold border border-blue-100 dark:border-slate-800 bg-blue-50/60 dark:bg-slate-800/60 text-blue-650 dark:text-slate-350 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-600 dark:hover:text-white transition-colors cursor-pointer">
                            ${s.date}
                        </button>
                    `).join('')}
                </div>
            ` : '';

            const isEvangelismTarget = (latestSession && latestSession.member_status === 'evangelism') || (member.member_status === 'evangelism');
            const nameColorClass = isEvangelismTarget
                ? 'text-orange-600 dark:text-orange-400 italic font-black'
                : 'text-blue-650 dark:text-blue-400 font-black';

            return `
                <div class="visitation-person-card bg-white dark:bg-[#131B2E] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex items-start p-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors ${nameColorClass}">${member.name}</span>
                            ${toggleButtonHtml}
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded font-bold">${displayInfoText}</span>
                            ${leadTargetHtml}
                            ${daysDiffHtml}
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${dateButtonsHtml}
                        <div class="member-sessions-wrapper w-full mt-2 hidden">
                            ${allSessionsHtml}
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 심방 <span class="text-blue-600 dark:text-blue-400 font-black">${member.visitation_count}</span>회</div>
                        <div class="flex flex-col gap-1">
                            <button onclick="openNewVisitationWithMember('${member.name}', ${member.id}, '${member.category || ''}', '${member.bs || ''}')"
                                    class="bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                추가 심방 등록
                            </button>
                            <button onclick="deleteMemberAllVisitation('${member.name}', ${member.id})"
                                    class="border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-rose-600 hover:text-white dark:hover:bg-rose-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                심방 이력 전체 삭제
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        visitationList.querySelectorAll('.visit-session-card').forEach(card => {
            attachInlineEditToCard(card, loadStatus);
        });
    }

    window.deleteMemberAllVisitation = async function(name, memberId) {
        const msg = `${name} 성도의 모든 심방 기록(달력 일정 포함)이 영구 삭제되며, 심방 목록에서 완전히 제외됩니다.\n\n정말 삭제하시겠습니까?`;
        if (confirm(msg)) {
            try {
                const res = await fetch(`/api/visitation/member/${memberId}`, { method: 'DELETE' });
                if (res.ok) { loadStatus(); } else { alert('전체 삭제에 실패했습니다.'); }
            } catch (err) {
                console.error(err);
                alert('서버 오류로 인해 삭제에 실패했습니다.');
            }
        }
    };

    if (districtFilter) districtFilter.addEventListener('change', applyFilters);
    if (sortOption) sortOption.addEventListener('change', applyFilters);
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', applyFilters);

    // ──────────────────────────────────────────────────
    // Member Detail Modal (심방/상담/출석/인적사항 4개 탭)
    // ──────────────────────────────────────────────────
    const RECORD_STATUS_MAP = {
        'DISTRICT': '구역 변경',
        'CATEGORY': '소속 변경',
        'POSITION': '직분 임명',
        'POSITION_DISMISS': '직분 면직',
        'SERVICE': '봉사 임무',
        'SERVICE_DISMISS': '봉사 면직',
        'FELLOWSHIP': '교제 상태',
        'TRANSFER': '전입/전출 (메모)',
        'CHURCH_IN': '교회 전입',
        'CHURCH_MOVE': '교회 이동',
        'PARISH_MOVE': '교구 이동',
        'COUNSELING': '상담',
        'ETC': '기타'
    };

    window.openMemberHistoryModal = async function(id) {
        try {
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="visitation"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const res = await fetch(`/api/members/${id}/history`);
            const { member, history, family, leaderProfile } = await res.json();
            currentMemberData = member;

            const recRes = await fetch(`/api/members/${id}/records`);
            const records = await recRes.json();

            // 심방 기록 탭 (own type — 상담관리의 자기 탭과 동일하게 수정/삭제 지원)
            const visitRes = await fetch(`/api/visitation/${id}`);
            const visitSessions = await visitRes.json();

            // 상담 기록 탭 (달력 기반 + 레거시 병합 — counseling_history.js와 동일 소스)
            const counselingRes = await fetch(`/api/counseling/${id}`);
            const counselingSessions = await counselingRes.json();

            // Calculate current position and service from history records
            let calculatedPosArray = [];
            let calculatedSvcArray = [];

            const todayStr = new Date().toISOString().split('T')[0];
            [...records].filter(rec => rec.date <= todayStr).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(rec => {
                if (rec.status === 'POSITION') {
                    const newPos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
                    calculatedPosArray = Array.from(new Set([...calculatedPosArray, ...newPos]));
                } else if (rec.status === 'POSITION_DISMISS') {
                    const cleanedRemark = rec.remark.replace(/\[면직\]\s*|면직\s*/g, '');
                    const removePos = cleanedRemark.split(',').map(p => p.trim()).filter(p => p);
                    calculatedPosArray = calculatedPosArray.filter(p => !removePos.includes(p));
                } else if (rec.status === 'SERVICE') {
                    const newSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
                    calculatedSvcArray = Array.from(new Set([...calculatedSvcArray, ...newSvc]));
                } else if (rec.status === 'SERVICE_DISMISS') {
                    const cleanedRemark = rec.remark.replace(/\[면직\]\s*|면직\s*/g, '');
                    const removeSvc = cleanedRemark.split(',').map(s => s.trim()).filter(s => s);
                    calculatedSvcArray = calculatedSvcArray.filter(s => !removeSvc.includes(s));
                }
            });

            const finalCalculatedSvc = calculatedSvcArray.length ? calculatedSvcArray.join(', ') : '없음';

            const memberBasicInfo = document.getElementById('memberBasicInfo');
            if (memberBasicInfo) {
                memberBasicInfo.innerHTML = window.renderMemberProfileHeader(member, family, calculatedPosArray, finalCalculatedSvc);
            }

            // Attendance History (공용 member-profile.js가 규칙+화면을 모두 그림)
            window.renderAttendanceTab(id, member, history, leaderProfile);

            // 심방 기록 탭
            const visitList = document.getElementById('visitationMemoList');
            if (visitList) {
                if (visitSessions.length) {
                    visitList.innerHTML = visitSessions.map(s => renderSessionCard(s, member.id, false)).join('');
                    visitList.querySelectorAll('.visit-session-card').forEach(card => {
                        attachInlineEditToCard(card, () => openMemberHistoryModal(id));
                    });
                } else {
                    visitList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">심방 기록이 없습니다.</p>';
                }
            }

            // 상담 기록 탭 (counseling_history.js와 동일한 인라인 수정 UX)
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
                        const leadTarget = s.lead_target || '';
                        let sessionLeadHtml = '';
                        if (leadTarget) {
                            const isHash = leadTarget.startsWith('#');
                            const cleanName = isHash ? leadTarget.slice(1).trim() : leadTarget;
                            if (isHash) {
                                sessionLeadHtml = `<span class="text-[9px] bg-amber-50 dark:bg-amber-955/20 text-amber-800 dark:text-amber-350 px-1.5 py-0.5 rounded border border-amber-200/80 dark:border-amber-900/50 font-black cursor-pointer hover:underline" onclick="event.stopPropagation(); openMemberHistoryModalByName('${cleanName}')">🤝 인도대상: ${cleanName}</span>`;
                            } else {
                                sessionLeadHtml = `<span class="text-[9px] bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-450 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60 font-bold">🤝 모임: ${cleanName}</span>`;
                            }
                        }

                        return `
                            <div class="counsel-card bg-indigo-50 dark:bg-[#131B2E] border border-indigo-100 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col gap-2" data-session-id="${s.session_id}" data-member-id="${id}" data-tags="${s.tags || ''}" data-member-status="${s.member_status || 'member'}" data-remark-memo="${s.remark_memo || ''}" data-lead-target="${s.lead_target || ''}">
                                <div class="text-xs font-black text-indigo-800 dark:text-indigo-400 border-b dark:border-slate-800 pb-1.5 flex justify-between items-center">
                                    <div class="flex items-center gap-2">
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
                                        const res = await fetch(`/api/counseling/${sessionId}`, { method: 'DELETE' });
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

                            const memberTags = ['전도상담', '구원확신/의심', '진로', '이성', '죄', '자녀', '부부관계', '가족', '성경질문', '이단', '직장생활', '결혼'];
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
                                        <input type="text" class="counsel-edit-lead-target w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" value="${currentLeadTarget}" placeholder="#이름 또는 모임명 입력...">
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

                            updateModalPresetTags(selectedStatus);
                            updateModalEditTags();

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
                                    updateModalPresetTags(selectedStatus);
                                    updateModalEditTags();
                                });
                            });

                            bodyArea.querySelector('.edit-tags-presets').addEventListener('click', (ev) => {
                                const btn = ev.target.closest('.inline-edit-tag-btn');
                                if (!btn) return;
                                const tag = btn.dataset.tag;
                                if (activeTags.has(tag)) { activeTags.delete(tag); } else { activeTags.add(tag); }
                                updateModalEditTags();
                            });

                            const addTagBtn = bodyArea.querySelector('.inline-add-tag-btn');
                            const customInput = bodyArea.querySelector('.inline-custom-tag-input');
                            const performAddCustomTag = () => {
                                let val = customInput.value.trim();
                                if (!val) return;
                                if (val.startsWith('#')) val = val.substring(1);
                                if (val) { activeTags.add(val); customInput.value = ''; updateModalEditTags(); }
                            };

                            addTagBtn.addEventListener('click', performAddCustomTag);
                            customInput.addEventListener('keydown', (ev) => {
                                if (ev.key === 'Enter') { ev.preventDefault(); performAddCustomTag(); }
                            });

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
                                    const res = await fetch(`/api/counseling/${sessionId}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ date: newDate, content: newContent, tags: newTags, member_status: selectedStatus, member_id: parseInt(memberId) })
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

            // Personal Records (수직 타임라인 디자인 적용)
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
                                if (status === 'POSITION') {
                                    colorClass = 'bg-emerald-500'; iconClass = 'fa-award'; textBg = 'bg-emerald-50 text-emerald-805 border-emerald-100/50';
                                } else if (status === 'POSITION_DISMISS') {
                                    colorClass = 'bg-rose-500'; iconClass = 'fa-user-slash'; textBg = 'bg-rose-50 text-rose-805 border-rose-100/50';
                                } else if (status === 'SERVICE') {
                                    colorClass = 'bg-teal-500'; iconClass = 'fa-hand-holding-heart'; textBg = 'bg-teal-50 text-teal-805 border-teal-100/50';
                                } else if (status === 'SERVICE_DISMISS') {
                                    colorClass = 'bg-orange-500'; iconClass = 'fa-times-circle'; textBg = 'bg-orange-50/70 text-orange-850 border-orange-100/50';
                                } else if (status.includes('MOVE') || status.includes('IN') || status === 'TRANSFER') {
                                    colorClass = 'bg-blue-500'; iconClass = 'fa-route'; textBg = 'bg-blue-50 text-blue-855 border-blue-100/50';
                                } else if (status === 'FELLOWSHIP') {
                                    colorClass = 'bg-amber-500'; iconClass = 'fa-users'; textBg = 'bg-amber-50 text-amber-805 border-amber-100/50';
                                }

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

    // 성도 정보 수정(#memberAddModal)은 공용 member-edit.js가 전담.
    if (window.MemberEditModule) {
        window.MemberEditModule.init({
            getMember: () => currentMemberData,
            setMember: (m) => { currentMemberData = m; },
            refreshList: () => { if (typeof loadStatus === 'function') loadStatus(); },
            refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
        });
    }

    // 상담/심방 기록의 "인도대상" 태그 클릭 시 그 사람 상세정보로 이동
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

    // 탭 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.member-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');

            document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
            const targetTab = btn.dataset.tab;
            const targetContent = document.getElementById(`tabContent_${targetTab}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const closeHistoryModal = document.getElementById('closeHistoryModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    if (closeHistoryModal) closeHistoryModal.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    if (closeHistoryModalBtn) closeHistoryModalBtn.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));

    loadStatus();

    // ──────────────────────────────────────────────────
    // 새 심방 등록 모달 로직 (상담관리의 새 상담 등록 모달과 동일한 패턴)
    // ──────────────────────────────────────────────────
    const newVisitationModal = document.getElementById('newVisitationModal');
    const openNewVisitationBtn = document.getElementById('openNewVisitationBtn');
    const closeNewVisitationModal = document.getElementById('closeNewVisitationModal');
    const cancelNewVisitationBtn = document.getElementById('cancelNewVisitationBtn');
    const saveNewVisitationBtn = document.getElementById('saveNewVisitationBtn');

    const visitationName = document.getElementById('visitationName');
    const visitationNameSuggestions = document.getElementById('visitationNameSuggestions');
    const visitationMemberId = document.getElementById('visitationMemberId');
    const newVisitationMemberBadgeContainer = document.getElementById('newVisitationMemberBadgeContainer');

    const visitationChurchId = document.getElementById('visitationChurchId');
    const visitationChurchInput = document.getElementById('visitationChurchInput');
    const visitationChurchSuggestions = document.getElementById('visitationChurchSuggestions');
    const visitationParish = document.getElementById('visitationParish');
    const visitationDistrict = document.getElementById('visitationDistrict');

    let allChurches = [];
    let selectedVisitationTags = new Set();

    function updateVisitationPresetTags(status) {
        const btnGroup = document.getElementById('visitationTagsBtnGroup');
        if (!btnGroup) return;
        const tags = getDynamicTagsSync(status);
        btnGroup.innerHTML = tags.map(t => {
            const isSelected = selectedVisitationTags.has(t);
            const activeClasses = 'bg-blue-600 text-white border-blue-600 dark:bg-blue-600';
            const inactiveClasses = 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60';
            const cls = isSelected ? activeClasses : inactiveClasses;
            return `<button type="button" data-tag="${t}" class="visit-tag-btn px-2.5 py-1 rounded-lg text-[11px] font-bold hover:bg-blue-600 hover:text-white hover:border-blue-600 dark:hover:bg-blue-600 dark:hover:text-white transition-all ${cls}">#${t}</button>`;
        }).join('');

        const bsBtnB = document.querySelector('#visitationBsBtnGroup button[data-val="B"]');
        const bsBtnS = document.querySelector('#visitationBsBtnGroup button[data-val="S"]');
        if (bsBtnB && bsBtnS) {
            if (status === 'evangelism') { bsBtnB.textContent = '남자'; bsBtnS.textContent = '여자'; }
            else { bsBtnB.textContent = '형제'; bsBtnS.textContent = '자매'; }
        }
    }

    function updateVisitationTagsPreview() {
        const preview = document.getElementById('visitationSelectedTagsPreview');
        const hiddenInput = document.getElementById('visitationTagsValue');
        if (!preview || !hiddenInput) return;

        if (selectedVisitationTags.size === 0) {
            preview.innerHTML = '';
            hiddenInput.value = '';
            return;
        }

        const tagsArr = Array.from(selectedVisitationTags);
        hiddenInput.value = tagsArr.map(t => `#${t}`).join(' ');
        preview.innerHTML = tagsArr.map(t => `
            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-600 text-white">
                #${t}
                <button type="button" onclick="removeVisitationTag('${t}')" class="hover:text-blue-200 transition-colors leading-none">&times;</button>
            </span>
        `).join('');
    }

    window.removeVisitationTag = function(tag) {
        selectedVisitationTags.delete(tag);
        document.querySelectorAll('.visit-tag-btn').forEach(btn => {
            if (btn.dataset.tag === tag) {
                btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600', 'dark:bg-blue-600');
                btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400');
            }
        });
        updateVisitationTagsPreview();
    };

    document.getElementById('visitationTagsBtnGroup')?.addEventListener('click', e => {
        const btn = e.target.closest('.visit-tag-btn');
        if (!btn) return;
        const tag = btn.dataset.tag;
        if (selectedVisitationTags.has(tag)) {
            selectedVisitationTags.delete(tag);
            btn.classList.remove('bg-blue-600', 'text-white', 'border-blue-600', 'dark:bg-blue-600');
            btn.classList.add('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400');
        } else {
            selectedVisitationTags.add(tag);
            btn.classList.add('bg-blue-600', 'text-white', 'border-blue-600', 'dark:bg-blue-600');
            btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-blue-600', 'dark:text-blue-400');
        }
        updateVisitationTagsPreview();
    });

    document.getElementById('addVisitationCustomTagBtn')?.addEventListener('click', () => {
        const input = document.getElementById('visitationTagCustomInput');
        const val = (input.value || '').trim().replace(/^#+/, '');
        if (!val) return;
        selectedVisitationTags.add(val);
        input.value = '';
        updateVisitationTagsPreview();
    });
    document.getElementById('visitationTagCustomInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addVisitationCustomTagBtn')?.click(); }
    });

    function initVisitationGroupBtns(groupId, hiddenId) {
        const group = document.getElementById(groupId);
        if (!group) return;
        group.addEventListener('click', e => {
            const btn = e.target.closest('button[data-val]');
            if (!btn) return;
            group.querySelectorAll('button[data-val]').forEach(b => {
                b.className = b.className
                    .replace(/border-blue-\S+/g, '')
                    .replace(/border-emerald-\S+/g, '')
                    .replace(/border-orange-\S+/g, '')
                    .replace(/border-pink-\S+/g, '')
                    .replace(/text-blue-\S+/g, '')
                    .replace(/text-emerald-\S+/g, '')
                    .replace(/text-orange-\S+/g, '')
                    .replace(/text-pink-\S+/g, '')
                    .replace(/bg-blue-\S+/g, '')
                    .replace(/bg-emerald-\S+/g, '')
                    .replace(/bg-orange-\S+/g, '')
                    .replace(/bg-pink-\S+/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                b.classList.remove('ring-2', 'ring-offset-1', 'ring-blue-400', 'ring-emerald-400', 'ring-orange-400', 'ring-pink-400');
                b.classList.add('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
            });
            btn.classList.remove('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
            btn.classList.add('ring-2', 'ring-offset-1');
            if (groupId === 'visitationBsBtnGroup') {
                const isB = btn.dataset.val === 'B';
                btn.classList.add(isB ? 'border-blue-500' : 'border-pink-400', isB ? 'text-blue-700' : 'text-pink-700', isB ? 'dark:text-blue-300' : 'dark:text-pink-300', isB ? 'bg-blue-50' : 'bg-pink-50', isB ? 'dark:bg-blue-950/30' : 'dark:bg-pink-950/30', isB ? 'ring-blue-400' : 'ring-pink-400');
            } else if (groupId === 'visitationMemberStatusBtnGroup') {
                const isMember = btn.dataset.val === 'member';
                btn.classList.add(isMember ? 'border-emerald-400' : 'border-orange-400', isMember ? 'text-emerald-700' : 'text-orange-700', isMember ? 'dark:text-emerald-300' : 'dark:text-orange-300', isMember ? 'bg-emerald-50' : 'bg-orange-50', isMember ? 'dark:bg-emerald-950/30' : 'dark:bg-orange-950/30', isMember ? 'ring-emerald-400' : 'ring-orange-400');
                updateVisitationPresetTags(btn.dataset.val);
            } else {
                btn.classList.add('border-blue-400', 'text-blue-700', 'dark:text-blue-300', 'bg-blue-50', 'dark:bg-blue-950/30', 'ring-blue-400');
            }
            const hidden = document.getElementById(hiddenId);
            if (hidden) hidden.value = btn.dataset.val;
        });
    }

    initVisitationGroupBtns('visitationCategoryBtnGroup', 'visitationCategory');
    initVisitationGroupBtns('visitationBsBtnGroup', 'visitationBs');
    initVisitationGroupBtns('visitationMemberStatusBtnGroup', 'visitationMemberStatus');

    function setVisitationGroupBtn(groupId, hiddenId, val) {
        const group = document.getElementById(groupId);
        if (!group) return;
        const btn = group.querySelector(`button[data-val="${val}"]`);
        if (btn) btn.click();
        const hidden = document.getElementById(hiddenId);
        if (hidden) hidden.value = val;
    }

    function resetVisitationModal() {
        document.getElementById('newVisitationForm')?.reset();
        if (visitationMemberId) visitationMemberId.value = '';
        if (visitationChurchId) visitationChurchId.value = '';
        if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.add('hidden');
        if (visitationNameSuggestions) visitationNameSuggestions.classList.add('hidden');
        if (visitationChurchSuggestions) visitationChurchSuggestions.classList.add('hidden');
        document.getElementById('visitationDate').value = new Date().toISOString().split('T')[0];
        if (visitationParish) { visitationParish.innerHTML = '<option value="">교구 선택</option>'; visitationParish.disabled = true; }
        if (visitationDistrict) { visitationDistrict.innerHTML = '<option value="">구역 선택</option>'; visitationDistrict.disabled = true; }

        selectedVisitationTags = new Set();
        updateVisitationTagsPreview();

        document.querySelectorAll('.visitation-category-btn, .visitation-bs-btn, .visitation-member-status-btn').forEach(btn => {
            btn.classList.remove('ring-2', 'ring-offset-1', 'border-blue-400', 'text-blue-700', 'dark:text-blue-300', 'bg-blue-50', 'dark:bg-blue-950/30', 'ring-blue-400', 'border-pink-400', 'text-pink-700', 'dark:text-pink-300', 'bg-pink-50', 'dark:bg-pink-950/30', 'ring-pink-400', 'border-emerald-400', 'text-emerald-700', 'dark:text-emerald-300', 'bg-emerald-50', 'dark:bg-emerald-950/30', 'ring-emerald-400', 'border-orange-400', 'text-orange-700', 'dark:text-orange-300', 'bg-orange-50', 'dark:bg-orange-950/30', 'ring-orange-400');
            btn.classList.add('border-slate-200', 'dark:border-slate-600', 'bg-white', 'dark:bg-slate-700', 'text-slate-600', 'dark:text-slate-300');
        });
        document.getElementById('visitationCategory').value = '';
        document.getElementById('visitationBs').value = '';
        document.getElementById('visitationMemberStatus').value = 'member';
        const memberBtn = document.querySelector('#visitationMemberStatusBtnGroup button[data-val="member"]');
        if (memberBtn) memberBtn.click();
        updateVisitationPresetTags('member');
    }

    window.openNewVisitationWithMember = (memberName, memberId, category, bs) => {
        resetVisitationModal();
        setTimeout(async () => {
            if (visitationName) visitationName.value = memberName;
            if (visitationMemberId) visitationMemberId.value = memberId;
            if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.add('hidden');
            if (category) setVisitationGroupBtn('visitationCategoryBtnGroup', 'visitationCategory', category);
            if (bs) setVisitationGroupBtn('visitationBsBtnGroup', 'visitationBs', bs);

            const targetMember = allStatus.find(s => s.id === memberId);
            if (targetMember) {
                const isMember = targetMember.member_status !== 'evangelism';
                setVisitationGroupBtn('visitationMemberStatusBtnGroup', 'visitationMemberStatus', isMember ? 'member' : 'evangelism');
            }

            if (targetMember && targetMember.church && targetMember.church !== '교회정보없음') {
                if (visitationChurchInput) visitationChurchInput.value = targetMember.church;
                const matchedChurch = allChurches.find(c => c.name.trim() === targetMember.church.trim());
                if (matchedChurch) {
                    if (visitationChurchId) visitationChurchId.value = matchedChurch.id;
                    await loadVisitationParishes(matchedChurch.id);
                    if (targetMember.parish && targetMember.parish !== '교구정보없음') {
                        if (visitationParish) visitationParish.value = targetMember.parish;
                        const selectedOpt = visitationParish.options[visitationParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;
                        if (parishId) {
                            await loadVisitationDistricts(parishId);
                            if (targetMember.district && targetMember.district !== '구역정보없음' && visitationDistrict) {
                                visitationDistrict.value = targetMember.district;
                            }
                        }
                    }
                }
            }
        }, 100);
        newVisitationModal.classList.remove('hidden');
    };

    if (openNewVisitationBtn) {
        openNewVisitationBtn.addEventListener('click', async () => {
            resetVisitationModal();
            await loadVisitationChurches();
            newVisitationModal.classList.remove('hidden');
        });
    }

    const closeNewVisitation = () => {
        newVisitationModal.classList.add('hidden');
        if (visitationNameSuggestions) visitationNameSuggestions.classList.add('hidden');
        if (visitationChurchSuggestions) visitationChurchSuggestions.classList.add('hidden');
    };
    if (closeNewVisitationModal) closeNewVisitationModal.addEventListener('click', closeNewVisitation);
    if (cancelNewVisitationBtn) cancelNewVisitationBtn.addEventListener('click', closeNewVisitation);

    async function loadVisitationChurches() {
        try {
            const res = await fetch('/api/churches/all');
            allChurches = await res.json();
        } catch (e) { console.error('Error loading churches:', e); }
    }

    let activeVisitationChurchIndex = -1;
    let activeVisitationNameIndex = -1;

    if (visitationChurchInput) {
        visitationChurchInput.addEventListener('input', () => {
            const val = visitationChurchInput.value.trim().toLowerCase();
            if (visitationChurchId) visitationChurchId.value = '';
            if (visitationParish) { visitationParish.innerHTML = '<option value="">교구 선택</option>'; visitationParish.disabled = true; }
            if (visitationDistrict) { visitationDistrict.innerHTML = '<option value="">구역 선택</option>'; visitationDistrict.disabled = true; }
            activeVisitationChurchIndex = -1;
            if (!val) { if (visitationChurchSuggestions) visitationChurchSuggestions.classList.add('hidden'); return; }
            const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
            if (visitationChurchSuggestions) {
                if (filtered.length > 0) {
                    visitationChurchSuggestions.innerHTML = filtered.map((c, i) => `
                        <div class="church-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 transition-colors"
                             data-id="${c.id}" data-name="${c.name}" data-index="${i}">${c.name}</div>
                    `).join('');
                    visitationChurchSuggestions.classList.remove('hidden');
                } else {
                    visitationChurchSuggestions.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">검색 결과가 없습니다.</div>';
                    visitationChurchSuggestions.classList.remove('hidden');
                }
            }
        });

        visitationChurchInput.addEventListener('keydown', async (e) => {
            if (!visitationChurchSuggestions || visitationChurchSuggestions.classList.contains('hidden')) return;
            const items = visitationChurchSuggestions.querySelectorAll('.church-search-item');
            if (items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); activeVisitationChurchIndex = (activeVisitationChurchIndex + 1) % items.length; updateActiveVisitationChurchHighlight(items); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activeVisitationChurchIndex = (activeVisitationChurchIndex - 1 + items.length) % items.length; updateActiveVisitationChurchHighlight(items); }
            else if (e.key === 'Enter') { e.preventDefault(); const idx = activeVisitationChurchIndex >= 0 ? activeVisitationChurchIndex : 0; if (items[idx]) selectVisitationChurchItem(items[idx]); }
            else if (e.key === 'Escape') { visitationChurchSuggestions.classList.add('hidden'); }
            else if (e.key === 'Tab') { const idx = activeVisitationChurchIndex >= 0 ? activeVisitationChurchIndex : 0; if (items[idx]) selectVisitationChurchItem(items[idx]); }
        });
    }

    function updateActiveVisitationChurchHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === activeVisitationChurchIndex) { item.classList.add('bg-blue-50', 'dark:bg-slate-700', 'text-blue-800', 'dark:text-white'); item.scrollIntoView({ block: 'nearest' }); }
            else { item.classList.remove('bg-blue-50', 'dark:bg-slate-700', 'text-blue-800', 'dark:text-white'); }
        });
    }

    async function selectVisitationChurchItem(item) {
        visitationChurchInput.value = item.dataset.name;
        visitationChurchId.value = item.dataset.id;
        visitationChurchSuggestions.classList.add('hidden');
        await loadVisitationParishes(item.dataset.id);
        if (visitationParish) visitationParish.focus();
    }

    if (visitationChurchSuggestions) {
        visitationChurchSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.church-search-item');
            if (!item) return;
            selectVisitationChurchItem(item);
        });
    }

    async function loadVisitationParishes(churchId) {
        if (visitationParish) { visitationParish.innerHTML = '<option value="">교구 선택</option>'; }
        if (visitationDistrict) { visitationDistrict.innerHTML = '<option value="">구역 선택</option>'; visitationDistrict.disabled = true; }
        if (!churchId) { if (visitationParish) visitationParish.disabled = true; return; }
        try {
            const res = await fetch(`/api/parishes?church_id=${churchId}`);
            const parishes = await res.json();
            if (visitationParish) {
                visitationParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
                visitationParish.disabled = false;
            }
        } catch (e) { console.error(e); }
    }

    async function loadVisitationDistricts(parishId) {
        if (visitationDistrict) { visitationDistrict.innerHTML = '<option value="">구역 선택</option>'; }
        if (!parishId) { if (visitationDistrict) visitationDistrict.disabled = true; return; }
        try {
            const res = await fetch(`/api/districts?parish_id=${parishId}`);
            const districts = await res.json();
            if (visitationDistrict) {
                visitationDistrict.innerHTML = '<option value="">구역 선택</option>' + districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
                visitationDistrict.disabled = false;
            }
        } catch (e) { console.error(e); }
    }

    if (visitationParish) {
        visitationParish.addEventListener('change', async () => {
            const selectedOpt = visitationParish.options[visitationParish.selectedIndex];
            await loadVisitationDistricts(selectedOpt.dataset.id);
        });
    }

    if (visitationName) {
        visitationName.addEventListener('input', async () => {
            const val = visitationName.value.trim();
            activeVisitationNameIndex = -1;
            if (!val) {
                if (visitationNameSuggestions) visitationNameSuggestions.classList.add('hidden');
                if (visitationMemberId) visitationMemberId.value = '';
                if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.add('hidden');
                return;
            }
            try {
                const res = await fetch(`/api/members/filter?q=${encodeURIComponent(val)}`);
                const suggestions = await res.json();
                if (visitationNameSuggestions) {
                    if (suggestions.length > 0) {
                        visitationNameSuggestions.innerHTML = suggestions.map((s, i) => `
                            <div class="name-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 flex justify-between items-center transition-colors"
                                 data-id="${s.id}" data-name="${s.name}" data-church="${s.church || ''}" data-parish="${s.parish || ''}" data-district="${s.district || ''}" data-category="${s.category || ''}" data-bs="${s.bs || ''}" data-index="${i}">
                                <span>${s.name} <span class="text-xs font-medium text-slate-400">(${s.position || '성도'})</span></span>
                                <span class="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded font-bold">${s.church || '교회정보없음'}</span>
                            </div>
                        `).join('');
                        visitationNameSuggestions.classList.remove('hidden');
                    } else {
                        visitationNameSuggestions.classList.add('hidden');
                    }
                }
                const exactMatch = suggestions.find(s => s.name === val);
                if (!exactMatch) {
                    if (visitationMemberId) visitationMemberId.value = '';
                    if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.remove('hidden');
                } else {
                    if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.add('hidden');
                }
            } catch (e) { console.error(e); }
        });

        visitationName.addEventListener('keydown', async (e) => {
            if (!visitationNameSuggestions || visitationNameSuggestions.classList.contains('hidden')) return;
            const items = visitationNameSuggestions.querySelectorAll('.name-search-item');
            if (items.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); activeVisitationNameIndex = (activeVisitationNameIndex + 1) % items.length; updateActiveVisitationNameHighlight(items); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activeVisitationNameIndex = (activeVisitationNameIndex - 1 + items.length) % items.length; updateActiveVisitationNameHighlight(items); }
            else if (e.key === 'Enter') { e.preventDefault(); const idx = activeVisitationNameIndex >= 0 ? activeVisitationNameIndex : 0; if (items[idx]) selectVisitationNameItem(items[idx]); }
            else if (e.key === 'Escape') { visitationNameSuggestions.classList.add('hidden'); }
            else if (e.key === 'Tab') { const idx = activeVisitationNameIndex >= 0 ? activeVisitationNameIndex : 0; if (items[idx]) selectVisitationNameItem(items[idx]); }
        });
    }

    function updateActiveVisitationNameHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === activeVisitationNameIndex) { item.classList.add('bg-blue-50', 'dark:bg-slate-700', 'text-blue-800', 'dark:text-white'); item.scrollIntoView({ block: 'nearest' }); }
            else { item.classList.remove('bg-blue-50', 'dark:bg-slate-700', 'text-blue-800', 'dark:text-white'); }
        });
    }

    async function selectVisitationNameItem(item) {
        const { id, name, church, parish, district, category, bs } = item.dataset;
        if (visitationName) visitationName.value = name;
        if (visitationMemberId) visitationMemberId.value = id;
        if (visitationNameSuggestions) visitationNameSuggestions.classList.add('hidden');
        if (newVisitationMemberBadgeContainer) newVisitationMemberBadgeContainer.classList.add('hidden');
        if (category) setVisitationGroupBtn('visitationCategoryBtnGroup', 'visitationCategory', category);
        if (bs) setVisitationGroupBtn('visitationBsBtnGroup', 'visitationBs', bs);
        if (church && church !== '교회정보없음') {
            await loadVisitationChurches();
            if (visitationChurchInput) visitationChurchInput.value = church;
            const matchedChurch = allChurches.find(c => c.name.trim() === church.trim());
            const churchId = matchedChurch ? matchedChurch.id : null;
            if (visitationChurchId) visitationChurchId.value = churchId || '';
            if (churchId) {
                await loadVisitationParishes(churchId);
                setTimeout(async () => {
                    if (parish && parish !== '교구정보없음' && visitationParish) {
                        visitationParish.value = parish;
                        const selectedOpt = visitationParish.options[visitationParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;
                        if (parishId) {
                            await loadVisitationDistricts(parishId);
                            setTimeout(() => {
                                if (district && district !== '구역정보없음' && visitationDistrict) visitationDistrict.value = district;
                            }, 300);
                        }
                    }
                }, 300);
            }
        }
        if (visitationChurchInput) visitationChurchInput.focus();
    }

    if (visitationNameSuggestions) {
        visitationNameSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.name-search-item');
            if (!item) return;
            selectVisitationNameItem(item);
        });
    }

    document.addEventListener('click', (e) => {
        if (visitationName && visitationNameSuggestions && !visitationName.contains(e.target) && !visitationNameSuggestions.contains(e.target)) {
            visitationNameSuggestions.classList.add('hidden');
        }
        if (visitationChurchInput && visitationChurchSuggestions && !visitationChurchInput.contains(e.target) && !visitationChurchSuggestions.contains(e.target)) {
            visitationChurchSuggestions.classList.add('hidden');
        }
    });

    if (saveNewVisitationBtn) {
        saveNewVisitationBtn.addEventListener('click', async () => {
            const name = visitationName ? visitationName.value.trim() : '';
            const memberId = visitationMemberId ? visitationMemberId.value : '';
            const church = visitationChurchInput ? visitationChurchInput.value.trim() : '';
            const parish = visitationParish ? visitationParish.value : '';
            const district = visitationDistrict ? visitationDistrict.value : '';
            const date = document.getElementById('visitationDate').value;
            const sermonContent = document.getElementById('visitationSermonContent').value.trim();
            const counselingContent = document.getElementById('visitationCounselingContent').value.trim();
            const remark_memo = document.getElementById('visitationRemark').value.trim();
            const lead_target = document.getElementById('visitationLeadTarget')?.value.trim() || '';
            const tagsValue = document.getElementById('visitationTagsValue').value;
            const category = document.getElementById('visitationCategory').value;
            const bs = document.getElementById('visitationBs').value;
            const member_status = document.getElementById('visitationMemberStatus').value;

            if (!name) return alert('심방 대상자 이름을 입력하세요.');
            if (!date) return alert('심방 날짜를 입력하세요.');
            if (!sermonContent && !counselingContent) return alert('설교 내용 또는 상담 내용 중 하나는 입력하세요.');

            saveNewVisitationBtn.disabled = true;
            saveNewVisitationBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 저장 중...';

            try {
                const res = await fetch('/api/visitation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        member_id: memberId ? parseInt(memberId) : null,
                        name, date,
                        sermon_content: sermonContent,
                        counseling_content: counselingContent,
                        tags: tagsValue || null,
                        remark_memo: remark_memo || null,
                        lead_target: lead_target || null,
                        church: church || null,
                        parish: parish || null,
                        district: district || null,
                        category: category || null,
                        bs: bs || null,
                        member_status: member_status || 'member'
                    })
                });

                if (!res.ok) throw new Error('심방 기록 저장 실패');
                closeNewVisitation();
                loadStatus();
            } catch (err) {
                console.error(err);
                alert('심방 기록 저장 중 오류가 발생했습니다.');
            } finally {
                saveNewVisitationBtn.disabled = false;
                saveNewVisitationBtn.innerHTML = '<i class="fa-solid fa-check"></i> 심방 저장하기';
            }
        });
    }

    // ──────────────────────────────────────────────────
    // 심방 태그 프리셋 관리 모달 (설정 > 심방 태그 프리셋 관리)
    // ──────────────────────────────────────────────────
    const visitationTagManageModal = document.getElementById('visitationTagManageModal');
    const openVisitationTagManageBtn = document.getElementById('openVisitationTagManageBtn');
    const closeVisitationTagManageModal = document.getElementById('closeVisitationTagManageModal');
    const cancelVisitationTagManageBtn = document.getElementById('cancelVisitationTagManageBtn');
    const saveVisitationTagManageBtn = document.getElementById('saveVisitationTagManageBtn');
    const visitationTagTabMemberBtn = document.getElementById('visitationTagTabMemberBtn');
    const visitationTagTabEvangelismBtn = document.getElementById('visitationTagTabEvangelismBtn');
    const visitationTagSecMember = document.getElementById('visitationTagSecMember');
    const visitationTagSecEvangelism = document.getElementById('visitationTagSecEvangelism');
    const visitationTagListMember = document.getElementById('visitationTagListMember');
    const visitationTagListEvangelism = document.getElementById('visitationTagListEvangelism');

    let editingMemberTags = [];
    let editingEvangelismTags = [];

    function renderTagManageList(container, tagsArr, colorClass) {
        if (!container) return;
        container.innerHTML = tagsArr.map((t, i) => `
            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${colorClass}" data-idx="${i}">
                ${t}
                <button type="button" class="tag-manage-remove-btn hover:opacity-70 transition-opacity leading-none font-black" data-idx="${i}">&times;</button>
            </span>
        `).join('') || '<p class="text-slate-400 italic text-[11px] w-full text-center py-2">등록된 태그가 없습니다.</p>';
    }

    function renderVisitationTagManage() {
        renderTagManageList(visitationTagListMember, editingMemberTags, 'bg-blue-600 text-white');
        renderTagManageList(visitationTagListEvangelism, editingEvangelismTags, 'bg-orange-600 text-white');
    }

    if (openVisitationTagManageBtn) {
        openVisitationTagManageBtn.addEventListener('click', async () => {
            editingMemberTags = [...(await VisitationTagManager.getMemberTags())];
            editingEvangelismTags = [...(await VisitationTagManager.getEvangelismTags())];
            renderVisitationTagManage();
            document.getElementById('settingsModal')?.classList.add('hidden');
            visitationTagManageModal.classList.remove('hidden');
            requestAnimationFrame(() => {
                const inner = visitationTagManageModal.querySelector('div > div');
                if (inner) { inner.classList.remove('scale-95', 'opacity-0'); }
            });
        });
    }

    const closeVisitTagManage = () => visitationTagManageModal.classList.add('hidden');
    if (closeVisitationTagManageModal) closeVisitationTagManageModal.addEventListener('click', closeVisitTagManage);
    if (cancelVisitationTagManageBtn) cancelVisitationTagManageBtn.addEventListener('click', closeVisitTagManage);
    document.getElementById('visitationTagManageModalBackdrop')?.addEventListener('click', closeVisitTagManage);

    if (visitationTagTabMemberBtn && visitationTagTabEvangelismBtn) {
        visitationTagTabMemberBtn.addEventListener('click', () => {
            visitationTagTabMemberBtn.classList.add('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
            visitationTagTabMemberBtn.classList.remove('border-transparent', 'text-slate-400');
            visitationTagTabEvangelismBtn.classList.remove('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
            visitationTagTabEvangelismBtn.classList.add('border-transparent', 'text-slate-400');
            visitationTagSecMember.classList.remove('hidden');
            visitationTagSecEvangelism.classList.add('hidden');
        });
        visitationTagTabEvangelismBtn.addEventListener('click', () => {
            visitationTagTabEvangelismBtn.classList.add('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
            visitationTagTabEvangelismBtn.classList.remove('border-transparent', 'text-slate-400');
            visitationTagTabMemberBtn.classList.remove('border-blue-600', 'text-blue-600', 'dark:text-blue-400');
            visitationTagTabMemberBtn.classList.add('border-transparent', 'text-slate-400');
            visitationTagSecEvangelism.classList.remove('hidden');
            visitationTagSecMember.classList.add('hidden');
        });
    }

    visitationTagListMember?.addEventListener('click', e => {
        const btn = e.target.closest('.tag-manage-remove-btn');
        if (!btn) return;
        editingMemberTags.splice(parseInt(btn.dataset.idx), 1);
        renderVisitationTagManage();
    });
    visitationTagListEvangelism?.addEventListener('click', e => {
        const btn = e.target.closest('.tag-manage-remove-btn');
        if (!btn) return;
        editingEvangelismTags.splice(parseInt(btn.dataset.idx), 1);
        renderVisitationTagManage();
    });

    document.getElementById('addVisitationMemberTagBtn')?.addEventListener('click', () => {
        const input = document.getElementById('newVisitationMemberTagInput');
        const val = (input.value || '').trim();
        if (!val || editingMemberTags.includes(val)) { input.value = ''; return; }
        editingMemberTags.push(val);
        input.value = '';
        renderVisitationTagManage();
    });
    document.getElementById('newVisitationMemberTagInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addVisitationMemberTagBtn')?.click(); }
    });

    document.getElementById('addVisitationEvangelismTagBtn')?.addEventListener('click', () => {
        const input = document.getElementById('newVisitationEvangelismTagInput');
        const val = (input.value || '').trim();
        if (!val || editingEvangelismTags.includes(val)) { input.value = ''; return; }
        editingEvangelismTags.push(val);
        input.value = '';
        renderVisitationTagManage();
    });
    document.getElementById('newVisitationEvangelismTagInput')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('addVisitationEvangelismTagBtn')?.click(); }
    });

    if (saveVisitationTagManageBtn) {
        saveVisitationTagManageBtn.addEventListener('click', async () => {
            saveVisitationTagManageBtn.disabled = true;
            saveVisitationTagManageBtn.textContent = '저장 중...';
            try {
                await VisitationTagManager.saveMemberTags(editingMemberTags);
                await VisitationTagManager.saveEvangelismTags(editingEvangelismTags);
                closeVisitTagManage();
            } catch (e) {
                console.error(e);
                alert('태그 저장 중 오류가 발생했습니다.');
            } finally {
                saveVisitationTagManageBtn.disabled = false;
                saveVisitationTagManageBtn.textContent = '저장하기';
            }
        });
    }

});
