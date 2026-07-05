document.addEventListener('DOMContentLoaded', () => {
    let allMembersData = []; 
    let filteredMembersData = []; 
    let attendanceRates = {};
    let currentSort = { column: 'district', direction: 'asc' };
    let currentMemberData = null;
    let pendingCrossUpdates = [];
    let pendingRecords = [];
    let isEditSortMode = false;
    let sortableInstance = null;
    let editingRecordId = null;

    

    const tableBody = document.getElementById('tableBody');
    const exportBtn = document.getElementById('exportExcelBtn');
    const totalCountEl = document.getElementById('totalCount');
    const searchName = document.getElementById('searchName');
    const filterParish = document.getElementById('headerParishSelect');
    const headerChurch = document.getElementById('headerChurchSelect');
    const filterChurchSelect = document.getElementById('filterChurchSelect');
    const filterParishSelect = document.getElementById('filterParishSelect');
    const filterDistrict = document.getElementById('filterDistrict');
    const filterGender = document.getElementById('filterGender');
    const filterCategory = document.getElementById('filterCategory');
    const filterStatus = document.getElementById('filterStatus');
    const roleCheckboxes = document.querySelectorAll('.role-filter');
    const btnEditSortMode = document.getElementById('btnEditSortMode');
    const btnSaveSort = document.getElementById('btnSaveSort');
    const btnCustomSort = document.getElementById('btnCustomSort');

    // --- 상세 필터 토글 이벤트 (모바일) ---
    const toggleFilterBtn = document.getElementById('toggleFilterBtn');
    const detailedFilters = document.getElementById('detailedFilters');

    if (toggleFilterBtn && detailedFilters) {
        toggleFilterBtn.addEventListener('click', () => {
            detailedFilters.classList.toggle('hidden');
            detailedFilters.classList.toggle('flex');
        });
    }

    // --- memberAddForm 교회-교구-구역 연동 및 등록/수정 모달 전체 로직은 공용 member-edit.js가 처리 ---


    async function loadData() {
        try {
            const [response, ratesResponse] = await Promise.all([
                fetch('/api/members/search?status=all'),
                fetch('/api/members/attendance-rates')
            ]);
            allMembersData = await response.json();
            attendanceRates = await ratesResponse.json();
            allMembersData.forEach(m => {
                const fid = parseInt(m.family_id);
                m.family_id = isNaN(fid) ? null : fid;
                const so = parseInt(m.sort_order);
                m.sort_order = isNaN(so) ? 999999 : so;
            });
            applyFilters();
        } catch (err) { console.error(err); }
    }

    

    function getSelectedChurchName() {
        if (!headerChurch || headerChurch.selectedIndex === -1 || !headerChurch.options[headerChurch.selectedIndex]) {
            return '서울중앙교회';
        }
        const opt = headerChurch.options[headerChurch.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    function getSelectedParishName() {
        if (!filterParish || filterParish.selectedIndex === -1 || !filterParish.options[filterParish.selectedIndex]) {
            return '전체';
        }
        const opt = filterParish.options[filterParish.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    function applyFilters() {
        const nameQuery = searchName.value.trim().toLowerCase();
        const churchName = getSelectedChurchName();
        const parishName = getSelectedParishName();
        const district = filterDistrict.value, gender = filterGender.value, category = filterCategory.value, statusVal = filterStatus.value;
        const filterMaritalStatus = document.getElementById('filterMaritalStatus');
        const maritalVal = filterMaritalStatus ? filterMaritalStatus.value : '전체';
        const checkedRoles = Array.from(roleCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        const isAllChecked = checkedRoles.includes('all');

        const primaryMatches = allMembersData.filter(m => {
            if (nameQuery && !m.name.toLowerCase().includes(nameQuery)) return false;
            
            // 교회 필터
            const mChurch = m.church || '서울중앙교회';
            if (churchName && churchName !== '전체' && mChurch !== churchName) return false;
            
            // 교구 필터
            const mParish = m.parish || '부곡교구';
            if (parishName !== '전체' && parishName !== '교구 없음' && mParish !== parishName) return false;
            
            // 구역 필터: 교구가 '부곡교구'인 경우에만 구역 필터 적용 (타 교구는 구역이 없을 수 있음)
            if (parishName === '부곡교구' || parishName === '전체') {
                if (district !== '전체' && m.district !== district) return false;
            }
            
            if (gender !== '전체' && m.bs !== gender) return false;
            if (category !== '전체' && m.category !== category) return false;
            if (statusVal !== 'all' && (m.status || 'active') !== statusVal) return false;
            if (maritalVal !== '전체') {
                if (maritalVal === '기혼' && m.marital_status !== '기혼') return false;
                if (maritalVal === '미혼_미선택' && m.marital_status === '기혼') return false;
            }
            
            // 모든 기본 조건(이름, 소속 등)을 통과한 후, 체크박스(역할) 조건 검사
            if (isAllChecked) return true;
            if (checkedRoles.length === 0) return false;
            const hasPos = m.position && m.position.trim() !== '', isDeacon = m.position && m.position.includes('집사'), hasSvc = m.church_service && m.church_service.trim() !== '' && m.church_service !== '없음';
            if (checkedRoles.includes('officer') && hasPos) return true;
            if (checkedRoles.includes('deacon') && isDeacon) return true;
            if (checkedRoles.includes('none') && !hasPos && !hasSvc) return true;
            return false;
        });

        filteredMembersData = primaryMatches;
        renderTable();
    }

    // --- Helper Functions ---
    const getCI = (cat) => { if (!cat) return '-'; if (cat.includes('봉사')) return '봉'; if (cat.includes('어머니')) return '어'; if (cat.includes('청년')) return '청'; if (cat.includes('은장')) return '은'; return cat[0]; };
    ;

    // --- Custom Sort Logic ---
    function toggleEditSortMode() {
        isEditSortMode = !isEditSortMode;
        if (isEditSortMode) {
            btnEditSortMode.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> 편집 종료`;
            btnEditSortMode.className = "bg-red-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-red-700 transition flex items-center gap-2";
            btnSaveSort.classList.remove('hidden');
        } else {
            btnEditSortMode.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> 커스텀 정렬 수정`;
            btnEditSortMode.className = "bg-gray-800 text-white px-4 py-2 rounded font-bold text-sm hover:bg-black transition flex items-center gap-2";
            btnSaveSort.classList.add('hidden');
        }
        renderTable();
    }

    async function saveNewOrder() {
        const orderData = filteredMembersData.map((m, index) => ({ id: m.id, sort_order: index + 1 }));
        try {
            const res = await fetch('/api/members/sort-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: orderData }) });
            if (res.ok) { alert('순서가 저장되었습니다.'); toggleEditSortMode(); loadData(); }
        } catch (err) { alert('저장 실패'); }
    }

    btnEditSortMode.addEventListener('click', toggleEditSortMode);
    btnSaveSort.addEventListener('click', saveNewOrder);
    btnCustomSort.addEventListener('click', () => { currentSort = { column: 'sort_order', direction: 'asc' }; renderTable(); });

    window.moveMemberIndex = (currentIndex, memberName) => {
        const total = filteredMembersData.length;
        const targetNameInput = prompt(`'${memberName}' 성도를 어느 성도 위로 이동시킬까요?\n- 사람 이름 입력 (예: 홍길동)\n- 화면 No 숫자 입력 (예: 15)\n- 맨 위로 보내려면 '0' 또는 '맨위' 입력`);
        if (targetNameInput === null) return;

        const query = targetNameInput.trim();
        if (!query) return;

        let targetMemberObj = null;
        let isTop = false;

        if (query === '0' || query === '맨위' || query === '맨 위') {
            isTop = true;
        } else {
            // 1. Check if the query is a number (No)
            const targetNo = parseInt(query);
            if (!isNaN(targetNo) && targetNo > 0 && targetNo <= total) {
                if (targetNo - 1 === currentIndex) {
                    alert('자기 자신 위로는 이동할 수 없습니다.');
                    return;
                }
                targetMemberObj = filteredMembersData[targetNo - 1];
            } else {
                // 2. Search by name (whitespace-insensitive matching)
                const matchedMembers = filteredMembersData
                    .map((m, idx) => ({ member: m, originalIndex: idx }))
                    .filter(item => item.member.name.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) && item.originalIndex !== currentIndex);

                if (matchedMembers.length === 0) {
                    alert(`'${query}' 성도를 목록에서 찾을 수 없습니다. (자기 자신으로는 이동할 수 없습니다)`);
                    return;
                }

                if (matchedMembers.length === 1) {
                    targetMemberObj = matchedMembers[0].member;
                } else {
                    const optionsList = matchedMembers.map((item, idx) => `${idx + 1}. ${item.member.name} (${item.member.district || '구역 없음'})`).join('\n');
                    const selection = prompt(`동명이인이 ${matchedMembers.length}명 검색되었습니다. 어느 성도 위로 이동시킬까요? 번호를 입력하세요:\n${optionsList}`);
                    if (selection === null) return;

                    const selIdx = parseInt(selection.trim()) - 1;
                    if (isNaN(selIdx) || selIdx < 0 || selIdx >= matchedMembers.length) {
                        alert('올바른 번호를 선택해주세요.');
                        return;
                    }
                    targetMemberObj = matchedMembers[selIdx].member;
                }
            }
        }

        // Perform splice
        const [movedMember] = filteredMembersData.splice(currentIndex, 1);

        if (isTop) {
            filteredMembersData.unshift(movedMember);
        } else if (targetMemberObj) {
            const newTargetIndex = filteredMembersData.findIndex(m => m.id === targetMemberObj.id);
            if (newTargetIndex !== -1) {
                // Insert at newTargetIndex to place it 'above' targetMemberObj
                filteredMembersData.splice(newTargetIndex, 0, movedMember);
            } else {
                filteredMembersData.splice(currentIndex, 0, movedMember);
            }
        }
        renderTable();
    };

    // --- 가족 검색/연결 로직은 공용 member-edit.js가 처리 ---

    // --- Final Sorting Rules ---
    const ROLE_PRIORITY = { '교구장': 1, '집사': 2, '구역장': 3, '조장': 4, '구역총무': 5, '조총무': 6 };
    const CAT_PRIORITY = { '봉사회': 1, '어머니회': 2, '청년회': 3, '은장회': 4 };
    const getMemberRank = (p) => { if(!p) return 99; const ps = p.split(',').map(s=>s.trim()); if(ps.includes('집사') && !ps.includes('교구장')) return 2; let min = 90; ps.forEach(x => { if(ROLE_PRIORITY[x] && ROLE_PRIORITY[x] < min) min = ROLE_PRIORITY[x]; }); return (min === 90 && ps.length > 0) ? 7 : min; };
    const getCatRank = (c) => { if(!c) return 99; for(let k in CAT_PRIORITY){ if(c.includes(k)) return CAT_PRIORITY[k]; } return 95; };

    function renderTable() {
        totalCountEl.textContent = `${filteredMembersData.length}명 조회됨`;
        if (isEditSortMode) {
            // 커스텀 정렬 수정 중에는 데이터 정렬을 타지 않고, 현재 배열 순서를 그대로 유지하여 렌더링합니다.
        } else if (currentSort.column === 'sort_order') {
            filteredMembersData.sort((a, b) => (a.sort_order || 999999) - (b.sort_order || 999999));
        } else if (currentSort.column === 'district' && currentSort.direction === 'asc') {
            const ROLE_SCORES = {
                '교구장': 0,
                '구역장': 1,
                '조장': 2,
                '구역총무': 3,
                '조총무': 4,
                '집사': 5
            };

            const getMemberRoleScore = (m) => {
                if (!m.position) return 6;
                const posList = m.position.split(',').map(p => p.trim());
                let minScore = 6;
                posList.forEach(p => {
                    if (ROLE_SCORES[p] !== undefined && ROLE_SCORES[p] < minScore) {
                        minScore = ROLE_SCORES[p];
                    }
                });
                return minScore;
            };

            const getMemberAttendanceRate = (mId) => {
                const rateInfo = attendanceRates[mId];
                return rateInfo ? rateInfo.ratePercent : 0;
            };

            const familyGroups = {};
            filteredMembersData.forEach(m => {
                if (m.family_id) {
                    if (!familyGroups[m.family_id]) familyGroups[m.family_id] = [];
                    familyGroups[m.family_id].push(m);
                }
            });

            const memberSortMeta = {};
            filteredMembersData.forEach(m => {
                const familyId = m.family_id;
                const familyList = familyId ? familyGroups[familyId] : null;
                
                let spouse = null;
                if (familyList && familyList.length > 1) {
                    const isMeCouple = m.family_relation && (m.family_relation.includes('남편') || m.family_relation.includes('아내'));
                    if (isMeCouple) {
                        spouse = familyList.find(o => o.id !== m.id && o.family_relation && (o.family_relation.includes('남편') || o.family_relation.includes('아내')));
                    }
                }

                if (spouse) {
                    const myScore = getMemberRoleScore(m);
                    const spouseScore = getMemberRoleScore(spouse);
                    const coupleScore = Math.min(myScore, spouseScore);
                    
                    const myRate = getMemberAttendanceRate(m.id);
                    const spouseRate = getMemberAttendanceRate(spouse.id);
                    const coupleRate = (myRate + spouseRate) / 2;

                    const isGlobalTop = (myScore === 0 || spouseScore === 0);

                    memberSortMeta[m.id] = {
                        groupKey: `couple_${familyId}`,
                        priority: isGlobalTop ? -1 : coupleScore,
                        rate: coupleRate,
                        isCouple: true,
                        spouseId: spouse.id,
                        relation: m.family_relation
                    };
                } else {
                    const myScore = getMemberRoleScore(m);
                    const isGlobalTop = (myScore === 0);
                    const myRate = getMemberAttendanceRate(m.id);

                    memberSortMeta[m.id] = {
                        groupKey: `indiv_${m.id}`,
                        priority: isGlobalTop ? -1 : myScore,
                        rate: myRate,
                        isCouple: false,
                        spouseId: null,
                        relation: m.family_relation
                    };
                }
            });

            filteredMembersData.sort((a, b) => {
                const gA = memberSortMeta[a.id];
                const gB = memberSortMeta[b.id];

                if (gA.priority === -1 && gB.priority !== -1) return -1;
                if (gA.priority !== -1 && gB.priority === -1) return 1;
                if (gA.priority === -1 && gB.priority === -1) {
                    if (gA.groupKey !== gB.groupKey) {
                        return a.name.localeCompare(b.name);
                    } else {
                        const bsA = a.bs || '';
                        const bsB = b.bs || '';
                        if (bsA === 'B' && bsB !== 'B') return -1;
                        if (bsA !== 'B' && bsB === 'B') return 1;
                        return a.name.localeCompare(b.name);
                    }
                }

                const distA = a.district || '';
                const distB = b.district || '';
                if (distA !== distB) {
                    return distA.localeCompare(distB);
                }

                if (gA.priority !== gB.priority) {
                    return gA.priority - gB.priority;
                }

                if (gA.groupKey !== gB.groupKey) {
                    return gB.rate - gA.rate;
                } else {
                    const bsA = a.bs || '';
                    const bsB = b.bs || '';
                    if (bsA === 'B' && bsB !== 'B') return -1;
                    if (bsA !== 'B' && bsB === 'B') return 1;
                    return a.name.localeCompare(b.name);
                }
            });
        } else if (currentSort.column === 'attendance_rate') {
            filteredMembersData.sort((a, b) => {
                const rateA = attendanceRates[a.id] ? attendanceRates[a.id].ratePercent : -1;
                const rateB = attendanceRates[b.id] ? attendanceRates[b.id].ratePercent : -1;
                return currentSort.direction === 'asc' ? rateA - rateB : rateB - rateA;
            });
        } else {
            filteredMembersData.sort((a, b) => {
                let vA = a[currentSort.column] || '', vB = b[currentSort.column] || '';
                if(currentSort.column === 'age' || currentSort.column === 'birth_year') {
                    vA = a.birth_year ? parseInt(a.birth_year) : (currentSort.column === 'age' ? -1 : 9999);
                    vB = b.birth_year ? parseInt(b.birth_year) : (currentSort.column === 'age' ? -1 : 9999);
                    return currentSort.direction === 'asc' ? (currentSort.column === 'age' ? vB - vA : vA - vB) : (currentSort.column === 'age' ? vA - vB : vB - vA);
                }
                if (currentSort.column === 'church_service') {
                    const isNoSvcA = (!vA || vA === '-' || vA === '없음');
                    const isNoSvcB = (!vB || vB === '-' || vB === '없음');
                    if (isNoSvcA && !isNoSvcB) return 1;
                    if (!isNoSvcA && isNoSvcB) return -1;
                    if (isNoSvcA && isNoSvcB) return 0;
                }
                return currentSort.direction === 'asc' ? String(vA).localeCompare(String(vB)) : String(vB).localeCompare(String(vA));
            });
        }
        const fidN = {}; allMembersData.forEach(m => { if (m.family_id !== null) { if (!fidN[m.family_id]) fidN[m.family_id] = []; fidN[m.family_id].push(m.name.trim()); } });
        tableBody.innerHTML = filteredMembersData.map((m, index) => {
            const fEnt = sortFamilyRelations((m.family_relation || '').split(',').map(s => s.trim()).filter(s => s));
            const lNames = (m.family_id !== null && fidN[m.family_id]) ? fidN[m.family_id] : [];
            const fHtml = fEnt.map(e => { const match = e.match(/^(.+?)\(/); const name = match ? match[1].trim() : e.trim(); const isL = lNames.includes(name) && name !== m.name.trim(); return `<span class="${isL ? 'text-blue-700 font-black' : 'text-gray-600 font-medium'}">${e}</span>`; }).join(', ') || '-';
            
            const indexCol = isEditSortMode 
                ? `<button type="button" class="bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] px-2 py-0.5 rounded font-black shadow-sm transition active:scale-95" onclick="moveMemberIndex(${index}, '${m.name}')">${index + 1} ⇄</button>`
                : `${index + 1}`;

            const rateInfo = attendanceRates[m.id];
            const rateText = rateInfo ? `${rateInfo.attendCount}/${rateInfo.totalCount} (${rateInfo.ratePercent}%)` : '-';
            const rateDetail = rateInfo ? `title="${rateInfo.attendCount}/${rateInfo.totalCount}회"` : '';
            let rateBadgeClass = 'text-gray-400';
            if (rateInfo && rateInfo.totalCount > 0) {
                if (rateInfo.ratePercent >= 80) rateBadgeClass = 'text-emerald-600 font-bold';
                else if (rateInfo.ratePercent >= 50) rateBadgeClass = 'text-amber-600 font-bold';
                else rateBadgeClass = 'text-rose-500 font-bold';
            }
            const rateHtml = `<span class="${rateBadgeClass}" ${rateDetail}>${rateText}</span>`;
            
            const addrHtml = m.address 
                ? `<span class="cursor-pointer hover:underline hover:text-blue-600 font-semibold flex items-center gap-1" onclick="event.stopPropagation(); triggerMapModal('${m.address.replace(/'/g, "\\'")}')" title="${m.address}"><i class="fa-solid fa-map-location-dot text-rose-500 text-[10px]"></i> ${m.address}</span>` 
                : '-';

            return `<tr class="hover:bg-blue-50 border-b transition text-[13px] ${isEditSortMode ? 'bg-yellow-50' : ''}" data-id="${m.id}"><td class="p-2 text-center font-bold border-r ${isEditSortMode ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400'}">${indexCol}</td><td class="p-2 text-center border-r"><span class="px-2 py-0.5 rounded-full border font-bold text-[11px] ${getDC(m.district)}">${m.district || '-'}</span></td><td class="p-2 text-center font-bold text-gray-600 border-r">${getCI(m.category)}</td><td class="p-2 text-center font-black text-blue-800 border-r cursor-pointer hover:underline" onclick="openMemberHistoryModal(${m.id})">${m.name || ''}</td><td class="p-2 text-center border-r text-gray-700 font-bold">${rateHtml}</td><td class="p-2 text-center border-r text-gray-700">${m.birth_year || '-'}</td><td class="p-2 text-center border-r text-gray-700 font-bold">${calculateAge(m.birth_year)}</td><td class="p-2 text-center border-r text-gray-700">${m.salvation_date || '-'}</td><td class="p-2 text-center border-r text-yellow-800 font-bold">${m.position || '-'}</td><td class="p-2 text-center border-r text-green-800 font-bold">${(!m.church_service || m.church_service === '없음') ? '-' : m.church_service}</td><td class="p-2 border-r font-medium">${fHtml}</td><td class="p-2 text-center border-r text-gray-700 font-medium">${m.phone || '-'}</td><td class="p-2 border-r text-gray-700 truncate min-w-[150px]" title="${m.address || ''}">${addrHtml}</td><td class="p-2 text-gray-700 truncate min-w-[200px]" title="${m.testimony || ''}">${m.testimony || '-'}</td></tr>`;
        }).join('');
    }

    document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => { const col = th.dataset.sort; if (currentSort.column === col) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; } else { currentSort.column = col; currentSort.direction = 'asc'; } renderTable(); }));

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const memberBasicInfo = document.getElementById('memberBasicInfo');
    // 등록/수정 모달(교회·교구·구역 연동, 가족검색, 인적사항 기록 CRUD, RECORD_STATUS_MAP)은
    // 공용 member-edit.js가 전담 (window.RECORD_STATUS_MAP / window.renderEditModalRecords로 노출됨)

    // 인적사항 기록 표시/추가/수정/삭제 관련 함수(getRecordRemarkInputHTML, setupInlineOrgSelectors,
    // onRecordStatusChange, renderEditModalRecords, cancelRecordEdit, startRecordEdit,
    // saveRecordFromModal, deleteRecordFromModal)은 공용 member-edit.js가 전담
    window.deleteRecord = async (id) => { if (confirm('삭제할까요?')) { try { await fetch(`/api/members/records/${id}`, { method: 'DELETE' }); openMemberHistoryModal(currentMemberData.id); } catch (e) { console.error(e); } } };

    ;

    ;

    // 탭 클릭 바인딩 (최초 1회만 등록되도록 member_management.js 로드 시점이나 혹은 여기에 바인딩함)
    if (!window._tabsBound) {
        window._tabsBound = true;
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.member-tab-btn');
            if (!btn) return;
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');

            document.querySelectorAll('.member-tab-content').forEach(content => content.classList.add('hidden'));
            const target = btn.dataset.tab;
            const targetContent = document.getElementById(`tabContent_${target}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    }

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
            
            // Calculate current position and service from history records
            let calculatedPosArray = [];
            let calculatedSvcArray = [];
            
            const today = new Date().toISOString().split('T')[0];
            [...records].filter(rec => rec.date <= today).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(rec => {
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

            memberBasicInfo.innerHTML = window.renderMemberProfileHeader(member, family, calculatedPosArray, finalCalculatedSvc);

            // Attendance History (공용 member-profile.js가 규칙+화면을 모두 그림)
            window.renderAttendanceTab(id, member, history, leaderProfile);

            // Visitation Memos
            const visMemos = history.filter(h => h.type === '심방' || h.type === '상담');
            const visSec = document.getElementById('visitationHistorySection'), visList = document.getElementById('visitationMemoList');
            if (visMemos.length) { 
                if (visSec) visSec.classList.remove('hidden'); 
                if (visList) {
                    visList.innerHTML = visMemos.map(h => {
                        const memoVal = h.memo ? h.memo.trim() : '';
                        const testimonyVal = h.testimony_snapshot ? h.testimony_snapshot.trim() : '';
                        const isCounseling = h.type === '상담';
                        
                        let contentHTML = '';
                        if (memoVal) {
                            contentHTML += `
                                <div class="mb-2 bg-white/60 p-2.5 rounded-lg border border-slate-100">
                                    <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">${isCounseling ? '💬 상담 내용' : '✍️ 메모'}</span>
                                    <p class="text-xs text-slate-700 whitespace-pre-wrap font-bold leading-relaxed">${memoVal}</p>
                                </div>
                            `;
                        }
                        if (testimonyVal) {
                            contentHTML += `
                                <div class="${isCounseling ? 'bg-indigo-50/50 border-indigo-100/30' : 'bg-blue-50/50 border-blue-100/30'} p-2.5 rounded-lg border">
                                    <span class="block text-[10px] font-black ${isCounseling ? 'text-indigo-700' : 'text-blue-700'} uppercase tracking-wider mb-1">${isCounseling ? '📝 추가 메모' : '🎙️ 심방 간증'}</span>
                                    <p class="text-xs ${isCounseling ? 'text-indigo-900' : 'text-blue-900'} whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p>
                                </div>
                            `;
                        }
                        if (!memoVal && !testimonyVal) {
                            contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">기록된 상세 내용이 없습니다.</p>`;
                        }

                        const cardBg = isCounseling ? 'bg-indigo-50 border-indigo-100' : 'bg-teal-50 border-teal-100';
                        const textCol = isCounseling ? 'text-indigo-800 border-indigo-200/30' : 'text-teal-800 border-teal-200/30';
                        const titleText = isCounseling ? '상담 기록' : '심방 기록';

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
                if (visList) visList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white rounded-2xl border border-dashed border-slate-200">기록이 없습니다.</p>';
            }

            // Personal Records (수직 타임라인 디자인 적용)
            fetch(`/api/members/${id}/records`).then(r => r.json()).then(recs => {
                renderEditModalRecords(recs);
                
                // 타임라인 그리기
                const timelineContainer = document.getElementById('timelineContainer');
                if (timelineContainer) {
                    if (recs.length > 0) {
                        timelineContainer.classList.remove('hidden');
                        timelineContainer.innerHTML = `
                            <div class="relative border-l-2 border-slate-100 ml-4 my-2 space-y-6">
                                ${recs.map(r => {
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
            });

            memberHistoryModal.classList.remove('hidden');
        } catch (e) { console.error(e); }
    };


    // 성도 상세 조회 모달(#memberHistoryModal) 닫기 버튼
    // (member-edit.js 통합 작업 중 실수로 같이 지워졌던 부분을 복구함 — 2026-07-05)
    [document.getElementById('closeHistoryModal'), document.getElementById('closeHistoryModalBtn')].forEach(b => { if (b) b.addEventListener('click', () => memberHistoryModal.classList.add('hidden')); });

    // 등록/수정 모달(교회·교구·구역 연동, 가족검색, 인적사항 기록 CRUD, 삭제, 저장) 전체는
    // 공용 member-edit.js가 전담. 여기서는 초기화만 호출.
    if (window.MemberEditModule) {
        window.MemberEditModule.init({
            getMember: () => currentMemberData,
            setMember: (m) => { currentMemberData = m; },
            refreshList: () => { if (typeof loadData === 'function') loadData(); },
            refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
        });
    }

    // --- Header Church/Parish Selectors ---
    async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }
    async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
    async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

    async function updateHeaderParishOptions(churchId, targetParishId = null) {
        if (!filterParish) return;
        if (!churchId) return;
        
        if (churchId === '전체') {
            const optionsHtml = `<option value="전체" data-name="전체">모든 교구</option>`;
            filterParish.innerHTML = optionsHtml;
            filterParish.style.display = 'inline-block';
            if (filterParishSelect) {
                filterParishSelect.innerHTML = optionsHtml;
            }
            filterParish.value = '전체';
            if (filterParishSelect) filterParishSelect.value = '전체';
            return;
        }

        const parishes = await fetchParishes(churchId);
        if (parishes.length > 0) {
            const optionsHtml = `<option value="전체" data-name="전체">모든 교구</option>` + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
            filterParish.innerHTML = optionsHtml;
            filterParish.style.display = 'inline-block';
            if (filterParishSelect) {
                filterParishSelect.innerHTML = optionsHtml;
            }
            
            if (targetParishId) {
                const exists = parishes.some(p => p.id == targetParishId);
                if (exists) {
                    filterParish.value = targetParishId;
                    if (filterParishSelect) filterParishSelect.value = targetParishId;
                } else {
                    const bp = parishes.find(p => p.name.includes('부곡교구'));
                    if (bp) {
                        filterParish.value = bp.id;
                        if (filterParishSelect) filterParishSelect.value = bp.id;
                    }
                    else {
                        filterParish.value = '전체';
                        if (filterParishSelect) filterParishSelect.value = '전체';
                    }
                }
            } else {
                const bp = parishes.find(p => p.name.includes('부곡교구'));
                if (bp) {
                    filterParish.value = bp.id;
                    if (filterParishSelect) filterParishSelect.value = bp.id;
                }
                else {
                    filterParish.value = '전체';
                    if (filterParishSelect) filterParishSelect.value = '전체';
                }
            }
        } else {
            filterParish.innerHTML = '<option value="">교구 없음</option>';
            if (filterParishSelect) filterParishSelect.innerHTML = '<option value="">교구 없음</option>';
        }
    }

    async function initHeaderSelectors() {
        if (!headerChurch || !filterParish) return;

        const churches = await fetchChurches();
        const churchesHtml = `<option value="전체" data-name="전체">모든 교회</option>` + churches.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('');
        headerChurch.innerHTML = churchesHtml;
        if (filterChurchSelect) {
            filterChurchSelect.innerHTML = churchesHtml;
        }

        let savedChurchId = localStorage.getItem('activeChurchId');
        let savedParishId = localStorage.getItem('activeParishId');

        if (!savedChurchId) {
            const sc = churches.find(c => c.name.includes('서울중앙교회'));
            if (sc) savedChurchId = sc.id;
        }

        if (savedChurchId) {
            headerChurch.value = savedChurchId;
            if (filterChurchSelect) filterChurchSelect.value = savedChurchId;
        }

        await updateHeaderParishOptions(headerChurch.value, savedParishId);

        headerChurch.addEventListener('change', async () => {
            if (filterChurchSelect) filterChurchSelect.value = headerChurch.value;
            localStorage.setItem('activeChurchId', headerChurch.value);
            await updateHeaderParishOptions(headerChurch.value);
            localStorage.setItem('activeParishId', filterParish.value);
            updateDistrictFilterState();
            applyFilters();
        });

        if (filterChurchSelect) {
            filterChurchSelect.addEventListener('change', async () => {
                headerChurch.value = filterChurchSelect.value;
                localStorage.setItem('activeChurchId', filterChurchSelect.value);
                await updateHeaderParishOptions(filterChurchSelect.value);
                localStorage.setItem('activeParishId', filterParish.value);
                updateDistrictFilterState();
                applyFilters();
            });
        }

        filterParish.addEventListener('change', () => {
            if (filterParishSelect) filterParishSelect.value = filterParish.value;
            localStorage.setItem('activeParishId', filterParish.value);
            updateDistrictFilterState();
            applyFilters();
        });

        if (filterParishSelect) {
            filterParishSelect.addEventListener('change', () => {
                filterParish.value = filterParishSelect.value;
                localStorage.setItem('activeParishId', filterParishSelect.value);
                updateDistrictFilterState();
                applyFilters();
            });
        }
    }

    function updateDistrictFilterState() {
        const parishName = getSelectedParishName();
        if (parishName !== '부곡교구' && parishName !== '전체') {
            filterDistrict.value = '전체';
            filterDistrict.disabled = true;
            filterDistrict.classList.add('bg-gray-100', 'text-gray-400');
        } else {
            filterDistrict.disabled = false;
            filterDistrict.classList.remove('bg-gray-100', 'text-gray-400');
        }
    }

    // --- Filter Event Listeners ---
    searchName.addEventListener('input', applyFilters);
    filterDistrict.addEventListener('change', applyFilters);
    filterGender.addEventListener('change', applyFilters);
    filterCategory.addEventListener('change', applyFilters);
    filterStatus.addEventListener('change', applyFilters);
    const filterMaritalStatus = document.getElementById('filterMaritalStatus');
    if (filterMaritalStatus) {
        filterMaritalStatus.addEventListener('change', applyFilters);
    }
    roleCheckboxes.forEach(cb => cb.addEventListener('change', applyFilters));

    // --- Excel Export Control ---
    const excelExportModal = document.getElementById('excelExportModal');
    const closeExportModal = document.getElementById('closeExportModal');
    const cancelExport = document.getElementById('cancelExport');
    const submitExport = document.getElementById('submitExport');
    const btnSelectAllExport = document.getElementById('btnSelectAllExport');
    const exportColumnsContainer = document.getElementById('exportColumnsContainer');

    if (exportBtn && excelExportModal) {
        exportBtn.addEventListener('click', () => {
            if (filteredMembersData.length === 0) {
                alert('내보낼 데이터가 없습니다.');
                return;
            }
            excelExportModal.classList.remove('hidden');
        });

        const closeModal = () => excelExportModal.classList.add('hidden');
        closeExportModal.addEventListener('click', closeModal);
        cancelExport.addEventListener('click', closeModal);

        let allSelected = true;
        btnSelectAllExport.addEventListener('click', () => {
            const checkboxes = exportColumnsContainer.querySelectorAll('input[type="checkbox"]');
            allSelected = !allSelected;
            checkboxes.forEach(cb => cb.checked = allSelected);
            btnSelectAllExport.textContent = allSelected ? '전체 해제' : '전체 선택';
        });

        submitExport.addEventListener('click', () => {
            const checkedBoxes = exportColumnsContainer.querySelectorAll('input[type="checkbox"]:checked');
            if (checkedBoxes.length === 0) {
                alert('최소 한 개 이상의 항목을 선택해 주세요.');
                return;
            }

            const selectedCols = Array.from(checkedBoxes).map(cb => cb.value);

            const dataToExport = filteredMembersData.map(m => {
                const row = {};
                if (selectedCols.includes('name')) row['이름'] = m.name || '';
                if (selectedCols.includes('bs')) row['성별'] = m.bs === 'B' ? '형제' : (m.bs === 'S' ? '자매' : m.bs || '');
                if (selectedCols.includes('birth_year')) row['생년'] = m.birth_year || '';
                if (selectedCols.includes('salvation_date')) row['구원일'] = m.salvation_date || '';
                if (selectedCols.includes('church')) row['소속 교회'] = m.church || '서울중앙교회';
                if (selectedCols.includes('parish')) row['교구'] = m.parish || '';
                if (selectedCols.includes('district')) row['구역'] = m.district || '';
                if (selectedCols.includes('category')) row['소속회'] = m.category || '';
                if (selectedCols.includes('position')) row['직분'] = m.position || '';
                if (selectedCols.includes('church_service')) row['봉사'] = m.church_service && m.church_service !== '없음' ? m.church_service : '';
                if (selectedCols.includes('family_relation')) row['가족관계'] = m.family_relation || '';
                if (selectedCols.includes('phone')) row['연락처'] = m.phone || '';
                if (selectedCols.includes('address')) row['주소'] = m.address || '';
                if (selectedCols.includes('testimony')) row['메모(간증)'] = m.testimony || '';
                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "성도 목록");

            const parishName = getSelectedParishName() || '전체';
            const fileName = `성도현황_${parishName}_${new Date().toISOString().split('T')[0]}.xlsx`;

            XLSX.writeFile(workbook, fileName);
            closeModal();
        });
    }

    // --- Excel Import Control ---
    const importExcelBtn = document.getElementById('importExcelBtn');
    const excelImportModal = document.getElementById('excelImportModal');
    const closeImportModal = document.getElementById('closeImportModal');
    const cancelImport = document.getElementById('cancelImport');
    const submitImport = document.getElementById('submitImport');
    const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');
    const dropZone = document.getElementById('dropZone');
    const excelFileInput = document.getElementById('excelFileInput');
    const selectedFileInfo = document.getElementById('selectedFileInfo');
    const selectedFileName = document.getElementById('selectedFileName');
    const importProgressContainer = document.getElementById('importProgressContainer');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const progressBar = document.getElementById('progressBar');
    const importResultContainer = document.getElementById('importResultContainer');
    const importResultList = document.getElementById('importResultList');

    let selectedUploadFile = null;

    if (importExcelBtn && excelImportModal) {
        // 모달 열기
        importExcelBtn.addEventListener('click', () => {
            resetImportModal();
            excelImportModal.classList.remove('hidden');
        });

        // 모달 닫기
        const closeImport = () => {
            excelImportModal.classList.add('hidden');
            resetImportModal();
        };
        closeImportModal.addEventListener('click', closeImport);
        cancelImport.addEventListener('click', closeImport);

        // 드래그앤드롭 / 파일 선택 처리
        dropZone.addEventListener('click', () => excelFileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('border-blue-500', 'bg-blue-50/20');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50/20');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-blue-500', 'bg-blue-50/20');
            if (e.dataTransfer.files.length > 0) {
                handleFileSelect(e.dataTransfer.files[0]);
            }
        });
        excelFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        function handleFileSelect(file) {
            selectedUploadFile = file;
            selectedFileName.textContent = file.name;
            selectedFileInfo.classList.remove('hidden');
        }

        function resetImportModal() {
            selectedUploadFile = null;
            excelFileInput.value = '';
            selectedFileInfo.classList.add('hidden');
            importProgressContainer.classList.add('hidden');
            progressBar.style.width = '0%';
            progressPercent.textContent = '0%';
            progressText.textContent = '대기 중...';
            importResultContainer.classList.add('hidden');
            importResultList.innerHTML = '';
            submitImport.disabled = false;
            submitImport.textContent = '업로드 시작';
        }

        // 템플릿 파일 생성 및 다운로드 (SheetJS 활용)
        btnDownloadTemplate.addEventListener('click', () => {
            const headers = [
                '이름', '성별(형제/자매)', '생년', '구원일', '소속 교회', 
                '교구명', '구역명', '소속회(대분류)', '직분', '봉사', 
                '가족관계', '연락처', '주소', '메모'
            ];
            const exampleRow = [
                '홍길동', '형제', '1985', '2015-05-10', '서울중앙교회', 
                '부곡교구', '2구역', '봉사회', '조장', '미디어봉사', 
                '김영희(아내), 홍이동(자녀)', '010-1234-5678', '경기도 의왕시 ...', '일요일 오전 예배 참석'
            ];

            const ws1 = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

            const guideHeaders = ['구분', '내용 / 예시'];
            const guideRows = [
                ['작성 규칙 1', '가족 이름 옆에 괄호()를 열고 관계를 기재해 주세요. (남편/아내/자녀/부모/기타 중 입력)'],
                ['예시 1', '홍길동(남편)'],
                ['예시 2 (여러 명인 경우)', '홍길동(남편), 홍이동(자녀)'],
                ['작성 규칙 2', '가족 이름은 동일한 교구 내에 실제로 등록되는 성도 성명과 오타 없이 정확하게 일치해야 시스템에서 연결이 가능합니다.'],
                ['동명이인 주의', '만약 동일 교구 내에 동명이인이 존재할 경우 시스템에서 가족이 꼬이는 것을 방지하기 위해 자동 연결이 유보됩니다. 이 경우 업로드 완료 후 성도 상세 화면에서 직접 수동으로 가족을 연결해 주셔야 합니다.']
            ];
            const ws2 = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws1, "성도 정보");
            XLSX.utils.book_append_sheet(wb, ws2, "가족관계 작성 안내");

            XLSX.writeFile(wb, "성도등록_템플릿.xlsx");
        });

        // 엑셀 업로드 시작
        submitImport.addEventListener('click', () => {
            if (!selectedUploadFile) {
                alert('업로드할 엑셀 파일을 선택해 주세요.');
                return;
            }
            submitImport.disabled = true;
            submitImport.textContent = '업로드 진행 중...';
            importProgressContainer.classList.remove('hidden');

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet);

                    if (rows.length === 0) {
                        alert('엑셀 파일에 데이터가 없습니다.');
                        resetImportModal();
                        return;
                    }

                    const parsedMembers = rows.map(r => {
                        const rawGender = String(r['성별(형제/자매)'] || r['성별'] || '').trim();
                        let bs = '';
                        if (rawGender.includes('형제') || rawGender === 'B') bs = 'B';
                        else if (rawGender.includes('자매') || rawGender === 'S') bs = 'S';
                        
                        return {
                            name: String(r['이름'] || '').trim(),
                            bs: bs,
                            birth_year: r['생년'] ? parseInt(r['생년']) : null,
                            salvation_date: r['구원일'] || null,
                            church: String(r['소속 교회'] || r['교회'] || '서울중앙교회').trim(),
                            parish: String(r['교구명'] || r['교구'] || '').trim(),
                            district: String(r['구역명'] || r['구역'] || '').trim(),
                            category: String(r['소속회(대분류)'] || r['소속회'] || '').trim(),
                            position: String(r['직분'] || '').trim(),
                            church_service: String(r['봉사'] || '').trim(),
                            phone: String(r['연락처'] || r['핸드폰번호'] || r['휴대폰번호'] || '').trim(),
                            address: String(r['주소'] || '').trim(),
                            testimony: String(r['메모'] || r['메모(간증)'] || '').trim(),
                            family_relation_raw: String(r['가족관계'] || '').trim(),
                            status: 'active'
                        };
                    }).filter(m => m.name);

                    if (parsedMembers.length === 0) {
                        alert('올바른 성도 이름 정보를 찾을 수 없습니다.');
                        resetImportModal();
                        return;
                    }

                    const totalCount = parsedMembers.length;
                    let successCount = 0;
                    const insertedMembers = [];

                    for (let i = 0; i < totalCount; i++) {
                        const m = parsedMembers[i];
                        progressText.textContent = `[1/2단계] 성도 등록 중 (${i + 1}/${totalCount})...`;
                        const percent = Math.round(((i + 1) / totalCount) * 50);
                        progressBar.style.width = `${percent}%`;
                        progressPercent.textContent = `${percent}%`;

                        try {
                            const postData = { ...m, family_relation: '' };
                            const response = await fetch('/api/members', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(postData)
                            });
                            
                            if (response.ok) {
                                const result = await response.json();
                                insertedMembers.push({
                                    id: result.id,
                                    name: m.name,
                                    parish: m.parish,
                                    district: m.district,
                                    bs: m.bs,
                                    family_relation_raw: m.family_relation_raw
                                });
                                successCount++;
                            }
                        } catch (err) {
                            console.error('성도 등록 오류:', err);
                        }
                    }

                    const freshRes = await fetch('/api/members/search?status=active');
                    const dbAllMembers = await freshRes.json();

                    const skippedRelations = [];

                    for (let i = 0; i < insertedMembers.length; i++) {
                        const me = insertedMembers[i];
                        progressText.textContent = `[2/2단계] 가족관계 매핑 중 (${i + 1}/${insertedMembers.length})...`;
                        const percent = 50 + Math.round(((i + 1) / insertedMembers.length) * 50);
                        progressBar.style.width = `${percent}%`;
                        progressPercent.textContent = `${percent}%`;

                        const rawRel = me.family_relation_raw;
                        if (!rawRel) continue;

                        const entries = rawRel.split(',').map(s => s.trim()).filter(s => s);
                        const validRels = [];
                        const failedRels = [];

                        for (const entry of entries) {
                            const match = entry.match(/^(.+?)\((.+?)\)$/);
                            if (!match) {
                                failedRels.push({ relation: entry, reason: '작성 포맷 오류' });
                                continue;
                            }
                            const familyName = match[1].trim();
                            const relationTag = match[2].trim();

                            const matchedTargets = dbAllMembers.filter(m => 
                                m.name.trim() === familyName && 
                                m.parish === me.parish &&
                                m.id !== me.id
                            );

                            if (matchedTargets.length === 0) {
                                failedRels.push({ relation: entry, reason: '등록된 성도 없음' });
                            } else if (matchedTargets.length > 1) {
                                const districtMatch = matchedTargets.filter(m => m.district === me.district);
                                if (districtMatch.length === 1) {
                                    validRels.push(entry);
                                } else {
                                    failedRels.push({ relation: entry, reason: '교구 내 동명이인 다수' });
                                }
                            } else {
                                validRels.push(entry);
                            }
                        }

                        if (failedRels.length > 0) {
                            failedRels.forEach(fr => {
                                skippedRelations.push({
                                    name: me.name,
                                    location: `${me.parish} ${me.district || ''}`,
                                    rawEntry: fr.relation,
                                    reason: fr.reason
                                });
                            });
                        }

                        if (validRels.length > 0) {
                            try {
                                const validRelationString = validRels.join(', ');
                                await fetch(`/api/members/${me.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        name: me.name,
                                        parish: me.parish,
                                        district: me.district,
                                        bs: me.bs,
                                        family_relation: validRelationString
                                    })
                                });
                            } catch (e) {
                                console.error('가족관계 업데이트 에러:', e);
                            }
                        }
                    }

                    progressText.textContent = `업로드 완료! (성공: ${successCount}/${totalCount}명)`;
                    progressBar.style.width = '100%';
                    progressPercent.textContent = '100%';

                    if (skippedRelations.length > 0) {
                        importResultList.innerHTML = skippedRelations.map(sr => `
                            <tr class="hover:bg-slate-50 transition border-b text-[11px]">
                                <td class="p-2 font-bold text-slate-800">${sr.name}</td>
                                <td class="p-2 text-slate-500">${sr.location}</td>
                                <td class="p-2 text-slate-700 font-bold">${sr.rawEntry}</td>
                                <td class="p-2"><span class="px-1.5 py-0.5 rounded-full text-[9px] font-black ${sr.reason.includes('다수') ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-red-50 text-rose-700 border border-red-100'}">${sr.reason}</span></td>
                            </tr>
                        `).join('');
                        importResultContainer.classList.remove('hidden');
                    } else {
                        importResultList.innerHTML = `
                            <tr>
                                <td colspan="4" class="p-4 text-center text-slate-400 italic font-semibold">모든 성도 및 가족관계가 완벽하게 연결되었습니다!</td>
                            </tr>
                        `;
                        importResultContainer.classList.remove('hidden');
                    }

                    alert(`성도 정보 업로드가 완료되었습니다.\n등록 성공: ${successCount}명`);
                    submitImport.textContent = '완료';
                    loadData();

                } catch (err) {
                    console.error(err);
                    alert('엑셀 파일을 읽는 과정에서 오류가 발생했습니다.');
                    resetImportModal();
                }
            };
            reader.readAsArrayBuffer(selectedUploadFile);
        });
    }

    initHeaderSelectors().then(() => {
        updateDistrictFilterState();
        loadData().then(() => {
            // URL 파라미터 체크 및 모달 자동 오픈
            const urlParams = new URLSearchParams(window.location.search);
            const openId = urlParams.get('openId');
            const shouldEdit = urlParams.get('edit') === 'true';
            if (openId) {
                const parsedId = parseInt(openId);
                if (shouldEdit) {
                    openMemberHistoryModal(parsedId).then(() => {
                        memberHistoryModal.classList.add('hidden');
                        if (window.MemberEditModule) window.MemberEditModule.openAddModal(true);
                    });
                } else {
                    openMemberHistoryModal(parsedId);
                }
            }
        });
    });

});
