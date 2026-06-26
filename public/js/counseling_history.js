document.addEventListener('DOMContentLoaded', () => {
    function sortFamilyRelations(relationsArray) {
        const priority = (entry) => {
            const match = entry.match(/\(([^)]+)\)/);
            if (!match) return 999;
            const rel = match[1].trim();
            if (rel.includes('아내') || rel.includes('남편') || rel.includes('배우자') || rel.includes('부부')) return 1;
            if (rel.includes('자녀') || rel.includes('아들') || rel.includes('딸')) return 2;
            if (rel.includes('부모') || rel.includes('아버지') || rel.includes('어머니') || rel.includes('아빠') || rel.includes('엄마')) return 3;
            if (rel.includes('기타')) return 4;
            return 5;
        };
        return [...relationsArray].sort((a, b) => priority(a) - priority(b));
    }

    const counselingList = document.getElementById('counselingList');
    const sortOption = document.getElementById('sortOption');
    const counselingCount = document.getElementById('counselingCount');

    let allStatus = [];
    let currentMemberData = null;

    // ──────────────────────────────────────────────────
    // 데이터 로드 (신규 /api/counseling 사용)
    // ──────────────────────────────────────────────────
    async function loadStatus() {
        try {
            const response = await fetch('/api/counseling?_t=' + Date.now(), { cache: 'no-store' });
            allStatus = await response.json();
            updateDashboard(allStatus);
            applyFilters();
        } catch (error) {
            console.error('Error loading counseling status:', error);
            if (counselingList) counselingList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const sort = sortOption ? sortOption.value : 'last_counseling';
        const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

        let filtered = allStatus.filter(s => {
            if (query) {
                const nameMatch = (s.name || '').toLowerCase().includes(query);
                const dateMatch = (s.last_counseling_date || '').includes(query);
                const contentMatch = (s.last_counseling_content || '').toLowerCase().includes(query);
                const tagsMatch = (s.last_counseling_tags || '').toLowerCase().includes(query);
                const positionMatch = (s.position || '').toLowerCase().includes(query);
                const categoryMatch = (s.category || '').toLowerCase().includes(query);
                const districtTextMatch = (s.district || '').toLowerCase().includes(query);
                if (!nameMatch && !dateMatch && !contentMatch && !tagsMatch && !positionMatch && !categoryMatch && !districtTextMatch) return false;
            }
            return true;
        });

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
            const bodyArea = card.querySelector('.counsel-session-body');
            const remarkTextPara = bodyArea ? bodyArea.querySelector('.counsel-content-text') : null;
            const currentRemark = remarkTextPara ? remarkTextPara.textContent.replace(/^📝\s*/, '').trim() : '';

            const presetTags = ['전도상담','구원확신/의심','진로','이성','죄','자녀','부부관계','가족','성경질문','이단','직장생활','결혼'];
            if (bodyArea) bodyArea.innerHTML = `
                <div class="flex flex-col gap-2 w-full mt-2">
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 날짜</label>
                        <input type="date" class="counsel-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                    </div>
                    <div class="edit-tags-container bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/50 dark:border-indigo-900/20 mt-1">
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">상담 주제 태그</label>
                        <div class="edit-tags-presets flex flex-wrap gap-1 mb-2">
                            ${presetTags.map(t => `<button type="button" data-tag="${t}" class="inline-edit-tag-btn px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 transition-all">${t}</button>`).join('')}
                        </div>
                        <div class="flex gap-1 items-center mb-2">
                            <input type="text" class="inline-custom-tag-input flex-1 border border-slate-200 dark:border-slate-700/60 rounded-lg px-2 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="직접 태그 입력...">
                            <button type="button" class="inline-add-tag-btn px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 whitespace-nowrap">+ 추가</button>
                        </div>
                        <div class="inline-tags-preview flex flex-wrap gap-1 min-h-[16px]"></div>
                        <input type="hidden" class="counsel-edit-tags" value="${currentTags}">
                    </div>
                    <div>
                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 내용</label>
                        <textarea class="counsel-edit-textarea w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="3">${currentRemark}</textarea>
                    </div>
                    <div class="flex justify-end gap-1.5 mt-1">
                        <button type="button" class="save-counsel-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                        <button type="button" class="cancel-counsel-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                    </div>
                </div>
            `;
            editBtn.style.display = 'none';

            let activeTags = new Set(currentTags.split(/\s+/).filter(t => t.startsWith('#')).map(t => t.slice(1)));

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
            updateInlineTags();

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
                if (!newDate) return alert('날짜를 입력해주세요.');
                const saveBtn = bodyArea.querySelector('.save-counsel-btn');
                saveBtn.disabled = true; saveBtn.textContent = '저장중...';
                try {
                    const res = await fetch(`/api/counseling/${sessionId}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date: newDate, content: newContent, tags: newTags, member_id: parseInt(memberId) })
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
                        const res = await fetch(`/api/counseling/${sessionId}`, { method: 'DELETE' });
                        if (res.ok) { loadStatusFn(); } else { alert('삭제에 실패했습니다.'); }
                    } catch (err) { console.error(err); alert('서버 오류로 인해 삭제에 실패했습니다.'); }
                }
            });
        }
    }

    // ── 세션 하나를 렌더하는 헬퍼 ───────────────────────────
    function renderSessionCard(session, memberId, isLatest) {
        const isEv = session.member_status === 'evangelism';
        const methodBadge = session.counseling_method && session.counseling_method !== '대면'
            ? `<span class="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200/60 dark:border-amber-700/40">${session.counseling_method}</span>`
            : '';
        const memberBadge = isEv
            ? `<span class="text-[9px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded border border-orange-200/60">전도대상</span>`
            : '';
        const tagsHtml = renderTagBadge(session.tags || '', session.member_status);
        const latestLabel = isLatest ? `<span class="text-[9px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded">최근</span>` : '';

        return `
            <div class="counsel-session-card mt-2 p-2.5 bg-gray-50 dark:bg-[#0B0F19] rounded-lg border border-gray-100 dark:border-slate-800 text-xs relative"
                 data-session-id="${session.session_id || ''}"
                 data-member-id="${memberId}"
                 data-date="${session.date || ''}"
                 data-tags="${session.tags || ''}">
                <div class="flex items-center gap-1.5 mb-1 pr-20">
                    ${latestLabel}
                    <span class="font-bold text-indigo-600 dark:text-indigo-400">${session.date || ''}</span>
                    ${methodBadge}
                    ${memberBadge}
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
                    ${session.content ? `<div class="counsel-content-text text-gray-500 dark:text-slate-400 italic mt-1 pr-10">📝 ${session.content}</div>` : ''}
                </div>
            </div>
        `;
    }

    // ── 세션 접기/펼치기 ─────────────────────────────────────
    window.toggleSessions = function(btn, memberId) {
        const card = btn.closest('.counseling-person-card');
        const extraSessions = card.querySelector('.extra-sessions');
        if (!extraSessions) return;
        const isHidden = extraSessions.style.display === 'none' || extraSessions.style.display === '';
        extraSessions.style.display = isHidden ? 'block' : 'none';
        btn.textContent = isHidden ? '▲ 접기' : `▼ 이전 상담 ${extraSessions.dataset.count}건 더 보기`;
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
            const extraSessions = sessions.slice(1);

            let daysDiffHtml = '';
            if (latestSession && latestSession.date) {
                const lastDate = new Date(latestSession.date);
                lastDate.setHours(0, 0, 0, 0);
                const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                daysDiffHtml = `<span class="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40 font-bold">${daysDiff}일 전(최근 상담)</span>`;
            }

            const latestSessionHtml = latestSession ? renderSessionCard(latestSession, member.id, true) : '';

            const extraHtml = extraSessions.length > 0
                ? `<div class="extra-sessions" style="display:none" data-count="${extraSessions.length}">
                       ${extraSessions.map(s => renderSessionCard(s, member.id, false)).join('')}
                   </div>
                   <button type="button" onclick="toggleSessions(this, ${member.id})"
                       class="mt-2 w-full text-center text-[10px] font-bold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 py-1 border border-dashed border-indigo-200 dark:border-indigo-800/50 rounded-lg transition-colors cursor-pointer">
                       ▼ 이전 상담 ${extraSessions.length}건 더 보기
                   </button>`
                : '';

            const displayDistrict = member.district ? (String(member.district).includes('구역') ? member.district : member.district + '구역') : '구역 미정';
            const bsLabel = member.bs === 'B' ? '형제' : (member.bs === 'S' ? '자매' : '');

            return `
                <div class="counseling-person-card bg-white dark:bg-[#131B2E] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex items-start p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline cursor-pointer transition-colors">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded font-bold">${displayDistrict} | ${member.category || ''}${bsLabel ? ' · ' + bsLabel : ''}</span>
                            ${daysDiffHtml}
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${latestSessionHtml}
                        ${extraHtml}
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
    const RECORD_STATUS_MAP = { 
        'DISTRICT': '구역 변경', 'CATEGORY': '소속 변경', 'POSITION': '직분 임명', 
        'POSITION_DISMISS': '직분 면직', 'SERVICE': '봉사 임무', 'SERVICE_DISMISS': '봉사 면직', 
        'FELLOWSHIP': '교제 상태', 'TRANSFER': '전입/전출 (메모)', 'CHURCH_IN': '교회 전입',
        'CHURCH_MOVE': '교회 이동', 'PARISH_MOVE': '교구 이동', 'COUNSELING': '상담', 'ETC': '기타' 
    };

    function calculateAge(birthYear) {
        if (!birthYear) return '-';
        const year = parseInt(birthYear);
        return isNaN(year) ? '-' : (2026 - year + 1);
    }

    function getDC(d) {
        if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
        if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
        if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }

    window.openMemberHistoryModal = async function(id) {
        try {
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="counseling"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const [historyRes, recRes, counselingRes] = await Promise.all([
                fetch(`/api/members/${id}/history?_t=` + Date.now(), { cache: 'no-store' }),
                fetch(`/api/members/${id}/records?_t=` + Date.now(), { cache: 'no-store' }),
                fetch(`/api/counseling/${id}?_t=` + Date.now(), { cache: 'no-store' })
            ]);
            const { member, history, family } = await historyRes.json();
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
            const fEnt = sortFamilyRelations((member.family_relation || '').split(',').map(s => s.trim()).filter(s => s));
            
            const fDispHTML = fEnt.map(e => {
                const match = e.match(/^(.+?)\(/);
                const name = match ? match[1].trim() : e.trim();
                const found = family ? family.find(f => f.name.trim() === name) : null;
                if (found) {
                    return `<button type="button" class="bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] px-2.5 py-1.5 rounded-full font-bold border border-blue-200 shadow-sm transition active:scale-[0.97]" onclick="openMemberHistoryModal(${found.id})">${e} ➔</button>`;
                }
                return `<span class="bg-gray-100 text-gray-600 text-[11px] px-2.5 py-1.5 rounded-full font-medium border border-gray-200 shadow-sm">${e}</span>`;
            }).join(' ') || '<span class="text-slate-400 italic text-xs">없음</span>';

            const initial = member.name ? member.name[0] : '';
            const avatarColors = member.bs === 'B' 
                ? 'from-blue-500 to-indigo-600 shadow-blue-100' 
                : 'from-pink-500 to-rose-600 shadow-rose-100';
            
            const badges = [
                member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
                member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
                ...calculatedPosArray.map(p => `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${p}</span>`)
            ].filter(x => x).join(' ');

            const memberBasicInfo = document.getElementById('memberBasicInfo');
            if (memberBasicInfo) {
                memberBasicInfo.innerHTML = `
                <div class="col-span-2 md:col-span-4 flex flex-col md:flex-row items-center gap-5 pb-5 border-b border-slate-100 w-full">
                    <div class="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-gradient-to-tr ${avatarColors} flex items-center justify-center text-white text-2xl md:text-3xl font-black shadow-lg">
                        ${initial}
                    </div>
                    <div class="flex-1 text-center md:text-left">
                        <div class="flex flex-col md:flex-row items-center gap-2 mb-2">
                            <h3 class="text-2xl font-black text-slate-800">${member.name}</h3>
                            <span class="text-xs font-black text-slate-400 bg-slate-100/70 px-2 py-0.5 rounded-md">${member.bs === 'B' ? '형제' : '자매'} (${calculateAge(member.birth_year)}세, ${member.birth_year || '-'}년생)</span>
                        </div>
                        <div class="flex flex-wrap gap-1.5 justify-center md:justify-start">
                            ${badges}
                        </div>
                    </div>
                </div>
                <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                    <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">구원일</span>
                    <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${member.salvation_date || '-'}
                    </span>
                </div>
                <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                    <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">연락처</span>
                    <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                        ${member.phone || '-'}
                    </span>
                </div>
                <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                    <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">가족 관계</span>
                    <div class="flex flex-wrap gap-1.5 mt-1">${fDispHTML}</div>
                </div>
                <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                    <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">주소</span>
                    <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        <span class="truncate" title="${member.address || ''}">${member.address || '-'}</span>
                    </span>
                </div>
                <div class="col-span-2 md:col-span-4 bg-blue-50/40 p-4 rounded-xl border border-blue-100/50 flex flex-col gap-1">
                    <span class="text-blue-700 text-[10px] font-black uppercase tracking-wider">교회 봉사 내역</span>
                    <span class="font-extrabold text-blue-900 text-sm">${finalCalculatedSvc}</span>
                </div>
                <div class="col-span-2 md:col-span-4 bg-yellow-50/30 p-4 rounded-xl border border-yellow-100/50 flex flex-col gap-1 relative group">
                    <div class="flex items-center justify-between">
                        <span class="text-yellow-700 text-[10px] font-black uppercase tracking-wider">간증 및 기타 메모</span>
                        <button type="button" id="testimonyEditBtn" onclick="toggleTestimonyEdit(true)" class="text-yellow-700 hover:text-yellow-900 text-xs font-bold transition flex items-center gap-1">
                            <i class="fa-regular fa-pen-to-square"></i> 수정
                        </button>
                    </div>
                    <div id="testimonyViewMode" class="font-medium text-slate-700 text-xs whitespace-pre-wrap leading-relaxed mt-1">
                        ${member.testimony || '내용 없음'}
                    </div>
                    <div id="testimonyEditMode" class="hidden flex flex-col gap-2 mt-1">
                        <textarea id="testimonyTextarea" class="w-full border border-slate-200 focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 rounded-xl px-3 py-2 h-24 outline-none text-xs leading-relaxed text-slate-700 transition duration-150 resize-y" placeholder="간증 및 기타 메모 내용을 입력하세요...">${member.testimony || ''}</textarea>
                        <div class="flex justify-end gap-1.5">
                            <button type="button" onclick="toggleTestimonyEdit(false)" class="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition active:scale-[0.97]">취소</button>
                            <button type="button" onclick="saveTestimonyDirect(${member.id})" class="px-2.5 py-1.5 text-[11px] font-bold text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition active:scale-[0.97] shadow-sm">저장</button>
                        </div>
                    </div>
                </div>`;
            }

            // 출석 히스토리 탭
            const rawFilteredHistory = history.filter(h => h.type !== '심방' && h.type !== '설교' && h.type !== '외부설교' && h.date <= todayStr);
            function isMandatoryMeeting(member, meeting) {
                const mType = meeting.type || '';
                const mDistMatch = mType.match(/\d+/);
                const mDistNum = mDistMatch ? mDistMatch[0] : null;
                const memDistNum = (member.district || '').replace(/[^0-9]/g, '');
                if (mType.includes('조모임')) {
                    if (member.category === '청년회' && member.bs === 'S') return false;
                    if (member.bs === 'B') return false;
                }
                if (mType.includes('구역모임')) { if (!mDistNum || mDistNum === memDistNum) return true; }
                if (mType.includes('조모임')) { if (!mDistNum || mDistNum === memDistNum) return true; }
                if (mType.includes('교구전체모임')) return true;
                if (mType.includes('교구형제모임') && member.bs === 'B') return true;
                if (mType.includes('교구임원모임') && (member.position || '').trim() !== '') return true;
                if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;
                return false;
            }
            const filteredHistory = rawFilteredHistory.filter(h => isMandatoryMeeting(member, h) || h.is_present);
            const getMeetingCategory = (type) => {
                if (type.includes('구역모임')) return 'district';
                if (type.includes('조모임')) return 'group';
                return 'other';
            };
            const stats = { all: { count: 0, present: 0 }, district: { count: 0, present: 0 }, group: { count: 0, present: 0 }, other: { count: 0, present: 0 } };
            filteredHistory.forEach(h => {
                const cat = getMeetingCategory(h.type);
                stats.all.count++;
                if (h.is_present) stats.all.present++;
                stats[cat].count++;
                if (h.is_present) stats[cat].present++;
            });
            const getRate = (s) => s.count > 0 ? Math.round((s.present / s.count) * 100) : 0;

            const historyTableBody = document.getElementById('historyTableBody');
            if (historyTableBody) {
                const memberAttendanceStats = document.getElementById('memberAttendanceStats');
                if (memberAttendanceStats) memberAttendanceStats.textContent = `${getRate(stats.all)}% (${stats.all.present}/${stats.all.count})`;
                historyTableBody.innerHTML = filteredHistory.map(h => `
                    <tr class="text-sm border-b hover:bg-slate-50/50 transition-colors">
                        <td class="py-1.5 px-2.5 text-slate-500 font-medium text-center">${h.date}</td>
                        <td class="py-1.5 px-2.5 font-bold text-slate-800">${h.title}</td>
                        <td class="py-1.5 px-2.5 text-center font-bold ${h.is_present ? 'text-emerald-600' : 'text-rose-500'}">${h.is_present ? '출석' : '결석'}</td>
                        <td class="py-1.5 px-2.5 text-slate-600 text-xs">${h.testimony_snapshot || '-'}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">출석 기록이 존재하지 않습니다.</td></tr>';
            }

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
                        const tagsHtml = s.tags ? s.tags.trim().split(/\s+/).filter(t => t.startsWith('#'))
                            .map(t => `<span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-700/40">${t}</span>`)
                            .join('') : '';
                        const sourceLabel = s.source === 'meeting' 
                            ? '<span class="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">달력</span>' 
                            : '<span class="text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold">직접등록</span>';
                        return `
                            <div class="counsel-card bg-indigo-50 dark:bg-[#131B2E] border border-indigo-100 dark:border-slate-800 p-4 rounded-xl shadow-sm flex flex-col gap-2" data-session-id="${s.session_id}" data-member-id="${id}" data-tags="${s.tags || ''}">
                                <div class="text-xs font-black text-indigo-800 dark:text-indigo-400 border-b dark:border-slate-800 pb-1.5 flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <span class="counsel-date-text">📅 ${s.date} 개인 상담</span>
                                        ${sourceLabel}
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
                                </div>
                            </div>
                        `;
                    }).join('');

                    // 수정 버튼 이벤트 연결
                    counselingMemoList.querySelectorAll('.counsel-card').forEach(card => {
                        const sessionId = card.dataset.sessionId;
                        const memberId = card.dataset.memberId;
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
                            const currentTags = card.dataset.tags || '';

                            bodyArea.innerHTML = `
                                <div class="flex flex-col gap-2 w-full">
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">상담 날짜</label>
                                        <input type="date" class="counsel-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                                    </div>
                                    <div class="edit-tags-container bg-indigo-50/30 dark:bg-indigo-950/10 rounded-xl p-3 border border-indigo-100/50 dark:border-indigo-900/20 mt-1">
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">상담 주제 태그 (클릭하여 토글 / 직접 입력 추가 가능)</label>
                                        <div class="edit-tags-presets flex flex-wrap gap-1 mb-2">
                                            ${['전도상담', '구원확신/의심', '진로', '이성', '죄', '자녀', '부부관계', '가족', '성경질문', '이단', '직장생활', '결혼'].map(t => {
                                                return `<button type="button" data-tag="${t}" class="inline-edit-tag-btn px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-200 dark:border-indigo-850/60 transition-all">${t}</button>`;
                                            }).join('')}
                                        </div>
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
                                    <div class="flex justify-end gap-1.5 mt-1">
                                        <button type="button" class="save-counsel-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                                        <button type="button" class="cancel-counsel-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                                    </div>
                                </div>
                            `;

                            // 태그 상태 관리
                            let activeTags = new Set(currentTags.split(/\s+/).filter(t => t.startsWith('#')).map(t => t.substring(1)));

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

                            // 초기 태그 렌더링
                            updateModalEditTags();

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
                                    const res = await fetch(`/api/counseling/${sessionId}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ date: newDate, content: newContent, tags: newTags, member_id: parseInt(memberId) })
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

    window.toggleTestimonyEdit = function(isEdit) {
        const viewMode = document.getElementById('testimonyViewMode');
        const editMode = document.getElementById('testimonyEditMode');
        const editBtn = document.getElementById('testimonyEditBtn');
        if (isEdit) {
            viewMode.classList.add('hidden');
            editMode.classList.remove('hidden');
            editBtn.classList.add('hidden');
            const textarea = document.getElementById('testimonyTextarea');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } else {
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');
            editBtn.classList.remove('hidden');
            document.getElementById('testimonyTextarea').value = currentMemberData.testimony || '';
        }
    };

    window.saveTestimonyDirect = async function(id) {
        try {
            const text = document.getElementById('testimonyTextarea').value;
            const updatedData = { ...currentMemberData, testimony: text };
            const response = await fetch(`/api/members/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedData) });
            if (response.ok) {
                currentMemberData = updatedData;
                document.getElementById('testimonyViewMode').textContent = text || '내용 없음';
                window.toggleTestimonyEdit(false);
                loadStatus();
            } else {
                alert('저장에 실패했습니다.');
            }
        } catch (e) { console.error(e); alert('에러가 발생했습니다.'); }
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

    if (counselingChurchInput) {
        counselingChurchInput.addEventListener('input', () => {
            const val = counselingChurchInput.value.trim().toLowerCase();
            if (counselingChurchId) counselingChurchId.value = '';
            if (counselingParish) { counselingParish.innerHTML = '<option value="">교구 선택</option>'; counselingParish.disabled = true; }
            if (counselingDistrict) { counselingDistrict.innerHTML = '<option value="">구역 선택</option>'; counselingDistrict.disabled = true; }
            if (!val) { if (counselingChurchSuggestions) counselingChurchSuggestions.classList.add('hidden'); return; }
            const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
            if (counselingChurchSuggestions) {
                if (filtered.length > 0) {
                    counselingChurchSuggestions.innerHTML = filtered.map(c => `
                        <div class="church-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800" 
                             data-id="${c.id}" data-name="${c.name}">${c.name}</div>
                    `).join('');
                    counselingChurchSuggestions.classList.remove('hidden');
                } else {
                    counselingChurchSuggestions.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">검색 결과가 없습니다.</div>';
                    counselingChurchSuggestions.classList.remove('hidden');
                }
            }
        });
    }

    if (counselingChurchSuggestions) {
        counselingChurchSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('.church-search-item');
            if (!item) return;
            counselingChurchInput.value = item.dataset.name;
            counselingChurchId.value = item.dataset.id;
            counselingChurchSuggestions.classList.add('hidden');
            await loadParishes(item.dataset.id);
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
                        counselingNameSuggestions.innerHTML = suggestions.map(s => `
                            <div class="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 flex justify-between items-center" 
                                 data-id="${s.id}" data-name="${s.name}" data-church="${s.church || ''}" data-parish="${s.parish || ''}" data-district="${s.district || ''}" data-category="${s.category || ''}" data-bs="${s.bs || ''}">
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
    }

    if (counselingNameSuggestions) {
        counselingNameSuggestions.addEventListener('click', async (e) => {
            const item = e.target.closest('[data-id]');
            if (!item) return;
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
            const tagsValue = document.getElementById('counselingTagsValue').value;
            const category = document.getElementById('counselingCategory').value;
            const bs = document.getElementById('counselingBs').value;
            const member_status = document.getElementById('counselingMemberStatus').value;

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
                        church: church || null,
                        parish: parish || null,
                        district: district || null,
                        category: category || null,
                        bs: bs || null,
                        member_status: member_status || 'member'
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

    const editMemberBtn = document.getElementById('editMemberBtn');
    const counselEditMemberModal = document.getElementById('counselEditMemberModal');
    const counselEditMemberForm = document.getElementById('counselEditMemberForm');
    const counselEditMemberSubmitBtn = document.getElementById('counselEditMemberSubmitBtn');

    if (editMemberBtn && counselEditMemberModal && counselEditMemberForm) {
        editMemberBtn.addEventListener('click', () => {
            if (!currentMemberData) return;
            
            counselEditMemberForm.querySelector('input[name="name"]').value = currentMemberData.name || '';
            counselEditMemberForm.querySelector('select[name="category"]').value = currentMemberData.category || '모름';
            counselEditMemberForm.querySelector('input[name="birth_year"]').value = currentMemberData.birth_year || '';
            counselEditMemberForm.querySelector('select[name="bs"]').value = currentMemberData.bs || 'B';
            counselEditMemberForm.querySelector('input[name="salvation_date"]').value = currentMemberData.salvation_date || '';
            counselEditMemberForm.querySelector('input[name="phone"]').value = currentMemberData.phone || '';
            counselEditMemberForm.querySelector('input[name="address"]').value = currentMemberData.address || '';
            counselEditMemberForm.querySelector('textarea[name="testimony"]').value = currentMemberData.testimony || '';

            counselEditMemberModal.classList.remove('hidden');
        });
    }

    if (counselEditMemberSubmitBtn && counselEditMemberForm) {
        counselEditMemberSubmitBtn.addEventListener('click', async () => {
            if (!currentMemberData) return;

            const name = counselEditMemberForm.querySelector('input[name="name"]').value.trim();
            if (!name) return alert('성명을 입력하세요.');

            const category = counselEditMemberForm.querySelector('select[name="category"]').value;
            const birth_year = counselEditMemberForm.querySelector('input[name="birth_year"]').value;
            const bs = counselEditMemberForm.querySelector('select[name="bs"]').value;
            const salvation_date = counselEditMemberForm.querySelector('input[name="salvation_date"]').value;
            const phone = counselEditMemberForm.querySelector('input[name="phone"]').value.trim();
            const address = counselEditMemberForm.querySelector('input[name="address"]').value.trim();
            const testimony = counselEditMemberForm.querySelector('textarea[name="testimony"]').value.trim();

            counselEditMemberSubmitBtn.disabled = true;
            counselEditMemberSubmitBtn.textContent = '저장 중...';

            try {
                const updatedMember = {
                    ...currentMemberData,
                    name,
                    category,
                    birth_year: birth_year ? parseInt(birth_year) : null,
                    bs,
                    salvation_date: salvation_date || null,
                    phone: phone || null,
                    address: address || null,
                    testimony: testimony || null
                };

                const res = await fetch(`/api/members/${currentMemberData.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedMember)
                });

                if (!res.ok) throw new Error('성도 정보 수정 실패');

                alert('성공적으로 수정되었습니다.');
                counselEditMemberModal.classList.add('hidden');
                
                await openMemberHistoryModal(currentMemberData.id);
                loadStatus();
            } catch (err) {
                console.error(err);
                alert('성도 정보 수정 중 오류가 발생했습니다.');
            } finally {
                counselEditMemberSubmitBtn.disabled = false;
                counselEditMemberSubmitBtn.textContent = '수정 완료';
            }
        });
    }

    // ──────────────────────────────────────────────────
    // 대시보드 업데이트 & 접기/펼치기 토글 로직
    // ──────────────────────────────────────────────────

    // 태그 탭 상태
    let dashTagTab = 'member'; // 'member' | 'evangelism'
    let dashTagData = { member: [], evangelism: [] };

    function renderTopTags(tab) {
        const container = document.getElementById('topTagsContainer');
        if (!container) return;
        const list = dashTagData[tab] || [];
        if (list.length === 0) {
            container.innerHTML = `<p class="text-slate-400 italic text-[11px] text-center py-6">주제 정보가 없습니다.</p>`;
            return;
        }
        const maxCount = list[0].count || 1;
        const barColor = tab === 'member' ? 'bg-indigo-500 dark:bg-indigo-400' : 'bg-orange-500 dark:bg-orange-400';
        const countColor = tab === 'member' ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400';
        container.innerHTML = list.slice(0, 8).map(item => {
            const pct = Math.round((item.count / maxCount) * 100);
            return `
                <div class="space-y-1">
                    <div class="flex justify-between items-center text-[11px] font-bold">
                        <span class="text-slate-700 dark:text-slate-300">#${item.tag}</span>
                        <span class="${countColor} font-extrabold">${item.count}건</span>
                    </div>
                    <div class="w-full bg-slate-100 dark:bg-slate-800/80 h-2 rounded-full overflow-hidden">
                        <div class="${barColor} h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 태그 탭 버튼 클릭
    document.getElementById('tagTabMemberBtn')?.addEventListener('click', () => {
        dashTagTab = 'member';
        document.getElementById('tagTabMemberBtn').className = 'px-3 py-1.5 bg-indigo-600 text-white transition-all';
        document.getElementById('tagTabEvangelismBtn').className = 'px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all';
        renderTopTags('member');
    });
    document.getElementById('tagTabEvangelismBtn')?.addEventListener('click', () => {
        dashTagTab = 'evangelism';
        document.getElementById('tagTabEvangelismBtn').className = 'px-3 py-1.5 bg-orange-500 text-white transition-all';
        document.getElementById('tagTabMemberBtn').className = 'px-3 py-1.5 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all';
        renderTopTags('evangelism');
    });

    function updateDashboard(data) {
        const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        if (!data || data.length === 0) {
            setEl('monthlyCounselCount', '0 건');
            setEl('totalCounselCount', '0 건');
            setEl('memberKpiCount', '0 명'); setEl('memberKpiPct', '전체의 0%');
            setEl('evangelismKpiCount', '0 명'); setEl('evangelismKpiPct', '전체의 0%');
            setEl('memberTargetRatioText', '0 / 0');
            setEl('memberStatCount', '0'); setEl('memberStatPct', '0%');
            setEl('evangelismStatCount', '0'); setEl('evangelismStatPct', '0%');
            setEl('churchRatioText', '0 / 0');
            setEl('seoulStatCount', '0'); setEl('seoulStatPct', '0%');
            setEl('otherStatCount', '0'); setEl('otherStatPct', '0%');
            ['memberRatioBar','targetRatioBar','seoulChurchRatioBar','otherChurchRatioBar'].forEach(id => {
                const el = document.getElementById(id); if (el) el.style.width = '0%';
            });
            dashTagData = { member: [], evangelism: [] };
            renderTopTags(dashTagTab);
            return;
        }

        // 1. 당월 및 누적 상담 건수
        let totalCount = 0, monthlyCount = 0;
        const now = new Date();
        const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        data.forEach(s => {
            totalCount += (s.counseling_count || 0);
            if (s.last_counseling_date && s.last_counseling_date.startsWith(currentYM)) monthlyCount++;
        });
        setEl('monthlyCounselCount', `${monthlyCount} 건`);
        setEl('totalCounselCount', `${totalCount} 건`);

        // 2. 성도 vs 전도대상 (member_status 우선, 없으면 salvation_date 기준)
        const totalPeople = data.length || 1;
        const memberCount = data.filter(s => s.member_status ? s.member_status === 'member' : (s.salvation_date && s.salvation_date.trim() !== '')).length;
        const targetCount = totalPeople - memberCount;
        const memberPct = Math.round((memberCount / totalPeople) * 100);
        const targetPct = 100 - memberPct;

        setEl('memberKpiCount', `${memberCount} 명`);
        setEl('memberKpiPct', `전체의 ${memberPct}%`);
        setEl('evangelismKpiCount', `${targetCount} 명`);
        setEl('evangelismKpiPct', `전체의 ${targetPct}%`);
        setEl('memberTargetRatioText', `성도 ${memberCount}명 / 전도 ${targetCount}명`);
        setEl('memberStatCount', `${memberCount}`);
        setEl('memberStatPct', `${memberPct}%`);
        setEl('evangelismStatCount', `${targetCount}`);
        setEl('evangelismStatPct', `${targetPct}%`);
        const mrBar = document.getElementById('memberRatioBar'); if (mrBar) mrBar.style.width = `${memberPct}%`;
        const trBar = document.getElementById('targetRatioBar'); if (trBar) trBar.style.width = `${targetPct}%`;

        // 3. 서울중앙 vs 타교회/모름
        const seoulCount = data.filter(s => s.church === '서울중앙교회').length;
        const otherCount = totalPeople - seoulCount;
        const seoulPct = Math.round((seoulCount / totalPeople) * 100);
        const otherPct = 100 - seoulPct;

        setEl('churchRatioText', `서울중앙 ${seoulCount}명 / 타교회 ${otherCount}명`);
        setEl('seoulStatCount', `${seoulCount}`);
        setEl('seoulStatPct', `${seoulPct}%`);
        setEl('otherStatCount', `${otherCount}`);
        setEl('otherStatPct', `${otherPct}%`);
        const scBar = document.getElementById('seoulChurchRatioBar'); if (scBar) scBar.style.width = `${seoulPct}%`;
        const ocBar = document.getElementById('otherChurchRatioBar'); if (ocBar) ocBar.style.width = `${otherPct}%`;

        // 4. 인기 상담 주제 — 성도 / 전도대상 분리 집계
        const memberTagCounts = {}, evangelismTagCounts = {};
        data.forEach(s => {
            if (!s.last_counseling_tags) return;
            const isMember = s.member_status ? s.member_status === 'member' : (s.salvation_date && s.salvation_date.trim() !== '');
            const bucket = isMember ? memberTagCounts : evangelismTagCounts;
            s.last_counseling_tags.split(/\s+/).filter(t => t.startsWith('#')).forEach(t => {
                const tag = t.substring(1);
                if (tag) bucket[tag] = (bucket[tag] || 0) + 1;
            });
        });

        const toSorted = obj => Object.entries(obj).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);
        dashTagData = { member: toSorted(memberTagCounts), evangelism: toSorted(evangelismTagCounts) };
        renderTopTags(dashTagTab);
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
            if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 펼치기';
            if (dashboardToggleIcon) {
                dashboardToggleIcon.classList.remove('fa-chevron-up');
                dashboardToggleIcon.classList.add('fa-chevron-down');
            }
        }

        toggleDashboardBtn.addEventListener('click', () => {
            const isCurrentlyHidden = counselingDashboard.style.display === 'none';
            if (!isCurrentlyHidden) {
                counselingDashboard.style.display = 'none';
                if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 펼치기';
                if (dashboardToggleIcon) {
                    dashboardToggleIcon.classList.remove('fa-chevron-up');
                    dashboardToggleIcon.classList.add('fa-chevron-down');
                }
                localStorage.setItem('counseling_dashboard_collapsed', 'true');
            } else {
                counselingDashboard.style.display = '';
                if (dashboardToggleText) dashboardToggleText.textContent = '대시보드 접기';
                if (dashboardToggleIcon) {
                    dashboardToggleIcon.classList.remove('fa-chevron-down');
                    dashboardToggleIcon.classList.add('fa-chevron-up');
                }
                localStorage.setItem('counseling_dashboard_collapsed', 'false');
            }
        });
    }
});
