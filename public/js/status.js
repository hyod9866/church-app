document.addEventListener('DOMContentLoaded', () => {
    // --- Data States ---
    let churches = [];
    let parishes = [];
    let districts = [];
    let allSermons = []; // meetings with type '외부설교'
    let selectedNode = null; // { type: 'church'|'parish'|'district', id: Number, name: String, parentId: Number }

    // --- DOM Elements ---
    const treeContainer = document.getElementById('treeContainer');
    const treeSearchInput = document.getElementById('treeSearchInput');
    const onlySermonChecked = document.getElementById('onlySermonChecked');
    const noSelectionAlert = document.getElementById('noSelectionAlert');
    const detailDashboard = document.getElementById('detailDashboard');
    const nodeTypeBadge = document.getElementById('nodeTypeBadge');
    const nodeParentHierarchy = document.getElementById('nodeParentHierarchy');
    const nodeTitle = document.getElementById('nodeTitle');
    const tabOrgBtn = document.getElementById('tabOrgBtn');
    const tabSermonBtn = document.getElementById('tabSermonBtn');
    const tabOrgPanel = document.getElementById('tabOrgPanel');
    const tabSermonPanel = document.getElementById('tabSermonPanel');
    const sermonBadgeCount = document.getElementById('sermonBadgeCount');
    
    // Metrics
    const metricMemberCount = document.getElementById('metricMemberCount');
    const metricSubOrgCard = document.getElementById('metricSubOrgCard');
    const metricSubOrgTitle = document.getElementById('metricSubOrgTitle');
    const metricSubOrgCount = document.getElementById('metricSubOrgCount');
    const metricOfficerRatio = document.getElementById('metricOfficerRatio');
    
    // Inner Table
    const tableSectionTitle = document.getElementById('tableSectionTitle');
    const addSubOrgBtn = document.getElementById('addSubOrgBtn');
    const tableListContainer = document.getElementById('tableListContainer');
    
    // Sermons
    const sermonStatTotal = document.getElementById('sermonStatTotal');
    const sermonStatLast = document.getElementById('sermonStatLast');
    const sermonTimelineContainer = document.getElementById('sermonTimelineContainer');
    
    // Node Modal & Form
    const nodeModal = document.getElementById('nodeModal');
    const nodeForm = document.getElementById('nodeForm');
    const nodeFormAction = document.getElementById('nodeFormAction');
    const nodeFormType = document.getElementById('nodeFormType');
    const nodeFormParentId = document.getElementById('nodeFormParentId');
    const nodeFormTargetId = document.getElementById('nodeFormTargetId');
    const nodeFormName = document.getElementById('nodeFormName');
    const nodeFormParishNo = document.getElementById('nodeFormParishNo');
    const modalTitle = document.getElementById('modalTitle');
    const inputLabel = document.getElementById('inputLabel');
    const parishLeaderSection = document.getElementById('parishLeaderSection');
    
    // Buttons
    const addChurchBtn = document.getElementById('addChurchBtn');
    const editNodeBtn = document.getElementById('editNodeBtn');
    const deleteNodeBtn = document.getElementById('deleteNodeBtn');

    // Header Selectors
    const headerChurch = document.getElementById('headerChurchSelect');
    const headerParish = document.getElementById('headerParishSelect');

    // --- Helper Colors mapping ---
    const getDC = (d) => {
        if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
        if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
        if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
        return 'bg-amber-100 text-amber-800 border-amber-200';
    };

    // --- API Fetchers ---
    async function fetchChurches() { const res = await fetch('/api/churches/all'); return await res.json(); }
    async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
    async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }
    async function fetchMeetings() { const res = await fetch('/api/meetings'); return await res.json(); }

    // --- Load & Prepare Data ---
    async function initData() {
        try {
            churches = await fetchChurches();
            
            // 모든 교구 정보를 일괄 조회
            const parishesRes = await fetch('/api/parishes?church_id=all');
            parishes = await parishesRes.json();
            
            // 모든 구역 정보를 일괄 조회
            const districtsRes = await fetch('/api/districts?parish_id=all');
            districts = await districtsRes.json();
            
            // 외부설교 일정
            const meetings = await fetchMeetings();
            allSermons = meetings.filter(m => m.type === '외부설교');
            
            renderTree();
        } catch (err) {
            console.error('Data Loading Error:', err);
            treeContainer.innerHTML = `<div class="text-red-500 font-bold p-4 text-center text-xs">오류가 발생했습니다: ${err.message}</div>`;
        }
    }

    // --- Tab Switching Logic ---
    function switchTab(target) {
        if (target === 'org') {
            tabOrgBtn.className = "border-b-2 border-blue-600 text-blue-600 pb-3 px-1 text-sm font-black flex items-center gap-2";
            tabSermonBtn.className = "border-b-2 border-transparent text-gray-500 hover:text-gray-700 pb-3 px-1 text-sm font-bold flex items-center gap-2 transition";
            tabOrgPanel.classList.remove('hidden');
            tabSermonPanel.classList.add('hidden');
        } else {
            tabSermonBtn.className = "border-b-2 border-blue-600 text-blue-600 pb-3 px-1 text-sm font-black flex items-center gap-2";
            tabOrgBtn.className = "border-b-2 border-transparent text-gray-500 hover:text-gray-700 pb-3 px-1 text-sm font-bold flex items-center gap-2 transition";
            tabSermonPanel.classList.remove('hidden');
            tabOrgPanel.classList.add('hidden');
        }
    }

    tabOrgBtn.addEventListener('click', () => switchTab('org'));
    tabSermonBtn.addEventListener('click', () => switchTab('sermon'));

    // --- Collapsible Tree Rendering ---
    function renderTree() {
        const searchQuery = treeSearchInput.value.trim().toLowerCase();
        const showOnlySermon = onlySermonChecked.checked;
        treeContainer.innerHTML = '';

        // 외부설교 횟수 캐싱
        const sermonCountsByChurch = {};
        allSermons.forEach(s => {
            if (s.church) {
                const name = s.church.trim();
                sermonCountsByChurch[name] = (sermonCountsByChurch[name] || 0) + 1;
            }
        });

        const filteredChurches = churches.filter(c => {
            const hasSermon = !!sermonCountsByChurch[c.name.trim()];
            if (showOnlySermon && !hasSermon) return false;
            
            if (searchQuery) {
                // 검색어 매칭: 교회명 또는 하위 교구/구역명이 매칭되는지 확인
                const matchChurch = c.name.toLowerCase().includes(searchQuery);
                const matchParish = parishes.some(p => p.church_id === c.id && p.name.toLowerCase().includes(searchQuery));
                const matchDistrict = districts.some(d => {
                    const p = parishes.find(pa => pa.id === d.parish_id);
                    return p && p.church_id === c.id && d.name.toLowerCase().includes(searchQuery);
                });
                return matchChurch || matchParish || matchDistrict;
            }
            return true;
        });

        if (filteredChurches.length === 0) {
            treeContainer.innerHTML = `<div class="text-gray-400 text-xs italic p-4 text-center">검색 결과가 없습니다.</div>`;
            return;
        }

        filteredChurches.forEach(c => {
            const isSeoul = c.name.includes('서울중앙교회');
            const cSermonCount = sermonCountsByChurch[c.name.trim()] || 0;
            const churchEl = document.createElement('div');
            churchEl.className = 'select-none mb-1';
            
            // Render Church Node
            const isNodeActive = selectedNode && selectedNode.type === 'church' && selectedNode.id === c.id;
            const hasSermonIcon = cSermonCount > 0 ? `<span class="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1.5"><i class="fa-solid fa-microphone text-[8px] mr-0.5"></i>${cSermonCount}회</span>` : '';
            
            // 서울중앙교회는 특별 아이콘(fa-hotel), 타교회는 일반교회 아이콘(fa-place-of-worship)
            const iconClass = isSeoul ? 'fa-hotel text-blue-600' : 'fa-place-of-worship text-gray-400';
            
            churchEl.innerHTML = `
                <div class="flex items-center justify-between p-2 rounded-xl cursor-pointer hover:bg-gray-100 transition duration-200 group text-sm font-bold text-gray-700 ${isNodeActive ? 'tree-node-active' : ''}" data-type="church" data-id="${c.id}" data-name="${c.name}">
                    <div class="flex items-center gap-2 min-w-0">
                        <i class="fa-solid ${iconClass} flex-shrink-0"></i>
                        <span class="truncate">${c.name}</span>
                        ${hasSermonIcon}
                    </div>
                    <i class="fa-solid fa-chevron-right text-gray-400 text-[10px] transition-transform duration-200 flex-shrink-0" id="chevron-c-${c.id}"></i>
                </div>
                <div id="sub-c-${c.id}" class="pl-4 border-l border-gray-100 ml-3.5 mt-1 space-y-1 hidden"></div>
            `;
            
            const churchNode = churchEl.querySelector('[data-type="church"]');
            churchNode.addEventListener('click', (e) => {
                e.stopPropagation();
                selectNode('church', c.id, c.name, null);
                
                const subContainer = churchEl.querySelector(`#sub-c-${c.id}`);
                const chevron = churchEl.querySelector(`#chevron-c-${c.id}`);
                const isHidden = subContainer.classList.contains('hidden');
                
                if (isHidden) {
                    subContainer.classList.remove('hidden');
                    chevron.classList.add('rotate-90');
                    renderParishNodes(c.id, subContainer);
                } else {
                    subContainer.classList.add('hidden');
                    chevron.classList.remove('rotate-90');
                }
            });

            treeContainer.appendChild(churchEl);
        });
    }

    // --- Render Parish Nodes (Seoul Central Only) ---
    function renderParishNodes(churchId, container) {
        container.innerHTML = '';
        const searchQuery = treeSearchInput.value.trim().toLowerCase();

        const filteredParishes = parishes.filter(p => {
            if (p.church_id !== churchId) return false;
            if (searchQuery) {
                const matchParish = p.name.toLowerCase().includes(searchQuery);
                const matchDistrict = districts.some(d => d.parish_id === p.id && d.name.toLowerCase().includes(searchQuery));
                return matchParish || matchDistrict;
            }
            return true;
        });

        filteredParishes.forEach(p => {
            const parishEl = document.createElement('div');
            parishEl.className = 'select-none mb-1';
            
            const isNodeActive = selectedNode && selectedNode.type === 'parish' && selectedNode.id === p.id;
            
            parishEl.innerHTML = `
                <div class="flex items-center justify-between p-2 rounded-xl cursor-pointer hover:bg-gray-100 transition duration-200 group text-xs font-bold text-gray-600 ${isNodeActive ? 'tree-node-active' : ''}" data-type="parish" data-id="${p.id}" data-name="${p.name}">
                    <div class="flex items-center gap-2 min-w-0">
                        <i class="fa-solid fa-people-roof text-indigo-500 flex-shrink-0"></i>
                        <span class="truncate">${p.name}</span>
                    </div>
                    <i class="fa-solid fa-chevron-right text-gray-400 text-[9px] transition-transform duration-200 flex-shrink-0" id="chevron-p-${p.id}"></i>
                </div>
                <div id="sub-p-${p.id}" class="pl-4 border-l border-gray-100 ml-3 mt-1 space-y-1 hidden"></div>
            `;
            
            const parishNode = parishEl.querySelector('[data-type="parish"]');
            parishNode.addEventListener('click', (e) => {
                e.stopPropagation();
                selectNode('parish', p.id, p.name, churchId);
                const subContainer = parishEl.querySelector(`#sub-p-${p.id}`);
                const chevron = parishEl.querySelector(`#chevron-p-${p.id}`);
                const isHidden = subContainer.classList.contains('hidden');
                
                if (isHidden) {
                    subContainer.classList.remove('hidden');
                    chevron.classList.add('rotate-90');
                    renderDistrictNodes(p.id, subContainer);
                } else {
                    subContainer.classList.add('hidden');
                    chevron.classList.remove('rotate-90');
                }
            });
            
            container.appendChild(parishEl);
        });
    }

    // --- Render District Nodes ---
    function renderDistrictNodes(parishId, container) {
        container.innerHTML = '';
        const searchQuery = treeSearchInput.value.trim().toLowerCase();

        const filteredDistricts = districts.filter(d => {
            if (searchQuery) {
                return d.name.toLowerCase().includes(searchQuery);
            }
            return true;
        });

        filteredDistricts.filter(d => d.parish_id === parishId).forEach(d => {
            const distEl = document.createElement('div');
            distEl.className = 'select-none';
            
            const isNodeActive = selectedNode && selectedNode.type === 'district' && selectedNode.id === d.id;
            
            distEl.innerHTML = `
                <div class="flex items-center p-2 rounded-xl cursor-pointer hover:bg-gray-100 transition duration-200 group text-xs font-bold text-gray-500 ${isNodeActive ? 'tree-node-active' : ''}" data-type="district" data-id="${d.id}" data-name="${d.name}">
                    <i class="fa-solid fa-house-chimney text-emerald-500 mr-2 flex-shrink-0"></i>
                    <span class="truncate">${d.name}</span>
                </div>
            `;
            
            distEl.querySelector('[data-type="district"]').addEventListener('click', (e) => {
                e.stopPropagation();
                selectNode('district', d.id, d.name, parishId);
            });
            
            container.appendChild(distEl);
        });
    }

    // --- Select Node Actions ---
    async function selectNode(type, id, name, parentId) {
        selectedNode = { type, id, name, parentId };
        
        // UI Visual Update (Re-apply active background highlighting)
        document.querySelectorAll('[data-type]').forEach(el => {
            el.classList.remove('tree-node-active');
            if (el.dataset.type === type && parseInt(el.dataset.id) === id) {
                el.classList.add('tree-node-active');
            }
        });
        
        noSelectionAlert.classList.add('hidden');
        detailDashboard.classList.remove('hidden');
        
        // Set Header labels
        nodeTitle.textContent = name;
        nodeTypeBadge.textContent = type === 'church' ? '교회' : type === 'parish' ? '교구' : '구역';
        
        if (type === 'church') {
            nodeParentHierarchy.textContent = '';
            metricSubOrgCard.classList.remove('hidden');
            metricSubOrgTitle.textContent = '하위 교구 수';
            tableSectionTitle.textContent = '하위 교구 리스트';
            editNodeBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 교회명 변경';
            // 모든 교회에서 하위교구 추가 허용
            addSubOrgBtn.classList.remove('hidden');
            
            // 외부설교 탭 활성화 & 카운트 노출
            const churchSermons = allSermons.filter(s => s.church && s.church.trim() === name.trim());
            sermonBadgeCount.textContent = churchSermons.length;
            sermonBadgeCount.classList.remove('hidden');
            tabSermonBtn.classList.remove('hidden');
            
            renderSermonTimeline(name, churchSermons);
        } else if (type === 'parish') {
            const ch = churches.find(c => c.id === parentId);
            nodeParentHierarchy.textContent = `${ch ? ch.name : ''} >`;
            metricSubOrgCard.classList.remove('hidden');
            metricSubOrgTitle.textContent = '하위 구역 수';
            tableSectionTitle.textContent = '하위 구역 리스트';
            editNodeBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 교구 정보 수정';
            addSubOrgBtn.classList.remove('hidden');
            
            sermonBadgeCount.classList.add('hidden');
            tabSermonBtn.classList.add('hidden'); // 교구 단위 외부설교 불가
            switchTab('org');
        } else {
            const p = parishes.find(pa => pa.id === parentId);
            const ch = p ? churches.find(c => c.id === p.church_id) : null;
            nodeParentHierarchy.textContent = `${ch ? ch.name : ''} > ${p ? p.name : ''} >`;
            metricSubOrgCard.classList.add('hidden');
            tableSectionTitle.textContent = '소속 성도 명단';
            editNodeBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 구역명 변경';
            addSubOrgBtn.classList.add('hidden'); // 구역 아래는 하위 조직 없음
            
            sermonBadgeCount.classList.add('hidden');
            tabSermonBtn.classList.add('hidden');
            switchTab('org');
        }
        
        await loadDetails();
    }

    // --- Load Detail Metrics and Sub-Organ list ---
    async function loadDetails() {
        const { type, id, name, parentId } = selectedNode;
        tableListContainer.innerHTML = `<div class="text-gray-400 text-xs italic text-center py-6"><i class="fa-solid fa-spinner animate-spin mr-2"></i>상세 정보를 불러오는 중...</div>`;
        
        try {
            let memberUrl = '';
            if (type === 'church') {
                memberUrl = `/api/members/search?parish=all&status=all`; // 전체 교회 조회
            } else if (type === 'parish') {
                memberUrl = `/api/members/search?parish=${encodeURIComponent(name)}&status=all`;
            } else {
                memberUrl = `/api/members/search?district=${encodeURIComponent(name)}&status=all`;
            }
            
            const mRes = await fetch(memberUrl);
            let members = await mRes.json();
            
            // 교회 단위 필터링 (서울중앙교회는 소속 parish가 '부곡교구' 등인 인원만, 타교회는 m.church 또는 m.parish가 타교회인 인원)
            if (type === 'church') {
                if (name.includes('서울중앙교회')) {
                    members = members.filter(m => m.parish && m.parish !== '타 교구');
                } else {
                    members = members.filter(m => m.church === name);
                }
            }
            
            // 통계 계산
            const totalCount = members.length;
            const activeCount = members.filter(m => m.status === 'active').length;
            const officerCount = members.filter(m => m.position && m.position.trim().length > 0).length;
            const officerRatio = totalCount > 0 ? Math.round((officerCount / totalCount) * 100) : 0;
            
            metricMemberCount.textContent = `${activeCount}명 (총 ${totalCount}명)`;
            metricOfficerRatio.textContent = `${officerRatio}%`;
            
            // 하위 노드 수 및 리스트 렌더링
            if (type === 'church') {
                const churchParishes = parishes.filter(p => p.church_id === id);
                const subCount = churchParishes.length;
                metricSubOrgCount.textContent = `${subCount}개`;
                
                tableListContainer.innerHTML = `
                    <table class="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-100 font-black text-gray-600">
                                <th class="p-2 border-b">교구 명칭</th>
                                <th class="p-2 border-b">교구 코드</th>
                                <th class="p-2 border-b text-right">구역 수</th>
                                <th class="p-2 border-b text-center w-12">삭제</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${churchParishes.map(p => {
                                const dCount = districts.filter(d => d.parish_id === p.id).length;
                                return `
                                    <tr class="hover:bg-blue-50 border-b cursor-pointer transition" onclick="selectNode('parish', ${p.id}, '${p.name}', ${id})">
                                        <td class="p-2 font-bold text-blue-900">${p.name}</td>
                                        <td class="p-2 font-mono text-gray-500">${p.parish_no || '-'}번</td>
                                        <td class="p-2 text-right text-gray-700 font-bold">${dCount}개 구역</td>
                                        <td class="p-2 text-center" onclick="event.stopPropagation(); deleteNodeDirectly('parish', ${p.id}, '${p.name}')">
                                            <button class="text-rose-500 hover:text-rose-700 transition p-1"><i class="fa-solid fa-trash-can"></i></button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            } else if (type === 'parish') {
                const subDists = districts.filter(d => d.parish_id === id);
                metricSubOrgCount.textContent = `${subDists.length}개`;
                
                tableListContainer.innerHTML = `
                    <table class="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr class="bg-gray-100 font-black text-gray-600">
                                <th class="p-2 border-b">구역 명칭</th>
                                <th class="p-2 border-b text-right">등록 인원</th>
                                <th class="p-2 border-b text-center w-12">삭제</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${subDists.map(d => {
                                return `
                                    <tr class="hover:bg-blue-50 border-b cursor-pointer transition" onclick="selectNode('district', ${d.id}, '${d.name}', ${id})">
                                        <td class="p-2 font-bold text-blue-900">${d.name}</td>
                                        <td class="p-2 text-right text-gray-500">조회 가능</td>
                                        <td class="p-2 text-center" onclick="event.stopPropagation(); deleteNodeDirectly('district', ${d.id}, '${d.name}')">
                                            <button class="text-rose-500 hover:text-rose-700 transition p-1"><i class="fa-solid fa-trash-can"></i></button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                // 구역 상세: 소속 성도 명단 테이블화
                tableListContainer.innerHTML = `
                    <table class="w-full text-[11px] text-left border-collapse whitespace-nowrap">
                        <thead>
                            <tr class="bg-gray-100 font-black text-gray-600">
                                <th class="p-2 border-b">성명</th>
                                <th class="p-2 border-b">소속회</th>
                                <th class="p-2 border-b">생년</th>
                                <th class="p-2 border-b">직분</th>
                                <th class="p-2 border-b">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${members.map(m => {
                                return `
                                    <tr class="hover:bg-gray-50 border-b">
                                        <td class="p-2 font-black text-gray-800">${m.name}</td>
                                        <td class="p-2 font-bold text-blue-800">${m.category || '-'}</td>
                                        <td class="p-2 text-gray-500">${m.birth_year || '-'}년</td>
                                        <td class="p-2 text-yellow-800 font-bold">${m.position || '-'}</td>
                                        <td class="p-2"><span class="px-1.5 py-0.5 rounded-full text-[9px] font-black ${m.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${m.status === 'active' ? '교제중' : '쉬는중'}</span></td>
                                    </tr>
                                `;
                            }).join('') || '<tr><td colspan="5" class="p-4 text-center text-gray-400 italic">등록된 성도가 없습니다.</td></tr>'}
                        </tbody>
                    </table>
                `;
            }
        } catch (err) {
            console.error(err);
            tableListContainer.innerHTML = `<div class="text-red-500 font-bold p-4 text-center text-xs">정보 로드 실패: ${err.message}</div>`;
        }
    }

    // --- Render External Sermon Timeline (🎤) ---
    function renderSermonTimeline(churchName, sermons) {
        sermonStatTotal.textContent = `${surn(sermons.length)}회`;
        
        if (sermons.length === 0) {
            sermonStatLast.textContent = '기록 없음';
            sermonTimelineContainer.innerHTML = `
                <div class="flex flex-col items-center justify-center py-10 text-gray-400">
                    <i class="fa-solid fa-microphone-slash text-4xl mb-2 text-gray-200"></i>
                    <p class="text-xs italic">'${churchName}'으로 다녀온 외부설교 기록이 아직 등록되어 있지 않습니다.</p>
                </div>
            `;
            return;
        }

        // 시간 기준 역순 정렬
        sermons.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // 마지막 설교 계산
        const last = sermons[0];
        const lastDate = new Date(last.date);
        const today = new Date();
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        sermonStatLast.textContent = `${last.date} (약 ${diffDays}일 전)`;

        sermonTimelineContainer.innerHTML = sermons.map((s, idx) => {
            return `
                <div class="relative pl-2 group">
                    <!-- Timeline node dot -->
                    <span class="absolute -left-[23px] top-1.5 w-3.5 h-3.5 rounded-full ${idx === 0 ? 'bg-purple-600 ring-4 ring-purple-100' : 'bg-gray-300'} border-2 border-white transition group-hover:scale-125 duration-200 z-10"></span>
                    <div class="bg-gray-50 border rounded-2xl p-4 shadow-sm group-hover:shadow-md transition duration-200">
                        <div class="flex justify-between items-center mb-1 flex-wrap gap-2">
                            <span class="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">${s.date}</span>
                            <span class="text-[10px] text-gray-400 font-bold"><i class="fa-solid fa-microphone-lines mr-0.5"></i>외부설교</span>
                        </div>
                        <h4 class="font-extrabold text-gray-800 text-sm mb-1 text-blue-900">${s.title}</h4>
                        ${s.sermon_title ? `<div class="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-100 font-black mb-2">설교 본문: ${s.sermon_title}</div>` : ''}
                        ${s.memo ? `<p class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">${s.memo}</p>` : '<p class="text-xs text-gray-400 italic">설교 내용 메모 없음</p>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    function surn(v) { return isNaN(v) ? 0 : v; }

    // --- Modal Management (Add/Edit Nodes) ---
    function openModal(action, type, parentId = null, targetId = null, currentName = '', parishNo = '') {
        nodeFormAction.value = action;
        nodeFormType.value = type;
        nodeFormParentId.value = parentId || '';
        nodeFormTargetId.value = targetId || '';
        nodeFormName.value = currentName;
        nodeFormParishNo.value = parishNo;
        
        parishLeaderSection.classList.add('hidden');

        if (action === 'create') {
            if (type === 'church') {
                modalTitle.textContent = '새 외부 교회 등록';
                inputLabel.textContent = '교회 명칭';
                nodeFormName.placeholder = '교회 명칭 입력 (예: 파주교회)';
            } else if (type === 'parish') {
                modalTitle.textContent = '교구 신설';
                inputLabel.textContent = '교구 명칭';
                nodeFormName.placeholder = '교구 명칭 입력 (예: 58교구)';
                parishLeaderSection.classList.remove('hidden');
            } else {
                modalTitle.textContent = '구역 생성';
                inputLabel.textContent = '구역 명칭';
                nodeFormName.placeholder = '구역 명칭 입력 (예: 584구역)';
            }
        } else { // Edit
            modalTitle.textContent = `'${currentName}' 이름 변경`;
            inputLabel.textContent = '변경할 명칭';
            if (type === 'parish') {
                parishLeaderSection.classList.remove('hidden');
            }
        }

        nodeModal.classList.remove('hidden');
    }

    function closeModal() {
        nodeModal.classList.add('hidden');
        nodeForm.reset();
    }

    document.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModal));

    // Button Click Binds
    addChurchBtn.addEventListener('click', () => openModal('create', 'church'));
    
    addSubOrgBtn.addEventListener('click', () => {
        if (!selectedNode) return;
        const { type, id } = selectedNode;
        if (type === 'church') {
            openModal('create', 'parish', id);
        } else if (type === 'parish') {
            openModal('create', 'district', id);
        }
    });

    editNodeBtn.addEventListener('click', () => {
        if (!selectedNode) return;
        const { type, id, name, parentId } = selectedNode;
        let pNo = '';
        if (type === 'parish') {
            const pObj = parishes.find(pa => pa.id === id);
            pNo = pObj ? pObj.parish_no : '';
        }
        openModal('edit', type, parentId, id, name, pNo);
    });

    // Delete Node Handler
    async function deleteNode(type, id, name) {
        let confirmMsg = `'${name}'을 삭제하시겠습니까?\n삭제하면 되돌릴 수 없습니다.`;
        if (type === 'church' && name.includes('서울중앙교회')) {
            return alert('서울중앙교회 본교는 삭제할 수 없습니다.');
        }
        
        if (confirm(confirmMsg)) {
            try {
                let url = '';
                if (type === 'church') url = `/api/churches/${id}`;
                else if (type === 'parish') url = `/api/parishes/${id}`;
                else url = `/api/districts/${id}`;
                
                const res = await fetch(url, { method: 'DELETE' });
                const reply = await res.json();
                
                if (res.ok) {
                    alert('성공적으로 삭제되었습니다.');
                    if (selectedNode && selectedNode.type === type && selectedNode.id === id) {
                        selectedNode = null;
                        detailDashboard.classList.add('hidden');
                        noSelectionAlert.classList.remove('hidden');
                    }
                    await initData();
                } else {
                    alert(`삭제 실패: ${reply.error || '알 수 없는 오류'}`);
                }
            } catch (err) {
                alert(`통신 오류: ${err.message}`);
            }
        }
    }

    deleteNodeBtn.addEventListener('click', () => {
        if (!selectedNode) return;
        deleteNode(selectedNode.type, selectedNode.id, selectedNode.name);
    });

    // Submit Node Form (Add / Edit)
    nodeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const action = nodeFormAction.value;
        const type = nodeFormType.value;
        const parentId = nodeFormParentId.value;
        const targetId = nodeFormTargetId.value;
        const name = nodeFormName.value.trim();
        const parishNo = nodeFormParishNo.value;

        if (!name) return;

        try {
            let url = '';
            let method = 'POST';
            const bodyData = { name };
            
            if (type === 'parish') {
                bodyData.church_id = parentId;
                if (parishNo) bodyData.parish_no = parseInt(parishNo);
            } else if (type === 'district') {
                bodyData.parish_id = parentId;
            }

            if (action === 'create') {
                if (type === 'church') url = '/api/churches';
                else if (type === 'parish') url = '/api/parishes';
                else url = '/api/districts';
            } else { // edit
                method = 'PUT';
                if (type === 'church') url = `/api/churches/${targetId}`;
                else if (type === 'parish') {
                    url = `/api/parishes/${targetId}`;
                    if (parishNo) bodyData.parish_no = parseInt(parishNo);
                }
                else url = `/api/districts/${targetId}`;
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });
            const reply = await res.json();

            if (res.ok) {
                closeModal();
                await initData();
                if (action === 'edit') {
                    // 선택된 명칭 최신화
                    selectNode(type, parseInt(targetId), name, parentId ? parseInt(parentId) : null);
                }
            } else {
                alert(`실패: ${reply.error || '알 수 없는 오류'}`);
            }
        } catch (err) {
            alert(`통신 실패: ${err.message}`);
        }
    });

    // --- Search Input and Filter Binding ---
    treeSearchInput.addEventListener('input', renderTree);
    onlySermonChecked.addEventListener('change', renderTree);

    // --- Setup Header Org Selectors ( localStorage sync ) ---
    async function updateHeaderParishOptions(churchId, targetParishId = null) {
        if (!headerParish) return;
        if (!churchId) return;
        const parishes = await fetchParishes(churchId);
        if (parishes.length > 0) {
            headerParish.innerHTML = parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
            headerParish.style.display = 'inline-block';
            
            if (targetParishId) {
                const exists = parishes.some(p => p.id == targetParishId);
                if (exists) headerParish.value = targetParishId;
                else headerParish.value = parishes[0].id;
            } else {
                headerParish.value = parishes[0].id;
            }
        } else {
            headerParish.innerHTML = '<option value="">교구 없음</option>';
        }
    }

    async function initHeaderSelectors() {
        if (!headerChurch || !headerParish) return;

        const allChurches = await fetchChurches();
        headerChurch.innerHTML = allChurches.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        let savedChurchId = localStorage.getItem('activeChurchId');
        let savedParishId = localStorage.getItem('activeParishId');

        if (!savedChurchId) {
            const sc = allChurches.find(c => c.name.includes('서울중앙교회'));
            if (sc) savedChurchId = sc.id;
        }

        if (savedChurchId) {
            headerChurch.value = savedChurchId;
        }

        await updateHeaderParishOptions(headerChurch.value, savedParishId);

        headerChurch.addEventListener('change', async () => {
            localStorage.setItem('activeChurchId', headerChurch.value);
            await updateHeaderParishOptions(headerChurch.value);
            localStorage.setItem('activeParishId', headerParish.value);
        });

        headerParish.addEventListener('change', () => {
            localStorage.setItem('activeParishId', headerParish.value);
        });
    }

    // --- Final Execution ---
    window.selectNode = selectNode;
    window.deleteNodeDirectly = deleteNode;

    initHeaderSelectors();
    initData();
});
