document.addEventListener('DOMContentLoaded', () => {
    

    const visitationList = document.getElementById('visitationList');
    const districtFilter = document.getElementById('districtFilter');
    const sortOption = document.getElementById('sortOption');
    const visitationCount = document.getElementById('visitationCount');

    let allStatus = [];
    let currentMemberData = null;

    async function loadStatus() {
        try {
            const response = await fetch('/api/visitation/status');
            allStatus = await response.json();
            applyFilters();
        } catch (error) {
            console.error('Error loading visitation status:', error);
            visitationList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const district = districtFilter.value;
        const sort = sortOption.value;
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
                const memoMatch = (s.last_visitation_memo || '').toLowerCase().includes(query);
                const positionMatch = (s.position || '').toLowerCase().includes(query);
                const categoryMatch = (s.category || '').toLowerCase().includes(query);
                const districtTextMatch = (s.district || '').toLowerCase().includes(query);

                if (!nameMatch && !dateMatch && !memoMatch && !positionMatch && !categoryMatch && !districtTextMatch) {
                    return false;
                }
            }

            return true;
        });

        // Sorting
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
            if (sort === 'visited_first') {
                if (a.last_visitation_date && !b.last_visitation_date) return -1;
                if (!a.last_visitation_date && b.last_visitation_date) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sort === 'not_visited_first') {
                if (!a.last_visitation_date && b.last_visitation_date) return -1;
                if (a.last_visitation_date && !b.last_visitation_date) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sort === 'count') return b.visitation_count - a.visitation_count;
            return 0;
        });

        renderList(filtered);
    }

    function renderList(data) {
        visitationCount.textContent = `총 ${data.length}명 관리 중`;
        
        if (data.length === 0) {
            visitationList.innerHTML = '<p class="text-gray-500 text-center py-20 font-medium">조회된 성도가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        visitationList.innerHTML = data.map(member => {
            let statusHtml = '';
            let detailHtml = '';
            let daysDiff = null;

            if (member.last_visitation_date) {
                const lastDate = new Date(member.last_visitation_date);
                lastDate.setHours(0, 0, 0, 0);
                daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-teal-600 dark:text-teal-400 font-bold text-sm">${member.last_visitation_date}</span>
                        <span class="text-[10px] bg-teal-50 dark:bg-teal-950/40 text-teal-650 dark:text-teal-400 px-2 py-0.5 rounded border border-teal-100 dark:border-teal-900/40 font-bold">${daysDiff}일 전(심방)</span>
                    </div>
                `;

                if (member.last_visitation_memo) {
                    detailHtml = `
                        <div class="mt-2 p-2 bg-gray-50 dark:bg-[#0B0F19] rounded-lg border border-gray-100 dark:border-slate-800 text-xs">
                            <div class="text-gray-500 dark:text-slate-400 italic">📝 ${member.last_visitation_memo}</div>
                        </div>
                    `;
                }
            } else {
                statusHtml = `<span class="text-red-400 font-bold text-sm italic">심방 기록 없음</span>`;
            }

            const displayDistrict = member.district ? (String(member.district).includes('구역') ? member.district : member.district + '구역') : '구역 미정';

            return `
                <div class="bg-white dark:bg-[#131B2E] rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden flex items-start p-4 hover:border-blue-300 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg font-black text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline cursor-pointer transition-colors">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded font-bold">${displayDistrict} | ${member.category}</span>
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${statusHtml}
                        ${detailHtml}
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 심방 <span class="text-blue-600 dark:text-blue-400 font-black">${member.visitation_count}</span>회</div>
                        <div class="flex flex-col gap-1">
                            <button onclick="openRecordPanel(${member.id}, '${member.name}', '심방')" 
                                    class="bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                심방 기록 작성
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    districtFilter.addEventListener('change', applyFilters);
    sortOption.addEventListener('change', applyFilters);
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

    // --- Member Detail Modal Logic (Read-Only) ---
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
            // 탭 상태 리셋 (출석 탭 활성화)
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="attendance"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const res = await fetch(`/api/members/${id}/history`); 
            const { member, history, family, leaderProfile } = await res.json(); 
            currentMemberData = member; 
            
            // Fetch records for real-time position calculation
            const recRes = await fetch(`/api/members/${id}/records`);
            const records = await recRes.json();

            // 상담 기록 탭용: 달력(meetings) 기반 + 레거시(member_records) 기반 상담을 병합해서 반환하는 API
            // (counseling_history.js의 상담 관리 모달과 동일한 소스를 사용해서 여기서도 최신 방식으로 등록한
            // 상담이 빠짐없이 보이도록 함)
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
                    // 구버전 데이터는 remark에 "[면직] " 접두어가 남아있을 수 있어 제거 후 비교해야 함
                    // (server.js의 syncMemberProfileFromRecords와 동일한 정제 로직 — 2026-07-05)
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

            // Visitation Memos
            const visMemos = history.filter(h => h.type === '심방');
            const visSec = document.getElementById('visitationHistorySection'), visList = document.getElementById('visitationMemoList');
            if (visMemos.length) { 
                if (visSec) visSec.classList.remove('hidden'); 
                if (visList) {
                    visList.innerHTML = visMemos.map(h => {
                        const memoVal = h.memo ? h.memo.trim() : '';
                        const testimonyVal = h.testimony_snapshot ? h.testimony_snapshot.trim() : '';
                        
                        let contentHTML = '';
                        if (memoVal) {
                            contentHTML += `
                                <div class="mb-2 bg-white/60 p-2.5 rounded-lg border border-slate-100">
                                    <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">✍️ 메모</span>
                                    <p class="text-xs text-slate-700 whitespace-pre-wrap font-bold leading-relaxed">${memoVal}</p>
                                </div>
                            `;
                        }
                        if (testimonyVal) {
                            contentHTML += `
                                <div class="bg-blue-50/50 border-blue-100/30 p-2.5 rounded-lg border">
                                    <span class="block text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">🎙️ 심방 간증</span>
                                    <p class="text-xs text-blue-900 whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p>
                                </div>
                            `;
                        }
                        if (!memoVal && !testimonyVal) {
                            contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">기록된 상세 내용이 없습니다.</p>`;
                        }

                        const cardBg = 'bg-teal-50 border-teal-100 dark:bg-slate-800/40 dark:border-slate-700/60';
                        const textCol = 'text-teal-800 border-teal-200/30 dark:text-slate-300 dark:border-slate-700/30';
                        const titleText = '심방 기록';

                        return `
                            <div class="${cardBg} p-4 rounded-xl border shadow-sm flex flex-col gap-2">
                                <div class="text-xs font-black ${textCol} border-b pb-1 flex justify-between items-center">
                                    <span>📅 ${h.date} ${titleText}</span>
                                </div>
                                ${contentHTML}
                            </div>
                        `;
                    }).join('');
                }
            } 
            else {
                if (visList) visList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">심방 기록이 없습니다.</p>';
            }

            // Counseling Memos (개인 상담 기록 탭) — counseling_history.js의 상담 관리 모달과 동일하게
            // meetings(달력) + member_records(레거시) 병합 데이터(counselingSessions)를 사용
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

                    // 수정/삭제 버튼 이벤트 연결
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
                                    updateModalPresetTags(selectedStatus);
                                    updateModalEditTags();
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
            
            // 타임라인 그리기
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
                                    colorClass = 'bg-emerald-500';
                                    iconClass = 'fa-award';
                                    textBg = 'bg-emerald-50 text-emerald-805 border-emerald-100/50';
                                } else if (status === 'POSITION_DISMISS') {
                                    colorClass = 'bg-rose-500';
                                    iconClass = 'fa-user-slash';
                                    textBg = 'bg-rose-50 text-rose-805 border-rose-100/50';
                                } else if (status === 'SERVICE') {
                                    colorClass = 'bg-teal-500';
                                    iconClass = 'fa-hand-holding-heart';
                                    textBg = 'bg-teal-50 text-teal-805 border-teal-100/50';
                                } else if (status === 'SERVICE_DISMISS') {
                                    colorClass = 'bg-orange-500';
                                    iconClass = 'fa-times-circle';
                                    textBg = 'bg-orange-50/70 text-orange-850 border-orange-100/50';
                                } else if (status.includes('MOVE') || status.includes('IN') || status === 'TRANSFER') {
                                    colorClass = 'bg-blue-500';
                                    iconClass = 'fa-route';
                                    textBg = 'bg-blue-50 text-blue-855 border-blue-100/50';
                                } else if (status === 'FELLOWSHIP') {
                                    colorClass = 'bg-amber-500';
                                    iconClass = 'fa-users';
                                    textBg = 'bg-amber-50 text-amber-805 border-amber-100/50';
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
            if (memberHistoryModal) {
                memberHistoryModal.classList.remove('hidden');
            }
        } catch (e) { console.error(e); }
    };

    // 성도 정보 수정(#memberAddModal)은 공용 member-edit.js가 전담.
    // 심방 관리 화면엔 원래 수정/교제안나옴 기능 자체가 없었는데, 다른 화면과 동일하게 새로 추가함.
    if (window.MemberEditModule) {
        window.MemberEditModule.init({
            getMember: () => currentMemberData,
            setMember: (m) => { currentMemberData = m; },
            refreshList: () => { if (typeof loadStatus === 'function') loadStatus(); },
            refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
        });
    }

    // 상담 기록의 "인도대상" 태그 클릭 시 그 사람 상세정보로 이동 (counseling_history.js와 동일 기능)
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
        btn.addEventListener('click', (e) => {
            // 모든 탭 버튼 비활성화
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            // 클릭한 탭 버튼 활성화
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');

            // 모든 탭 콘텐츠 숨김
            document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
            // 해당하는 탭 콘텐츠 표시
            const targetTab = btn.dataset.tab;
            const targetContent = document.getElementById(`tabContent_${targetTab}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const closeHistoryModal = document.getElementById('closeHistoryModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    
    if (closeHistoryModal) {
        closeHistoryModal.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    }
    if (closeHistoryModalBtn) {
        closeHistoryModalBtn.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    }

    ;

    ;

    loadStatus();

    // --- Record Side Panel Logic ---
    const recordSidePanel = document.getElementById('recordSidePanel');
    const recordPanelContent = document.getElementById('recordPanelContent');
    const recordPanelBackdrop = document.getElementById('recordPanelBackdrop');
    const closeRecordPanelBtn = document.getElementById('closeRecordPanelBtn');
    const cancelRecordBtn = document.getElementById('cancelRecordBtn');
    const saveRecordBtn = document.getElementById('saveRecordBtn');

    window.openRecordPanel = (memberId, memberName, type) => {
        document.getElementById('recordMemberId').value = memberId;
        document.getElementById('recordType').value = type;
        
        document.getElementById('recordPanelTitle').textContent = `${type} 기록 작성`;
        document.getElementById('recordPanelSubtitle').textContent = `성도: ${memberName}`;
        
        document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('recordMemo').value = '';

        recordSidePanel.classList.remove('hidden');
        // Trigger reflow
        void recordSidePanel.offsetWidth;
        recordPanelBackdrop.classList.add('opacity-100');
        recordPanelContent.classList.remove('translate-x-full');
    };

    const closeRecordPanel = () => {
        recordPanelBackdrop.classList.remove('opacity-100');
        recordPanelContent.classList.add('translate-x-full');
        setTimeout(() => {
            recordSidePanel.classList.add('hidden');
        }, 300);
    };

    closeRecordPanelBtn.addEventListener('click', closeRecordPanel);
    cancelRecordBtn.addEventListener('click', closeRecordPanel);
    recordPanelBackdrop.addEventListener('click', closeRecordPanel);

    saveRecordBtn.addEventListener('click', async () => {
        const memberId = document.getElementById('recordMemberId').value;
        const type = document.getElementById('recordType').value;
        const date = document.getElementById('recordDate').value;
        const memo = document.getElementById('recordMemo').value.trim();

        if (!date) return alert('날짜를 선택해주세요.');

        saveRecordBtn.disabled = true;
        saveRecordBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 저장 중...';

        try {
            // 1. Create meeting
            const memberName = document.getElementById('recordPanelSubtitle').textContent.replace('성도: ', '');
            const title = `${memberName} ${type}`;
            
            const meetRes = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    date,
                    type,
                    memo
                })
            });
            
            if (!meetRes.ok) throw new Error('모임 생성 실패');
            const { id: meetingId } = await meetRes.json();

            // 2. Create attendance
            const attData = [{
                member_id: parseInt(memberId),
                is_present: 1,
                testimony_snapshot: memo
            }];
            
            const attRes = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meeting_id: meetingId,
                    attendance_data: attData
                })
            });

            if (!attRes.ok) throw new Error('출석 기록 생성 실패');

            closeRecordPanel();
            loadStatus(); // Reload data to update counts and UI
        } catch (error) {
            console.error(error);
            alert('기록 저장 중 오류가 발생했습니다.');
        } finally {
            saveRecordBtn.disabled = false;
            saveRecordBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                저장하기
            `;
        }
    });

});