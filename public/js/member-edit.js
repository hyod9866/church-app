/*
 * member-edit.js
 * ------------------------------------------------------------------
 * "성도 정보 수정/등록" 모달(#memberAddModal)의 공용 로직.
 * 예전엔 이 로직이 app.js / member_management.js 에 각각 따로(그것도 서로 다르게)
 * 구현되어 있었고, visitation_history.js 에는 아예 없었고, counseling_history.js 는
 * 훨씬 축소된 별도 모달(#counselEditMemberModal)을 쓰고 있었음.
 *
 * 이 파일로 통합하면서:
 *  - 교회/교구/구역 연동 선택 로직을 하나로 통일 (성도현황 페이지의 더 완전한 버전 기준)
 *  - 가족 검색/연결 기능을 4개 화면 전부에서 동일하게 사용
 *  - 인적사항 기록(구역변경/직분/봉사/교회이동 등) 추가·수정·삭제를 4개 화면 전부에서 동일하게 지원
 *    (기존엔 성도현황에서만 "기록 수정"이 가능했고, 나머지 화면은 추가/삭제만 되거나 아예 안 됐음)
 *  - 심방 관리 / 상담 관리 화면에도 "수정" 기능 자체를 새로 추가
 *
 * 각 페이지 스크립트는 DOMContentLoaded 안에서 아래처럼 한 번 호출하면 됨:
 *
 *   window.MemberEditModule.init({
 *     getMember: () => currentMemberData,
 *     setMember: (m) => { currentMemberData = m; },
 *     refreshList: () => { if (typeof loadData === 'function') loadData(); ... },
 *     refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
 *   });
 *
 * (2026-07-05)
 */
