document.addEventListener('DOMContentLoaded', () => {
    const sermonList = document.getElementById('sermonList');
    const sermonSearch = document.getElementById('sermonSearch');
    const typeFilter = document.getElementById('typeFilter');
    const sermonCount = document.getElementById('sermonCount');
    const panelsContainer = document.getElementById('meetingPanelsContainer');
    const closeDetailPanel = document.getElementById('closeDetailPanel');
    const editMeetingDetailBtn = document.getElementById('editMeetingDetailBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');

    let allSermons = [];
    let currentMeetingId = null;
    let isEditing = false;

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
            <div class="sermon-card cursor-pointer bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden flex items-stretch hover:border-blue-300 transition-colors" data-id="${sermon.id}">
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

    async function showMeetingDetail(id) {
        if (isEditing) {
            exitEditMode();
        }
        currentMeetingId = id;
        const meeting = allSermons.find(m => m.id == id);
        if (!meeting) return;

        // 패널 열기 애니메이션
        panelsContainer.classList.remove('hidden');
        setTimeout(() => {
            panelsContainer.classList.remove('translate-x-full');
            panelsContainer.classList.add('translate-x-0');
        }, 10);

        document.getElementById('detailTitle').textContent = meeting.sermon_title || meeting.title;
        let timeStr = meeting.start_time || '';
        if (meeting.start_time && meeting.end_time) {
            timeStr = `${meeting.start_time}~${meeting.end_time}`;
        }
        document.getElementById('detailDate').textContent = `${meeting.date}${timeStr ? ' ' + timeStr : ''} | ${meeting.type}`;

        // 로딩 표시
        document.getElementById('detailContent').innerHTML = `
            <div class="flex justify-center py-20">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        `;

        try {
            const res = await fetch(`/api/meetings/${id}/attendance`);
            const att = await res.json();
            const p = att.filter(a => a.is_present);
            const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());

            // 간증 섹션
            let testimonyHtml = '';
            if (pWithTestimony.length > 0) {
                testimonyHtml = `
                    <div class="mt-6 pt-4 border-t border-dashed border-gray-200">
                        <h4 class="text-[10px] font-black text-blue-700 mb-2 uppercase tracking-wider">간증 (${pWithTestimony.length}명)</h4>
                        <div class="space-y-2">
                            ${pWithTestimony.map(a => `
                                <div class="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100/70">
                                    <div class="font-bold text-blue-800 text-xs">${a.name}</div>
                                    <p class="text-xs text-gray-700 mt-1 pl-2 border-l-2 border-blue-200 whitespace-pre-wrap leading-relaxed">${a.testimony_snapshot}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            // 미참석자 구하기 (구역모임, 조모임 등의 경우)
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
                        <div class="mt-6 pt-4 border-t border-dashed border-gray-200">
                            <h4 class="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                            <div class="flex flex-wrap gap-1">
                                ${absentees.map(m => `<span class="px-2 py-1 bg-gray-100 text-gray-500 rounded text-[11px] font-bold">${m.name}</span>`).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            let detailHTML = `
                <div class="mb-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                    <span class="font-bold text-sm text-gray-600">총 참석</span>
                    <span class="text-2xl font-black text-blue-600">${p.length}명</span>
                </div>
                <div id="churchContainer" class="mb-4 bg-blue-50/50 p-4 rounded-xl border border-blue-100/70 shadow-sm ${meeting.church ? '' : 'hidden'}">
                    <h4 class="text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">외부 교회</h4>
                    <div id="churchViewArea">
                        <p class="font-bold text-slate-800">${meeting.church || ''}</p>
                    </div>
                </div>
                ${(meeting.sermon_title && meeting.type !== '설교') ? `
                    <div class="mb-4 bg-yellow-50/50 p-4 rounded-xl border border-yellow-100/70 shadow-sm">
                        <h4 class="text-[10px] font-black text-yellow-700 uppercase tracking-wider mb-1">설교</h4>
                        <p class="font-bold text-slate-800">${meeting.sermon_title}</p>
                    </div>
                ` : ''}
                <div id="memoContainer" class="mb-4 bg-slate-50/50 p-4.5 rounded-xl border border-slate-200/65">
                    <h4 class="text-[10px] font-black text-slate-450 uppercase tracking-wider mb-1.5">메모 / 설교 요약</h4>
                    <div id="memoViewArea">
                        ${meeting.memo ? `<p class="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">${meeting.memo}</p>` : '<p class="text-xs text-gray-400 italic">등록된 메모가 없습니다.</p>'}
                    </div>
                </div>
                
                <div class="mb-4">
                    <h4 class="text-[10px] font-black text-blue-600 mb-2.5 uppercase tracking-wider">참석자 명단</h4>
                    <div class="flex flex-wrap gap-1">
                        ${p.length > 0 ? p.map(a => `<span class="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold border border-blue-100/50">${a.name}</span>`).join('') : '<span class="text-xs text-gray-400 italic">참석자 없음</span>'}
                    </div>
                </div>

                ${absentHtml}
                ${testimonyHtml}
            `;

            document.getElementById('detailContent').innerHTML = detailHTML;

        } catch (error) {
            console.error('Error loading attendance details:', error);
            document.getElementById('detailContent').innerHTML = '<p class="text-red-500 text-center py-10 font-bold">참석 정보를 불러오지 못했습니다.</p>';
        }
    }

    function closePanel() {
        if (panelsContainer) {
            panelsContainer.classList.remove('translate-x-0');
            panelsContainer.classList.add('translate-x-full');
            setTimeout(() => {
                panelsContainer.classList.add('hidden');
            }, 300);
            currentMeetingId = null;
            if (isEditing) {
                exitEditMode();
            }
        }
    }

    // Event listeners
    sermonSearch.addEventListener('input', applyFilters);
    typeFilter.addEventListener('change', applyFilters);

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

    function exitEditMode() {
        isEditing = false;
        editMeetingDetailBtn.textContent = '기록 수정';
        editMeetingDetailBtn.className = 'flex-1 bg-slate-800 hover:bg-slate-900 active:scale-[0.98] transition-all text-white py-3 rounded-xl font-bold text-sm shadow-md';
        if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (currentMeetingId) {
                exitEditMode();
                showMeetingDetail(currentMeetingId);
            }
        });
    }

    if (editMeetingDetailBtn) {
        editMeetingDetailBtn.addEventListener('click', async () => {
            if (!currentMeetingId) return;
            const meeting = allSermons.find(m => m.id == currentMeetingId);
            if (!meeting) return;

            if (!isEditing) {
                isEditing = true;
                editMeetingDetailBtn.textContent = '저장';
                editMeetingDetailBtn.className = 'flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all text-white py-3 rounded-xl font-bold text-sm shadow-md';
                if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');

                document.getElementById('detailTitle').innerHTML = `
                    <input type="text" id="editSermonTitle" class="w-full bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm font-bold outline-none focus:bg-white/20 transition" value="${meeting.sermon_title || meeting.title}">
                `;

                if (meeting.type === '외부설교') {
                    const churchContainer = document.getElementById('churchContainer');
                    if (churchContainer) churchContainer.classList.remove('hidden');
                    const churchViewArea = document.getElementById('churchViewArea');
                    if (churchViewArea) {
                        churchViewArea.innerHTML = `
                            <input type="text" id="editChurch" class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 outline-none" value="${meeting.church || ''}">
                        `;
                    }
                }

                const memoViewArea = document.getElementById('memoViewArea');
                if (memoViewArea) {
                    memoViewArea.innerHTML = `
                        <textarea id="editMemo" class="w-full h-40 p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed bg-white" placeholder="설교 요약 또는 모임 메모를 입력해 주세요.">${meeting.memo || ''}</textarea>
                    `;
                }
            } else {
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

                editMeetingDetailBtn.disabled = true;
                editMeetingDetailBtn.textContent = '저장 중...';

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
                    editMeetingDetailBtn.textContent = '저장';
                } finally {
                    editMeetingDetailBtn.disabled = false;
                }
            }
        });
    }

    // 바깥 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (panelsContainer && !panelsContainer.classList.contains('hidden') && !panelsContainer.classList.contains('translate-x-full')) {
            if (!panelsContainer.contains(e.target) && !e.target.closest('.sermon-card')) {
                closePanel();
            }
        }
    });

    loadSermons();
});
