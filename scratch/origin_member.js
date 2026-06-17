document.addEventListener('DOMContentLoaded', () => {
    let allMembersData = []; 
    let filteredMembersData = []; 
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

    // --- memberAddForm 援먰쉶-援먭뎄-援ъ뿭 ??됲듃 諛뺤뒪 ?곕룞 ?대깽??---
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
            formParish.innerHTML = '<option value="">援먭뎄 ?좏깮 (?놁쓬)</option>';
            return;
        }
        const parishes = await fetchParishes(churchId);
        if (parishes && parishes.length > 0) {
            formParish.innerHTML = '<option value="">援먭뎄 ?좏깮 (?놁쓬)</option>' + 
                parishes.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
            
            if (targetParishName) {
                formParish.value = targetParishName;
            } else {
                formParish.value = "";
            }
        } else {
            formParish.innerHTML = '<option value="">援먭뎄 ?좏깮 (?놁쓬)</option>';
        }
    }

    async function updateFormDistrictOptions(parishName, targetDistrictName = null) {
        if (!formDistrict) return;
        if (!parishName) {
            formDistrict.innerHTML = '<option value="誘몃같??>誘몃같??/option>';
            return;
        }
        
        const opt = formParish.querySelector(`option[value="${parishName}"]`);
        const parishId = opt ? opt.dataset.id : null;
        
        if (!parishId) {
            formDistrict.innerHTML = '<option value="誘몃같??>誘몃같??/option>';
            return;
        }

        const districts = await fetchDistricts(parishId);
        if (districts && districts.length > 0) {
            formDistrict.innerHTML = '<option value="誘몃같??>誘몃같??/option>' + 
                districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            
            if (targetDistrictName) {
                formDistrict.value = targetDistrictName;
            } else {
                formDistrict.value = "誘몃같??;
            }
        } else {
            formDistrict.innerHTML = '<option value="誘몃같??>誘몃같??/option>';
        }
    }


    async function loadData() {
        try {
            const response = await fetch('/api/members/search?status=all');
            allMembersData = await response.json();
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
            return '?쒖슱以묒븰援먰쉶';
        }
        const opt = headerChurch.options[headerChurch.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    function getSelectedParishName() {
        if (!filterParish || filterParish.selectedIndex === -1 || !filterParish.options[filterParish.selectedIndex]) {
            return '?꾩껜';
        }
        const opt = filterParish.options[filterParish.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    function applyFilters() {
        const nameQuery = searchName.value.trim().toLowerCase();
        const churchName = getSelectedChurchName();
        const parishName = getSelectedParishName();
        const district = filterDistrict.value, gender = filterGender.value, category = filterCategory.value, statusVal = filterStatus.value;
        const checkedRoles = Array.from(roleCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
        const isAllChecked = checkedRoles.includes('all');

        const primaryMatches = allMembersData.filter(m => {
            if (nameQuery && !m.name.toLowerCase().includes(nameQuery)) return false;
            
            // 援먰쉶 ?꾪꽣
            const mChurch = m.church || '?쒖슱以묒븰援먰쉶';
            if (churchName && churchName !== '?꾩껜' && mChurch !== churchName) return false;
            
            // 援먭뎄 ?꾪꽣
            const mParish = m.parish || '遺怨↔탳援?;
            if (parishName !== '?꾩껜' && parishName !== '援먭뎄 ?놁쓬' && mParish !== parishName) return false;
            
            // 援ъ뿭 ?꾪꽣: 援먭뎄媛 '遺怨↔탳援???寃쎌슦?먮쭔 援ъ뿭 ?꾪꽣 ?곸슜 (? 援먭뎄??援ъ뿭???놁쓣 ???덉쓬)
            if (parishName === '遺怨↔탳援? || parishName === '?꾩껜') {
                if (district !== '?꾩껜' && m.district !== district) return false;
            }
            
            if (gender !== '?꾩껜' && m.bs !== gender) return false;
            if (category !== '?꾩껜' && m.category !== category) return false;
            if (statusVal !== 'all' && (m.status || 'active') !== statusVal) return false;
            
            // 紐⑤뱺 湲곕낯 議곌굔(?대쫫, ?뚯냽 ?????듦낵???? 泥댄겕諛뺤뒪(??븷) 議곌굔 寃??            if (isAllChecked) return true;
            if (checkedRoles.length === 0) return false;
            const hasPos = m.position && m.position.trim() !== '', isDeacon = m.position && m.position.includes('吏묒궗'), hasSvc = m.church_service && m.church_service.trim() !== '' && m.church_service !== '?놁쓬';
            if (checkedRoles.includes('officer') && hasPos) return true;
            if (checkedRoles.includes('deacon') && isDeacon) return true;
            if (checkedRoles.includes('none') && !hasPos && !hasSvc) return true;
            return false;
        });

        filteredMembersData = primaryMatches;
        renderTable();
    }

    // --- Helper Functions ---
    const getCI = (cat) => { if (!cat) return '-'; if (cat.includes('遊됱궗')) return '遊?; if (cat.includes('?대㉧??)) return '??; if (cat.includes('泥?뀈')) return '泥?; if (cat.includes('???)) return '?'; return cat[0]; };
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
            btnEditSortMode.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg> ?몄쭛 醫낅즺`;
            btnEditSortMode.className = "bg-red-600 text-white px-4 py-2 rounded font-bold text-sm hover:bg-red-700 transition flex items-center gap-2";
            btnSaveSort.classList.remove('hidden');
        } else {
            btnEditSortMode.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> 而ㅼ뒪? ?뺣젹 ?섏젙`;
            btnEditSortMode.className = "bg-gray-800 text-white px-4 py-2 rounded font-bold text-sm hover:bg-black transition flex items-center gap-2";
            btnSaveSort.classList.add('hidden');
        }
        renderTable();
    }

    async function saveNewOrder() {
        const orderData = filteredMembersData.map((m, index) => ({ id: m.id, sort_order: index + 1 }));
        try {
            const res = await fetch('/api/members/sort-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: orderData }) });
            if (res.ok) { alert('?쒖꽌媛 ??λ릺?덉뒿?덈떎.'); toggleEditSortMode(); loadData(); }
        } catch (err) { alert('????ㅽ뙣'); }
    }

    btnEditSortMode.addEventListener('click', toggleEditSortMode);
    btnSaveSort.addEventListener('click', saveNewOrder);
    btnCustomSort.addEventListener('click', () => { currentSort = { column: 'sort_order', direction: 'asc' }; renderTable(); });

    window.moveMemberIndex = (currentIndex, memberName) => {
        const total = filteredMembersData.length;
        const targetNameInput = prompt(`'${memberName}' ?깅룄瑜??대뒓 ?깅룄 ?꾨줈 ?대룞?쒗궗源뚯슂?\n- ?щ엺 ?대쫫 ?낅젰 (?? ?띻만??\n- ?붾㈃ No ?レ옄 ?낅젰 (?? 15)\n- 留??꾨줈 蹂대궡?ㅻ㈃ '0' ?먮뒗 '留⑥쐞' ?낅젰`);
        if (targetNameInput === null) return;

        const query = targetNameInput.trim();
        if (!query) return;

        let targetMemberObj = null;
        let isTop = false;

        if (query === '0' || query === '留⑥쐞' || query === '留???) {
            isTop = true;
        } else {
            // 1. Check if the query is a number (No)
            const targetNo = parseInt(query);
            if (!isNaN(targetNo) && targetNo > 0 && targetNo <= total) {
                if (targetNo - 1 === currentIndex) {
                    alert('?먭린 ?먯떊 ?꾨줈???대룞?????놁뒿?덈떎.');
                    return;
                }
                targetMemberObj = filteredMembersData[targetNo - 1];
            } else {
                // 2. Search by name (whitespace-insensitive matching)
                const matchedMembers = filteredMembersData
                    .map((m, idx) => ({ member: m, originalIndex: idx }))
                    .filter(item => item.member.name.replace(/\s+/g, '').includes(query.replace(/\s+/g, '')) && item.originalIndex !== currentIndex);

                if (matchedMembers.length === 0) {
                    alert(`'${query}' ?깅룄瑜?紐⑸줉?먯꽌 李얠쓣 ???놁뒿?덈떎. (?먭린 ?먯떊?쇰줈???대룞?????놁뒿?덈떎)`);
                    return;
                }

                if (matchedMembers.length === 1) {
                    targetMemberObj = matchedMembers[0].member;
                } else {
                    const optionsList = matchedMembers.map((item, idx) => `${idx + 1}. ${item.member.name} (${item.member.district || '援ъ뿭 ?놁쓬'})`).join('\n');
                    const selection = prompt(`?숇챸?댁씤??${matchedMembers.length}紐?寃?됰릺?덉뒿?덈떎. ?대뒓 ?깅룄 ?꾨줈 ?대룞?쒗궗源뚯슂? 踰덊샇瑜??낅젰?섏꽭??\n${optionsList}`);
                    if (selection === null) return;

                    const selIdx = parseInt(selection.trim()) - 1;
                    if (isNaN(selIdx) || selIdx < 0 || selIdx >= matchedMembers.length) {
                        alert('?щ컮瑜?踰덊샇瑜??좏깮?댁＜?몄슂.');
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
            badge.innerHTML = `${name}${rel ? `<span class="opacity-60 ml-0.5">(${rel})</span>` : ''} <button type="button" class="text-red-400 hover:text-red-600 font-bold ml-1" onclick="removeFamilyBadgeByEntry('${entry.replace(/'/g, "\\'")}')">횞</button>`;
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
        document.getElementById('relationTargetTitle').textContent = `'${name}' ?깅룄???愿怨??좏깮`;
        familySearchModal.classList.add('hidden');
        document.getElementById('familyRelationSelectModal').classList.remove('hidden');
    };

    window.confirmRelation = function(type) {
        if (!pendingRelationData) return;
        const { id, name, bs, familyId } = pendingRelationData;
        let finalRel = type;
        if (type === '?⑦렪/?꾨궡') {
            if (currentMemberData && currentMemberData.bs) finalRel = (currentMemberData.bs === 'S') ? '?⑦렪' : '?꾨궡';
            else if (bs) finalRel = (bs === 'B') ? '?꾨궡' : '?⑦렪';
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
                const myName = currentMemberData ? currentMemberData.name : '蹂몄씤';
                const symRel = (finalRel === '?⑦렪') ? '?꾨궡' : (finalRel === '?꾨궡') ? '?⑦렪' : (finalRel === '?먮?') ? '遺紐? : (finalRel === '遺紐?) ? '?먮?' : '湲고?';
                if (confirm(`'${name}' ?깅룄??媛議깃?怨꾩뿉??'${myName}(${symRel})'???먮룞?쇰줈 ?깅줉?좉퉴??`)) {
                    pendingCrossUpdates.push({ targetId: id, myName: myName, relationToAdd: `${myName}(${symRel})` });
                }
            }
        }
        updateFamilyUI(); document.getElementById('familyRelationSelectModal').classList.add('hidden'); pendingRelationData = null;
    };

    if (btnSearchFamily) btnSearchFamily.addEventListener('click', handleFamilySearchOrAdd);
    if (familySearchInput) familySearchInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); handleFamilySearchOrAdd(); } });

    // --- Final Sorting Rules ---
    const ROLE_PRIORITY = { '援먭뎄??: 1, '吏묒궗': 2, '援ъ뿭??: 3, '議곗옣': 4, '援ъ뿭珥앸Т': 5, '議곗킑臾?: 6 };
    const CAT_PRIORITY = { '遊됱궗??: 1, '?대㉧?덊쉶': 2, '泥?뀈??: 3, '??ν쉶': 4 };
    const getMemberRank = (p) => { if(!p) return 99; const ps = p.split(',').map(s=>s.trim()); if(ps.includes('吏묒궗') && !ps.includes('援먭뎄??)) return 2; let min = 90; ps.forEach(x => { if(ROLE_PRIORITY[x] && ROLE_PRIORITY[x] < min) min = ROLE_PRIORITY[x]; }); return (min === 90 && ps.length > 0) ? 7 : min; };
    const getCatRank = (c) => { if(!c) return 99; for(let k in CAT_PRIORITY){ if(c.includes(k)) return CAT_PRIORITY[k]; } return 95; };

    function renderTable() {
        totalCountEl.textContent = `${filteredMembersData.length}紐?議고쉶??;
        if (isEditSortMode) {
            // 而ㅼ뒪? ?뺣젹 ?섏젙 以묒뿉???곗씠???뺣젹???吏 ?딄퀬, ?꾩옱 諛곗뿴 ?쒖꽌瑜?洹몃?濡??좎??섏뿬 ?뚮뜑留곹빀?덈떎.
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
        } else {
            filteredMembersData.sort((a, b) => {
                let vA = a[currentSort.column] || '', vB = b[currentSort.column] || '';
                if(currentSort.column === 'age' || currentSort.column === 'birth_year') {
                    vA = a.birth_year ? parseInt(a.birth_year) : (currentSort.column === 'age' ? -1 : 9999);
                    vB = b.birth_year ? parseInt(b.birth_year) : (currentSort.column === 'age' ? -1 : 9999);
                    return currentSort.direction === 'asc' ? (currentSort.column === 'age' ? vB - vA : vA - vB) : (currentSort.column === 'age' ? vA - vB : vB - vA);
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
                ? `<button type="button" class="bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] px-2 py-0.5 rounded font-black shadow-sm transition active:scale-95" onclick="moveMemberIndex(${index}, '${m.name}')">${index + 1} ??/button>`
                : `${index + 1}`;
            
            return `<tr class="hover:bg-blue-50 border-b transition text-[13px] ${isEditSortMode ? 'bg-yellow-50' : ''}" data-id="${m.id}"><td class="p-2 text-center font-bold border-r ${isEditSortMode ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400'}">${indexCol}</td><td class="p-2 text-center border-r"><span class="px-2 py-0.5 rounded-full border font-bold text-[11px] ${getDC(m.district)}">${m.district || '-'}</span></td><td class="p-2 text-center font-bold text-gray-600 border-r">${getCI(m.category)}</td><td class="p-2 text-center font-black text-blue-800 border-r cursor-pointer hover:underline" onclick="openMemberHistoryModal(${m.id})">${m.name || ''}</td><td class="p-2 text-center border-r text-gray-700">${m.birth_year || '-'}</td><td class="p-2 text-center border-r text-gray-700 font-bold">${calculateAge(m.birth_year)}</td><td class="p-2 text-center border-r text-gray-700">${m.salvation_date || '-'}</td><td class="p-2 text-center border-r text-yellow-800 font-bold">${m.position || '-'}</td><td class="p-2 text-center border-r text-green-800 font-bold">${(!m.church_service || m.church_service === '?놁쓬') ? '-' : m.church_service}</td><td class="p-2 border-r font-medium">${fHtml}</td><td class="p-2 text-center border-r text-gray-700 font-medium">${m.phone || '-'}</td><td class="p-2 border-r text-gray-700 truncate min-w-[150px]" title="${m.address || ''}">${m.address || '-'}</td><td class="p-2 text-gray-700 truncate min-w-[200px]" title="${m.testimony || ''}">${m.testimony || '-'}</td></tr>`;
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
        'DISTRICT': '援ъ뿭 蹂寃?, 
        'CATEGORY': '?뚯냽 蹂寃?, 
        'POSITION': '吏곷텇 ?꾨챸', 
        'POSITION_DISMISS': '吏곷텇 硫댁쭅', 
        'SERVICE': '遊됱궗 ?꾨Т', 
        'SERVICE_DISMISS': '遊됱궗 硫댁쭅', 
        'FELLOWSHIP': '援먯젣 ?곹깭', 
        'TRANSFER': '?꾩엯/?꾩텧 (硫붾え)', 
        'CHURCH_IN': '援먰쉶 ?꾩엯',
        'CHURCH_MOVE': '援먰쉶 ?대룞',
        'PARISH_MOVE': '援먭뎄 ?대룞',
        'ETC': '湲고?' 
    };

    function renderEditModalRecords(recs) {
        const targets = ['editModalRecordTableBody', 'recordTableBody'];
        targets.forEach(targetId => {
            const b = document.getElementById(targetId);
            if (!b) return;
            b.innerHTML = recs.length ? recs.map((r, idx) => {
                const isEditing = currentMemberData ? (r.id === editingRecordId) : (idx === editingRecordId);
                
                if (isEditing) {
                    // ?섏젙 紐⑤뱶 ?뚮뜑留?                    return `
                        <tr class="text-[12px] border-b border-gray-50 bg-amber-50/30 transition">
                            <td class="p-2">
                                <input type="date" value="${r.date}" id="edit-rec-date-${r.id || idx}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] outline-none font-bold">
                            </td>
                            <td class="p-2">
                                <select id="edit-rec-status-${r.id || idx}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1 py-1 text-[11px] bg-white outline-none font-bold cursor-pointer">
                                    ${Object.entries(RECORD_STATUS_MAP).map(([k, v]) => `
                                        <option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>
                                    `).join('')}
                                </select>
                            </td>
                            <td class="p-2">
                                <input type="text" value="${r.remark || ''}" id="edit-rec-remark-${r.id || idx}" class="w-full border border-slate-200 focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-1 text-[11px] outline-none font-bold" placeholder="鍮꾧퀬 ?낅젰...">
                            </td>
                            <td class="p-2 text-right whitespace-nowrap">
                                <button type="button" class="text-emerald-600 hover:text-emerald-700 font-bold p-1 mr-1 transition" onclick="saveRecordFromModal(${currentMemberData ? r.id : idx}, ${currentMemberData ? currentMemberData.id : 'null'}, ${idx})">
                                    <i class="fa-solid fa-check text-sm"></i>
                                </button>
                                <button type="button" class="text-gray-400 hover:text-gray-600 font-bold p-1 transition" onclick="cancelRecordEdit()">
                                    <i class="fa-solid fa-xmark text-sm"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                } else {
                    // ?쇰컲 議고쉶 紐⑤뱶 ?뚮뜑留?                    return `
                        <tr class="text-[12px] border-b border-gray-50 hover:bg-gray-50 transition">
                            <td class="p-2 text-gray-500">${r.date}</td>
                            <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border bg-slate-50">${RECORD_STATUS_MAP[r.status] || r.status}</span></td>
                            <td class="p-2 text-gray-700 font-bold">${r.remark || ''}</td>
                            <td class="p-2 text-right whitespace-nowrap">
                                <button type="button" class="text-blue-500 hover:text-blue-700 font-bold p-1 mr-1 transition" onclick="startRecordEdit(${currentMemberData ? r.id : idx})">
                                    <i class="fa-solid fa-pen text-xs"></i>
                                </button>
                                <button type="button" class="text-red-400 hover:text-red-600 font-bold p-1 transition" onclick="deleteRecordFromModal(${currentMemberData ? r.id : idx}, ${currentMemberData ? currentMemberData.id : 'null'}, ${idx})">
                                    <i class="fa-solid fa-trash-can text-xs"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }
            }).join('') : '<tr><td colspan="4" class="p-4 text-center text-gray-400 text-xs italic">?놁쓬</td></tr>';
        });
    }

    // ?섏젙 痍⑥냼
    window.cancelRecordEdit = function() {
        editingRecordId = null;
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    // ?섏젙 ?쒖옉
    window.startRecordEdit = function(recordId) {
        editingRecordId = recordId;
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    // ?섏젙 ???    window.saveRecordFromModal = async function(recordId, memberId, idx) {
        const dateInput = document.getElementById(`edit-rec-date-${recordId}`);
        const statusInput = document.getElementById(`edit-rec-status-${recordId}`);
        const remarkInput = document.getElementById(`edit-rec-remark-${recordId}`);

        const date = dateInput ? dateInput.value : '';
        const status = statusInput ? statusInput.value : '';
        const remark = remarkInput ? remarkInput.value.trim() : '';

        if (!date) return alert('?좎쭨???꾩닔 ?낅젰 ??ぉ?낅땲??');

        if (memberId && memberId !== 'null') {
            // ?쒕쾭????λ맂 湲곕줉 ?섏젙
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
                    if (typeof loadData === 'function') loadData(); // 硫붿씤 ?뚯씠釉?由щ줈??                } else {
                    const err = await res.json();
                    alert(`?섏젙 ?ㅽ뙣: ${err.error || '?????녿뒗 ?ㅻ쪟'}`);
                }
            } catch (e) {
                console.error(e);
                alert('?듭떊 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
            }
        } else {
            // ???깅룄 ?깅줉 ???꾩떆 湲곕줉 ?섏젙
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
        if (!confirm('??湲곕줉???뺣쭚 ??젣?섏떆寃좎뒿?덇퉴?')) return;
        
        if (memberId && memberId !== 'null') {
            // ?쒕쾭????λ맂 湲곕줉 ??젣
            try {
                const res = await fetch(`/api/members/records/${recordId}`, { method: 'DELETE' });
                if (res.ok) {
                    editingRecordId = null; // ?섏젙 紐⑤뱶 珥덇린??                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    if (typeof loadData === 'function') loadData();
                }
            } catch (e) { console.error(e); }
        } else {
            // ???깅룄 ?깅줉 ???꾩떆 湲곕줉 紐⑸줉?먯꽌 ??젣
            editingRecordId = null; // ?섏젙 紐⑤뱶 珥덇린??            pendingRecords = pendingRecords.filter((_, i) => i !== idx);
            renderEditModalRecords(pendingRecords);
        }
    };

    window.deleteRecord = async (id) => { if (confirm('??젣?좉퉴??')) { try { await fetch(`/api/members/records/${id}`, { method: 'DELETE' }); openMemberHistoryModal(currentMemberData.id); } catch (e) { console.error(e); } } };

    // ???대┃ 諛붿씤??(理쒖큹 1?뚮쭔 ?깅줉?섎룄濡?member_management.js 濡쒕뱶 ?쒖젏?대굹 ?뱀? ?ш린??諛붿씤?⑺븿)
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
            // ???곹깭 由ъ뀑 (異쒖꽍 ???쒖꽦??
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
            
            const finalCalculatedSvc = calculatedSvcArray.length ? calculatedSvcArray.join(', ') : '?놁쓬';

            const fEnt = (member.family_relation || '').split(',').map(s => s.trim()).filter(s => s);
            
            // 媛議깃?怨???뷀삎 移대뱶 ?앹꽦 (?대┃ ???쒓컙?대룞)
            const fDispHTML = fEnt.map(e => {
                const match = e.match(/^(.+?)\(/);
                const name = match ? match[1].trim() : e.trim();
                const found = family ? family.find(f => f.name.trim() === name) : null;
                if (found) {
                    return `<button type="button" class="bg-blue-100 hover:bg-blue-200 text-blue-800 text-[11px] px-2.5 py-1.5 rounded-full font-bold border border-blue-200 shadow-sm transition active:scale-[0.97]" onclick="openMemberHistoryModal(${found.id})">${e} ??/button>`;
                }
                return `<span class="bg-gray-100 text-gray-600 text-[11px] px-2.5 py-1.5 rounded-full font-medium border border-gray-200 shadow-sm">${e}</span>`;
            }).join(' ') || '<span class="text-slate-400 italic text-xs">?놁쓬</span>';

            const initial = member.name ? member.name[0] : '';
            const avatarColors = member.bs === 'B' 
                ? 'from-blue-500 to-indigo-600 shadow-blue-100' 
                : 'from-pink-500 to-rose-600 shadow-rose-100';
            
            const badges = [
                member.church ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><i class="fa-solid fa-place-of-worship mr-1 text-[10px]"></i>${member.church}</span>` : '',
                member.parish ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${member.parish}</span>` : '',
                member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
                member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
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
                        <span class="text-xs font-black text-slate-400 bg-slate-100/70 px-2 py-0.5 rounded-md">${member.bs === 'B' ? '?뺤젣' : '?먮ℓ'} (${calculateAge(member.birth_year)}?? ${member.birth_year || '-'}?꾩깮)</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 justify-center md:justify-start">
                        ${badges}
                    </div>
                </div>
            </div>
            <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">援ъ썝??/span>
                <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${member.salvation_date || '-'}
                </span>
            </div>
            <div class="col-span-2 md:col-span-2 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">?곕씫泥?/span>
                <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
                    ${member.phone || '-'}
                </span>
            </div>
            <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">媛議?愿怨?<span class="text-[9px] text-slate-400 font-normal ml-1">(?대쫫???꾨Ⅴ硫??꾨줈?꾨줈 諛붾줈 ?꾪솚?⑸땲??</span></span>
                <div class="flex flex-wrap gap-1.5 mt-1">
                    ${fDispHTML}
                </div>
            </div>
            <div class="col-span-2 md:col-span-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1">
                <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">二쇱냼</span>
                <span class="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                    <svg class="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="truncate" title="${member.address || ''}">${member.address || '-'}</span>
                </span>
            </div>
            <div class="col-span-2 md:col-span-4 bg-blue-50/40 p-4 rounded-xl border border-blue-100/50 flex flex-col gap-1">
                <span class="text-blue-700 text-[10px] font-black uppercase tracking-wider">援먰쉶 遊됱궗 ?댁뿭</span>
                <span class="font-extrabold text-blue-900 text-sm">${finalCalculatedSvc}</span>
            </div>
            <div class="col-span-2 md:col-span-4 bg-yellow-50/30 p-4 rounded-xl border border-yellow-100/50 flex flex-col gap-1">
                <span class="text-yellow-700 text-[10px] font-black uppercase tracking-wider">湲고? 硫붾え</span>
                <span class="font-medium text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">${member.testimony || '?댁슜 ?놁쓬'}</span>
            </div>`;

            // Attendance History
            const rawFilteredHistory = history.filter(h => h.type !== '?щ갑' && h.type !== '?ㅺ탳' && h.type !== '?몃??ㅺ탳' && h.date <= today);
            
            function isMandatoryMeeting(member, meeting) {
                const mType = meeting.type || '';
                const mDistMatch = mType.match(/\d+/);
                const mDistNum = mDistMatch ? mDistMatch[0] : null;
                const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

                // 0. Hard Exclusion: Youth Sisters (category: '泥?뀈??, bs: 'S') are excluded from ALL Group meetings (議곕え??
                if (mType.includes('議곕え??)) {
                    if (member.category === '泥?뀈?? && member.bs === 'S') return false;
                    if (member.bs === 'B') return false; // Brothers are also excluded from Sisters' Group meetings
                }

                // 1. District Meetings (援ъ뿭紐⑥엫)
                if (mType.includes('援ъ뿭紐⑥엫')) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }

                // 2. Group Meetings (議곕え?? - Now only Sisters (S) who are NOT youth reach here
                if (mType.includes('議곕え??)) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }

                // 3. Global/Specific Meetings
                if (mType.includes('援먭뎄?꾩껜紐⑥엫')) return true;
                if (mType.includes('援먭뎄?뺤젣紐⑥엫') && member.bs === 'B') return true;
                if (mType.includes('援먭뎄?꾩썝紐⑥엫') && (member.position || '').trim() !== '') return true;
                if (mType.includes('泥?뀈') && member.category === '泥?뀈?? && member.id !== 270) return true;

                return false;
            }

            // Only keep meetings that are mandatory for this member OR where they actually attended (is_present is true/1)
            const filteredHistory = rawFilteredHistory.filter(h => {
                return isMandatoryMeeting(member, h) || h.is_present;
            });
            
            const getMeetingCategory = (type) => {
                if (type.includes('援ъ뿭紐⑥엫')) return 'district';
                if (type.includes('議곕え??)) return 'group';
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
                            <span class="text-xl md:text-2xl mb-0.5">?뱤</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">?꾩껜 紐⑥엫</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.all)}%</span>
                                <span class="text-xs md:text-sm font-extrabold text-blue-600">(${stats.all.present}/${stats.all.count}??</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="district">
                            <span class="text-xl md:text-2xl mb-0.5">?룧</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">援ъ뿭紐⑥엫</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.district)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.district.present}/${stats.district.count}??</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="group">
                            <span class="text-xl md:text-2xl mb-0.5">?뫁</span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">議곕え??/span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.group)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.group.present}/${stats.group.count}??</span>
                            </div>
                        </button>
                        <button type="button" class="att-filter-card p-3.5 rounded-2xl border bg-white flex flex-col items-center gap-1 active:scale-95 transition-all duration-150 shadow-sm border-slate-200 hover:border-slate-300 hover:bg-slate-50/30" data-filter="other">
                            <span class="text-xl md:text-2xl mb-0.5">??/span>
                            <span class="text-[10px] md:text-xs font-bold text-slate-400 tracking-wider">援먭뎄/湲고?</span>
                            <div class="flex items-baseline gap-1 mt-0.5">
                                <span class="text-base md:text-lg font-black text-slate-800">${getRate(stats.other)}%</span>
                                <span class="text-xs md:text-sm font-bold text-slate-500">(${stats.other.present}/${stats.other.count}??</span>
                            </div>
                        </button>
                    </div>

                    <div class="mb-6">
                        <h4 class="font-extrabold mb-4 text-slate-800 border-l-4 border-emerald-600 pl-3 flex justify-between items-center text-sm md:text-base">
                            <span id="attListTitle" class="font-black text-slate-800">?꾩껜 異쒖꽍 ?덉뒪?좊━</span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs md:text-sm font-semibold text-slate-500">?좏깮 異쒖꽍瑜?/span>
                                <span id="memberAttendanceStats" class="text-xs md:text-sm font-black text-blue-700 bg-blue-50/80 border border-blue-150 px-3 py-1 rounded-full shadow-sm">${getRate(stats.all)}% (${stats.all.present}/${stats.all.count})</span>
                            </div>
                        </h4>
                        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <table class="w-full text-sm text-left border-collapse bg-white">
                                <thead class="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider font-bold border-b border-slate-200">
                                    <tr>
                                        <th class="p-3.5 w-[110px] border-r text-center">?좎쭨</th>
                                        <th class="p-3.5 min-w-[150px] border-r text-center">紐⑥엫?뺣낫</th>
                                        <th class="p-3.5 text-center w-[90px] border-r">異쒖꽍 ?щ?</th>
                                        <th class="p-3.5 text-center">媛꾩쬆</th>
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
                        all: '?꾩껜 異쒖꽍 ?덉뒪?좊━',
                        district: '?룧 援ъ뿭紐⑥엫 ?덉뒪?좊━',
                        group: '?뫁 議곕え???덉뒪?좊━',
                        other: '??湲고?/援먭뎄紐⑥엫 ?덉뒪?좊━'
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
                            ? `<span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">異쒖꽍</span>`
                            : `<span class="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">寃곗꽍</span>`;

                        return `
                            <tr class="text-sm border-b hover:bg-slate-50/50 transition-colors">
                                <td class="p-3 text-slate-500 font-medium whitespace-nowrap">${h.date}</td>
                                <td class="p-3 font-bold text-slate-800">${h.title}</td>
                                <td class="p-3 text-center">${statusBadge}</td>
                                <td class="p-3 text-slate-600 font-medium text-xs md:text-sm whitespace-pre-wrap leading-relaxed">${h.testimony_snapshot || '<span class="text-slate-350 italic">-</span>'}</td>
                            </tr>
                        `;
                    }).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">異쒖꽍 湲곕줉??議댁옱?섏? ?딆뒿?덈떎.</td></tr>';
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
            const visMemos = history.filter(h => h.type === '?щ갑');
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
                                    <span class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">?랃툘 硫붾え</span>
                                    <p class="text-xs text-slate-700 whitespace-pre-wrap font-bold leading-relaxed">${memoVal}</p>
                                </div>
                            `;
                        }
                        if (testimonyVal) {
                            contentHTML += `
                                <div class="bg-blue-50/50 p-2.5 rounded-lg border border-blue-100/30">
                                    <span class="block text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">?럺截??щ갑 媛꾩쬆</span>
                                    <p class="text-xs text-blue-900 whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p>
                                </div>
                            `;
                        }
                        if (!memoVal && !testimonyVal) {
                            contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">湲곕줉???곸꽭 ?댁슜???놁뒿?덈떎.</p>`;
                        }

                        return `
                            <div class="bg-teal-50 p-4 rounded-xl border border-teal-100 shadow-sm flex flex-col gap-2">
                                <div class="text-xs font-black text-teal-800 border-b border-teal-200/30 pb-1 flex justify-between items-center">
                                    <span>?뱟 ${h.date} ?щ갑 湲곕줉</span>
                                </div>
                                ${contentHTML}
                            </div>
                        `;
                    }).join('');
                }
            } 
            else {
                if (visList) visList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white rounded-2xl border border-dashed border-slate-200">湲곕줉???놁뒿?덈떎.</p>';
            }

            // Personal Records (?섏쭅 ??꾨씪???붿옄???곸슜)
            fetch(`/api/members/${id}/records`).then(r => r.json()).then(recs => {
                renderEditModalRecords(recs);
                
                // ??꾨씪??洹몃━湲?                const timelineContainer = document.getElementById('timelineContainer');
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

        pendingCrossUpdates = [];
        pendingRecords = [];
        renderEditModalRecords([]);

        // 援먰쉶 紐⑸줉 濡쒕뱶 諛??듭뀡 諛붿씤??        const allChurches = await fetchChurches();
        if (formChurch) {
            formChurch.innerHTML = allChurches.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
        }

        if (!isEdit) { 
            currentMemberData = null; 
            memberAddForm.reset(); 
            
            // ?깅줉 紐⑤뱶: ?꾩옱 ?ㅻ뜑???좏깮 ?곹깭??留욎텛???뷀뤃??援먰쉶/援먭뎄 吏??            if (headerChurch && formChurch) {
                const opt = headerChurch.options[headerChurch.selectedIndex];
                const activeChurchName = opt ? opt.textContent.trim() : '?쒖슱以묒븰援먰쉶';
                formChurch.value = activeChurchName;
                
                const churchId = headerChurch.value;
                const activeParishOpt = filterParishSelect ? filterParishSelect.options[filterParishSelect.selectedIndex] : null;
                const activeParishName = (activeParishOpt && activeParishOpt.value !== '?꾩껜') ? activeParishOpt.textContent.trim() : null;
                
                await updateFormParishOptions(churchId, activeParishName);
                await updateFormDistrictOptions(activeParishName, null);
            } else {
                await updateFormParishOptions(null);
                await updateFormDistrictOptions(null);
            }

            // ???깅룄 ?깅줉 ?쒖뿉??湲곕줉 ?뱀뀡 ?쒖떆
            if (sec) sec.classList.remove('hidden'); 
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.add('hidden');
            window._sessionLinkedNames = new Set(); 
            updateFamilyUI(); 
            if (recordDate) recordDate.value = new Date().toISOString().split('T')[0];
        }
        else {
            // ?섏젙 紐⑤뱶: ?깅룄??湲곗〈 援먰쉶/援먭뎄/援ъ뿭 諛붿씤??            if (formChurch) {
                formChurch.value = currentMemberData.church || '?쒖슱以묒븰援먰쉶';
            }
            const cOpt = formChurch.querySelector(`option[value="${formChurch.value}"]`);
            const churchId = cOpt ? cOpt.dataset.id : null;
            
            await updateFormParishOptions(churchId, currentMemberData.parish);
            await updateFormDistrictOptions(currentMemberData.parish, currentMemberData.district);

            const ipts = memberAddForm.querySelectorAll('input, select, textarea');
            ipts.forEach(i => { 
                if (i.name === 'church' || i.name === 'parish' || i.name === 'district') return; // ?섎룞?쇰줈 ?ㅼ젙 ?꾨즺?덉쑝誘濡??ㅽ궢
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
                fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
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
            if (!confirm(`?뺣쭚 [${currentMemberData.name}] ?깅룄?섏쓣 '援먯젣?덈굹?? ?곹깭濡?蹂寃쏀븯?쒓쿋?듬땲源?`)) return;
            
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
                    alert('?깃났?곸쑝濡?蹂寃쎈릺?덉뒿?덈떎.');
                    memberHistoryModal.classList.add('hidden');
                    loadData();
                } else {
                    alert('泥섎━???ㅽ뙣?섏??듬땲??');
                }
            } catch (err) {
                console.error(err);
                alert('?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
            }
        });
    }

    const deleteMemberFullyBtn = document.getElementById('deleteMemberFullyBtn');
    if (deleteMemberFullyBtn) {
        deleteMemberFullyBtn.addEventListener('click', async () => {
            if (!currentMemberData) return;
            if (!confirm(`?뺣쭚 [${currentMemberData.name}] ?깅룄?섏쓽 ?뺣낫瑜??꾩껜 ??젣?섏떆寃좎뒿?덇퉴?\n??젣???뺣낫???덈? 蹂듦뎄?????놁뒿?덈떎.`)) return;
            
            try {
                const res = await fetch(`/api/members/${currentMemberData.id}`, {
                    method: 'DELETE'
                });
                
                if (res.ok) {
                    alert('?깃났?곸쑝濡???젣?섏뿀?듬땲??');
                    memberAddModal.classList.add('hidden');
                    loadData();
                } else {
                    alert('??젣 泥섎━???ㅽ뙣?섏??듬땲??');
                }
            } catch (err) {
                console.error(err);
                alert('?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
            }
        });
    }

    // ESC ?ㅻ줈 紐⑤떖 ?リ린 湲곕뒫
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
            
            // 援ъ뿭, ?뚯냽 ?먮뒗 吏곷텇 蹂寃쎌씤 寃쎌슦 ?좏깮??媛믪쓣 remark濡??ъ슜
            if (statusKey === 'DISTRICT') {
                const subDist = document.getElementById('recordSubDistrict');
                if (subDist) remark = subDist.value;
            } else if (statusKey === 'CATEGORY') {
                const subCat = document.getElementById('recordSubCategory');
                if (subCat) remark = subCat.value;
            } else if (statusKey === 'SERVICE') {
                const checked = Array.from(document.querySelectorAll('.record-sub-svc:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('遊됱궗 ??ぉ??理쒖냼 ?섎굹 ?댁긽 ?좏깮?섏꽭??');
            } else if (statusKey === 'POSITION' || statusKey === 'POSITION_DISMISS') {
                const checked = Array.from(document.querySelectorAll('.record-sub-pos:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('吏곷텇??理쒖냼 ?섎굹 ?댁긽 ?좏깮?섏꽭??');
            } else if (statusKey === 'CHURCH_IN') {
                const c = document.getElementById('subChurch'), p = document.getElementById('subParish'), d = document.getElementById('subDistrict');
                const cName = c.options[c.selectedIndex]?.text || '', pName = p.options[p.selectedIndex]?.text || '', dName = d.options[d.selectedIndex]?.text || '';
                if (!cName || cName === '援먰쉶 ?좏깮') return alert('援먰쉶瑜??좏깮?섏꽭??');
                remark = `${cName}${pName && pName !== '援먭뎄 ?좏깮' && pName !== '援먭뎄 ?뺣낫 ?놁쓬' ? ' > ' + pName : ''}${dName && dName !== '援ъ뿭 ?좏깮' && dName !== '援ъ뿭 ?뺣낫 ?놁쓬' ? ' > ' + dName : ''}`;
            } else if (statusKey === 'CHURCH_MOVE') {
                const c = document.getElementById('subChurch'), p = document.getElementById('subParish'), d = document.getElementById('subDistrict');
                const cName = c ? (c.options[c.selectedIndex]?.text || '') : '', pName = p ? (p.options[p.selectedIndex]?.text || '') : '', dName = d ? (d.options[d.selectedIndex]?.text || '') : '';
                if (!cName || cName === '援먰쉶 ?좏깮') return alert('?대룞??援먰쉶瑜??좏깮?섏꽭??');
                if (cName === '?쒖슱以묒븰援먰쉶') {
                    remark = `${cName}${pName && pName !== '援먭뎄 ?좏깮' && pName !== '援먭뎄 ?뺣낫 ?놁쓬' ? ' > ' + pName : ''}${dName && dName !== '援ъ뿭 ?좏깮' && dName !== '援ъ뿭 ?뺣낫 ?놁쓬' ? ' > ' + dName : ''}`;
                } else {
                    remark = cName;
                }
            } else if (statusKey === 'PARISH_MOVE') {
                const p = document.getElementById('subParish');
                remark = p.options[p.selectedIndex]?.text || '';
                if (!remark || remark === '援먭뎄 ?좏깮' || remark === '援먭뎄 ?뺣낫 ?놁쓬') return alert('?대룞??援먭뎄瑜??좏깮?섏꽭??');
            }

            if (!date || !statusKey || !remark) return;

            if (currentMemberData) {
                // 湲곗〈 ?깅룄 ?섏젙 ?? 利됱떆 ?쒕쾭 ???                try {
                    const res = await fetch(`/api/members/${currentMemberData.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, status: statusKey, remark }) });
                    if (res.ok) { 
                        fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs)); 
                        loadData(); 
                        recordRemark.value = '';
                        // 由ъ뀑
                        recordStatus.dispatchEvent(new Event('change'));
                    }
                } catch (e) { console.error(e); }
            } else {
                // ???깅룄 ?깅줉 ?? ?꾩떆 紐⑸줉??異붽?
                pendingRecords.push({ date, status: statusKey, remark });
                renderEditModalRecords(pendingRecords);
                recordRemark.value = '';
                // 由ъ뀑
                recordStatus.dispatchEvent(new Event('change'));
            }
        });
    }

    async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }
    async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
    async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

    async function setupOrgSelectors(container, status) {
        const churches = await fetchChurches();
        container.innerHTML = `
            <div class="flex flex-col gap-2">
                <select id="subChurch" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white">
                    <option value="">援먰쉶 ?좏깮</option>
                    ${churches.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <select id="subParish" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden">
                    <option value="">援먭뎄 ?좏깮</option>
                </select>
                <select id="subDistrict" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden">
                    <option value="">援ъ뿭 ?좏깮</option>
                </select>
            </div>
        `;

        const subChurch = document.getElementById('subChurch');
        const subParish = document.getElementById('subParish');
        const subDistrict = document.getElementById('subDistrict');

        subChurch.addEventListener('change', async () => {
            if (!subChurch.value) { subParish.classList.add('hidden'); subDistrict.classList.add('hidden'); return; }
            const parishes = await fetchParishes(subChurch.value);
            if (parishes.length > 0) {
                subParish.innerHTML = '<option value="">援먭뎄 ?좏깮</option>' + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
                subParish.classList.remove('hidden');
            } else {
                subParish.innerHTML = '<option value="none">援먭뎄 ?뺣낫 ?놁쓬</option>';
                subParish.classList.remove('hidden');
            }
            subDistrict.classList.add('hidden');
        });

        subParish.addEventListener('change', async () => {
            if (status === 'PARISH_MOVE') return;
            if (!subParish.value || subParish.value === 'none') { subDistrict.classList.add('hidden'); return; }
            const districts = await fetchDistricts(subParish.value);
            if (districts.length > 0) {
                subDistrict.innerHTML = '<option value="">援ъ뿭 ?좏깮</option>' + districts.map(d => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('');
                subDistrict.classList.remove('hidden');
            } else {
                subDistrict.innerHTML = '<option value="none">援ъ뿭 ?뺣낫 ?놁쓬</option>';
                subDistrict.classList.remove('hidden');
            }
        });
        
        if (status === 'CHURCH_MOVE') {
            subParish.classList.add('hidden');
            subDistrict.classList.add('hidden');
        }
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
                        <option value="581援ъ뿭">581援ъ뿭</option>
                        <option value="582援ъ뿭">582援ъ뿭</option>
                        <option value="583援ъ뿭">583援ъ뿭</option>
                        <option value="誘몃같??>誘몃같??/option>
                    </select>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'CATEGORY') {
                subContainer.classList.remove('hidden');
                subInputContainer.innerHTML = `
                    <select id="recordSubCategory" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400 outline-none shadow-sm bg-white font-bold text-blue-800">
                        <option value="遊됱궗??>遊됱궗??/option>
                        <option value="?대㉧?덊쉶">?대㉧?덊쉶</option>
                        <option value="泥?뀈??>泥?뀈??/option>
                        <option value="??ν쉶">??ν쉶</option>
                    </select>
                `;
                if (remarkInput && remarkInput.parentElement) remarkInput.parentElement.classList.add('hidden');
            } else if (val === 'SERVICE') {
                subContainer.classList.remove('hidden');
                const allServices = ['李ъ뼇?', '?띿씤?좉탳遺', '泥?뀈???꾩썝', '以묎퀬?깅?', '?섍꼍議곌꼍遺', '諛⑹넚??, '誘몃뵒?댁꽑援먮?', '臾몄꽌?좉탳遺', '?좎븘遺', '?쒖꽕愿由щ?', '?덉떊?먮?', '?좎튂遺', '援먰쉶吏곸썝', '??숈꽑援먮? ?꾩썝', '誘몄닠?좉탳遺', '?꾨룄??];
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
                const allPositions = ['援먭뎄??, '吏묒궗', '援ъ뿭??, '議곗옣', '援ъ뿭珥앸Т', '議곗킑臾?, '援먭뎄珥앸Т', '援먭뎄?먮ℓ珥앸Т', '援먭뎄泥?뀈?뚯옣', '援먭뎄泥?뀈?꾩썝', '援먭뎄泥댁쑁遺??, '援먭뎄泥댁쑁珥앸Т'];
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
        data.crossUpdates = pendingCrossUpdates;
        data.pendingRecords = pendingRecords; // ???깅룄???꾩떆 湲곕줉 ?ы븿
        
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
        
        if (churchId === '?꾩껜') {
            const optionsHtml = `<option value="?꾩껜" data-name="?꾩껜">紐⑤뱺 援먭뎄</option>`;
            filterParish.innerHTML = optionsHtml;
            filterParish.style.display = 'inline-block';
            if (filterParishSelect) {
                filterParishSelect.innerHTML = optionsHtml;
            }
            filterParish.value = '?꾩껜';
            if (filterParishSelect) filterParishSelect.value = '?꾩껜';
            return;
        }

        const parishes = await fetchParishes(churchId);
        if (parishes.length > 0) {
            const optionsHtml = `<option value="?꾩껜" data-name="?꾩껜">紐⑤뱺 援먭뎄</option>` + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
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
                    const bp = parishes.find(p => p.name.includes('遺怨↔탳援?));
                    if (bp) {
                        filterParish.value = bp.id;
                        if (filterParishSelect) filterParishSelect.value = bp.id;
                    }
                    else {
                        filterParish.value = '?꾩껜';
                        if (filterParishSelect) filterParishSelect.value = '?꾩껜';
                    }
                }
            } else {
                const bp = parishes.find(p => p.name.includes('遺怨↔탳援?));
                if (bp) {
                    filterParish.value = bp.id;
                    if (filterParishSelect) filterParishSelect.value = bp.id;
                }
                else {
                    filterParish.value = '?꾩껜';
                    if (filterParishSelect) filterParishSelect.value = '?꾩껜';
                }
            }
        } else {
            filterParish.innerHTML = '<option value="">援먭뎄 ?놁쓬</option>';
            if (filterParishSelect) filterParishSelect.innerHTML = '<option value="">援먭뎄 ?놁쓬</option>';
        }
    }

    async function initHeaderSelectors() {
        if (!headerChurch || !filterParish) return;

        const churches = await fetchChurches();
        const churchesHtml = `<option value="?꾩껜" data-name="?꾩껜">紐⑤뱺 援먰쉶</option>` + churches.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('');
        headerChurch.innerHTML = churchesHtml;
        if (filterChurchSelect) {
            filterChurchSelect.innerHTML = churchesHtml;
        }

        let savedChurchId = localStorage.getItem('activeChurchId');
        let savedParishId = localStorage.getItem('activeParishId');

        if (!savedChurchId) {
            const sc = churches.find(c => c.name.includes('?쒖슱以묒븰援먰쉶'));
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
        if (parishName !== '遺怨↔탳援? && parishName !== '?꾩껜') {
            filterDistrict.value = '?꾩껜';
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
                alert('?대낫???곗씠?곌? ?놁뒿?덈떎.');
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
            btnSelectAllExport.textContent = allSelected ? '?꾩껜 ?댁젣' : '?꾩껜 ?좏깮';
        });

        submitExport.addEventListener('click', () => {
            const checkedBoxes = exportColumnsContainer.querySelectorAll('input[type="checkbox"]:checked');
            if (checkedBoxes.length === 0) {
                alert('理쒖냼 ??媛??댁긽????ぉ???좏깮??二쇱꽭??');
                return;
            }

            const selectedCols = Array.from(checkedBoxes).map(cb => cb.value);

            const dataToExport = filteredMembersData.map(m => {
                const row = {};
                if (selectedCols.includes('name')) row['?대쫫'] = m.name || '';
                if (selectedCols.includes('bs')) row['?깅퀎'] = m.bs === 'B' ? '?뺤젣' : (m.bs === 'S' ? '?먮ℓ' : m.bs || '');
                if (selectedCols.includes('birth_year')) row['?앸뀈'] = m.birth_year || '';
                if (selectedCols.includes('salvation_date')) row['援ъ썝??] = m.salvation_date || '';
                if (selectedCols.includes('church')) row['?뚯냽 援먰쉶'] = m.church || '?쒖슱以묒븰援먰쉶';
                if (selectedCols.includes('parish')) row['援먭뎄'] = m.parish || '';
                if (selectedCols.includes('district')) row['援ъ뿭'] = m.district || '';
                if (selectedCols.includes('category')) row['?뚯냽??] = m.category || '';
                if (selectedCols.includes('position')) row['吏곷텇'] = m.position || '';
                if (selectedCols.includes('church_service')) row['遊됱궗'] = m.church_service && m.church_service !== '?놁쓬' ? m.church_service : '';
                if (selectedCols.includes('family_relation')) row['媛議깃?怨?] = m.family_relation || '';
                if (selectedCols.includes('phone')) row['?곕씫泥?] = m.phone || '';
                if (selectedCols.includes('address')) row['二쇱냼'] = m.address || '';
                if (selectedCols.includes('testimony')) row['硫붾え(媛꾩쬆)'] = m.testimony || '';
                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "?깅룄 紐⑸줉");

            const parishName = getSelectedParishName() || '?꾩껜';
            const fileName = `?깅룄?꾪솴_${parishName}_${new Date().toISOString().split('T')[0]}.xlsx`;

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
        // 紐⑤떖 ?닿린
        importExcelBtn.addEventListener('click', () => {
            resetImportModal();
            excelImportModal.classList.remove('hidden');
        });

        // 紐⑤떖 ?リ린
        const closeImport = () => {
            excelImportModal.classList.add('hidden');
            resetImportModal();
        };
        closeImportModal.addEventListener('click', closeImport);
        cancelImport.addEventListener('click', closeImport);

        // ?쒕옒洹몄븻?쒕∼ / ?뚯씪 ?좏깮 泥섎━
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
            progressText.textContent = '?湲?以?..';
            importResultContainer.classList.add('hidden');
            importResultList.innerHTML = '';
            submitImport.disabled = false;
            submitImport.textContent = '?낅줈???쒖옉';
        }

        // ?쒗뵆由??뚯씪 ?앹꽦 諛??ㅼ슫濡쒕뱶 (SheetJS ?쒖슜)
        btnDownloadTemplate.addEventListener('click', () => {
            const headers = [
                '?대쫫', '?깅퀎(?뺤젣/?먮ℓ)', '?앸뀈', '援ъ썝??, '?뚯냽 援먰쉶', 
                '援먭뎄紐?, '援ъ뿭紐?, '?뚯냽???遺꾨쪟)', '吏곷텇', '遊됱궗', 
                '媛議깃?怨?, '?곕씫泥?, '二쇱냼', '硫붾え'
            ];
            const exampleRow = [
                '?띻만??, '?뺤젣', '1985', '2015-05-10', '?쒖슱以묒븰援먰쉶', 
                '遺怨↔탳援?, '2援ъ뿭', '遊됱궗??, '議곗옣', '誘몃뵒?대큺??, 
                '源?곹씗(?꾨궡), ?띿씠???먮?)', '010-1234-5678', '寃쎄린???섏솗??...', '?쇱슂???ㅼ쟾 ?덈같 李몄꽍'
            ];

            const ws1 = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

            const guideHeaders = ['援щ텇', '?댁슜 / ?덉떆'];
            const guideRows = [
                ['?묒꽦 洹쒖튃 1', '媛議??대쫫 ?놁뿉 愿꾪샇()瑜??닿퀬 愿怨꾨? 湲곗옱??二쇱꽭?? (?⑦렪/?꾨궡/?먮?/遺紐?湲고? 以??낅젰)'],
                ['?덉떆 1', '?띻만???⑦렪)'],
                ['?덉떆 2 (?щ윭 紐낆씤 寃쎌슦)', '?띻만???⑦렪), ?띿씠???먮?)'],
                ['?묒꽦 洹쒖튃 2', '媛議??대쫫? ?숈씪??援먭뎄 ?댁뿉 ?ㅼ젣濡??깅줉?섎뒗 ?깅룄 ?깅챸怨??ㅽ? ?놁씠 ?뺥솗?섍쾶 ?쇱튂?댁빞 ?쒖뒪?쒖뿉???곌껐??媛?ν빀?덈떎.'],
                ['?숇챸?댁씤 二쇱쓽', '留뚯빟 ?숈씪 援먭뎄 ?댁뿉 ?숇챸?댁씤??議댁옱??寃쎌슦 ?쒖뒪?쒖뿉??媛議깆씠 瑗ъ씠??寃껋쓣 諛⑹??섍린 ?꾪빐 ?먮룞 ?곌껐???좊낫?⑸땲?? ??寃쎌슦 ?낅줈???꾨즺 ???깅룄 ?곸꽭 ?붾㈃?먯꽌 吏곸젒 ?섎룞?쇰줈 媛議깆쓣 ?곌껐??二쇱뀛???⑸땲??']
            ];
            const ws2 = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideRows]);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws1, "?깅룄 ?뺣낫");
            XLSX.utils.book_append_sheet(wb, ws2, "媛議깃?怨??묒꽦 ?덈궡");

            XLSX.writeFile(wb, "?깅룄?깅줉_?쒗뵆由?xlsx");
        });

        // ?묒? ?낅줈???쒖옉
        submitImport.addEventListener('click', () => {
            if (!selectedUploadFile) {
                alert('?낅줈?쒗븷 ?묒? ?뚯씪???좏깮??二쇱꽭??');
                return;
            }
            submitImport.disabled = true;
            submitImport.textContent = '?낅줈??吏꾪뻾 以?..';
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
                        alert('?묒? ?뚯씪???곗씠?곌? ?놁뒿?덈떎.');
                        resetImportModal();
                        return;
                    }

                    const parsedMembers = rows.map(r => {
                        const rawGender = String(r['?깅퀎(?뺤젣/?먮ℓ)'] || r['?깅퀎'] || '').trim();
                        let bs = '';
                        if (rawGender.includes('?뺤젣') || rawGender === 'B') bs = 'B';
                        else if (rawGender.includes('?먮ℓ') || rawGender === 'S') bs = 'S';
                        
                        return {
                            name: String(r['?대쫫'] || '').trim(),
                            bs: bs,
                            birth_year: r['?앸뀈'] ? parseInt(r['?앸뀈']) : null,
                            salvation_date: r['援ъ썝??] || null,
                            church: String(r['?뚯냽 援먰쉶'] || r['援먰쉶'] || '?쒖슱以묒븰援먰쉶').trim(),
                            parish: String(r['援먭뎄紐?] || r['援먭뎄'] || '').trim(),
                            district: String(r['援ъ뿭紐?] || r['援ъ뿭'] || '').trim(),
                            category: String(r['?뚯냽???遺꾨쪟)'] || r['?뚯냽??] || '').trim(),
                            position: String(r['吏곷텇'] || '').trim(),
                            church_service: String(r['遊됱궗'] || '').trim(),
                            phone: String(r['?곕씫泥?] || r['?몃뱶?곕쾲??] || r['?대??곕쾲??] || '').trim(),
                            address: String(r['二쇱냼'] || '').trim(),
                            testimony: String(r['硫붾え'] || r['硫붾え(媛꾩쬆)'] || '').trim(),
                            family_relation_raw: String(r['媛議깃?怨?] || '').trim(),
                            status: 'active'
                        };
                    }).filter(m => m.name);

                    if (parsedMembers.length === 0) {
                        alert('?щ컮瑜??깅룄 ?대쫫 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.');
                        resetImportModal();
                        return;
                    }

                    const totalCount = parsedMembers.length;
                    let successCount = 0;
                    const insertedMembers = [];

                    for (let i = 0; i < totalCount; i++) {
                        const m = parsedMembers[i];
                        progressText.textContent = `[1/2?④퀎] ?깅룄 ?깅줉 以?(${i + 1}/${totalCount})...`;
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
                            console.error('?깅룄 ?깅줉 ?ㅻ쪟:', err);
                        }
                    }

                    const freshRes = await fetch('/api/members/search?status=active');
                    const dbAllMembers = await freshRes.json();

                    const skippedRelations = [];

                    for (let i = 0; i < insertedMembers.length; i++) {
                        const me = insertedMembers[i];
                        progressText.textContent = `[2/2?④퀎] 媛議깃?怨?留ㅽ븨 以?(${i + 1}/${insertedMembers.length})...`;
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
                                failedRels.push({ relation: entry, reason: '?묒꽦 ?щ㎎ ?ㅻ쪟' });
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
                                failedRels.push({ relation: entry, reason: '?깅줉???깅룄 ?놁쓬' });
                            } else if (matchedTargets.length > 1) {
                                const districtMatch = matchedTargets.filter(m => m.district === me.district);
                                if (districtMatch.length === 1) {
                                    validRels.push(entry);
                                } else {
                                    failedRels.push({ relation: entry, reason: '援먭뎄 ???숇챸?댁씤 ?ㅼ닔' });
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
                                console.error('媛議깃?怨??낅뜲?댄듃 ?먮윭:', e);
                            }
                        }
                    }

                    progressText.textContent = `?낅줈???꾨즺! (?깃났: ${successCount}/${totalCount}紐?`;
                    progressBar.style.width = '100%';
                    progressPercent.textContent = '100%';

                    if (skippedRelations.length > 0) {
                        importResultList.innerHTML = skippedRelations.map(sr => `
                            <tr class="hover:bg-slate-50 transition border-b text-[11px]">
                                <td class="p-2 font-bold text-slate-800">${sr.name}</td>
                                <td class="p-2 text-slate-500">${sr.location}</td>
                                <td class="p-2 text-slate-700 font-bold">${sr.rawEntry}</td>
                                <td class="p-2"><span class="px-1.5 py-0.5 rounded-full text-[9px] font-black ${sr.reason.includes('?ㅼ닔') ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-red-50 text-rose-700 border border-red-100'}">${sr.reason}</span></td>
                            </tr>
                        `).join('');
                        importResultContainer.classList.remove('hidden');
                    } else {
                        importResultList.innerHTML = `
                            <tr>
                                <td colspan="4" class="p-4 text-center text-slate-400 italic font-semibold">紐⑤뱺 ?깅룄 諛?媛議깃?怨꾧? ?꾨꼍?섍쾶 ?곌껐?섏뿀?듬땲??</td>
                            </tr>
                        `;
                        importResultContainer.classList.remove('hidden');
                    }

                    alert(`?깅룄 ?뺣낫 ?낅줈?쒓? ?꾨즺?섏뿀?듬땲??\n?깅줉 ?깃났: ${successCount}紐?);
                    submitImport.textContent = '?꾨즺';
                    loadData();

                } catch (err) {
                    console.error(err);
                    alert('?묒? ?뚯씪???쎈뒗 怨쇱젙?먯꽌 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.');
                    resetImportModal();
                }
            };
            reader.readAsArrayBuffer(selectedUploadFile);
        });
    }

    initHeaderSelectors().then(() => {
        updateDistrictFilterState();
        loadData().then(() => {
            // URL ?뚮씪誘명꽣 泥댄겕 諛?紐⑤떖 ?먮룞 ?ㅽ뵂
            const urlParams = new URLSearchParams(window.location.search);
            const openId = urlParams.get('openId');
            if (openId) {
                openMemberHistoryModal(parseInt(openId));
            }
        });
    });
});
