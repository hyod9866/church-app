document.addEventListener('DOMContentLoaded', () => {
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const yearSelect = document.getElementById('yearSelect');
    const sidebarDistrictFilter = document.getElementById('sidebarDistrictFilter');
    const sidebarCategoryFilter = document.getElementById('sidebarCategoryFilter');
    const sidebarGenderFilter = document.getElementById('sidebarGenderFilter');
    const sortOrder = document.getElementById('sortOrder');
    const dashboardRange = document.getElementById('dashboardRange');
    
    // Sidebar elements
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebar');
    const searchInput = document.getElementById('memberSearch');

    let allData = { meetings: [], members: [] };
    let charts = {
        district: null,
        group: null,
        brother: null,
        youth: null
    };

    // Helper Functions
    function getAge(birthYear) {
        return birthYear ? (2026 - parseInt(birthYear) + 1) : '-';
    }

    function getDistrictColorClass(d) {
        if (!d) return 'text-gray-400';
        if (d.includes('581')) return 'text-blue-600';
        if (d.includes('582')) return 'text-red-600';
        if (d.includes('583')) return 'text-green-600';
        return 'text-amber-600';
    }

    function getPositionBadges(member) {
        const positions = (member.position || '').split(',').map(p => p.trim()).filter(p => p);
        positions.sort((a, b) => (a === '집사' ? -1 : b === '집사' ? 1 : 0));
        return positions.map(p => {
            const badgeClass = p === '집사' ? "bg-emerald-100 text-emerald-800 border-emerald-200" : "bg-yellow-100 text-yellow-800 border-yellow-200";
            return `<span class="${badgeClass} text-[10px] px-1.5 py-0.5 rounded border font-black ml-1">${p}</span>`;
        }).join('');
    }

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

    function calculateAttendanceStats(member, filteredMeetings) {
        let attendCount = 0;
        let totalCount = 0; 
        const today = new Date().toISOString().split('T')[0];

        filteredMeetings.forEach(m => {
            // Only include meetings that have already happened (or are happening today)
            if (m.date > today) return;

            const rec = member.attendance[m.id];
            const isMandatory = isMandatoryMeeting(member, m);
            
            // Criteria: Visible as V or X on the table
            if (isMandatory || (rec && rec.is_present)) {
                totalCount++;
                if (rec && rec.is_present) attendCount++;
            }
        });

        const ratePercent = totalCount > 0 ? Math.round((attendCount / totalCount) * 100) : 0;
        let rateClass = 'rate-low';
        if (ratePercent >= 80) rateClass = 'rate-high';
        else if (ratePercent >= 50) rateClass = 'rate-mid';

        return { attendCount, totalMandatory: totalCount, ratePercent, rateClass };
    }

    function getFilteredData() {
        const district = sidebarDistrictFilter.value;
        const category = sidebarCategoryFilter.value;
        const bs = sidebarGenderFilter.value;
        const query = (searchInput ? searchInput.value : '').trim();

        // Get selected meeting types from checkboxes
        const selectedTypes = Array.from(document.querySelectorAll('.meeting-type-checkbox:checked')).map(cb => cb.value);

        // 1. Filter meetings based on selected district and selected types
        const filteredMeetings = allData.meetings.filter(meeting => {
            // Exclusion: '설교' (Sermon) type is for personal management and excluded from Dashboard stats
            if (meeting.type === '설교' || meeting.type === '외부설교') return false;

            // Filter by selected types (multi-check)
            const matchesType = selectedTypes.some(type => meeting.type.includes(type));
            if (!matchesType) return false;

            // Filter by district (Hide other district specific meetings)
            if (district === '전체') return true;
            
            const selectedDistNum = district.replace(/[^0-9]/g, '');
            const meetingDistMatch = meeting.type.match(/\d+/);
            
            if (meetingDistMatch) {
                return meetingDistMatch[0] === selectedDistNum;
            }
            
            return true;
        });

        // 2. Filter and Sort members
        const filteredMembers = allData.members.filter(member => {
            // Hard Exclusion: Exclude '강효근' (ID: 270) from Dashboard
            if (member.id === 270) return false;

            // ALWAYS include "전도사" regardless of filters (if any other evangelist exists)
            if ((member.position || '').includes('전도사')) return true;

            // B/S Filter
            if (bs !== '전체') {
                if (member.bs !== bs) return false;
            }

            // Normalize district comparison (e.g., '581구역' vs '581')
            if (district !== '전체') {
                const normFilterDist = district.replace(/[^0-9]/g, '');
                const normMemberDist = (member.district || '').replace(/[^0-9]/g, '');
                if (normFilterDist !== normMemberDist) return false;
            }

            // Normalize category comparison (e.g., '청년회' vs '청년')
            if (category !== '전체') {
                const normFilterCat = category.replace(/회$/, '');
                const normMemberCat = (member.category || '').replace(/회$/, '');
                if (normFilterCat !== normMemberCat) return false;
            }

            // Search filter
            if (query !== '') {
                const searchStr = `${member.name} ${member.district || ''} ${member.category || ''}`.toLowerCase();
                if (!searchStr.includes(query.toLowerCase())) return false;
            }

            // --- Member Relevance Filter ---
            // Show member only if they are mandatory for AT LEAST ONE of the filtered meetings
            // OR if they have attended (V) at least one of them.
            if (filteredMeetings.length > 0) {
                const isRelevant = filteredMeetings.some(m => {
                    return isMandatoryMeeting(member, m) || member.attendance[m.id]?.is_present;
                });
                if (!isRelevant) return false;
            }

            return true;
        }).sort((a, b) => {
            const order = sortOrder ? sortOrder.value : 'name';
            
            if (order === 'rate') {
                const statsA = calculateAttendanceStats(a, filteredMeetings);
                const statsB = calculateAttendanceStats(b, filteredMeetings);
                if (statsA.ratePercent !== statsB.ratePercent) {
                    return statsB.ratePercent - statsA.ratePercent; // Descending
                }
                // If rates are equal, secondary sort by name
                return a.name.localeCompare(b.name, 'ko');
            }

            // Default: Sort by Gender -> District -> Name
            // 1. Sort by Gender (B first, then S)
            if (a.bs !== b.bs) {
                return (a.bs || 'Z').localeCompare(b.bs || 'Z');
            }

            // 2. Sort by district (numeric)
            const distA = parseInt((a.district || '').replace(/[^0-9]/g, '')) || 999;
            const distB = parseInt((b.district || '').replace(/[^0-9]/g, '')) || 999;
            if (distA !== distB) return distA - distB;
            
            // 3. Then by name
            return a.name.localeCompare(b.name, 'ko');
        });

        return { filteredMembers, filteredMeetings };
    }

    // --- Sidebar Functions ---
    function closeSidebarIfOpen() {
        if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
            sidebar.classList.add('-translate-x-full');
        }
    }

    // Sidebar Toggle Logic
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.remove('-translate-x-full');
        });
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
        });
    }

    // Close sidebar when clicking main content on mobile
    const mainContent = document.querySelector('main');
    if (mainContent) {
        mainContent.addEventListener('click', () => {
            if (window.innerWidth < 1280) {
                closeSidebarIfOpen();
            }
        });
    }

    // Initialize Year Selector
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 2024; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}년도`;
        yearSelect.appendChild(option);
    }

    function renderAll() {
        const { filteredMembers, filteredMeetings } = getFilteredData();
        renderTable(filteredMembers, filteredMeetings);
    }

    async function loadDashboardData(year) {
        try {
            const response = await fetch(`/api/dashboard/attendance?year=${year}`);
            if (!response.ok) throw new Error('Failed to fetch dashboard data');
            
            allData = await response.json();
            
            // Update range text
            dashboardRange.textContent = `${year-1}년 12월 ~ ${year}년 11월 출석 현황`;
            
            renderAll();
        } catch (error) {
            console.error('Error loading dashboard:', error);
            alert('데이터 로드 중 오류가 발생했습니다.');
        }
    }

    function renderTable(filteredMembers, filteredMeetings) {
        const today = new Date().toISOString().split('T')[0];
        let headerRow1 = `<tr><th rowspan="2" class="sticky-both p-3 border border-slate-200 text-sm font-black bg-slate-100 text-slate-800 member-info">성도명 / 소속 정보</th>`;
        let headerRow2 = `<tr>`;

        filteredMeetings.forEach(meeting => {
            const date = new Date(meeting.date);
            const formattedDate = `${date.getMonth() + 1}/${date.getDate()}`;
            
            let meetingAttendeeCount = 0;
            filteredMembers.forEach(member => {
                const rec = member.attendance[meeting.id];
                if (rec && rec.is_present) meetingAttendeeCount++;
            });

            const numMatch = meeting.type.match(/\d+/);
            const distNum = numMatch ? numMatch[0] : '';
            const label = meeting.type.replace(distNum, '').trim();
            
            let wrappedLabel = '';
            let tempLabel = label;
            if (tempLabel.includes('조모임')) {
                const parts = tempLabel.split('조모임');
                if (parts[0]) for (let i = 0; i < parts[0].length; i += 2) wrappedLabel += parts[0].substring(i, i + 2) + '<br>';
                wrappedLabel += '조<br>모임<br>';
                if (parts[1]) for (let i = 0; i < parts[1].length; i += 2) wrappedLabel += parts[1].substring(i, i + 2) + '<br>';
            } else {
                for (let i = 0; i < tempLabel.length; i += 2) wrappedLabel += tempLabel.substring(i, i + 2) + '<br>';
            }

            const isFuture = meeting.date > today;
            const header1Class = isFuture ? 'bg-slate-100/30 text-slate-400 opacity-60' : 'bg-slate-50 text-slate-700';
            const header2Class = isFuture ? 'bg-slate-100/10 text-slate-400 opacity-60' : 'bg-slate-50/50 text-slate-650';
            const attendeeBadgeClass = isFuture 
                ? 'text-[10px] font-extrabold text-slate-400 mt-1 bg-slate-50 border border-slate-100 px-1 rounded' 
                : 'text-[10px] font-extrabold text-blue-600 mt-1 bg-blue-50/70 border border-blue-100 px-1 rounded';

            headerRow1 += `<th class="sticky-header-1 p-2 border border-slate-200 text-xs font-bold ${header1Class} attendance-cell" title="${meeting.title}${isFuture ? ' (미실시 예정)' : ''}">${formattedDate}</th>`;
            headerRow2 += `<th class="sticky-header-2 p-1.5 border border-slate-150 ${header2Class} attendance-cell" title="${meeting.title}${isFuture ? ' (미실시 예정)' : ''}">
                <div class="vertical-text-container flex flex-col items-center justify-between">
                    <div class="dist-num text-[11px] font-black ${isFuture ? 'text-slate-400' : 'text-blue-800'}">${distNum}</div>
                    <div class="meeting-label text-[11px] font-bold ${isFuture ? 'text-slate-400' : 'text-slate-700'} leading-tight">${wrappedLabel}</div>
                    <div class="text-[10px] font-extrabold mt-1 ${attendeeBadgeClass}">(${isFuture ? '예정' : meetingAttendeeCount + '명'})</div>
                </div>
            </th>`;
        });

        headerRow1 += `</tr>`;
        headerRow2 += `</tr>`;
        tableHead.innerHTML = headerRow1 + headerRow2;

        tableBody.innerHTML = '';
        filteredMembers.forEach(member => {
            const age = getAge(member.birth_year);
            const { attendCount, totalMandatory, ratePercent, rateClass } = calculateAttendanceStats(member, filteredMeetings);
            const positionBadges = getPositionBadges(member);
            const hasService = member.church_service && 
                               member.church_service.trim() !== '' && 
                               member.church_service.trim() !== '없음' && 
                               member.church_service.trim() !== '-';
            
            let row = `<tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-150" id="member-row-${member.id}">
                <td class="sticky-col p-2.5 md:p-3 border-r border-b border-slate-200 member-info bg-white align-top shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div class="flex justify-between items-start mb-1">
                        <div class="flex flex-wrap items-center gap-1">
                            <span class="font-bold text-blue-800 text-[14px] cursor-pointer hover:underline" onclick="location.href='/member_management.html?openId=${member.id}'" title="클릭하여 상세 이력 조회 (성도 현황으로 이동)">${member.name}</span>
                            <span class="text-[10px] text-gray-500 font-bold ml-0.5">(${age}세)</span>
                            ${positionBadges}
                        </div>
                        <div class="text-[10px] font-bold px-1 py-0.5 rounded ${member.bs === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${member.bs || '-'}</div>
                    </div>
                    <div class="text-[11px] text-gray-650 font-bold mb-0.5">
                        <span class="${getDistrictColorClass(member.district)} font-black">${member.district || ''}</span> | ${member.category || ''}${hasService ? ` | <span class="text-green-800">${member.church_service}</span>` : ''}
                    </div>
                    <div class="mt-1">
                        <span class="attendance-rate-badge ${rateClass}">${attendCount}/${totalMandatory} (${ratePercent}%)</span>
                    </div>
                </td>`;

            filteredMeetings.forEach(meeting => {
                const record = member.attendance[meeting.id];
                const isMandatory = isMandatoryMeeting(member, meeting);
                const isFuture = meeting.date > today;
                
                let cellHTML = `<span class="text-slate-350 font-bold text-xs">-</span>`;
                let cellBgClass = 'bg-white';
                
                // Special Exclusion: Youth members show empty dash for Group meetings
                const isYouthGroupExclusion = (member.category === '청년회' && (meeting.type || '').includes('조모임'));

                if (!isYouthGroupExclusion) {
                    if (isFuture) {
                        cellHTML = `<span class="text-slate-300 font-bold opacity-60 text-xs">-</span>`;
                        cellBgClass = 'bg-slate-50/70';
                    } else if (record) {
                        if (record.is_present) {
                            if (record.testimony_snapshot) {
                                const escapedContent = record.testimony_snapshot.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
                                cellHTML = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-black shadow-sm cursor-pointer hover:bg-amber-100 hover:scale-105 active:scale-95 transition-all duration-150" onclick="showTestimonyPopup('${member.name}', '${member.district || ''} | ${member.category || ''}', '${meeting.title}', \`${escapedContent}\`)" title="간증: ${record.testimony_snapshot}">⭐</span>`;
                                cellBgClass = 'bg-amber-50/20';
                            } else {
                                cellHTML = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-150 text-[11px] font-black">출</span>`;
                            }
                        } else {
                            cellHTML = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50 text-rose-500 border border-rose-100 text-[11px] font-bold">결</span>`;
                        }
                    } else if (isMandatory) {
                        // NO record in DB, but IS mandatory -> show as Absent (X)
                        cellHTML = `<span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-rose-50/70 text-rose-400 border border-rose-100/50 text-[11px] font-bold">결</span>`;
                    }
                }
                
                const futureTitleAttr = isFuture ? `\n[미실시 예정 모임]` : ``;
                row += `<td class="p-1 md:p-1.5 border border-slate-100 text-center attendance-cell ${cellBgClass}" title="${meeting.title}${futureTitleAttr}\n${record?.testimony_snapshot || ''}">${cellHTML}</td>`;
            });
            row += `</tr>`;
            tableBody.innerHTML += row;
        });

        if (filteredMembers.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${filteredMeetings.length + 1}" class="p-10 text-center text-gray-500">해당하는 성도가 없습니다.</td></tr>`;
        }
        // (End of Header/Body rendering code)

        prepareChartData(allData.meetings, allData.members);
    }

    function prepareChartData(allMeetings, allMembers) {
        // 1. District Monthly
        const districtLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
        const districtIds = ['581', '582', '583'];
        const districtColors = ['#2563eb', '#dc2626', '#16a34a'];
        const districtDatasets = districtIds.map((dist, idx) => {
            const data = new Array(12).fill(0);
            allMeetings.forEach(m => {
                if (m.type.includes('구역모임') && m.type.includes(dist)) {
                    const month = new Date(m.date).getMonth();
                    let count = 0;
                    allMembers.forEach(mem => { if (mem.attendance[m.id]?.is_present) count++; });
                    data[month] += count;
                }
            });
            return { label: `${dist}구역`, data, borderColor: districtColors[idx], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2, tension: 0.3 };
        });
        updateChart('district', districtLabels, districtDatasets);

        // 2. Group Monthly
        const groupDatasets = districtIds.map((dist, idx) => {
            const data = new Array(12).fill(0);
            allMeetings.forEach(m => {
                if (m.type.includes('조모임') && m.type.includes(dist)) {
                    const month = new Date(m.date).getMonth();
                    let count = 0;
                    allMembers.forEach(mem => { 
                        // Exclusion: Youth category members are not part of Group meeting stats
                        if (mem.category !== '청년회' && mem.attendance[m.id]?.is_present) count++; 
                    });
                    data[month] += count;
                }
            });
            return { label: `${dist}조`, data, borderColor: districtColors[idx], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2, tension: 0.3 };
        });
        updateChart('group', districtLabels, groupDatasets);

        // 3. Brother Progress
        const brotherMeetings = allMeetings.filter(m => m.type.includes('형제')).sort((a, b) => new Date(a.date) - new Date(b.date));
        const brotherLabels = brotherMeetings.map(m => { const d = new Date(m.date); return `${d.getMonth() + 1}/${d.getDate()}`; });
        const brotherData = brotherMeetings.map(m => {
            let count = 0;
            allMembers.forEach(mem => { if (mem.attendance[m.id]?.is_present) count++; });
            return count;
        });
        updateChart('brother', brotherLabels, [{ label: '참석', data: brotherData, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }]);

        // 4. Youth Progress
        const youthMeetings = allMeetings.filter(m => m.type.includes('청년')).sort((a, b) => new Date(a.date) - new Date(b.date));
        const youthLabels = youthMeetings.map(m => { const d = new Date(m.date); return `${d.getMonth() + 1}/${d.getDate()}`; });
        const youthData = youthMeetings.map(m => {
            let count = 0;
            allMembers.forEach(mem => { if (mem.attendance[m.id]?.is_present) count++; });
            return count;
        });
        updateChart('youth', youthLabels, [{ label: '참석', data: youthData, borderColor: '#9333ea', backgroundColor: 'rgba(147, 51, 234, 0.1)', borderWidth: 2, fill: true, tension: 0.3 }]);
    }

    function updateChart(type, labels, datasets) {
        const canvasId = `${type}Chart`;
        const ctx = document.getElementById(canvasId).getContext('2d');
        
        if (charts[type]) {
            charts[type].data.labels = labels;
            charts[type].data.datasets = datasets;
            charts[type].update();
            return;
        }

        charts[type] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: (type === 'district' || type === 'group'),
                        position: 'top',
                        labels: { boxWidth: 8, font: { size: 9 }, padding: 5 }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        padding: 8,
                        titleFont: { size: 10 },
                        bodyFont: { size: 10 }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { font: { size: 9 }, maxTicksLimit: 5 } },
                    x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }
                }
            }
        });
    }

    // Event Listeners (Tab listeners removed)

    // Event Listeners
    yearSelect.addEventListener('change', () => loadDashboardData(yearSelect.value));
    
    [sidebarDistrictFilter, sidebarCategoryFilter, sidebarGenderFilter, sortOrder].forEach(filter => {
        if (filter) filter.addEventListener('change', renderAll);
    });

    if (searchInput) {
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(renderAll, 300);
        });
    }
    
    // Meeting type checkboxes event listeners
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('meeting-type-checkbox')) {
            renderAll();
        }
    });

    const selectAllBtn = document.getElementById('selectAllMeetingTypes');
    const deselectAllBtn = document.getElementById('deselectAllMeetingTypes');

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.meeting-type-checkbox').forEach(cb => cb.checked = true);
            renderAll();
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.meeting-type-checkbox').forEach(cb => cb.checked = false);
            renderAll();
        });
    }

    // Initial Load
    loadDashboardData(yearSelect.value);

    // Testimony Modal Popup functions
    window.showTestimonyPopup = function(name, info, title, content) {
        const modal = document.getElementById('testimonyModal');
        if (!modal) return;
        
        document.getElementById('testimonyMemberName').textContent = name;
        document.getElementById('testimonyMemberInfo').textContent = info;
        document.getElementById('testimonyMeetingTitle').textContent = title;
        document.getElementById('testimonyContentText').textContent = content || '기록된 간증이 없습니다.';
        
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.querySelector('.transform').classList.remove('scale-95');
            modal.querySelector('.transform').classList.add('scale-100');
        }, 10);
    };

    window.closeTestimonyPopup = function() {
        const modal = document.getElementById('testimonyModal');
        if (!modal) return;
        
        modal.querySelector('.transform').classList.add('scale-95');
        modal.querySelector('.transform').classList.remove('scale-100');
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 150);
    };

    // Bind Testimony Close events
    const closeTestimonyBtn = document.getElementById('closeTestimonyModal');
    const confirmTestimonyBtn = document.getElementById('confirmTestimonyModal');
    const testimonyModal = document.getElementById('testimonyModal');

    if (closeTestimonyBtn) closeTestimonyBtn.addEventListener('click', window.closeTestimonyPopup);
    if (confirmTestimonyBtn) confirmTestimonyBtn.addEventListener('click', window.closeTestimonyPopup);
    if (testimonyModal) {
        testimonyModal.addEventListener('click', (e) => {
            if (e.target === testimonyModal) {
                window.closeTestimonyPopup();
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const tModal = document.getElementById('testimonyModal');
            if (tModal && !tModal.classList.contains('hidden')) {
                window.closeTestimonyPopup();
            }
        }
    });
});

