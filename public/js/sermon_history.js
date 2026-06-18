document.addEventListener('DOMContentLoaded', () => {
    const sermonList = document.getElementById('sermonList');
    const sermonSearch = document.getElementById('sermonSearch');
    const filterChipsContainer = document.getElementById('filterChipsContainer');
    const panelsContainer = document.getElementById('meetingPanelsContainer');
    const closeDetailPanel = document.getElementById('closeDetailPanel');
    const desktopPlaceholder = document.getElementById('desktopPlaceholder');
    const desktopDetailAnchor = document.getElementById('desktopDetailAnchor');
    const statsDashboard = document.getElementById('sermonStatsDashboard');

    let allSermons = [];
    let currentMeetingId = null;
    let isEditing = false;
    let selectedType = '전체';

    const getBadgeStyles = (type) => {
        if (type === '설교') return 'bg-amber-50 text-amber-700 border-amber-250/50';
        if (type === '외부설교') return 'bg-emerald-50 text-emerald-700 border-emerald-250/50';
        if (type.includes('조모임')) return 'bg-rose-50 text-rose-700 border-rose-250/50';
        if (type.includes('구역모임')) return 'bg-orange-50 text-orange-700 border-orange-250/50';
        if (type.includes('형제')) return 'bg-teal-50 text-teal-700 border-teal-250/50';
        if (type.includes('청년')) return 'bg-purple-50 text-purple-700 border-purple-250/50';
        if (type.includes('봉사')) return 'bg-indigo-50 text-indigo-700 border-indigo-250/50';
        if (type.includes('심방')) return 'bg-cyan-50 text-cyan-700 border-cyan-250/50';
        return 'bg-sky-50 text-sky-700 border-sky-250/50';
    };

    const isUpcoming = (dateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const meetingDate = new Date(dateStr);
        meetingDate.setHours(0, 0, 0, 0);
        return meetingDate >= today;
    };

    const isLargeScreen = () => window.innerWidth >= 1024;

    // Helper to resolve active panel elements dynamically based on viewport size
    const getDetailElements = () => {
        const isLg = isLargeScreen();
        return {
            title: document.getElementById(isLg ? 'detailTitle' : 'mobileDetailTitle'),
            date: document.getElementById(isLg ? 'detailDate' : 'mobileDetailDate'),
            content: document.getElementById(isLg ? 'detailContent' : 'mobileDetailContent'),
            editBtn: document.getElementById(isLg ? 'editMeetingDetailBtn' : 'mobileEditBtn'),
            cancelBtn: document.getElementById(isLg ? 'cancelEditBtn' : 'mobileCancelBtn')
        };
    };

    // --- 1. Dashboard Statistics Calculation ---
    function renderDashboardStats() {
        if (!statsDashboard) return;

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        const thisMonthSermons = allSermons.filter(m => {
            if (isUpcoming(m.date)) return false;
            const mDate = new Date(m.date);
            return mDate.getFullYear() === currentYear && mDate.getMonth() === currentMonth;
        }).length;

        const upcomingCount = allSermons.filter(m => isUpcoming(m.date)).length;
        const totalCount = allSermons.length;

        const typeCounts = allSermons.reduce((acc, m) => {
            let type = m.type === '설교' ? '내부설교' : m.type;
            if (type.includes('구역모임')) type = '구역모임';
            if (type.includes('조모임')) type = '조모임';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});
        
        let favoriteType = '없음';
        let maxCount = 0;
        Object.keys(typeCounts).forEach(type => {
            if (typeCounts[type] > maxCount) {
                maxCount = typeCounts[type];
                favoriteType = type;
            }
        });

        statsDashboard.innerHTML = `
            <!-- Card 1 -->
            <div class="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[100px] border border-blue-400/20">
                <div class="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
                <span class="text-[10px] font-black text-blue-100 uppercase tracking-widest leading-none">이번 달 설교</span>
                <span class="text-3xl font-black tracking-tight leading-none mt-2">${thisMonthSermons}<span class="text-xs font-bold ml-1">회</span></span>
                <span class="text-[9px] text-blue-200 mt-2 font-medium">당월 완결된 설교 집계</span>
            </div>
            <!-- Card 2 -->
            <div class="bg-gradient-to-br from-pink-500 to-rose-600 text-white p-4 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[100px] border border-rose-400/20">
                <div class="absolute -right-6 -bottom-6 w-20 h-20 bg-white/10 rounded-full blur-xl"></div>
                <span class="text-[10px] font-black text-rose-100 uppercase tracking-widest leading-none">예정된 설교</span>
                <span class="text-3xl font-black tracking-tight leading-none mt-2 animate-pulse">${upcomingCount}<span class="text-xs font-bold ml-1">회</span></span>
                <span class="text-[9px] text-rose-250 mt-2 font-medium">오늘 이후 일정 잡힌 모임</span>
            </div>
            <!-- Card 3 -->
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between min-h-[100px] relative overflow-hidden">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">주요 설교 대상</span>
                <span class="text-base font-black text-slate-800 tracking-tight leading-tight mt-2 truncate">${favoriteType}</span>
                <span class="text-[9px] text-slate-400 mt-2 font-bold flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> 누적 ${maxCount}회 진행됨
                </span>
            </div>
            <!-- Card 4 -->
            <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between min-h-[100px]">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">총 누적 기록</span>
                <span class="text-3xl font-black text-slate-800 tracking-tight leading-none mt-2">${totalCount}<span class="text-xs font-bold text-slate-400 ml-1">건</span></span>
                <span class="text-[9px] text-slate-400 mt-2 font-medium">모임/설교 기록 전체 누적</span>
            </div>
        `;
    }

    // --- 2. Filter Chips Renders ---
    const CATEGORIES = [
        { label: '전체', value: '전체' },
        { label: '🎙️ 내부설교', value: '설교' },
        { label: '⛪ 외부설교', value: '외부설교' },
        { label: '🏠 구역모임', value: '구역모임' },
        { label: '👥 조모임', value: '조모임' },
        { label: '👨 형제모임', value: '형제모임' },
        { label: '⚡ 청년모임', value: '청년모임' },
        { label: '💼 임원모임', value: '임원모임' },
        { label: '💬 기타', value: '기타' }
    ];

    function renderFilterChips() {
        if (!filterChipsContainer) return;
        filterChipsContainer.innerHTML = CATEGORIES.map(cat => {
            const isActive = selectedType === cat.value;
            const activeClass = isActive 
                ? 'bg-blue-600 text-white shadow-sm border-blue-600 font-extrabold' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-650 border-slate-200/60 font-bold';
            return `
                <button type="button" class="filter-chip px-3.5 py-1.5 rounded-full text-xs border transition duration-150 whitespace-nowrap cursor-pointer ${activeClass}" data-value="${cat.value}">
                    ${cat.label}
                </button>
            `;
        }).join('');

        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedType = btn.dataset.value;
                renderFilterChips();
                applyFilters();
            });
        });
    }

    // --- 3. Loading Data & Filtering ---
    async function loadSermons() {
        try {
            const response = await fetch('/api/meetings');
            const meetings = await response.json();
            
            const today = new Date().toISOString().split('T')[0];

            allSermons = meetings.filter(m => {
                if (m.type === '구원기념일' || m.type === '교회행사') return false;
                if (m.date >= today) return true;
                return m.type === '설교' || m.type === '외부설교' || (m.sermon_title && m.sermon_title.trim() !== '');
            });
            
            allSermons.sort((a, b) => new Date(b.date) - new Date(a.date));

            renderDashboardStats();
            renderFilterChips();
            applyFilters();
        } catch (error) {
            console.error('Error loading sermons:', error);
            sermonList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">기록을 불러오는 중 오류가 발생했습니다.</p>';
        }
    }

    function applyFilters() {
        const query = sermonSearch.value.toLowerCase();

        const filtered = allSermons.filter(s => {
            const matchesSearch = (s.sermon_title && s.sermon_title.toLowerCase().includes(query)) ||
                                (s.title && s.title.toLowerCase().includes(query)) ||
                                (s.date && s.date.includes(query)) ||
                                (s.memo && s.memo.toLowerCase().includes(query));
            
            let matchesType = true;
            if (selectedType !== '전체') {
                if (selectedType === '설교') {
                    matchesType = s.type === '설교';
                } else if (selectedType === '외부설교') {
                    matchesType = s.type === '외부설교';
                } else if (selectedType === '임원모임') {
                    matchesType = s.type.includes('임원');
                } else if (selectedType === '형제모임') {
                    matchesType = s.type.includes('형제');
                } else if (selectedType === '청년모임') {
                    matchesType = s.type.includes('청년');
                } else {
                    matchesType = s.type.includes(selectedType.replace('모임', ''));
                }
            }
            
            return matchesSearch && matchesType;
        });

        renderSermons(filtered);
    }

    function renderSermons(sermons) {
        if (sermons.length === 0) {
            sermonList.innerHTML = '<p class="text-slate-400 italic text-center py-20 font-bold text-xs bg-white rounded-2xl border border-dashed border-slate-200">조건에 맞는 설교 기록이 없습니다.</p>';
            return;
        }

        const upcoming = sermons.filter(s => isUpcoming(s.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const completed = sermons.filter(s => !isUpcoming(s.date)).sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';

        if (upcoming.length > 0) {
            html += `
                <div class="mb-4">
                    <h2 class="text-xs font-black text-blue-600 mb-2 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                        <span class="w-1.5 h-3.5 bg-blue-600 rounded-full"></span>
                        예정된 설교 (${upcoming.length})
                    </h2>
                    <div class="space-y-2">
                        ${upcoming.map(s => renderSermonCard(s, true)).join('')}
                    </div>
                </div>
            `;
        }

        if (completed.length > 0) {
            html += `
                <div class="mb-2">
                    <h2 class="text-xs font-black text-slate-450 mb-2 flex items-center gap-1.5 px-1 uppercase tracking-wider">
                        <span class="w-1.5 h-3.5 bg-slate-400 rounded-full"></span>
                        진행 완료 (${completed.length})
                    </h2>
                </div>
            `;

            const groups = completed.reduce((acc, s) => {
                let type = s.type === '설교' ? '내부설교' : s.type;
                if (!acc[type]) acc[type] = [];
                acc[type].push(s);
                return acc;
            }, {});

            const sortedGroupNames = Object.keys(groups).sort((a, b) => {
                if (a.includes('설교')) return -1;
                if (b.includes('설교')) return 1;
                return a.localeCompare(b);
            });

            sortedGroupNames.forEach(type => {
                html += `
                    <div class="mb-4 ml-1">
                        <h3 class="text-[11px] font-black text-slate-400 mb-2 flex items-center gap-1.5 opacity-80 uppercase tracking-widest pl-1">
                            ㆍ${type} (${groups[type].length})
                        </h3>
                        <div class="space-y-2 border-l border-slate-100 pl-3">
                            ${groups[type].map(s => renderSermonCard(s, false)).join('')}
                        </div>
                    </div>
                `;
            });
        }

        sermonList.innerHTML = html;

        if (currentMeetingId) {
            const activeCard = document.querySelector(`.sermon-card[data-id="${currentMeetingId}"]`);
            if (activeCard) {
                activeCard.classList.add('border-blue-500', 'ring-2', 'ring-blue-500/10');
            }
        }
    }

    function renderSermonCard(sermon, isUpcomingVal) {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const date = new Date(sermon.date);
        const dayOfWeek = days[date.getDay()];
        
        const badgeClass = getBadgeStyles(sermon.type);
        const displayType = sermon.type === '설교' ? '내부설교' : sermon.type;
        const isSelected = currentMeetingId == sermon.id;
        
        const borderSelectClass = isSelected 
            ? 'border-blue-500 ring-2 ring-blue-500/10 bg-blue-50/10' 
            : 'border-slate-100 hover:border-blue-200 bg-white';

        return `
            <div class="sermon-card cursor-pointer rounded-xl border p-0 flex items-stretch transition duration-150 sermon-card ${borderSelectClass}" data-id="${sermon.id}">
                <div class="${isUpcomingVal ? 'bg-blue-500/5 text-blue-700' : 'bg-slate-50 text-slate-650'} w-20 p-2 flex flex-col justify-center items-center border-r border-slate-100 shrink-0">
                    <span class="text-[9px] font-bold opacity-60 leading-none mb-0.5">${date.getFullYear()}</span>
                    <span class="text-sm font-black leading-none">${date.getMonth() + 1}/${date.getDate()}</span>
                    <span class="text-[9px] font-bold opacity-60 mt-1">${dayOfWeek}</span>
                </div>
                <div class="p-3.5 flex-1 flex items-center justify-between min-w-0">
                    <div class="flex-1 min-w-0 pr-3">
                        <h3 class="text-xs font-black text-slate-800 truncate leading-snug">
                            ${sermon.sermon_title || sermon.title}
                        </h3>
                        ${sermon.title && sermon.sermon_title && sermon.title !== sermon.sermon_title ? `<p class="text-[10px] text-slate-400 font-bold truncate mt-0.5">${sermon.title}</p>` : ''}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="${badgeClass} px-2 py-0.5 rounded-full text-[9px] font-black border whitespace-nowrap">${displayType}</span>
                        ${isUpcomingVal ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm whitespace-nowrap animate-pulse">예정</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // --- 4. Presentation & Detailed Panel Remounting ---
    async function showMeetingDetail(id) {
        if (isEditing) {
            exitEditMode();
        }
        currentMeetingId = id;
        
        document.querySelectorAll('.sermon-card').forEach(card => {
            card.classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/10', 'bg-blue-50/10');
            card.classList.add('border-slate-100');
        });
        const activeCard = document.querySelector(`.sermon-card[data-id="${id}"]`);
        if (activeCard) {
            activeCard.classList.remove('border-slate-100');
            activeCard.classList.add('border-blue-500', 'ring-2', 'ring-blue-500/10', 'bg-blue-50/10');
        }

        const meeting = allSermons.find(m => m.id == id);
        if (!meeting) return;

        const largeScreen = isLargeScreen();

        if (largeScreen) {
            if (desktopPlaceholder) desktopPlaceholder.classList.add('hidden');
            if (desktopDetailAnchor) {
                desktopDetailAnchor.classList.remove('hidden');
                desktopDetailAnchor.innerHTML = `
                    <div id="desktopDetailPanel" class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col h-full min-h-[450px]">
                        <div class="p-5 bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white shadow-md">
                            <h3 id="detailTitle" class="text-base md:text-lg font-black tracking-tight leading-tight">${meeting.sermon_title || meeting.title}</h3>
                            <p id="detailDate" class="text-blue-200/95 font-bold text-[10px] mt-1.5"></p>
                        </div>
                        <div class="flex-1 overflow-y-auto p-5 md:p-6 no-scrollbar bg-slate-50/30" id="detailContent">
                            <div class="flex justify-center py-20">
                                <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                            </div>
                        </div>
                        <div class="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                            <button id="editMeetingDetailBtn" class="flex-1 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] transition-all text-white py-2.5 rounded-xl font-bold text-xs shadow-md">기록 수정</button>
                            <button id="cancelEditBtn" class="flex-1 bg-gray-200 hover:bg-gray-300 active:scale-[0.98] transition-all text-gray-700 py-2.5 rounded-xl font-bold text-xs shadow-md hidden">취소</button>
                        </div>
                    </div>
                `;
            }
        } else {
            if (desktopDetailAnchor) desktopDetailAnchor.classList.add('hidden');
            if (desktopPlaceholder) desktopPlaceholder.classList.remove('hidden');
            
            if (panelsContainer) {
                panelsContainer.classList.remove('hidden');
                setTimeout(() => {
                    panelsContainer.classList.remove('translate-y-full');
                    panelsContainer.classList.add('translate-y-0');
                }, 10);
            }
        }

        // Fetch targets based on viewport
        const elements = getDetailElements();

        elements.title.textContent = meeting.sermon_title || meeting.title;
        let timeStr = meeting.start_time || '';
        if (meeting.start_time && meeting.end_time) {
            timeStr = `${meeting.start_time}~${meeting.end_time}`;
        }
        elements.date.textContent = `${meeting.date}${timeStr ? ' ' + timeStr : ''} | ${meeting.type}`;

        // Bind Edit/Cancel buttons in the newly created DOM context
        bindEditButtons();

        // Load attendance details
        try {
            const res = await fetch(`/api/meetings/${id}/attendance`);
            const att = await res.json();
            const p = att.filter(a => a.is_present);
            const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());

            // 간증 섹션
            let testimonyHtml = '';
            if (pWithTestimony.length > 0) {
                testimonyHtml = `
                    <div class="mt-5 pt-4 border-t border-dashed border-slate-200">
                        <h4 class="text-[9px] font-black text-blue-600 mb-2.5 uppercase tracking-wider">교인 간증 / 특이사항 (${pWithTestimony.length}명)</h4>
                        <div class="space-y-2">
                            ${pWithTestimony.map(a => `
                                <div class="p-3 bg-blue-50/40 rounded-xl border border-blue-100/50">
                                    <div class="font-extrabold text-blue-800 text-xs">${a.name}</div>
                                    <p class="text-xs text-slate-700 mt-1 pl-2 border-l-2 border-blue-250 whitespace-pre-wrap leading-relaxed font-medium">${a.testimony_snapshot}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // 미참석자 계산
            let absentHtml = '';
            const typeStr = meeting.type || '';
            if (!['설교', '외부설교', '심방', '교회행사', '기타'].includes(typeStr)) {
                let targetParams = new URLSearchParams({ status: 'active' });
                if (typeStr.includes('구역모임') || typeStr.includes('조모임')) {
                    const distMatch = typeStr.match(/\d+/);
                    if (distMatch) targetParams.append('district', `${distMatch[0]}구역`);
                } else if (typeStr === '교구임원모임') {
                    targetParams.append('has_position', 'true');
                } else if (typeStr.includes('형제모임')) {
                    targetParams.append('category', '봉사회');
                } else if (typeStr.includes('청년모임')) {
                    targetParams.append('category', '청년회');
                }

                const mRes = await fetch(`/api/members/search?${targetParams.toString()}`);
                let allTargets = await mRes.json();
                
                if (typeStr.includes('형제모임')) {
                    const eRes = await fetch(`/api/members/search?status=active&category=은장회`);
                    const eMembers = await eRes.json();
                    allTargets = [...allTargets, ...eMembers];
                    allTargets = allTargets.filter(m => m.bs === 'B');
                }
                if (typeStr.includes('조모임')) {
                    allTargets = allTargets.filter(m => m.bs === 'S' && m.category !== '청년회');
                }
                if (typeStr === '교구임원모임') {
                    allTargets = allTargets.filter(m => m.position && m.position.trim().length > 0);
                }

                const presentIds = p.map(a => a.member_id);
                const absentees = allTargets.filter(m => !presentIds.includes(m.id));

                if (absentees.length > 0) {
                    absentHtml = `
                        <div class="mt-5 pt-4 border-t border-dashed border-slate-200">
                            <h4 class="text-[9px] font-black text-slate-400 mb-2.5 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                            <div class="flex flex-wrap gap-1">
                                ${absentees.map(m => `<span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold border border-slate-200/40">${m.name}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            let detailHTML = `
                <div class="mb-4 bg-white p-3.5 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                    <span class="font-extrabold text-xs text-slate-500">참석 교인</span>
                    <span class="text-xl font-black text-blue-600">${p.length}명</span>
                </div>
                
                <div id="churchContainer" class="mb-4 bg-blue-50/30 p-3.5 rounded-xl border border-blue-100/50 shadow-sm ${meeting.church ? '' : 'hidden'}">
                    <h4 class="text-[9px] font-black text-blue-700 uppercase tracking-wider mb-1">외부 교회</h4>
                    <div id="churchViewArea">
                        <p class="font-bold text-xs text-slate-800">${meeting.church || ''}</p>
                    </div>
                </div>
                
                ${(meeting.sermon_title && meeting.type !== '설교') ? `
                    <div class="mb-4 bg-amber-50/30 p-3.5 rounded-xl border border-amber-100/50 shadow-sm">
                        <h4 class="text-[9px] font-black text-amber-700 uppercase tracking-wider mb-1">설교 주제</h4>
                        <p class="font-bold text-xs text-slate-800">${meeting.sermon_title}</p>
                    </div>
                ` : ''}

                <div id="memoContainer" class="mb-4 bg-slate-50/40 p-4 rounded-xl border border-slate-200/50">
                    <h4 class="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">메모 / 설교 요약</h4>
                    <div id="memoViewArea">
                        ${meeting.memo ? `<p class="text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">${meeting.memo}</p>` : '<p class="text-[11px] text-slate-400 italic">등록된 메모가 없습니다.</p>'}
                    </div>
                </div>
                
                <div class="mb-4">
                    <h4 class="text-[9px] font-black text-blue-600 mb-2 uppercase tracking-wider">참석자 명단</h4>
                    <div class="flex flex-wrap gap-1">
                        ${p.length > 0 ? p.map(a => `<span class="px-2.5 py-1 bg-blue-50/50 text-blue-700 rounded-lg text-[10px] font-bold border border-blue-100/30">${a.name}</span>`).join('') : '<span class="text-xs text-gray-400 italic">참석자 없음</span>'}
                    </div>
                </div>

                ${absentHtml}
                ${testimonyHtml}
            `;

            elements.content.innerHTML = detailHTML;

        } catch (error) {
            console.error('Error loading attendance details:', error);
            elements.content.innerHTML = '<p class="text-red-500 text-center py-10 font-bold">참석 정보를 불러오지 못했습니다.</p>';
        }
    }

    function closePanel() {
        if (isLargeScreen()) {
            if (desktopDetailAnchor) desktopDetailAnchor.classList.add('hidden');
            if (desktopPlaceholder) desktopPlaceholder.classList.remove('hidden');
            currentMeetingId = null;
            if (isEditing) {
                exitEditMode();
            }
            document.querySelectorAll('.sermon-card').forEach(card => {
                card.classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/10', 'bg-blue-50/10');
                card.classList.add('border-slate-100');
            });
        } else {
            if (panelsContainer) {
                panelsContainer.classList.remove('translate-y-0');
                panelsContainer.classList.add('translate-y-full');
                setTimeout(() => {
                    panelsContainer.classList.add('hidden');
                }, 300);
                currentMeetingId = null;
                if (isEditing) {
                    exitEditMode();
                }
                document.querySelectorAll('.sermon-card').forEach(card => {
                    card.classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/10', 'bg-blue-50/10');
                    card.classList.add('border-slate-100');
                });
            }
        }
    }

    // --- 5. Inline Editing & Saving Logic ---
    function exitEditMode() {
        isEditing = false;
        const elements = getDetailElements();
        if (elements.editBtn) {
            elements.editBtn.textContent = '기록 수정';
            elements.editBtn.className = 'flex-1 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] transition-all text-white py-2.5 rounded-xl font-bold text-xs shadow-md';
        }
        if (elements.cancelBtn) elements.cancelBtn.classList.add('hidden');
    }

    function bindEditButtons() {
        const elements = getDetailElements();

        if (elements.cancelBtn) {
            const newCancelBtn = elements.cancelBtn.cloneNode(true);
            elements.cancelBtn.parentNode.replaceChild(newCancelBtn, elements.cancelBtn);
            
            newCancelBtn.addEventListener('click', () => {
                if (currentMeetingId) {
                    exitEditMode();
                    showMeetingDetail(currentMeetingId);
                }
            });
        }

        if (elements.editBtn) {
            const newEditBtn = elements.editBtn.cloneNode(true);
            elements.editBtn.parentNode.replaceChild(newEditBtn, elements.editBtn);

            newEditBtn.addEventListener('click', async () => {
                if (!currentMeetingId) return;
                const meeting = allSermons.find(m => m.id == currentMeetingId);
                if (!meeting) return;

                const activeElements = getDetailElements();

                if (!isEditing) {
                    isEditing = true;
                    activeElements.editBtn.textContent = '저장';
                    activeElements.editBtn.className = 'flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white py-2.5 rounded-xl font-bold text-xs shadow-md';
                    if (activeElements.cancelBtn) activeElements.cancelBtn.classList.remove('hidden');

                    // Convert Title to Input
                    activeElements.title.innerHTML = `
                        <input type="text" id="editSermonTitle" class="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-xs font-bold outline-none focus:bg-white/20 transition" value="${meeting.sermon_title || meeting.title}">
                    `;

                    // Convert Church name to Input (if type is 외부설교)
                    if (meeting.type === '외부설교') {
                        const churchContainer = document.getElementById('churchContainer');
                        if (churchContainer) churchContainer.classList.remove('hidden');
                        const churchViewArea = document.getElementById('churchViewArea');
                        if (churchViewArea) {
                            churchViewArea.innerHTML = `
                                <input type="text" id="editChurch" class="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none" value="${meeting.church || ''}">
                            `;
                        }
                    }

                    // Convert Memo to Textarea
                    const memoViewArea = document.getElementById('memoViewArea');
                    if (memoViewArea) {
                        memoViewArea.innerHTML = `
                            <textarea id="editMemo" class="w-full h-40 p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white" placeholder="설교 요약 또는 모임 메모를 입력해 주세요.">${meeting.memo || ''}</textarea>
                        `;
                    }
                } else {
                    // Save changes
                    const editSermonTitle = document.getElementById('editSermonTitle');
                    const editMemo = document.getElementById('editMemo');
                    const editChurch = document.getElementById('editChurch');

                    const newSermonTitle = editSermonTitle ? editSermonTitle.value.trim() : '';
                    const newMemo = editMemo ? editMemo.value.trim() : '';
                    const newChurch = editChurch ? editChurch.value.trim() : '';

                    if (!newSermonTitle) {
                        alert('제목을 입력해 주세요.');
                        return;
                    }

                    const updatedData = {
                        title: meeting.title,
                        date: meeting.date,
                        end_date: meeting.end_date,
                        type: meeting.type,
                        sermon_title: newSermonTitle,
                        memo: newMemo,
                        church: meeting.type === '외부설교' ? newChurch : meeting.church,
                        start_time: meeting.start_time,
                        end_time: meeting.end_time
                    };

                    activeElements.editBtn.disabled = true;
                    activeElements.editBtn.textContent = '저장 중...';

                    try {
                        const response = await fetch(`/api/meetings/${currentMeetingId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(updatedData)
                        });

                        if (!response.ok) {
                            throw new Error('Network response error');
                        }

                        meeting.title = updatedData.title;
                        meeting.sermon_title = updatedData.sermon_title;
                        meeting.memo = updatedData.memo;
                        meeting.church = updatedData.church;

                        exitEditMode();
                        showMeetingDetail(currentMeetingId);
                        applyFilters();

                    } catch (error) {
                        console.error('Error updating meeting:', error);
                        alert('기록을 저장하는 중 오류가 발생했습니다.');
                        activeElements.editBtn.textContent = '저장';
                    } finally {
                        activeElements.editBtn.disabled = false;
                    }
                }
            });
        }
    }

    // --- 6. Event Listeners ---
    sermonSearch.addEventListener('input', applyFilters);

    sermonList.addEventListener('click', (e) => {
        const card = e.target.closest('.sermon-card');
        if (card) {
            const meetingId = card.getAttribute('data-id');
            if (meetingId) {
                showMeetingDetail(meetingId);
            }
        }
    });

    if (closeDetailPanel) {
        closeDetailPanel.addEventListener('click', closePanel);
    }

    // Close on backdrop click (mobile only)
    document.addEventListener('click', (e) => {
        if (!isLargeScreen() && panelsContainer && !panelsContainer.classList.contains('hidden') && panelsContainer.classList.contains('translate-y-0')) {
            if (!panelsContainer.contains(e.target) && !e.target.closest('.sermon-card')) {
                closePanel();
            }
        }
    });

    window.addEventListener('resize', () => {
        if (currentMeetingId) {
            showMeetingDetail(currentMeetingId);
        }
    });

    loadSermons();
});