(function () {
    'use strict';

    // 이미 다른 스크립트가 초기화했다면 중복 바인딩 방지
    if (window._memberEditModuleInitialized) return;

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
        'COUNSELING': '상담', // 상담 관리 페이지의 상담이력 병합 표시용 (counseling_history.js 전용 상태값)
        'ETC': '기타'
    };

    async function fetchChurchesForEdit() { const res = await fetch('/api/churches'); return await res.json(); }
    async function fetchParishesForEdit(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
    async function fetchDistrictsForEdit(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

    // init()이 호출되면 여기 채워짐 (페이지당 모달은 하나뿐이므로 모듈 스코프에 보관해도 안전)
    let ctx = null;
    let pendingCrossUpdates = [];
    let pendingRecords = [];
    let editingRecordId = null;

    function getMember() { return ctx && ctx.getMember ? ctx.getMember() : null; }
    function setMember(m) { if (ctx && ctx.setMember) ctx.setMember(m); }
    function refreshList() { if (ctx && typeof ctx.refreshList === 'function') { try { ctx.refreshList(); } catch (e) { console.error(e); } } }
    function refreshHistoryModal(id) { if (ctx && typeof ctx.refreshHistoryModal === 'function') { try { ctx.refreshHistoryModal(id); } catch (e) { console.error(e); } } }

    // ------------------------------------------------------------------
    // 가족 검색 / 연결
    // ------------------------------------------------------------------
    let pendingRelationData = null;

    function updateFamilyUI() {
        const familyRelationText = document.getElementById('familyRelationText');
        const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
        if (!familyRelationText || !linkedFamilyContainer) return;
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

    window.removeFamilyBadgeByEntry = function (entry) {
        const familyRelationText = document.getElementById('familyRelationText');
        if (!familyRelationText) return;
        const currentText = familyRelationText.value.trim();
        const entries = currentText.split(',').map(n => n.trim()).filter(n => n);
        familyRelationText.value = entries.filter(e => e !== entry).join(', ');
        const nameMatch = entry.match(/^(.+?)\(/);
        if (window._sessionLinkedNames) window._sessionLinkedNames.delete(nameMatch ? nameMatch[1].trim() : entry.trim());
        if (window._familyRelationIdMap) delete window._familyRelationIdMap[entry];
        updateFamilyUI();
    };

    async function handleFamilySearchOrAdd() {
        const familySearchInput = document.getElementById('familySearchInput');
        const familySearchModal = document.getElementById('familySearchModal');
        const familySearchResultList = document.getElementById('familySearchResultList');
        if (!familySearchInput) return;
        const q = familySearchInput.value.trim(); if (!q) return;
        try {
            const res = await fetch(`/api/members/family-search?q=${encodeURIComponent(q)}`);
            const members = await res.json();
            if (members.length > 0) {
                familySearchResultList.innerHTML = members.map(m => `<div class="p-3 border-b hover:bg-blue-50 cursor-pointer flex justify-between items-center text-left" onclick="initiateRelationChoice(${m.id}, '${m.name}', '${m.district}', '${m.bs}', ${m.family_id || 'null'})"><div><div class="font-bold text-blue-900">${m.name} (${m.bs})</div><div class="text-[11px] text-gray-500">${m.district}</div></div><svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>`).join('');
                familySearchModal.classList.remove('hidden');
            } else { window.initiateRelationChoice(null, q, null, null, null); }
        } catch (e) { window.initiateRelationChoice(null, q, null, null, null); }
        familySearchInput.value = '';
    }

    window.initiateRelationChoice = function (id, name, district, bs, familyId) {
        const familySearchModal = document.getElementById('familySearchModal');
        const relationTargetTitle = document.getElementById('relationTargetTitle');
        pendingRelationData = { id, name, district, bs, familyId };
        if (relationTargetTitle) relationTargetTitle.textContent = `'${name}' 성도와의 관계 선택`;
        if (familySearchModal) familySearchModal.classList.add('hidden');
        const relModal = document.getElementById('familyRelationSelectModal');
        if (relModal) relModal.classList.remove('hidden');
    };

    window.confirmRelation = function (type) {
        if (!pendingRelationData) return;
        const familyRelationText = document.getElementById('familyRelationText');
        const hiddenFamilyId = document.getElementById('hiddenFamilyId');
        const { id, name, bs, familyId } = pendingRelationData;
        const currentMemberData = getMember();
        let finalRel = type;
        if (type === '남편/아내') {
            if (currentMemberData && currentMemberData.bs) finalRel = (currentMemberData.bs === 'S') ? '남편' : '아내';
            else if (bs) finalRel = (bs === 'B') ? '아내' : '남편';
        }

        // 배우자 등록 시 폼 내부의 결혼 상태를 기혼으로 자동 변경
        if (finalRel === '남편' || finalRel === '아내') {
            const maritalSelect = document.querySelector('#memberAddForm select[name="marital_status"]');
            if (maritalSelect) maritalSelect.value = '기혼';
        }

        const entry = `${name.trim()}(${finalRel})`;
        const currentText = familyRelationText.value.trim();
        const entries = currentText ? currentText.split(',').map(n => n.trim()).filter(n => n) : [];
        if (!entries.includes(entry)) {
            entries.push(entry); familyRelationText.value = entries.join(', ');
            if (id) {
                if (!window._sessionLinkedNames) window._sessionLinkedNames = new Set();
                window._sessionLinkedNames.add(name.trim());
                // [2026-07-07 감사 보고서 8번 항목] 검색 결과를 클릭한 이 순간에만 "정확히 어떤
                // 사람인지(id)"를 확실히 알 수 있다. 예전에는 이 정보를 버리고 이름 텍스트만
                // 저장해서, 서버가 매번 이름만으로 다시 찾다가 동명이인을 잘못 연결하는 위험이
                // 있었다. 이제 이 id를 함께 기억해뒀다가 저장 시 서버로 보낸다.
                if (!window._familyRelationIdMap) window._familyRelationIdMap = {};
                window._familyRelationIdMap[entry] = id;
                if (familyId !== null && familyId !== undefined && familyId !== 'null' && familyId !== '') hiddenFamilyId.value = familyId;
                const myName = currentMemberData ? currentMemberData.name : '본인';
                const symRel = (finalRel === '남편') ? '아내' : (finalRel === '아내') ? '남편' : (finalRel === '자녀') ? '부모' : (finalRel === '부모') ? '자녀' : '기타';
                if (confirm(`'${name}' 성도의 가족관계에도 '${myName}(${symRel})'을 자동으로 등록할까요?`)) {
                    pendingCrossUpdates.push({ targetId: id, myName: myName, relationToAdd: `${myName}(${symRel})` });
                }
            }
        }
        updateFamilyUI();
        const relModal = document.getElementById('familyRelationSelectModal');
        if (relModal) relModal.classList.add('hidden');
        pendingRelationData = null;
    };

    // ------------------------------------------------------------------
    // 교회 / 교구 / 구역 연동 (등록 폼 상단 셀렉트)
    // ------------------------------------------------------------------
    async function updateFormParishOptions(formParish, churchId, targetParishName) {
        if (!formParish) return;
        if (!churchId) {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>';
            return;
        }
        let parishes = [];
        if (churchId !== 'temp-ext') {
            parishes = await fetchParishesForEdit(churchId);
        }

        let options = [...parishes];
        if (targetParishName) {
            const exists = parishes.some(p => p.name === targetParishName);
            if (!exists) options.push({ id: 'temp-ext-parish', name: targetParishName });
        }

        if (options.length > 0) {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>' +
                options.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
            formParish.value = targetParishName || '';
        } else {
            formParish.innerHTML = '<option value="">교구 선택 (없음)</option>';
        }
    }

    async function updateFormDistrictOptions(formParish, formDistrict, parishName, targetDistrictName) {
        if (!formDistrict) return;
        if (!parishName) {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>';
            return;
        }

        const opt = formParish ? formParish.querySelector(`option[value="${parishName}"]`) : null;
        const parishId = opt ? opt.dataset.id : null;

        let districts = [];
        if (parishId && parishId !== 'temp-ext-parish') {
            districts = await fetchDistrictsForEdit(parishId);
        }

        let options = [...districts];
        if (targetDistrictName) {
            const exists = districts.some(d => d.name === targetDistrictName);
            if (!exists) options.push({ name: targetDistrictName });
        }

        if (options.length > 0) {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>' +
                options.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            formDistrict.value = targetDistrictName || '미배정';
        } else {
            formDistrict.innerHTML = '<option value="미배정">미배정</option>';
        }
    }

    // ------------------------------------------------------------------
    // 인적사항 기록 (추가/수정/삭제) — 기록 리스트 렌더링 (조회 탭 + 수정 모달 둘 다 공용)
    // ------------------------------------------------------------------
    window.getRecordRemarkInputHTML = function (targetId, recordId, status, currentRemark) {
        const idSuffix = `${targetId}-${recordId}`;
        const remark = currentRemark || '';

        if (status === 'CHURCH_IN' || status === 'CHURCH_MOVE' || status === 'PARISH_MOVE') {
            setTimeout(() => { setupInlineOrgSelectors(targetId, recordId, status, remark); }, 0);
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
        const currentMemberData = getMember();

        if (status === 'PARISH_MOVE') {
            const activeChurchName = currentMemberData ? currentMemberData.church : '서울중앙교회';
            const churches = await fetch('/api/churches/all').then(res => res.json());
            const matched = churches.find(c => c.name === activeChurchName);
            const churchId = matched ? matched.id : null;

            let parishes = [];
            if (churchId) parishes = await fetchParishesForEdit(churchId);

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

        const loadParish = async (churchId, targetParishName) => {
            if (!churchId) { subParish.classList.add('hidden'); subDistrict.classList.add('hidden'); return; }
            const parishes = await fetchParishesForEdit(churchId);
            if (parishes.length > 0) {
                subParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.id}" data-name="${p.name}" ${p.name === targetParishName ? 'selected' : ''}>${p.name}</option>`).join('');
                subParish.classList.remove('hidden');
            } else {
                subParish.innerHTML = '<option value="none">교구 정보 없음</option>';
                subParish.classList.remove('hidden');
            }
            subDistrict.classList.add('hidden');
        };

        const loadDistrict = async (parishId, targetDistrictName) => {
            if (status === 'PARISH_MOVE') return;
            if (!parishId || parishId === 'none') { subDistrict.classList.add('hidden'); return; }
            const districts = await fetchDistrictsForEdit(parishId);
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
                if (activeParishOpt && activeParishOpt.value !== 'none') initParishId = activeParishOpt.value;
                if (initParishId) await loadDistrict(initParishId, initialDistrict);
            } else {
                subParish.classList.add('hidden');
                subDistrict.classList.add('hidden');
            }
        };

        subChurch.addEventListener('change', () => onChurchSelect(subChurch.value));
        subChurch.addEventListener('input', () => onChurchSelect(subChurch.value));

        if (initialChurch) await onChurchSelect(initialChurch);
    }

    window.onRecordStatusChange = function (targetId, recordId, selectElement) {
        const idSuffix = `${targetId}-${recordId}`;
        const container = document.getElementById(`edit-rec-remark-container-${idSuffix}`);
        if (!container) return;
        const newStatus = selectElement.value;
        container.innerHTML = window.getRecordRemarkInputHTML(targetId, recordId, newStatus, '');
    };

    function renderEditModalRecords(recs) {
        const currentMemberData = getMember();
        const targets = ['editModalRecordTableBody', 'recordTableBody'];
        targets.forEach(targetId => {
            const b = document.getElementById(targetId);
            if (!b) return;
            b.innerHTML = recs.length ? recs.map((r, idx) => {
                const isEditing = currentMemberData ? (r.id === editingRecordId) : (idx === editingRecordId);

                if (isEditing) {
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
                                ${window.getRecordRemarkInputHTML(targetId, r.id || idx, r.status, r.remark)}
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
    window.renderEditModalRecords = renderEditModalRecords;

    window.cancelRecordEdit = function () {
        editingRecordId = null;
        const currentMemberData = getMember();
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    window.startRecordEdit = function (recordId) {
        editingRecordId = recordId;
        const currentMemberData = getMember();
        if (currentMemberData) {
            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
        } else {
            renderEditModalRecords(pendingRecords);
        }
    };

    window.saveRecordFromModal = async function (targetId, recordId, memberId, idx) {
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
            } else { return alert('이동할 교구를 선택하세요.'); }
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
            } else { return alert('교회를 입력 또는 선택하세요.'); }
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
            try {
                const res = await fetch(`/api/members/records/${recordId}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, status, remark })
                });
                if (res.ok) {
                    editingRecordId = null;
                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    refreshList();
                } else {
                    const err = await res.json();
                    alert(`수정 실패: ${err.error || '알 수 없는 오류'}`);
                }
            } catch (e) { console.error(e); alert('통신 중 오류가 발생했습니다.'); }
        } else {
            if (pendingRecords[idx]) {
                pendingRecords[idx].date = date;
                pendingRecords[idx].status = status;
                pendingRecords[idx].remark = remark;
            }
            editingRecordId = null;
            renderEditModalRecords(pendingRecords);
        }
    };

    window.deleteRecordFromModal = async function (recordId, memberId, idx) {
        if (!confirm('이 기록을 정말 삭제하시겠습니까?')) return;

        if (memberId && memberId !== 'null') {
            try {
                const res = await fetch(`/api/members/records/${recordId}`, { method: 'DELETE' });
                if (res.ok) {
                    editingRecordId = null;
                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    refreshList();
                }
            } catch (e) { console.error(e); }
        } else {
            editingRecordId = null;
            pendingRecords = pendingRecords.filter((_, i) => i !== idx);
            renderEditModalRecords(pendingRecords);
        }
    };

    // ------------------------------------------------------------------
    // "새 기록 추가" 패널 (교회/교구/구역 이동 등 하위 선택지 동적 렌더링)
    // ------------------------------------------------------------------
    async function setupOrgSelectors(container, status) {
        const currentMemberData = getMember();
        if (status === 'PARISH_MOVE') {
            const formChurch = document.querySelector('#memberAddForm select[name="church"]');
            const activeChurchName = currentMemberData ? currentMemberData.church : (formChurch ? formChurch.value : '서울중앙교회');
            const churches = await fetch('/api/churches/all').then(res => res.json());
            const matched = churches.find(c => c.name === activeChurchName);
            const churchId = matched ? matched.id : null;

            let parishes = [];
            if (churchId) parishes = await fetchParishesForEdit(churchId);

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
            const parishes = await fetchParishesForEdit(matched.id);
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
            const districts = await fetchDistrictsForEdit(subParish.value);
            if (districts.length > 0) {
                subDistrict.innerHTML = '<option value="">구역 선택</option>' + districts.map(d => `<option value="${d.id}" data-name="${d.name}">${d.name}</option>`).join('');
                subDistrict.classList.remove('hidden');
            } else {
                subDistrict.innerHTML = '<option value="none">구역 정보 없음</option>';
                subDistrict.classList.remove('hidden');
            }
        });
    }

    // ------------------------------------------------------------------
    // openAddModal — 등록/수정 모달 열기
    // ------------------------------------------------------------------
    async function openAddModal(isEdit) {
        const memberAddForm = document.getElementById('memberAddForm');
        const memberAddModal = document.getElementById('memberAddModal');
        if (!memberAddForm || !memberAddModal) return;

        const formChurch = memberAddForm.querySelector('select[name="church"]');
        const formParish = memberAddForm.querySelector('select[name="parish"]');
        const formDistrict = memberAddForm.querySelector('select[name="district"]');
        const headerChurch = document.getElementById('headerChurchSelect');
        const filterParishSelect = document.getElementById('filterParishSelect');

        const sec = document.getElementById('editOnlyRecordSection');
        const deleteMemberFullyBtn = document.getElementById('deleteMemberFullyBtn');
        const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
        const hiddenFamilyId = document.getElementById('hiddenFamilyId');
        const familyRelationText = document.getElementById('familyRelationText');
        const recordDate = document.getElementById('recordDate');

        if (linkedFamilyContainer) linkedFamilyContainer.innerHTML = '';
        if (hiddenFamilyId) hiddenFamilyId.value = '';
        if (familyRelationText) familyRelationText.value = '';

        if (formChurch) { formChurch.disabled = false; formChurch.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400'); formChurch.classList.add('bg-blue-50/50', 'text-blue-800'); }
        if (formParish) { formParish.disabled = false; formParish.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400'); formParish.classList.add('bg-blue-50/50', 'text-blue-800'); }
        if (formDistrict) { formDistrict.disabled = false; formDistrict.classList.remove('bg-slate-100', 'cursor-not-allowed', 'text-slate-400'); formDistrict.classList.add('bg-white'); }

        pendingCrossUpdates = [];
        pendingRecords = [];
        editingRecordId = null;
        renderEditModalRecords([]);

        const allChurches = await fetchChurchesForEdit();
        const currentMemberData = getMember();
        if (formChurch) {
            let options = [...allChurches];
            if (isEdit && currentMemberData && currentMemberData.church) {
                const exists = allChurches.some(c => c.name === currentMemberData.church);
                if (!exists) options.push({ id: 'temp-ext', name: currentMemberData.church });
            }
            formChurch.innerHTML = options.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
        }

        if (!isEdit) {
            setMember(null);
            memberAddForm.reset();

            if (headerChurch && formChurch) {
                const opt = headerChurch.options[headerChurch.selectedIndex];
                const activeChurchName = opt ? opt.textContent.trim() : '서울중앙교회';
                formChurch.value = activeChurchName;

                const churchId = headerChurch.value;
                const activeParishOpt = filterParishSelect ? filterParishSelect.options[filterParishSelect.selectedIndex] : null;
                const activeParishName = (activeParishOpt && activeParishOpt.value !== '전체') ? activeParishOpt.textContent.trim() : null;

                await updateFormParishOptions(formParish, churchId, activeParishName);
                await updateFormDistrictOptions(formParish, formDistrict, activeParishName, null);
            } else {
                await updateFormParishOptions(formParish, null);
                await updateFormDistrictOptions(formParish, formDistrict, null);
            }

            if (sec) sec.classList.remove('hidden');
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.add('hidden');
            window._sessionLinkedNames = new Set();
            window._familyRelationIdMap = {};
            updateFamilyUI();
            if (recordDate) recordDate.value = new Date().toISOString().split('T')[0];
        } else {
            if (formChurch) formChurch.value = currentMemberData.church || '서울중앙교회';
            const cOpt = formChurch ? formChurch.querySelector(`option[value="${formChurch.value}"]`) : null;
            const churchId = cOpt ? cOpt.dataset.id : null;

            await updateFormParishOptions(formParish, churchId, currentMemberData.parish);
            await updateFormDistrictOptions(formParish, formDistrict, currentMemberData.parish, currentMemberData.district);

            const ipts = memberAddForm.querySelectorAll('input, select, textarea');
            ipts.forEach(i => {
                if (i.name === 'church' || i.name === 'parish' || i.name === 'district') return;
                if (i.type === 'checkbox') {
                    i.checked = (currentMemberData[i.name] || '').split(',').map(s => s.trim()).includes(i.value);
                } else if (currentMemberData[i.name] !== undefined) {
                    i.value = currentMemberData[i.name] || '';
                }
            });

            if (currentMemberData.family_id && hiddenFamilyId) hiddenFamilyId.value = currentMemberData.family_id;
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.remove('hidden');
            window._sessionLinkedNames = new Set();
            window._familyRelationIdMap = {};
            updateFamilyUI();
            if (currentMemberData.id) {
                fetch(`/api/members/${currentMemberData.id}/history`).then(r => r.json()).then(d => {
                    if (d.family) {
                        d.family.forEach(f => window._sessionLinkedNames.add(f.name.trim()));
                        // [2026-07-07 감사 보고서 8번 항목] 이 성도의 family_id로 이미 확립된
                        // 진짜 가족 그룹(d.family, 이름이 아니라 family_id 기준이라 정확함)을
                        // 가족관계 텍스트의 각 항목과 이름으로 매칭해 id를 미리 채워둔다.
                        // 이렇게 하면 이 화면을 다시 열어 저장만 해도(가족 검색을 다시 안 해도)
                        // 서버가 이름으로 재검색하지 않고 정확한 id로 매칭할 수 있다.
                        const familyRelationTextEl = document.getElementById('familyRelationText');
                        const existingEntries = (familyRelationTextEl && familyRelationTextEl.value)
                            ? familyRelationTextEl.value.split(',').map(s => s.trim()).filter(s => s)
                            : [];
                        const coreNameOf = (n) => (n || '').trim().replace(/[DBS P]$/i, '').trim();
                        existingEntries.forEach(entry => {
                            const match = entry.match(/^(.+?)\(/);
                            const entryCore = coreNameOf(match ? match[1] : entry);
                            const found = d.family.find(f => coreNameOf(f.name) === entryCore);
                            if (found) window._familyRelationIdMap[entry] = found.id;
                        });
                        updateFamilyUI();
                    }
                });
                fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => {
                    renderEditModalRecords(recs);
                    const hasOrgRecord = recs.some(rec => rec.status === 'CHURCH_IN' || rec.status === 'CHURCH_MOVE' || rec.status === 'PARISH_MOVE' || rec.status === 'DISTRICT');
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
            if (sec) { sec.classList.remove('hidden'); if (recordDate) recordDate.value = new Date().toISOString().split('T')[0]; }
        }
        memberAddModal.classList.remove('hidden');
    }

    // ------------------------------------------------------------------
    // init — 페이지별 1회 호출
    // ------------------------------------------------------------------
    function init(pageCtx) {
        ctx = pageCtx || {};
        window._memberEditModuleInitialized = true;

        const memberHistoryModal = document.getElementById('memberHistoryModal');
        const memberAddModal = document.getElementById('memberAddModal');
        const memberAddForm = document.getElementById('memberAddForm');
        if (!memberAddModal || !memberAddForm) return; // 이 페이지엔 수정 모달 자체가 없음

        const editMemberBtn = document.getElementById('editMemberBtn');
        const openAddMemberModalBtn = document.getElementById('openAddMemberModal');
        const closeAddMemberModal = document.getElementById('closeAddMemberModal');
        const cancelAddMember = document.getElementById('cancelAddMember');
        const familySearchInput = document.getElementById('familySearchInput');
        const btnSearchFamily = document.getElementById('btnSearchFamily');
        const recordStatus = document.getElementById('recordStatus');
        const recordRemark = document.getElementById('recordRemark');
        const recordDate = document.getElementById('recordDate');
        const addRecordBtn = document.getElementById('addRecordBtn');
        const deleteMemberBtn = document.getElementById('deleteMemberBtn');
        const deleteMemberFullyBtn = document.getElementById('deleteMemberFullyBtn');

        if (editMemberBtn) {
            editMemberBtn.addEventListener('click', () => {
                if (memberHistoryModal) memberHistoryModal.classList.add('hidden');
                openAddModal(true);
            });
        }
        if (openAddMemberModalBtn) {
            openAddMemberModalBtn.addEventListener('click', () => openAddModal(false));
        }
        [closeAddMemberModal, cancelAddMember].forEach(b => { if (b) b.addEventListener('click', () => memberAddModal.classList.add('hidden')); });

        if (btnSearchFamily) btnSearchFamily.addEventListener('click', handleFamilySearchOrAdd);
        if (familySearchInput) familySearchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleFamilySearchOrAdd(); } });

        // ESC 키로 모달 닫기
        if (!window._memberEditEscBound) {
            window._memberEditEscBound = true;
            document.addEventListener('keydown', (e) => {
                if (e.key !== 'Escape') return;
                const addModal = document.getElementById('memberAddModal');
                const histModal = document.getElementById('memberHistoryModal');
                if (addModal && !addModal.classList.contains('hidden')) addModal.classList.add('hidden');
                else if (histModal && !histModal.classList.contains('hidden')) histModal.classList.add('hidden');
            });
        }

        // "교제안나옴" (비활성 처리) — 프로필 조회 모달에서 실행
        if (deleteMemberBtn) {
            deleteMemberBtn.addEventListener('click', async () => {
                const currentMemberData = getMember();
                if (!currentMemberData) return;
                if (!confirm(`정말 [${currentMemberData.name}] 성도님을 '교제안나옴' 상태로 변경하시겠습니까?`)) return;
                try {
                    const res = await fetch(`/api/members/${currentMemberData.id}`, {
                        method: 'PUT', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ...currentMemberData, status: 'inactive' })
                    });
                    if (res.ok) {
                        alert('성공적으로 변경되었습니다.');
                        if (memberHistoryModal) memberHistoryModal.classList.add('hidden');
                        refreshList();
                    } else { alert('처리에 실패하였습니다.'); }
                } catch (err) { console.error(err); alert('오류가 발생했습니다.'); }
            });
        }

        // 성도 정보 완전 삭제 — 수정 모달에서 실행
        if (deleteMemberFullyBtn) {
            deleteMemberFullyBtn.addEventListener('click', async () => {
                const currentMemberData = getMember();
                if (!currentMemberData) return;
                if (!confirm(`정말 [${currentMemberData.name}] 성도님의 정보를 전체 삭제하시겠습니까?\n삭제된 정보는 절대 복구할 수 없습니다.`)) return;
                try {
                    const res = await fetch(`/api/members/${currentMemberData.id}`, { method: 'DELETE' });
                    if (res.ok) {
                        alert('성공적으로 삭제되었습니다.');
                        memberAddModal.classList.add('hidden');
                        refreshList();
                    } else { alert('삭제 처리에 실패하였습니다.'); }
                } catch (err) { console.error(err); alert('오류가 발생했습니다.'); }
            });
        }

        // "새 기록 추가" 패널
        if (addRecordBtn) {
            addRecordBtn.addEventListener('click', async () => {
                const currentMemberData = getMember();
                const date = recordDate.value, statusKey = recordStatus.value;
                let remark = recordRemark.value.trim();

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
                    } else { remark = cName; }
                } else if (statusKey === 'PARISH_MOVE') {
                    const p = document.getElementById('subParish');
                    remark = p.options[p.selectedIndex]?.text || '';
                    if (!remark || remark === '교구 선택' || remark === '교구 정보 없음') return alert('이동할 교구를 선택하세요.');
                }

                if (!date || !statusKey || !remark) return;

                if (currentMemberData) {
                    try {
                        const res = await fetch(`/api/members/${currentMemberData.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, status: statusKey, remark }) });
                        if (res.ok) {
                            fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs));
                            refreshList();
                            recordRemark.value = '';
                            recordStatus.dispatchEvent(new Event('change'));
                        }
                    } catch (e) { console.error(e); }
                } else {
                    pendingRecords.push({ date, status: statusKey, remark });
                    renderEditModalRecords(pendingRecords);
                    recordRemark.value = '';
                    recordStatus.dispatchEvent(new Event('change'));
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

        // 폼 제출 (등록/수정)
        memberAddForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentMemberData = getMember();
            const data = {}; new FormData(memberAddForm).forEach((v, k) => data[k] = v);

            if (currentMemberData) {
                if (!data.church) data.church = currentMemberData.church;
                if (!data.parish) data.parish = currentMemberData.parish;
                if (!data.district) data.district = currentMemberData.district;
            }

            data.crossUpdates = pendingCrossUpdates;
            data.pendingRecords = pendingRecords;
            // [2026-07-07 감사 보고서 8번 항목] 가족 검색으로 특정 사람을 골랐을 때 확정된
            // "이름(관계)" -> member_id 매핑. 서버가 이름 대신 이 id로 정확히 매칭하도록 함께 보낸다.
            data.family_relation_ids = JSON.stringify(window._familyRelationIdMap || {});

            try {
                const url = currentMemberData ? `/api/members/${currentMemberData.id}` : '/api/members';
                const method = currentMemberData ? 'PUT' : 'POST';
                const editedId = currentMemberData ? currentMemberData.id : null;
                const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                if (res.ok) {
                    memberAddModal.classList.add('hidden');
                    refreshList();
                    if (editedId) refreshHistoryModal(editedId);
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert(`저장 실패: ${err.error || '알 수 없는 오류'}`);
                }
            } catch (e) { console.error(e); alert('통신 중 오류가 발생했습니다.'); }
        });

        // 등록 폼 상단 교회/교구/구역 select 연동
        const formChurch = memberAddForm.querySelector('select[name="church"]');
        const formParish = memberAddForm.querySelector('select[name="parish"]');
        const formDistrict = memberAddForm.querySelector('select[name="district"]');
        if (formChurch && formParish && formDistrict) {
            formChurch.addEventListener('change', async () => {
                const opt = formChurch.options[formChurch.selectedIndex];
                const churchId = opt ? opt.dataset.id : null;
                await updateFormParishOptions(formParish, churchId);
                await updateFormDistrictOptions(formParish, formDistrict, formParish.value);
            });
            formParish.addEventListener('change', async () => {
                await updateFormDistrictOptions(formParish, formDistrict, formParish.value);
            });
        }
    }

    window.RECORD_STATUS_MAP = RECORD_STATUS_MAP;
    window.MemberEditModule = { init: init, openAddModal: (isEdit) => openAddModal(isEdit) };
})();
