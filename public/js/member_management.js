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

    // --- memberAddForm 교회-교구-구역 셀렉트 박스 연동 이벤트 ---
    const formChurch = document.querySelector('#memberAddForm select[name="church"]');
    const formParish = document.querySelector('#memberAddForm select[name="parish"]');
    const formDistrict = document.querySelector('#memberAddForm select[name="district"]');

    if (formChurch && formParish && formDistrict) {
        formChurch.addEventListener('change', async () => {
            const opt = formChurch.options[formChurch.selectedIndex];
            const churchId = opt ? opt.dataset.id : null;
            await updateFormParishOptions(churchId);
            await updateFormDistrictOptions(formParish.value);
        });

        formParish.addEventListener('change', async () => {
            await updateFormDistrictOptions(formParish.value);
        });
    }

    async function updateFormParishOptions(churchId, targetParishName = null) {
        if (!formParish) return;
        if (!churchId) {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>';
            return;
        }
        let parishes = [];
        if (churchId !== 'temp-ext') {
            parishes = await fetchParishes(churchId);
        }
        
        let options = [...parishes];
        if (targetParishName) {
            const exists = parishes.some(p => p.name === targetParishName);
            if (!exists) {
                options.push({ id: 'temp-ext-parish', name: targetParishName });
            }
        }

        if (options.length > 0) {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>' + 
                options.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
            
            if (targetParishName) {
                formParish.value = targetParishName;
            } else {
                formParish.value = "";
            }
        } else {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>';
        }
    }

    async function updateFormDistrictOptions(parishName, targetDistrictName = null) {
        if (!formDistrict) return;
        if (!parishName) {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>';
            return;
        }
        
        const opt = formParish.querySelector(`option[value="${parishName}"]`);
        const parishId = opt ? opt.dataset.id : null;
        
        let districts = [];
        if (parishId && parishId !== 'temp-ext-parish') {
            districts = await fetchDistricts(parishId);
        }
        
        let options = [...districts];
        if (targetDistrictName) {
            const exists = districts.some(d => d.name === targetDistrictName);
            if (!exists) {
                options.push({ name: targetDistrictName });
            }
        }

        if (options.length > 0) {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>' + 
                options.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            
            if (targetDistrictName) {
                formDistrict.value = targetDistrictName;
            } else {
                formDistrict.value = "미배정";
            }
        } else {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>';
        }
    }


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

    function calculateAge(birthYear) {
        if (!birthYear) return '-';
        const year = parseInt(birthYear);
        return isNaN(year) ? '-' : (2026 - year + 1);
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
    const getDC = (d) => {
        if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
        if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
        if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
        return 'bg-amber-100 text-amber-800 border-amber-200';
    };

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

    // --- Family Logic ---
    const familySearchInput = document.getElementById('familySearchInput');
    const btnSearchFamily = document.getElementById('btnSearchFamily');
    const familySearchModal = document.getElementById('familySearchModal');
    const familySearchResultList = document.getElementById('familySearchResultList');
    const familyRelationText = document.getElementById('familyRelationText');
    const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
    const hiddenFamilyId = document.getElementById('hiddenFamilyId');
    let pendingRelationData = null;

    function updateFamilyUI() {
        linkedFamilyContainer.innerHTML = '';
        const currentText = familyRelationText.value.trim();
        if (!currentText) return;
        const entries = currentText.split(',').map(n => n.trim()).filter(n => n);
        if (!window._sessionLinkedNames) window._sessionLinkedNames = new Set();
        entries.forEach(entry => {
            const match = entry.match(/^(.+?)\((.+)\)$/);
            const name = match ? match[1].trim() : entry.trim();
            const rel = match ? match[2] : '';
            const isL = window._sessionLinkedNames.has(name);
            const badge = document.createElement('span');
            badge.className = isL ? 'bg-blue-100 text-blue-800 text-[11px] px-2 py-1.5 rounded-full font-bold border border-blue-200 shadow-sm mb-1' : 'bg-gray-100 text-gray-700 text-[11px] px-2 py-1.5 rounded-full font-bold border border-gray-200 shadow-sm mb-1';
            badge.innerHTML = `${name}${rel ? `<span class="opacity-60 ml-0.5">(${rel})</span>` : ''} <button type="button" class="text-red-400 hover:text-red-600 font-bold ml-1" onclick="removeFamilyBadgeByEntry('${entry.replace(/'/g, "\\'")}')">×</button>`;
            linkedFamilyContainer.appendChild(badge);
        });
    }

    window.removeFamilyBadgeByEntry = function(entry) {
        const currentText = familyRelationText.value.trim();
        const entries = currentText.split(',').map(n => n.trim()).filter(n => n);
        familyRelationText.value = entries.filter(e => e !== entry).join(', ');
        const nameMatch = entry.match(/^(.+?)\(/);
        if (window._sessionLinkedNames) window._sessionLinkedNames.delete(nameMatch ? nameMatch[1].trim() : entry.trim());
        updateFamilyUI();
    };

    async function handleFamilySearchOrAdd() {
        const q = familySearchInput.value.trim(); if (!q) return;
        try {
            const res = await fetch(`/api/members/family-search?q=${encodeURIComponent(q)}`);
            const members = await res.json();
            if (members.length > 0) {
                familySearchResultList.innerHTML = members.map(m => `<div class="p-3 border-b hover:bg-blue-50 cursor-pointer flex justify-between items-center text-left" onclick="initiateRelationChoice(${m.id}, '${m.name}', '${m.district}', '${m.bs}', ${m.family_id || 'null'})"><div><div class="font-bold text-blue-900">${m.name} (${m.bs})</div><div class="text-[11px] text-gray-500">${m.district}</div></div><svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>`).join('');
                familySearchModal.classList.remove('hidden');
            } else { initiateRelationChoice(null, q, null, null, null); }
        } catch (e) { initiateRelationChoice(null, q, null, null, null); }
        familySearchInput.value = '';
    }

    window.initiateRelationChoice = function(id, name, district, bs, familyId) {
        pendingRelationData = { id, name, district, bs, familyId };
        document.getElementById('relationTargetTitle').textContent = `'${name}' 성도와의 관계 선택`;
        familySearchModal.classList.add('hidden');
        document.getElementById('familyRelationSelectModal').classList.remove('hidden');
    };

    window.confirmRelation = function(type) {
        if (!pendingRelationData) return;
        const { id, name, bs, familyId } = pendingRelationData;
        let finalRel = type;
        if (type === '남편/아내') {
            if (currentMemberData && currentMemberData.bs) finalRel = (currentMemberData.bs === 'S') ? '남편' : '아내';
            else if (bs) finalRel = (bs === 'B') ? '아내' : '남편';
        }
        const entry = `${name.trim()}(${finalRel})`;
        const currentText = familyRelationText.value.trim();
        const entries = currentText ? currentText.split(',').map(n => n.trim()).filter(n => n) : [];
        if (!entries.includes(entry)) {
            entries.push(entry); familyRelationText.value = entries.join(', ');
            if (id) {
                if (!window._sessionLinkedNames) window._sessionLinkedNames = new Set();
                window._sessionLinkedNames.add(name.trim());
                if (familyId !== null && familyId !== undefined && familyId !== 'null' && familyId !== '') hiddenFamilyId.value = familyId;
                const myName = currentMemberData ? currentMemberData.name : '본인';
                const symRel = (finalRel === '남편') ? '아내' : (finalRel === '아내') ? '남편' : (finalRel === '자녀') ? '부모' : (finalRel === '부모') ? '자녀' : '기타';
                if (confirm(`'${name}' 성도의 가족관계에도 '${myName}(${symRel})'을 자동으로 등록할까요?`)) {
                    pendingCrossUpdates.push({ targetId: id, myName: myName, relationToAdd: `${myName}(${symRel})` });
                }
            }
        }
        updateFamilyUI(); document.getElementById('familyRelationSelectModal').classList.add('hidden'); pendingRelationData = null;
    };

    if (btnSearchFamily) btnSearchFamily.addEventListener('click', handleFamilySearchOrAdd);
    if (familySearchInput) familySearchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); handleFamilySearchOrAdd(); } });

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
            filteredMembersData.sort((a, b) => {
                if (a.district !== b.district) return a.district.localeCompare(b.district);
                const orderA = (a.sort_order === null || isNaN(a.sort_order)) ? 999999 : a.sort_order;
                const orderB = (b.sort_order === null || isNaN(b.sort_order)) ? 999999 : b.sort_order;
                if (orderA !== orderB) return orderA - orderB;
                return a.name.localeCompare(b.name);
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
            const fEnt = (m.family_relation || '').split(',').map(s => s.trim()).filter(s => s);
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
            
            return `<tr class="hover:bg-blue-50 border-b transition text-[13px] ${isEditSortMode ? 'bg-yellow-50' : ''}" data-id="${m.id}"><td class="p-2 text-center font-bold border-r ${isEditSortMode ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400'}">${indexCol}</td><td class="p-2 text-center border-r"><span class="px-2 py-0.5 rounded-full border font-bold text-[11px] ${getDC(m.district)}">${m.district || '-'}</span></td><td class="p-2 text-center font-bold text-gray-600 border-r">${getCI(m.category)}</td><td class="p-2 text-center font-black text-blue-800 border-r cursor-pointer hover:underline" onclick="openMemberHistoryModal(${m.id})">${m.name || ''}</td><td class="p-2 text-center border-r text-gray-700 font-bold">${rateHtml}</td><td class="p-2 text-center border-r text-gray-700">${m.birth_year || '-'}</td><td class="p-2 text-center border-r text-gray-700 font-bold">${calculateAge(m.birth_year)}</td><td class="p-2 text-center border-r text-gray-700">${m.salvation_date || '-'}</td><td class="p-2 text-center border-r text-yellow-800 font-bold">${m.position || '-'}</td><td class="p-2 text-center border-r text-green-800 font-bold">${(!m.church_service || m.church_service === '없음') ? '-' : m.church_service}</td><td class="p-2 border-r font-medium">${fHtml}</td><td class="p-2 text-center border-r text-gray-700 font-medium">${m.phone || '-'}</td><td class="p-2 border-r text-gray-700 truncate min-w-[150px]" title="${m.address || ''}">${m.address || '-'}</td><td class="p-2 text-gray-700 truncate min-w-[200px]" title="${m.testimony || ''}">${m.testimony || '-'}</td></tr>`;
        }).join('');
    }

    document.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => { const col = th.dataset.sort; if (currentSort.column === col) { currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc'; } else { currentSort.column = col; currentSort.direction = 'asc'; } renderTable(); }));

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const editMemberBtn = document.getElementById('editMemberBtn');
    const memberAddModal = document.getElementById('memberAddModal');
    const memberAddForm = document.getElementById('memberAddForm');
    const memberBasicInfo = document.getElementById('memberBasicInfo');
    const recordStatus = document.getElementById('recordStatus');
    const recordRemark = document.getElementById('recordRemark');
    const recordDate = document.getElementById('recordDate');
    const addRecordBtn = document.getElementById('addRecordBtn');
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
        'ETC': '기타' 
    };

    window.getRecordRemarkInputHTML = function(targetId, recordId, status, currentRemark) {
        const idSuffix = `${targetId}-${recordId}`;
        const remark = currentRemark || '';
        
        if (status === 'CHURCH_IN' || status === 'CHURCH_MOVE' || status === 'PARISH_MOVE') {
            setTimeout(() => {
                setupInlineOrgSelectors(targetId, recordId, status, remark);
            }, 0);
            return `
                <div id="inline-org-container-${idSuffix}" class="flex flex-col gap-1.5 min-w-[150px]">
                    <span class="text-[11px] text-gray-400 italic">로딩 중...</span>
                </div>
            `;
        } else if (status === 'DISTRICT') {
            const districts = ['581구역', '582구역', '583구역', '미배정'];
            return `
                <select id="edit-rec-remark-val-${idSuffix}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] bg-white outline-none font-bold cursor-pointer">
                    ${districts.map(d => `<option value="${d}" ${remark === d ? 'selected' : ''}>${d}</option>`).join('')}
                </select>
            `;
        } else if (status === 'CATEGORY') {
            const categories = ['봉사회', '어머니회', '청년회', '은장회'];
            return `
                <select id="edit-rec-remark-val-${idSuffix}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] bg-white outline-none font-bold cursor-pointer">
                    ${categories.map(c => `<option value="${c}" ${remark === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            `;
        } else if (status === 'SERVICE' || status === 'SERVICE_DISMISS') {
            const allServices = ['찬양대', '농인선교부', '청년회 임원', '중고등부', '환경조경부', '방송실', '미디어선교부', '문서선교부', '유아부', '시설관리부', '새신자부', '유치부', '교회직원', '대학선교부 임원', '미술선교부', '전도인'];
            const checkedSvc = remark.split(',').map(s => s.trim());
            return `
                <div class="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-200 rounded max-h-[100px] overflow-y-auto min-w-[200px]">
                    ${allServices.map(s => `
                        <label class="flex items-center gap-1 cursor-pointer hover:bg-blue-50 px-1 rounded transition text-[10px]">
                            <input type="checkbox" class="inline-rec-sub-svc-${idSuffix} w-3.5 h-3.5 text-blue-600 rounded" value="${s}" ${checkedSvc.includes(s) ? 'checked' : ''}>
                            <span class="font-bold text-gray-700">${s}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        } else if (status === 'POSITION' || status === 'POSITION_DISMISS') {
            const allPositions = ['교구장', '집사', '구역장', '조장', '구역총무', '조총무', '교구총무', '교구자매총무', '교구청년회장', '교구청년임원', '교구체육부장', '교구체육총무'];
            const checkedPos = remark.split(',').map(p => p.trim());
            return `
                <div class="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-200 rounded max-h-[100px] overflow-y-auto min-w-[200px]">
                    ${allPositions.map(p => `
                        <label class="flex items-center gap-1 cursor-pointer hover:bg-blue-50 px-1 rounded transition text-[10px]">
                            <input type="checkbox" class="inline-rec-sub-pos-${idSuffix} w-3.5 h-3.5 text-blue-600 rounded" value="${p}" ${checkedPos.includes(p) ? 'checked' : ''}>
                            <span class="font-bold text-gray-700">${p}</span>
                        </label>
                    `).join('')}
                </div>
            `;
        } else {
            return `
                <input type="text" value="${remark}" id="edit-rec-remark-val-${idSuffix}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] outline-none font-bold" placeholder="비고 입력...">
            `;
        }
    };

    async function setupInlineOrgSelectors(targetId, recordId, status, initialRemark) {
        const idSuffix = `${targetId}-${recordId}`;
        const container = document.getElementById(`inline-org-container-${idSuffix}`);
        if (!container) return;

        if (status === 'PARISH_MOVE') {
            const activeChurchName = currentMemberData ? currentMemberData.church : '서울중앙교회';
            const churches = await fetch('/api/churches/all').then(res => res.json());
            const matched = churches.find(c => c.name === activeChurchName);
            const churchId = matched ? matched.id : null;
            
            let parishes = [];
            if (churchId) {
                parishes = await fetchParishes(churchId);
            }
            
            container.innerHTML = `
                <select id="inline-parish-${idSuffix}" class="w-full border rounded px-1 py-0.5 text-[11px] font-bold text-blue-800 bg-white">
                    <option value="">교구 선택</option>
                    ${parishes.map(p => `<option value="${p.id}" data-name="${p.name}" ${p.name === initialRemark ? 'selected' : ''}>${p.name}</option>`).join('')}
                </select>
            `;
            return;
        }

        const churches = await fetch('/api/churches/all').then(res => res.json());
        
        const parts = initialRemark.split(' > ');
        const initialChurch = parts[0] || '';
        const initialParish = parts[1] || '';
        const initialDistrict = parts[2] || '';

        container.innerHTML = `
            <input type="text" id="inline-church-${idSuffix}" list="inline-church-list-${idSuffix}" value="${initialChurch}" class="w-full border rounded px-1 py-0.5 text-[11px] font-bold text-blue-800 bg-white" placeholder="교회 검색..." autocomplete="off">
            <datalist id="inline-church-list-${idSuffix}">
                ${churches.map(c => `<option value="${c.name}"></option>`).join('')}
            </datalist>
            <select id="inline-parish-${idSuffix}" class="w-full border rounded px-1 py-0.5 text-[11px] font-bold text-blue-800 bg-white hidden">
                <option value="">교구 선택</option>
            </select>
            <select id="inline-district-${idSuffix}" class="w-full border rounded px-1 py-0.5 text-[11px] font-bold text-blue-800 bg-white hidden">
                <option value="">구역 선택</option>
            </select>
        `;

        const subChurch = document.getElementById(`inline-church-${idSuffix}`);
        const subParish = document.getElementById(`inline-parish-${idSuffix}`);
        const subDistrict = document.getElementById(`inline-district-${idSuffix}`);

        const loadParish = async (churchId, targetParishName = null) => {
            if (!churchId) { subParish.classList.add('hidden'); subDistrict.classList.add('hidden'); return; }
            const parishes = await fetchParishes(churchId);
            if (parishes.length > 0) {
                subParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.id}" data-name="${p.name}" ${p.name === targetParishName ? 'selected' : ''}>${p.name}</option>`).join('');
                subParish.classList.remove('hidden');
            } else {
                subParish.innerHTML = '<option value="none">교구 정보 없음</option>';
                subParish.classList.remove('hidden');
            }
            subDistrict.classList.add('hidden');
        };

        const loadDistrict = async (parishId, targetDistrictName = null) => {
            if (status === 'PARISH_MOVE') return;
            if (!parishId || parishId === 'none') { subDistrict.classList.add('hidden'); return; }
            const districts = await fetchDistricts(parishId);
            if (districts.length > 0) {
                subDistrict.innerHTML = '<option value="">구역 선택</option>' + districts.map(d => `<option value="${d.id}" data-name="${d.name}" ${d.name === targetDistrictName ? 'selected' : ''}>${d.name}</option>`).join('');
                subDistrict.classList.remove('hidden');
            } else {
                subDistrict.innerHTML = '<option value="none">구역 정보 없음</option>';
                subDistrict.classList.remove('hidden');
            }
        };

        const onChurchSelect = async (churchName) => {
            const matched = churches.find(c => c.name === churchName);
            if (matched && matched.name === '서울중앙교회') {
                await loadParish(matched.id, initialParish);
                let initParishId = "";
                const activeParishOpt = subParish.options[subParish.selectedIndex];
                if (activeParishOpt && activeParishOpt.value !== 'none') {
                    initParishId = activeParishOpt.value;
                }
                if (initParishId) {
                    await loadDistrict(initParishId, initialDistrict);
                }
            } else {
                subParish.classList.add('hidden');
                subDistrict.classList.add('hidden');
            }
        };

        subChurch.addEventListener('change', () => onChurchSelect(subChurch.value));
        subChurch.addEventListener('input', () => onChurchSelect(subChurch.value));

        if (initialChurch) {
            await onChurchSelect(initialChurch);
        }
    }

    window.onRecordStatusChange = function(targetId, recordId, selectElement) {
        const idSuffix = `${targetId}-${recordId}`;
        const container = document.getElementById(`edit-rec-remark-container-${idSuffix}`);
        if (!container) return;
        
        const newStatus = selectElement.value;
        container.innerHTML = getRecordRemarkInputHTML(targetId, recordId, newStatus, '');
    };

    function renderEditModalRecords(recs) {
        const targets = ['editModalRecordTableBody', 'recordTableBody'];
        targets.forEach(targetId => {
            const b = document.getElementById(targetId);
            if (!b) return;
            b.innerHTML = recs.length ? recs.map((r, idx) => {
                const isEditing = currentMemberData ? (r.id === editingRecordId) : (idx === editingRecordId);
                
                if (isEditing) {
                    // 수정 모드 렌더링
                    return `
                        <tr class="text-[12px] border-b border-gray-50 bg-amber-50/30 transition">
                            <td class="p-2">
                                <input type="date" value="${r.date}" id="edit-rec-date-${targetId}-${r.id || idx}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] outline-none font-bold">
                            </td>
                            <td class="p-2">
                                <select id="edit-rec-status-${targetId}-${r.id || idx}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-[11px] bg-white outline-none font-bold cursor-pointer" onchange="onRecordStatusChange('${targetId}', ${r.id || idx}, this)">
                                    ${Object.entries(RECORD_STATUS_MAP).map(([k, v]) => `
                                        <option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>
                                    `).join('')}
                                </select>
                            </td>
                            <td class="p-2" id="edit-rec-remark-container-${targetId}-${r.id || idx}">
                                ${getRecordRemarkInputHTML(targetId, r.id || idx, r.status, r.remark)}
                            </td>
                            <td class="p-2 text-right whitespace-nowrap">
                                <button type="button" class="text-emerald-600 hover:text-emerald-700 font-bold p-1 mr-1 transition" onclick="saveRecordFromModal('${targetId}', ${currentMemberData ? r.id : idx}, ${currentMemberData ? currentMemberData.id : 'null'}, ${idx})">
                                    <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                                </button>
                                <button type="button" class="text-gray-400 hover:text-gray-600 font-bold p-1 transition" onclick="cancelRecordEdit()">
                                    <svg class="w-4 h-4 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                                </button>
                            </td>
                        </tr>
                    `;
                } else {
                    // 일반 조회 모드 렌더링
                    return `
                        <tr class="text-[12px] border-b border-gray-50 hover:bg-gray-50 transition">
                            <td class="p-2 text-gray-500">${r.date}</td>
                            <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border bg-slate-50">${RECORD_STATUS_MAP[r.status] || r.status}</span></td>
                            <td class="p-2 text-gray-700 font-bold">${r.remark || ''}</td>
                            <td class="p-2 text-right whitespace-nowrap">
                                <button type="button" class="text-blue-500 hover:text-blue-700 font-bold p-1 mr-1 transition" onclick="startRecordEdit(${currentMemberData ? r.id : idx})">
                                    <svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15.232 5.232l3.536 3.536m-2.036-2.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                </button>
                                <button type="button" class="text-red-400 hover:text-red-600 font-bold p-1 transition" onclick="deleteRecordFromModal(${currentMemberData ? r.id : idx}, ${currentMemberData ? currentMemberData.id : 'null'}, ${idx})">
                                    <svg class="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </td>
                        </tr>
                    `;
                }
            }).join('') : '<tr><td colspan="4" class="p-4 text-center text-gray-400 text-xs italic">없음</td></tr>';
        });
    }

    // 수정 취소
    window.cancelRecordEdit = function() {
        editingRecordId = null;
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    // 수정 시작
    window.startRecordEdit = function(recordId) {
        editingRecordId = recordId;
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    // 수정 저장
    window.saveRecordFromModal = async function(targetId, recordId, memberId, idx) {
        const dateInput = document.getElementById(`edit-rec-date-${targetId}-${recordId}`);
        const statusInput = document.getElementById(`edit-rec-status-${targetId}-${recordId}`);

        const date = dateInput ? dateInput.value : '';
        const status = statusInput ? statusInput.value : '';

        if (!date) return alert('날짜는 필수 입력 항목입니다.');

        let remark = '';
        const idSuffix = `${targetId}-${recordId}`;
        
        if (status === 'PARISH_MOVE') {
            const subParish = document.getElementById(`inline-parish-${idSuffix}`);
            if (subParish && subParish.value && subParish.value !== 'none') {
                remark = subParish.options[subParish.selectedIndex].textContent.trim();
            } else {
                return alert('이동할 교구를 선택하세요.');
            }
        } else if (status === 'CHURCH_IN' || status === 'CHURCH_MOVE') {
            const subChurch = document.getElementById(`inline-church-${idSuffix}`);
            const subParish = document.getElementById(`inline-parish-${idSuffix}`);
            const subDistrict = document.getElementById(`inline-district-${idSuffix}`);
            
            const cName = subChurch ? subChurch.value.trim() : '';
            if (cName) {
                let result = cName;
                
                if (cName === '서울중앙교회' && subParish && subParish.value && subParish.value !== 'none') {
                    const pName = subParish.options[subParish.selectedIndex].textContent.trim();
                    result += ' > ' + pName;
                    
                    if (subDistrict && subDistrict.value && subDistrict.value !== 'none') {
                        const dName = subDistrict.options[subDistrict.selectedIndex].textContent.trim();
                        result += ' > ' + dName;
                    }
                }
                remark = result;
            } else {
                return alert('교회를 입력 또는 선택하세요.');
            }
        } else if (status === 'DISTRICT' || status === 'CATEGORY') {
            const el = document.getElementById(`edit-rec-remark-val-${idSuffix}`);
            remark = el ? el.value : '';
        } else if (status === 'SERVICE' || status === 'SERVICE_DISMISS') {
            const checked = Array.from(document.querySelectorAll(`.inline-rec-sub-svc-${idSuffix}:checked`)).map(cb => cb.value);
            if (checked.length > 0) remark = checked.join(', ');
            else return alert('봉사 항목을 최소 하나 이상 선택하세요.');
        } else if (status === 'POSITION' || status === 'POSITION_DISMISS') {
            const checked = Array.from(document.querySelectorAll(`.inline-rec-sub-pos-${idSuffix}:checked`)).map(cb => cb.value);
            if (checked.length > 0) remark = checked.join(', ');
            else return alert('직분 항목을 최소 하나 이상 선택하세요.');
        } else {
            const el = document.getElementById(`edit-rec-remark-val-${idSuffix}`);
            remark = el ? el.value.trim() : '';
        }

        if (memberId && memberId !== 'null') {
            // 서버에 저장된 기록 수정
            try {
                const res = await fetch(`/api/members/records/${recordId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ date, status, remark })
                });
                
                if (res.ok) {
                    editingRecordId = null;
                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    if (typeof loadData === 'function') loadData(); // 메인 테이블 리로드
                } else {
                    const err = await res.json();
                    alert(`수정 실패: ${err.error || '알 수 없는 오류'}`);
                }
            } catch (e) {
                console.error(e);
                alert('통신 중 오류가 발생했습니다.');
            }
        } else {
            // 새 성도 등록 시 임시 기록 수정
            if (pendingRecords[idx]) {
                pendingRecords[idx].date = date;
                pendingRecords[idx].status = status;
                pendingRecords[idx].remark = remark;
            }
            editingRecordId = null;
            renderEditModalRecords(pendingRecords);
        }
    };

    window.deleteRecordFromModal = async function(recordId, memberId, idx) {
        if (!confirm('이 기록을 정말 삭제하시겠습니까?')) return;
        
        if (memberId && memberId !== 'null') {
            // 서버에 저장된 기록 삭제
            try {
                const res = await fetch(`/api/members/records/${recordId}`, { method: 'DELETE' });
                if (res.ok) {
                    editingRecordId = null; // 수정 모드 초기화
                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    if (typeof loadData === 'function') loadData();
                }
            } catch (e) { console.error(e); }
        } else {
            // 새 성도 등록 시 임시 기록 목록에서 삭제
            editingRecordId = null; // 수정 모드 초기화
            pendingRecords = pendingRecords.filter((_, i) => i !== idx);
            renderEditModalRecords(pendingRecords);
        }
    };

    window.deleteRecord = async (id) => { if (confirm('삭제할까요?')) { try { await fetch(`/api/members/records/${id}`, { method: 'DELETE' }); openMemberHistoryModal(currentMemberData.id); } catch (e) { console.error(e); } } };

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
            const { member, history, family } = await res.json(); 
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

            const fEnt = (member.family_relation || '').split(',').map(s => s.trim()).filter(s => s);
            
            // 가족관계 대화형 카드 생성 (클릭 시 순간이동)
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
                member.church ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-place-of-worship mr-1 text-[10px]"></i>${member.church}</span>` : '',
                member.parish ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${member.parish}</span>` : '',
                member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
                member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
                member.marital_status ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">${member.marital_status}</span>` : '',
                ...calculatedPosArray.map(p => `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${p}</span>`)
            ].filter(x => x).join(' ');

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
                <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">가족 관계 <span class="text-[9px] text-slate-400 font-normal ml-1">(이름을 누르면 프로필로 바로 전환됩니다)</span></span>
                <div class="flex flex-wrap gap-1.5 mt-1">
                    ${fDispHTML}
                </div>
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
            <div class="col-span-2 md:col-span-4 bg-yellow-50/30 p-4 rounded-xl border border-yellow-100/50 flex flex-col gap-1">
                <span class="text-yellow-700 text-[10px] font-black uppercase tracking-wider">기타 메모</span>
                <span class="font-medium text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">${member.testimony || '내용 없음'}</span>
            </div>`;

            // Attendance History
            const rawFilteredHistory = history.filter(h => h.type !== '심방' && h.type !== '설교' && h.type !== '외부설교' && h.date <= today);
            
            function isMandatoryMeeting(member, meeting) {
                const mType = meeting.type || '';
                const mDistMatch = mType.match(/\d+/);
                const mDistNum = mDistMatch ? mDistMatch[0] : null;
                const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

                // 0. Hard Exclusion: Youth Sisters (category: '청년회', bs: 'S') are excluded from ALL Group meetings (조모임)
                if (mType.includes('조모임')) {
                    if (member.category === '청년회' && member.bs === 'S') return false;
                    if (member.bs === 'B') return false; // Brothers are also excluded from Sisters' Group meetings
                }

                // 1. District Meetings (구역모임)
                if (mType.includes('구역모임')) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }

                // 2. Group Meetings (조모임) - Now only Sisters (S) who are NOT youth reach here
                if (mType.includes('조모임')) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }

                // 3. Global/Specific Meetings
                if (mType.includes('교구전체모임')) return true;
                if (mType.includes('교구형제모임') && member.bs === 'B') return true;
                if (mType.includes('교구임원모임') && (member.position || '').trim() !== '') return true;
                if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

                return false;
            }

            // Only keep meetings that are mandatory for this member OR where they actually attended (is_present is true/1)
            const filteredHistory = rawFilteredHistory.filter(h => {
                return isMandatoryMeeting(member, h) || h.is_present;
            });
            
            const getMeetingCategory = (type) => {
                if (type.includes('구역모임')) return 'district';
                if (type.includes('조모임')) return 'group';
                return 'other';
            };

            const stats = {
                all: { count: 0, present: 0 },
                district: { count: 0, present: 0 },
                group: { count: 0, present: 0 },
                other: { count: 0, present: 0 }
            };

            filteredHistory.forEach(h => {
                const cat = getMeetingCategory(h.type);
                stats.all.count++;
                if (h.is_present) stats.all.present++;
                
                stats[cat].count++;
                if (h.is_present) stats[cat].present++;
            });

            const getRate = (s) => s.count > 0 ? Math.round((s.present / s.count) * 100) : 0;

            const attendanceTabContainer = document.getElementById('tabContent_attendance');
            if (attendanceTabContainer) {
                attendanceTabContainer.innerHTML = `
                    <div class="mb-5 grid grid-cols-4 gap-3">
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-blue-500 bg-blue-50/20 ring-2 ring-blue-100/50" data-filter="all">
                            <span class="text-xl md:text-2xl mb-0.5">📊</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">전체 모임</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.all)}%</span>
                                <span class="text-xs md:text-sm font-extrabold text-blue-600">(${stats.all.present}/${stats.all.count}회)</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="district">
                            <span class="text-xl md:text-2xl mb-0.5">🏠</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">구역모임</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.district)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.district.present}/${stats.district.count}회)</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="group">
                            <span class="text-xl md:text-2xl mb-0.5">👥</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">조모임</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.group)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.group.present}/${stats.group.count}회)</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="other">
                            <span class="text-xl md:text-2xl mb-0.5">⛪</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">교구/기타</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.other)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.other.present}/${stats.other.count}회)</span>
                            </div>
                        </button>
                    </div>

                    <div class="mb-6">
                        <h4 class="font-extrabold mb-4 text-slate-800 border-l-4 border-emerald-600 pl-3 flex justify-between items-center text-sm md:text-base">
                            <span id="attListTitle" class="font-black text-slate-800">전체 출석 히스토리</span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs md:text-sm font-semibold text-slate-500">선택 출석률</span>
                                <span id="memberAttendanceStats" class="text-xs md:text-sm font-black text-blue-700 bg-blue-50/80 border border-blue-150 px-3 py-1 rounded-full shadow-sm">${getRate(stats.all)}% (${stats.all.present}/${stats.all.count})</span>
                            </div>
                        </h4>
                        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <table class="w-full text-sm text-left border-collapse bg-white">
                                <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                                    <tr>
                                        <th class="p-3.5 w-[110px] border-r text-center">날짜</th>
                                        <th class="p-3.5 min-w-[150px] border-r text-center">모임정보</th>
                                        <th class="p-3.5 text-center w-[90px] border-r">출석 여부</th>
                                        <th class="p-3.5 text-center">간증</th>
                                    </tr>
                                </thead>
                                <tbody id="historyTableBody" class="divide-y divide-slate-100"></tbody>
                            </table>
                        </div>
                    </div>
                `;

                const renderAttendanceRows = (filterType) => {
                    const historyTableBody = document.getElementById('historyTableBody');
                    if (!historyTableBody) return;

                    const listTitle = document.getElementById('attListTitle');
                    const statsLabel = document.getElementById('memberAttendanceStats');
                    
                    const listMap = {
                        all: '전체 출석 히스토리',
                        district: '🏠 구역모임 히스토리',
                        group: '👥 조모임 히스토리',
                        other: '⛪ 기타/교구모임 히스토리'
                    };
                    if (listTitle) listTitle.textContent = listMap[filterType];
                    if (statsLabel) {
                        const s = stats[filterType];
                        statsLabel.textContent = `${getRate(s)}% (${s.present}/${s.count})`;
                    }

                    const displayHistory = filterType === 'all' 
                        ? filteredHistory 
                        : filteredHistory.filter(h => getMeetingCategory(h.type) === filterType);

                    historyTableBody.innerHTML = displayHistory.map(h => {
                        const statusBadge = h.is_present 
                            ? `<span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">출석</span>`
                            : `<span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">결석</span>`;

                        return `
                            <tr class="text-sm border-b hover:bg-slate-50/50 transition-colors">
                                <td class="p-3 text-slate-500 font-medium whitespace-nowrap">${h.date}</td>
                                <td class="p-3 font-bold text-slate-800">${h.title}</td>
                                <td class="p-3 text-center">${statusBadge}</td>
                                <td class="p-3 text-slate-600 font-medium text-xs md:text-sm whitespace-pre-wrap leading-relaxed">${h.testimony_snapshot || '<span class="text-slate-350 italic">-</span>'}</td>
                            </tr>
                        `;
                    }).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">출석 기록이 존재하지 않습니다.</td></tr>';
                };

                renderAttendanceRows('all');

                const cards = attendanceTabContainer.querySelectorAll('.att-filter-card');
                cards.forEach(card => {
                    card.addEventListener('click', () => {
                        cards.forEach(c => {
                            c.classList.remove('border-blue-500', 'bg-blue-50/20', 'ring-2', 'ring-blue-100/50');
                            c.classList.add('border-slate-200', 'hover:border-slate-300', 'hover:bg-slate-50/30');
                            
                            const countSpan = c.querySelector('span:nth-child(4)');
                            if (countSpan) {
                                countSpan.classList.remove('text-blue-600');
                                countSpan.classList.add('text-slate-500');
                            }
                        });
                        card.classList.add('border-blue-500', 'bg-blue-50/20', 'ring-2', 'ring-blue-100/50');
                        card.classList.remove('border-slate-200', 'hover:border-slate-300', 'hover:bg-slate-50/30');

                        const countSpan = card.querySelector('span:nth-child(4)');
                        if (countSpan) {
                            countSpan.classList.remove('text-slate-500');
                            countSpan.classList.add('text-blue-600');
                        }

                        const filter = card.dataset.filter;
                        renderAttendanceRows(filter);
                    });
                });
            }

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
                                <div class="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/30">
                                    <span class="block text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">🎙️ 심방 간증</span>
                                    <p class="text-xs text-blue-900 whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p>
                                </div>
                            `;
                        }
                        if (!memoVal && !testimonyVal) {
                            contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">기록된 상세 내용이 없습니다.</p>`;
                        }

                        return `
                            <div class="bg-teal-50 p-4 rounded-xl border border-teal-100 shadow-sm flex flex-col gap-2">
                                <div class="text-xs font-black text-teal-800 border-b border-teal-200/30 pb-1 flex justify-between items-center">
                                    <span>📅 ${h.date} 심방 기록</span>
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
                            <div class="relative border-l-2 border-blue-100 ml-4 my-2 space-y-6">
                                ${recs.map(r => `
                                    <div class="relative pl-6">
                                        <div class="absolute -left-[7px] top-1.5 w-3.5 h-3.5 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>
                                        <div class="text-[10px] font-black text-slate-400 mb-0.5">${r.date}</div>
                                        <div class="text-xs font-black text-slate-800 mb-1">${RECORD_STATUS_MAP[r.status] || r.status}</div>
                                        <div class="text-xs font-bold text-blue-700 bg-blue-50/50 px-2 py-1.5 rounded-lg border border-blue-100/30 inline-block">${r.remark || '-'}</div>
                                    </div>
                                `).join('')}
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

    async function openAddModal(isEdit = false) {
        const sec = document.getElementById('editOnlyRecordSection');
        const deleteMemberFullyBtn = document.getElementById('deleteMemberFullyBtn');
        const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
        const hiddenFamilyId = document.getElementById('hiddenFamilyId');
        const familyRelationText = document.getElementById('familyRelationText');
        const recordDate = document.getElementById('recordDate');

        linkedFamilyContainer.innerHTML = ''; hiddenFamilyId.value = '';
        if (familyRelationText) familyRelationText.value = '';

        if (formChurch) {
            formChurch.disabled = false;
            formChurch.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400');
            formChurch.classList.add('bg-blue-50/50', 'text-blue-800');
        }
        if (formParish) {
            formParish.disabled = false;
            formParish.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400');
            formParish.classList.add('bg-blue-50/50', 'text-blue-800');
        }
        if (formDistrict) {
            formDistrict.disabled = false;
            formDistrict.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400');
            formDistrict.classList.add('bg-white');
        }

        pendingCrossUpdates = [];
        pendingRecords = [];
        renderEditModalRecords([]);

        // 교회 목록 로드 및 옵션 바인딩
        const allChurches = await fetchChurches();
        if (formChurch) {
            let options = [...allChurches];
            if (isEdit && currentMemberData && currentMemberData.church) {
                const exists = allChurches.some(c => c.name === currentMemberData.church);
                if (!exists) {
                    options.push({ id: 'temp-ext', name: currentMemberData.church });
                }
            }
            formChurch.innerHTML = options.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
        }

        if (!isEdit) { 
            currentMemberData = null; 
            memberAddForm.reset(); 
            
            // 등록 모드: 현재 헤더의 선택 상태에 맞추어 디폴트 교회/교구 지정
            if (headerChurch && formChurch) {
                const opt = headerChurch.options[headerChurch.selectedIndex];
                const activeChurchName = opt ? opt.textContent.trim() : '서울중앙교회';
                formChurch.value = activeChurchName;
                
                const churchId = headerChurch.value;
                const activeParishOpt = filterParishSelect ? filterParishSelect.options[filterParishSelect.selectedIndex] : null;
                const activeParishName = (activeParishOpt && activeParishOpt.value !== '전체') ? activeParishOpt.textContent.trim() : null;
                
                await updateFormParishOptions(churchId, activeParishName);
                await updateFormDistrictOptions(activeParishName, null);
            } else {
                await updateFormParishOptions(null);
                await updateFormDistrictOptions(null);
            }

            // 새 성도 등록 시에도 기록 섹션 표시
            if (sec) sec.classList.remove('hidden'); 
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.add('hidden');
            window._sessionLinkedNames = new Set(); 
            updateFamilyUI(); 
            if (recordDate) recordDate.value = new Date().toISOString().split('T')[0];
        }
        else {
            // 수정 모드: 성도의 기존 교회/교구/구역 바인딩
            if (formChurch) {
                formChurch.value = currentMemberData.church || '서울중앙교회';
            }
            const cOpt = formChurch.querySelector(`option[value="${formChurch.value}"]`);
            const churchId = cOpt ? cOpt.dataset.id : null;
            
            await updateFormParishOptions(churchId, currentMemberData.parish);
            await updateFormDistrictOptions(currentMemberData.parish, currentMemberData.district);

            const ipts = memberAddForm.querySelectorAll('input, select, textarea');
            ipts.forEach(i => { 
                if (i.name === 'church' || i.name === 'parish' || i.name === 'district') return; // 수동으로 설정 완료했으므로 스킵
                if (i.type === 'checkbox') { 
                    i.checked = (currentMemberData[i.name] || '').split(',').map(s=>s.trim()).includes(i.value); 
                } else if (currentMemberData[i.name] !== undefined) { 
                    i.value = currentMemberData[i.name] || ''; 
                } 
            });

            if (currentMemberData.family_id) hiddenFamilyId.value = currentMemberData.family_id;
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.remove('hidden');
            window._sessionLinkedNames = new Set(); updateFamilyUI();
            if (currentMemberData.id) {
                fetch(`/api/members/${currentMemberData.id}/history`).then(r => r.json()).then(d => { if (d.family) { d.family.forEach(f => window._sessionLinkedNames.add(f.name.trim())); updateFamilyUI(); } });
                fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => {
                    renderEditModalRecords(recs);
                    const hasOrgRecord = recs.some(rec => 
                        rec.status === 'CHURCH_IN' || 
                        rec.status === 'CHURCH_MOVE' || 
                        rec.status === 'PARISH_MOVE' || 
                        rec.status === 'DISTRICT'
                    );
                    if (hasOrgRecord) {
                        [formChurch, formParish, formDistrict].forEach(el => {
                            if (el) {
                                el.disabled = true;
                                el.classList.add('bg-slate-100', 'cursor-not-allowed', 'text-slate-400');
                                el.classList.remove('bg-blue-50/50', 'text-blue-800', 'bg-white');
                            }
                        });
                    }
                });
            }
            if (sec) { sec.classList.remove('hidden'); if(recordDate) recordDate.value = new Date().toISOString().split('T')[0]; }
        }
        memberAddModal.classList.remove('hidden');
    }

    editMemberBtn.addEventListener('click', () => { memberHistoryModal.classList.add('hidden'); openAddModal(true); });
    [document.getElementById('closeHistoryModal'), document.getElementById('closeHistoryModalBtn')].forEach(b => b.addEventListener('click', () => memberHistoryModal.classList.add('hidden')));
    [document.getElementById('closeAddMemberModal'), document.getElementById('cancelAddMember')].forEach(b => b.addEventListener('click', () => memberAddModal.classList.add('hidden')));

    const deleteMemberBtn = document.getElementById('deleteMemberBtn');
    if (deleteMemberBtn) {
        deleteMemberBtn.addEventListener('click', async () => {
            if (!currentMemberData) return;
            if (!confirm(`정말 [${currentMemberData.name}] 성도님을 '교제안나옴' 상태로 변경하시겠습니까?`)) return;
            
            try {
                const res = await fetch(`/api/members/${currentMemberData.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...currentMemberData,
                        status: 'inactive'
                    })
                });
                
                if (res.ok) {
                    alert('성공적으로 변경되었습니다.');
                    memberHistoryModal.classList.add('hidden');
                    loadData();
                } else {
                    alert('처리에 실패하였습니다.');
                }
            } catch (err) {
                console.error(err);
                alert('오류가 발생했습니다.');
            }
        });
    }

    const deleteMemberFullyBtn = document.getElementById('deleteMemberFullyBtn');
    if (deleteMemberFullyBtn) {
        deleteMemberFullyBtn.addEventListener('click', async () => {
            if (!currentMemberData) return;
            if (!confirm(`정말 [${currentMemberData.name}] 성도님의 정보를 전체 삭제하시겠습니까?\n삭제된 정보는 절대 복구할 수 없습니다.`)) return;
            
            try {
                const res = await fetch(`/api/members/${currentMemberData.id}`, {
                    method: 'DELETE'
                });
                
                if (res.ok) {
                    alert('성공적으로 삭제되었습니다.');
                    memberAddModal.classList.add('hidden');
                    loadData();
                } else {
                    alert('삭제 처리에 실패하였습니다.');
                }
            } catch (err) {
                console.error(err);
                alert('오류가 발생했습니다.');
            }
        });
    }

    // ESC 키로 모달 닫기 기능
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const memberAddModal = document.getElementById('memberAddModal');
            const memberHistoryModal = document.getElementById('memberHistoryModal');
            
            if (memberAddModal && !memberAddModal.classList.contains('hidden')) {
                memberAddModal.classList.add('hidden');
            } else if (memberHistoryModal && !memberHistoryModal.classList.contains('hidden')) {
                memberHistoryModal.classList.add('hidden');
            }
        }
    });

    if (addRecordBtn) {
        addRecordBtn.addEventListener('click', async () => {
            const date = recordDate.value, statusKey = recordStatus.value;
            let remark = recordRemark.value.trim();
            
            // 구역, 소속 또는 직분 변경인 경우 선택된 값을 remark로 사용
            if (statusKey === 'DISTRICT') {
                const subDist = document.getElementById('recordSubDistrict');
                if (subDist) remark = subDist.value;
            } else if (statusKey === 'CATEGORY') {
                const subCat = document.getElementById('recordSubCategory');
                if (subCat) remark = subCat.value;
            } else if (statusKey === 'SERVICE' || statusKey === 'SERVICE_DISMISS') {
                const checked = Array.from(document.querySelectorAll('.record-sub-svc:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('봉사 항목을 최소 하나 이상 선택하세요.');
            } else if (statusKey === 'POSITION' || statusKey === 'POSITION_DISMISS') {
                const checked = Array.from(document.querySelectorAll('.record-sub-pos:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('직분을 최소 하나 이상 선택하세요.');
            } else if (statusKey === 'CHURCH_IN' || statusKey === 'CHURCH_MOVE') {
                const c = document.getElementById('subChurch'), p = document.getElementById('subParish'), d = document.getElementById('subDistrict');
                const cName = c ? c.value.trim() : '';
                if (!cName) return alert('교회를 입력 또는 선택하세요.');
                if (cName === '서울중앙교회') {
                    const pName = p ? (p.options[p.selectedIndex]?.text || '') : '', dName = d ? (d.options[d.selectedIndex]?.text || '') : '';
                    remark = `${cName}${pName && pName !== '교구 선택' && pName !== '교구 정보 없음' ? ' > ' + pName : ''}${dName && dName !== '구역 선택' && dName !== '구역 정보 없음' ? ' > ' + dName : ''}`;
                } else {
                    remark = cName;
                }
            } else if (statusKey === 'PARISH_MOVE') {
                const p = document.getElementById('subParish');
                remark = p.options[p.selectedIndex]?.text || '';
                if (!remark || remark === '교구 선택' || remark === '교구 정보 없음') return alert('이동할 교구를 선택하세요.');
            }

            if (!date || !statusKey || !remark) return;

            if (currentMemberData) {
                // 기존 성도 수정 시: 즉시 서버 저장
                try {
                    const res = await fetch(`/api/members/${currentMemberData.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, status: statusKey, remark }) });
                    if (res.ok) { 
                        fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs)); 
                        loadData(); 
                        recordRemark.value = '';
                        // 리셋
                        recordStatus.dispatchEvent(new Event('change'));
                    }
                } catch (e) { console.error(e); }
            } else {
                // 새 성도 등록 시: 임시 목록에 추가
                pendingRecords.push({ date, status: statusKey, remark });
                renderEditModalRecords(pendingRecords);
                recordRemark.value = '';
                // 리셋
                recordStatus.dispatchEvent(new Event('change'));
            }
        });
    }

    async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }
    async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
    async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

    async function setupOrgSelectors(container, status) {
        if (status === 'PARISH_MOVE') {
            const activeChurchName = currentMemberData ? currentMemberData.church : (formChurch ? formChurch.value : '서울중앙교회');
            const churches = await fetch('/api/churches/all').then(res => res.json());
            const matched = churches.find(c => c.name === activeChurchName);
            const churchId = matched ? matched.id : null;
            
            let parishes = [];
            if (churchId) {
                parishes = await fetchParishes(churchId);
            }
            
            container.innerHTML = `
                <div class="flex flex-col gap-2">
                    <select id="subParish" class="w-full border rounded-lg px-3 py-2 text-sm font-bold text-blue-800 bg-white">
                        <option value="">교구 선택</option>
                        ${parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('')}
                    </select>
                </div>
            `;
            return;
        }

        const churches = await fetch('/api/churches/all').then(res => res.json());
        container.innerHTML = `
            <div class="flex flex-col gap-2">
                <input type="text" id="subChurch" list="church-list" class="w-full border rounded-lg px-3 py-2 text-sm font-bold text-blue-800 bg-white shadow-sm" placeholder="교회 이름 검색 및 선택..." autocomplete="off">
                <datalist id="church-list">
                    ${churches.map(c => `<option value="${c.name}"></option>`).join('')}
                </datalist>
                <select id="subParish" class="w-full border rounded-lg px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden shadow-sm">
                    <option value="">교구 선택</option>
                </select>
                <select id="subDistrict" class="w-full border rounded-lg px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden shadow-sm">
                    <option value="">구역 선택</option>
                </select>
            </div>
        `;

        const subChurch = document.getElementById('subChurch');
        const subParish = document.getElementById('subParish');
        const subDistrict = document.getElementById('subDistrict');

        const onChurchSelect = async (churchName) => {
            const matched = churches.find(c => c.name === churchName);
            if (!matched || matched.name !== '서울중앙교회') {
                subParish.classList.add('hidden');
                subDistrict.classList.add('hidden');
                return;
            }
            const parishes = await fetchParishes(matched.id);
            if (parishes.length > 0) {
                subParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
                subParish.classList.remove('hidden');
            } else {
                subParish.innerHTML = '<option value="none">교구 정보 없음</option>';
                subParish.classList.remove('hidden');
            }
            subDistrict.classList.add('hidden');
        };

        subChurch.addEventListener('change', () => onChurchSelect(subChurch.value));
        subChurch.addEventListener('input', () => onChurchSelect(subChurch.value));

        subParish.addEventListener('change', async () => {
            if (status === 'PARISH_MOVE') return;
            if (!subParish.value || subParish.value === 'none') { subDistrict.classList.add('hidden'); return; }
            const districts = await fetchDistricts(subParish.value);
            if (districts.length > 0) {
                subDistrict.innerHTML = '<option value="">구역 선택</option>' + districts.map(d => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('');
                subDistrict.classList.remove('hidden');
            } else {
                subDistrict.innerHTML = '<option value="none">구역 정보 없음</option>';
                subDistrict.classList.remove('hidden');
            }
        });
    }

    if (recordStatus) {
        recordStatus.addEventListener('change', () => {
            const val = recordStatus.value;
            const subContainer = document.getElementById('recordSubStatusContainer');
            const subInputContainer = document.getElementById('recordSubStatusInputContainer');
            const remarkInput = recordRemark;

            if (val === 'CHURCH_IN' || val === 'CHURCH_MOVE' || val === 'PARISH_MOVE') {
                subContainer.classList.remove('hidden');
                setupOrgSelectors(subInputContainer, val);
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'DISTRICT') {
                subContainer.classList.remove('hidden');
                subInputContainer.innerHTML = `
                    <select id="recordSubDistrict" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none shadow-sm bg-white font-bold text-blue-800">
                        <option value="581구역">581구역</option>
                        <option value="582구역">582구역</option>
                        <option value="583구역">583구역</option>
                        <option value="미배정">미배정</option>
                    </select>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'CATEGORY') {
                subContainer.classList.remove('hidden');
                subInputContainer.innerHTML = `
                    <select id="recordSubCategory" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none shadow-sm bg-white font-bold text-blue-800">
                        <option value="봉사회">봉사회</option>
                        <option value="어머니회">어머니회</option>
                        <option value="청년회">청년회</option>
                        <option value="은장회">은장회</option>
                    </select>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'SERVICE' || val === 'SERVICE_DISMISS') {
                subContainer.classList.remove('hidden');
                const allServices = ['찬양대', '농인선교부', '청년회 임원', '중고등부', '환경조경부', '방송실', '미디어선교부', '문서선교부', '유아부', '시설관리부', '새신자부', '유치부', '교회직원', '대학선교부 임원', '미술선교부', '전도인'];
                subInputContainer.innerHTML = `
                    <div class="flex flex-wrap gap-2 p-2 bg-white border rounded-lg shadow-sm">
                        ${allServices.map(s => `
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-2 py-1 rounded transition">
                                <input type="checkbox" class="record-sub-svc w-4 h-4 text-blue-600 rounded" value="${s}">
                                <span class="text-xs font-bold text-gray-700">${s}</span>
                            </label>
                        `).join('')}
                    </div>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'POSITION' || val === 'POSITION_DISMISS') {
                subContainer.classList.remove('hidden');
                const allPositions = ['교구장', '집사', '구역장', '조장', '구역총무', '조총무', '교구총무', '교구자매총무', '교구청년회장', '교구청년임원', '교구체육부장', '교구체육총무'];
                subInputContainer.innerHTML = `
                    <div class="flex flex-wrap gap-2 p-2 bg-white border rounded-lg shadow-sm">
                        ${allPositions.map(p => `
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-2 py-1 rounded transition">
                                <input type="checkbox" class="record-sub-pos w-4 h-4 text-blue-600 rounded" value="${p}">
                                <span class="text-xs font-bold text-gray-700">${p}</span>
                            </label>
                        `).join('')}
                    </div>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else {
                subContainer.classList.add('hidden');
                subInputContainer.innerHTML = '';
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.remove('hidden');
            }
        });
    }

    memberAddForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {}; new FormData(memberAddForm).forEach((v, k) => data[k] = v);
        
        // disabled 상태여서 FormData에서 생략된 소속 정보 보정
        if (currentMemberData) {
            if (!data.church) data.church = currentMemberData.church;
            if (!data.parish) data.parish = currentMemberData.parish;
            if (!data.district) data.district = currentMemberData.district;
        }

        data.crossUpdates = pendingCrossUpdates;
        data.pendingRecords = pendingRecords; // 새 성도용 임시 기록 포함
        
        try {
            const url = currentMemberData ? `/api/members/${currentMemberData.id}` : '/api/members';
            const res = await fetch(url, { method: currentMemberData ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { memberAddModal.classList.add('hidden'); loadData(); }
        } catch (e) { console.error(e); }
    });

    // --- Header Church/Parish Selectors ---
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
            if (openId) {
                openMemberHistoryModal(parseInt(openId));
            }
        });
    });
});
