document.addEventListener('DOMContentLoaded', () => {
    const sermonList = document.getElementById('sermonList');
    const sermonSearch = document.getElementById('sermonSearch');
    const typeFilter = document.getElementById('typeFilter');
    const sermonCount = document.getElementById('sermonCount');

    let allSermons = [];

    const getBadgeStyles = (type) => {
        if (type === '설교') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        if (type === '외부설교') return 'bg-green-100 text-green-800 border-green-200';
        if (type.includes('조모임')) return 'bg-pink-100 text-pink-800 border-pink-200';
        if (type.includes('구역모임')) return 'bg-orange-100 text-orange-800 border-orange-200';
        if (type.includes('형제')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
        if (type.includes('청년')) return 'bg-purple-100 text-purple-800 border-purple-200';
        if (type.includes('봉사')) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
        if (type.includes('심방')) return 'bg-teal-100 text-teal-800 border-teal-200';
        // 교구전체, 임원, 기타 등
        return 'bg-sky-100 text-sky-800 border-sky-200';
    };

    const isUpcoming = (dateStr) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const meetingDate = new Date(dateStr);
        meetingDate.setHours(0, 0, 0, 0);
        return meetingDate >= today; // 오늘을 포함한 미래 모임
    };

    async function loadSermons() {
        try {
            const response = await fetch('/api/meetings');
            const meetings = await response.json();
            
            const today = new Date().toISOString().split('T')[0];

            // Filter: All upcoming meetings OR past meetings with sermon_title/type '설교'
            // EXCLUDE: '구원기념일', '교회행사' as they are not sermon targets
            allSermons = meetings.filter(m => {
                if (m.type === '구원기념일' || m.type === '교회행사') return false;
                if (m.date >= today) return true; // 오늘 포함 미래 모임은 모두 표시
                return m.type === '설교' || m.type === '외부설교' || (m.sermon_title && m.sermon_title.trim() !== '');
            });
            
            // Sort by date descending
            allSermons.sort((a, b) => new Date(b.date) - new Date(a.date));

            applyFilters();
        } catch (error) {
            console.error('Error loading sermons:', error);
            sermonList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">기록을 불러오는 중 오류가 발생했습니다.</p>';
        }
    }

    function applyFilters() {
        const query = sermonSearch.value.toLowerCase();
        const selectedType = typeFilter.value;

        const filtered = allSermons.filter(s => {
            const matchesSearch = (s.sermon_title && s.sermon_title.toLowerCase().includes(query)) ||
                                (s.title && s.title.toLowerCase().includes(query)) ||
                                (s.date && s.date.includes(query));
            
            let matchesType = true;
            if (selectedType !== '전체') {
                if (selectedType === '설교') {
                    matchesType = s.type === '설교' || s.type === '외부설교';
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
        sermonCount.textContent = `총 ${sermons.length}개의 설교 기록`;
        
        if (sermons.length === 0) {
            sermonList.innerHTML = '<p class="text-gray-500 text-center py-20 font-medium">기록된 설교가 없습니다.</p>';
            return;
        }

        const upcoming = sermons.filter(s => isUpcoming(s.date)).sort((a, b) => new Date(a.date) - new Date(b.date));
        const completed = sermons.filter(s => !isUpcoming(s.date)).sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';

        if (upcoming.length > 0) {
            const upcomingCounts = upcoming.reduce((acc, s) => {
                let type = s.type;
                if (type === '교회행사' || type === '기타모임') {
                    return acc;
                }
                if (type.includes('구역모임')) {
                    type = '구역모임';
                } else if (type.includes('조모임')) {
                    type = '조모임';
                } else if (type === '설교') {
                    type = '내부설교';
                }
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});

            const countsHtml = Object.keys(upcomingCounts).map(type => {
                const count = upcomingCounts[type];
                return `<span class="bg-blue-50 text-blue-700 border border-blue-150 px-2.5 py-1 rounded-xl text-xs font-bold">${type} ${count}</span>`;
            }).join(' ');

            html += `
                <div class="mb-8">
                    <h2 class="text-lg font-black text-blue-700 mb-2.5 flex items-center gap-2 px-1">
                        <span class="w-2 h-6 bg-blue-600 rounded-full"></span>
                        예정된 설교 <span class="text-sm font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full ml-1">${upcoming.length}</span>
                    </h2>
                    ${countsHtml ? `<div class="flex flex-wrap gap-1.5 mb-3 px-1">${countsHtml}</div>` : ''}
                    <div class="space-y-2">
                        ${upcoming.map(s => renderSermonCard(s, true)).join('')}
                    </div>
                </div>
            `;
        }

        if (completed.length > 0) {
            // Group completed sermons by type
            const groups = completed.reduce((acc, s) => {
                let type = s.type === '설교' ? '내부설교' : s.type;
                if (type === '외부설교') type = '외부설교';
                if (!acc[type]) acc[type] = [];
                acc[type].push(s);
                return acc;
            }, {});

            html += `
                <div class="mb-4">
                    <h2 class="text-lg font-black text-gray-700 mb-4 flex items-center gap-2 px-1">
                        <span class="w-2 h-6 bg-gray-400 rounded-full"></span>
                        완료된 설교 <span class="text-sm font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-1">${completed.length}</span>
                    </h2>
                </div>
            `;

            // Sort group names (optional: put '설교' type first or alphabetically)
            const sortedGroupNames = Object.keys(groups).sort((a, b) => {
                if (a.includes('설교')) return -1;
                if (b.includes('설교')) return 1;
                return a.localeCompare(b);
            });

            sortedGroupNames.forEach(type => {
                html += `
                    <div class="mb-6 ml-1">
                        <h3 class="text-sm font-black text-gray-500 mb-3 flex items-center gap-2 opacity-80">
                            <span class="w-1.5 h-1.5 bg-gray-300 rounded-full"></span>
                            ${type} (${groups[type].length})
                        </h3>
                        <div class="space-y-2 border-l-2 border-gray-50 pl-3">
                            ${groups[type].map(s => renderSermonCard(s, false)).join('')}
                        </div>
                    </div>
                `;
            });
        }

        sermonList.innerHTML = html;
    }

    function renderSermonCard(sermon, isUpcoming) {
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const date = new Date(sermon.date);
        const dayOfWeek = days[date.getDay()];
        
        const badgeClass = getBadgeStyles(sermon.type);
        const displayType = sermon.type === '설교' ? '내부설교' : sermon.type;
        
        return `
            <div class="sermon-card bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex items-stretch hover:border-blue-300 transition-colors">
                <div class="${isUpcoming ? 'bg-blue-50' : 'bg-gray-50'} w-24 p-2 flex flex-col justify-center items-center border-r border-gray-100 shrink-0">
                    <span class="text-[10px] font-bold text-gray-400 leading-none mb-0.5">${date.getFullYear()}</span>
                    <span class="${isUpcoming ? 'text-blue-600' : 'text-gray-600'} text-base font-black leading-none">${date.getMonth() + 1}/${date.getDate()}</span>
                    <span class="text-[10px] font-bold text-gray-400 mt-0.5">${dayOfWeek}요일</span>
                </div>
                <div class="p-3 flex-1 flex items-center justify-between min-w-0">
                    <div class="flex-1 min-w-0 pr-4">
                        <h3 class="text-sm font-bold text-gray-800 truncate">
                            ${sermon.sermon_title || sermon.title}
                        </h3>
                        ${sermon.title && sermon.sermon_title && sermon.title !== sermon.sermon_title ? `<p class="text-[11px] text-gray-400 truncate mt-0.5">${sermon.title}</p>` : ''}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="${badgeClass} px-1.5 py-0.5 rounded text-[9px] font-bold border whitespace-nowrap">${displayType}</span>
                        ${isUpcoming ? `<span class="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[9px] font-bold shadow-sm whitespace-nowrap animate-pulse">예정</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    // Event listeners
    sermonSearch.addEventListener('input', applyFilters);
    typeFilter.addEventListener('change', applyFilters);

    loadSermons();
});
