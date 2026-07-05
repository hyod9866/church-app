function parseRecurringMetadata(m) {
    if (m.memo && m.memo.startsWith('__RECURRING__:')) {
        const lines = m.memo.split('\n');
        const metaLine = lines[0];
        try {
            const metaJson = metaLine.substring('__RECURRING__:'.length);
            const meta = JSON.parse(metaJson);
            m.rrule_type = meta.rrule_type || 'none';
            m.rrule_end_date = meta.rrule_end_date || null;
            m.exdates = meta.exdates || null;
            m.memo = lines.slice(1).join('\n');
        } catch (e) {
            console.error('Failed to parse recurring metadata:', e);
            m.rrule_type = 'none';
            m.rrule_end_date = null;
            m.exdates = null;
        }
    } else {
        m.rrule_type = 'none';
        m.rrule_end_date = null;
        m.exdates = null;
    }
    return m;
}

window.onerror = function(message, source, lineno, colno, error) {
    alert("자바스크립트 오류: " + message + " (라인: " + lineno + ")");
    return false;
};

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');

    

    function injectTimeGuides() {
        const cols = document.querySelectorAll('.fc-timegrid-col');
        if (cols.length === 0) return;
        
        const slotEls = document.querySelectorAll('.fc-timegrid-slots [data-time]');
        if (slotEls.length === 0) return;
        
        const hourOffsets = [];
        const seenHours = new Set();
        slotEls.forEach(el => {
            const timeVal = el.getAttribute('data-time');
            if (timeVal && timeVal.endsWith(':00:00')) {
                const hour = timeVal.split(':')[0];
                if (!seenHours.has(hour)) {
                    seenHours.add(hour);
                    const parentTr = el.closest('tr');
                    if (parentTr) {
                        hourOffsets.push({
                            hour: hour,
                            top: parentTr.offsetTop
                        });
                    }
                }
            }
        });
        
        if (hourOffsets.length === 0) return;
        
        cols.forEach(colEl => {
            if (!colEl.hasAttribute('data-date')) return;
            if (colEl.querySelector('.custom-time-guide-container')) return;
            
            colEl.style.position = 'relative';
            
            const container = document.createElement('div');
            container.className = 'custom-time-guide-container';
            container.style.position = 'absolute';
            container.style.inset = '0';
            container.style.pointerEvents = 'none';
            container.style.userSelect = 'none';
            container.style.overflow = 'hidden';
            container.style.zIndex = '0';
            
            hourOffsets.forEach(item => {
                const label = document.createElement('div');
                label.style.position = 'absolute';
                label.style.left = '10px';
                label.style.fontSize = '11px';
                label.style.color = 'rgba(100, 116, 139, 0.3)';
                label.style.fontWeight = '600';
                label.style.top = `${item.top}px`;
                label.textContent = item.hour;
                container.appendChild(label);
            });
            colEl.appendChild(container);
        });
    }

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        views: {
            dayGridMonth: {
                dayCellContent: (info) => ({ html: `<span>${info.date.getDate()}</span>` })
            },
            timeGridWeek: {
                dayHeaderFormat: { month: 'numeric', day: 'numeric', weekday: 'short', omitCommas: true }
            }
        },
        locale: 'ko',
        height: 'auto',
        aspectRatio: 1.35, // Adjust slightly to maintain vertical grid aesthetic
        dayMaxEvents: true,
        eventOrder: ['-allDay', 'order', 'start_time', 'title'],
        selectable: true,
        selectMirror: true,
        selectLongPressDelay: 1000,
        eventDisplay: 'block', // 시간 지정 일정도 파스텔톤 배경색 박스로 강제 채움 처리
        slotMinTime: '05:00:00', // 시작시간 05시부터
        slotMaxTime: '24:00:00', // 24시까지 표기
        slotLabelFormat: {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        },
        datesSet: (info) => {
            if (info.view.type.startsWith('timeGrid')) {
                setTimeout(injectTimeGuides, 50);
                setTimeout(injectTimeGuides, 200);
            }
        },


        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' },
        select: (info) => {
            const getPrevDay = (dateStr) => {
                const d = new Date(dateStr);
                d.setDate(d.getDate() - 1);
                return d.toISOString().split('T')[0];
            };
            const startParts = info.startStr.split('T');
            const endParts = info.endStr.split('T');
            
            const startDate = startParts[0];
            let endDate = endParts[0];
            
            let realEndDate = getPrevDay(endDate);
            let startTimeVal = '';
            let endTimeVal = '';
            
            if (startParts[1]) {
                startTimeVal = startParts[1].substring(0, 5);
                if (endParts[1]) {
                    endTimeVal = endParts[1].substring(0, 5);
                }
                if (startParts[0] === endParts[0]) {
                    realEndDate = startParts[0];
                }
            }
            
            const isSameDay = (startDate === realEndDate);
            const endDateVal = isSameDay ? '' : realEndDate;
            
            openMeetingModal(null, startDate, '', '', '', '', '', endDateVal, startTimeVal, endTimeVal);
            calendar.unselect();
        },
        events: async (fetchInfo, successCallback, failureCallback) => {
            const addOneDay = (dateStr) => {
                const d = new Date(dateStr);
                d.setDate(d.getDate() + 1);
                return d.toISOString().split('T')[0];
            };
            try {
                const res = await fetch('/api/meetings');
                const rawMeetings = await res.json();
                const meetings = rawMeetings.map(parseRecurringMetadata);
                successCallback(meetings.map(m => {
                    const t = m.type || '';
                    let bg, tc, br;
                    let ord = 1;
                    if (t.includes('조모임')) { bg = '#fce7f3'; tc = '#831843'; br = '#fbcfe8'; }
                    else if (t.includes('구역모임')) { bg = '#ffedd5'; tc = '#7c2d12'; br = '#fed7aa'; }
                    else if (t.includes('교구')) { bg = '#e0f2fe'; tc = '#1e3a8a'; br = '#bae6fd'; }
                    else if (t.includes('심방')) { bg = '#f0fdfa'; tc = '#134e4a'; br = '#ccfbf1'; }
                    else if (t.includes('교회행사')) { bg = '#f3e8ff'; tc = '#6b21a8'; br = '#e9d5ff'; }
                    else if (t.includes('상담')) { bg = '#f3f4f6'; tc = '#111827'; br = '#e5e7eb'; ord = 2; }
                    else if (t.includes('구원기념일')) { bg = 'transparent'; tc = '#0f172a'; br = 'transparent'; ord = 3; }
                    else { bg = '#f3f4f6'; tc = '#111827'; br = '#e5e7eb'; }
                    

                    // 여러 날에 걸친 종일행사(하계 수련회 등)는 달력에서 다른 일정보다 항상 위에 배치
                    const isMultiDayEvent = !!(m.end_date && m.end_date !== m.date);
                    if (isMultiDayEvent) ord = 0;

                    const isAllDay = !m.start_time;

                    const eventObj = { 
                        ...m,
                        id: m.id,
                        title: m.title || '',
                        backgroundColor: bg, 
                        textColor: tc, 
                        borderColor: br,
                        order: ord,
                        allDay: isAllDay,
                        classNames: t.includes('구원기념일') ? ['salvation-event'] : []
                    };

                    if (m.rrule_type && m.rrule_type !== 'none') {
                        const rruleObj = {
                            freq: m.rrule_type, // 'weekly', 'monthly', 'yearly'
                            dtstart: isAllDay ? m.date : `${m.date}T${m.start_time}:00`
                        };
                        
                        if (m.rrule_end_date) {
                            rruleObj.until = m.rrule_end_date;
                        }

                        if (m.rrule_type === 'weekly') {
                            const dateObj = new Date(m.date);
                            const weekdays = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
                            const dayOfWeek = weekdays[dateObj.getDay()];
                            rruleObj.byweekday = [dayOfWeek];
                        } else if (m.rrule_type === 'monthly') {
                            const dateObj = new Date(m.date);
                            rruleObj.bymonthday = [dateObj.getDate()];
                        }

                        if (m.exdates) {
                            const exDateList = m.exdates.split(',').map(d => d.trim()).filter(d => d);
                            rruleObj.exdate = exDateList.map(d => isAllDay ? d : `${d}T${m.start_time}:00`);
                        }

                        eventObj.rrule = rruleObj;

                        if (isAllDay) {
                            eventObj.duration = { days: 1 };
                        } else {
                            const startT = m.start_time || '00:00';
                            const endT = m.end_time || '01:00';
                            const [sh, sm] = startT.split(':').map(Number);
                            const [eh, em] = endT.split(':').map(Number);
                            let diffMin = (eh * 60 + em) - (sh * 60 + sm);
                            if (diffMin < 0) diffMin += 24 * 60;
                            
                            const diffH = Math.floor(diffMin / 60);
                            const diffM = diffMin % 60;
                            eventObj.duration = `${String(diffH).padStart(2, '0')}:${String(diffM).padStart(2, '0')}`;
                        }
                    } else {
                        let startVal = m.date;
                        if (m.start_time) {
                            startVal = `${m.date}T${m.start_time}:00`;
                        }
                        
                        let endVal = m.end_date ? addOneDay(m.end_date) : undefined;
                        if (m.start_time && m.end_time) {
                            endVal = `${m.end_date || m.date}T${m.end_time}:00`;
                        }
                        eventObj.start = startVal;
                        eventObj.end = endVal;
                    }

                    return eventObj;
                }));
                setTimeout(injectTimeGuides, 100);
                setTimeout(injectTimeGuides, 300);
            } catch (e) { failureCallback(e); }
        },
        eventContent: (arg) => {
            const count = arg.event.extendedProps.attendee_count || 0;
            const sermon = arg.event.extendedProps.sermon_title || '';
            const type = arg.event.extendedProps.type || '';
            const memo = arg.event.extendedProps.memo || '';
            const startTime = arg.event.extendedProps.start_time || '';
            const endTime = arg.event.extendedProps.end_time || '';
            let subtext = '';
            if (sermon) {
                subtext = `<div class="text-gray-700 truncate text-[12px]">ㆍ${sermon}</div>`;
            } else if (type === '교회행사' && memo) {
                subtext = `<div class="text-gray-700 truncate text-[12px]">ㆍ${memo}</div>`;
            }
            
            let formattedTime = startTime;
            if (startTime) {
                const isLargeDesktop = window.innerWidth >= 1200;
                if (!isLargeDesktop) {
                    const parts = startTime.split(':');
                    if (parts.length >= 2) {
                        const h = parseInt(parts[0], 10);
                        const m = parseInt(parts[1], 10);
                        if (m === 30) {
                            formattedTime = `${h}½`;
                        }
                    }
                }
            }

            const timePrefix = startTime ? `<span class="hidden md:inline text-[11px] text-slate-500 font-semibold mr-1">${formattedTime}</span>` : '';
            const isSalvation = (type === '구원기념일');
            const titleClass = isSalvation ? 'font-bold text-[13px] whitespace-normal break-all' : 'font-bold text-[13px] truncate';
            return { html: `<div class="p-1 overflow-hidden"><div class="${titleClass}">${timePrefix}${arg.event.title}${(type === '설교' || type === '외부설교' || type === '교회행사' || isSalvation) ? '' : ` (${count})`}</div>${subtext}</div>` };
        },
        dateClick: (info) => {
            const parts = info.dateStr.split('T');
            const clickedDate = parts[0];
            const clickedTime = parts[1] ? parts[1].substring(0, 5) : '';

            // 종료 시간은 기본적으로 시작시간 + 1시간 추천
            let endTimeVal = '';
            if (clickedTime) {
                const [h, m] = clickedTime.split(':').map(Number);
                const nextHour = (h + 1) % 24;
                endTimeVal = `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }

            if (typeof window.openGlobalMeetingEditor === 'function') {
                window.openGlobalMeetingEditor(null, () => {
                    if (typeof calendar !== 'undefined' && calendar.refetchEvents) calendar.refetchEvents();
                }, null, clickedDate, clickedTime, endTimeVal);
            } else {
                openMeetingModal(null, clickedDate, '', '', '', '', '', '', clickedTime, endTimeVal);
            }
        },
        eventClick: (info) => {
            const id = info.event.id;
            if (id && id.toString().startsWith('salvation-')) {
                const members = info.event.extendedProps.members;
                
                const showSalvationSelectionModal = (membersList) => {
                    const existing = document.getElementById('salvationSelectionModal');
                    if (existing) existing.remove();
                    
                    const modal = document.createElement('div');
                    modal.id = 'salvationSelectionModal';
                    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4 transition-all duration-300 opacity-0';
                    modal.innerHTML = `
                        <div class="bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform scale-95 transition-all duration-300 ease-out">
                            <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <h3 class="font-black text-slate-800 dark:text-slate-100 text-sm md:text-base flex items-center gap-2">
                                    <span>🎂</span> 구원기념일 성도 선택
                                </h3>
                                <button type="button" class="close-salvation-modal text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                            <div class="p-5 flex flex-col gap-2 max-h-64 overflow-y-auto custom-scrollbar">
                                ${membersList.map(m => `
                                    <button type="button" data-id="${m.id}" class="select-member-btn w-full text-left px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 font-bold hover:text-blue-600 dark:hover:text-blue-400 border border-slate-100 dark:border-slate-800/80 hover:border-blue-100 dark:hover:border-blue-900 transition-all flex justify-between items-center active:scale-[0.98]">
                                        <span>${m.name}${m.suffix ? `<span class="ml-1 text-[11px] font-black text-slate-400 dark:text-slate-500">${m.suffix}</span>` : ''}</span>
                                        <svg class="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path>
                                        </svg>
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    requestAnimationFrame(() => {
                        modal.classList.remove('opacity-0');
                        modal.querySelector('div').classList.remove('scale-95');
                    });
                    
                    const closeModal = () => {
                        modal.classList.add('opacity-0');
                        modal.querySelector('div').classList.add('scale-95');
                        setTimeout(() => modal.remove(), 300);
                    };
                    
                    modal.querySelector('.close-salvation-modal').addEventListener('click', closeModal);
                    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
                    modal.querySelectorAll('.select-member-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const memberId = btn.dataset.id;
                            closeModal();
                            if (typeof openMemberHistoryModal === 'function') {
                                openMemberHistoryModal(memberId);
                            }
                        });
                    });
                };

                if (members && members.length > 1) {
                    showSalvationSelectionModal(members);
                } else if (members && members.length === 1) {
                    if (typeof openMemberHistoryModal === 'function') {
                        openMemberHistoryModal(members[0].id);
                    }
                } else {
                    const memberId = id.split('-')[1];
                    if (typeof openMemberHistoryModal === 'function') {
                        openMemberHistoryModal(memberId);
                    }
                }
                return;
            }
            clickedInstanceDate = info.event.startStr.split('T')[0];
            currentMeetingData = {
                id: info.event.id,
                title: info.event.title,
                date: info.event.extendedProps.date,
                end_date: info.event.extendedProps.end_date,
                type: info.event.extendedProps.type,
                sermon_title: info.event.extendedProps.sermon_title,
                memo: info.event.extendedProps.memo,
                church: info.event.extendedProps.church,
                start_time: info.event.extendedProps.start_time,
                end_time: info.event.extendedProps.end_time,
                rrule_type: info.event.extendedProps.rrule_type,
                rrule_end_date: info.event.extendedProps.rrule_end_date,
                exdates: info.event.extendedProps.exdates,
                sermon_tags: info.event.extendedProps.sermon_tags,
                sermon_bible: info.event.extendedProps.sermon_bible
            };
            showMeetingDetail(id, clickedInstanceDate, info.event.title, info.event.extendedProps.type, info.event.extendedProps.sermon_title, info.event.extendedProps.memo, info.event.extendedProps.church, info.event.extendedProps.start_time, info.event.extendedProps.end_time, info.event.extendedProps.sermon_tags, info.event.extendedProps.leader_church_snapshot, info.event.extendedProps.leader_parish_snapshot);
        }
    });
    calendar.render();

    // 주간 뷰 배경 시간 표시 감시 및 재주입 폴링 등록
    setInterval(() => {
        const activeView = calendar.view;
        if (activeView && activeView.type.startsWith('timeGrid')) {
            injectTimeGuides();
        }
    }, 500);



    // --- Touch Swipe Navigation for Mobile/iPad ---
    let touchstartX = 0;
    let touchstartY = 0;
    let touchendX = 0;
    let touchendY = 0;

    calendarEl.addEventListener('touchstart', function(e) {
        touchstartX = e.changedTouches[0].screenX;
        touchstartY = e.changedTouches[0].screenY;
    }, { passive: true });

    calendarEl.addEventListener('touchend', function(e) {
        touchendX = e.changedTouches[0].screenX;
        touchendY = e.changedTouches[0].screenY;
        
        const diffX = touchendX - touchstartX;
        const diffY = touchendY - touchstartY;
        
        // Horizontal swipe is larger than vertical swipe, and exceeds minimum swipe threshold (50px)
        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX > 0) {
                calendar.prev(); // Swipe Right -> Go to Previous Month
            } else {
                calendar.next(); // Swipe Left -> Go to Next Month
            }
        }
    }, { passive: true });

    const sidebar = document.getElementById('sidebar'), memberList = document.getElementById('memberList'), searchInput = document.getElementById('memberSearch');
    const sidebarDistrictFilter = document.getElementById('sidebarDistrictFilter'), sidebarCategoryFilter = document.getElementById('sidebarCategoryFilter'), sidebarStatusFilter = document.getElementById('sidebarStatusFilter');
    const memberHistoryModal = document.getElementById('memberHistoryModal'), memberAddModal = document.getElementById('memberAddModal'), memberAddForm = document.getElementById('memberAddForm');
    const historyTableBody = document.getElementById('historyTableBody'), recordTableBody = document.getElementById('recordTableBody');

    let currentMemberData = null;
    let pendingCrossUpdates = [];
    let pendingRecords = [];

    ;

    function getSelectedChurchName() {
        const select = document.getElementById('headerChurchSelect');
        if (!select || select.selectedIndex === -1 || !select.options[select.selectedIndex]) {
            return null;
        }
        const opt = select.options[select.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    function getSelectedParishName() {
        const select = document.getElementById('headerParishSelect');
        if (!select || select.selectedIndex === -1 || !select.options[select.selectedIndex]) {
            return null;
        }
        const opt = select.options[select.selectedIndex];
        return opt.getAttribute('data-name') || opt.text;
    }

    async function loadMemberList() {
        const q = searchInput.value.trim(), dist = sidebarDistrictFilter.value, cat = sidebarCategoryFilter.value, st = sidebarStatusFilter.value;
        const sidebarMaritalFilter = document.getElementById('sidebarMaritalFilter');
        const marital = sidebarMaritalFilter ? sidebarMaritalFilter.value : '전체';
        try {
            const churchName = getSelectedChurchName();
            const parishName = getSelectedParishName();
            const params = new URLSearchParams({ q, district: dist, category: cat, status: st });
            if (churchName && churchName !== '교회 없음' && churchName !== '전체') {
                params.append('church', churchName);
            }
            if (parishName && parishName !== '교구 없음' && parishName !== '전체') {
                params.append('parish', parishName);
            }
            if (marital && marital !== '전체') {
                params.append('marital_status', marital);
            }
            const res = await fetch(`/api/members/search?${params.toString()}`);
            const members = await res.json();
            document.getElementById('memberCount').textContent = `${members.length}명`;
            memberList.innerHTML = members.map(m => {
                const age = m.birth_year ? (2026 - parseInt(m.birth_year) + 1) : '-';
                const ps = (m.position || '').split(',').filter(p=>p.trim()).map(p => `<span class="bg-yellow-100 dark:bg-yellow-950/25 text-yellow-800 dark:text-yellow-450 text-[9px] px-1 py-0.5 rounded border border-yellow-200 dark:border-yellow-900/35 font-black ml-0.5">${p}</span>`).join('');
                return `<div class="p-3 border dark:border-slate-850/50 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800/50 cursor-pointer transition member-item shadow-sm bg-white dark:bg-[#131B2E] mb-2" data-id="${m.id}"><div class="flex justify-between items-start mb-1"><div><span class="font-bold text-blue-800 dark:text-blue-400 text-[16px]">${m.name}</span><span class="text-[11px] text-gray-400 dark:text-slate-500 ml-1">(${age}세)</span>${ps}</div><div class="text-[10px] font-bold px-1.5 py-0.5 rounded ${m.bs === 'B' ? 'bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400' : 'bg-pink-100 dark:bg-pink-950/30 text-pink-700 dark:text-pink-400'}">${m.bs || '-'}</div></div><div class="text-[12px] text-gray-600 dark:text-slate-300 font-bold"><span class="${getDC(m.district)} px-1.5 py-0.5 rounded-full border dark:border-none text-[10px] mr-1">${m.district || ''}</span>${m.category || ''}</div>${m.family_relation ? `<div class="text-[11px] text-gray-400 dark:text-slate-500 mt-1 truncate">가족: ${m.family_relation}</div>` : ''}</div>`;
            }).join('');
            memberList.querySelectorAll('.member-item').forEach(item => item.addEventListener('click', () => openMemberHistoryModal(item.dataset.id)));
        } catch (e) { console.error(e); }
    }

    // 탭 클릭 바인딩 (최초 1회만 등록되도록 app.js 로드 시점이나 혹은 여기에 바인딩함)
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

            const res = await fetch(`/api/members/${id}/history`); const { member, history, family, leaderProfile } = await res.json(); currentMemberData = member;
            
            // Fetch records for real-time calculation
            const recRes = await fetch(`/api/members/${id}/records`);
            const records = await recRes.json();
            
            // Calculate current position and service from history
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

            document.getElementById('memberBasicInfo').innerHTML = window.renderMemberProfileHeader(member, family, calculatedPosArray, finalCalculatedSvc);
            
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
                                        textBg = 'bg-blue-50 text-blue-805 border-blue-100/50';
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
    }

    window.deleteRecord = async (id) => { if (confirm('삭제할까요?')) { try { await fetch(`/api/members/records/${id}`, { method: 'DELETE' }); openMemberHistoryModal(currentMemberData.id); } catch (e) { console.error(e); } } };

    ;

    ;


    // 등록/수정 모달(교회·교구·구역 연동, 가족검색, 인적사항 기록 CRUD, 삭제, 저장) 전체는
    // 공용 member-edit.js가 전담. 여기서는 초기화만 호출.
    if (window.MemberEditModule) {
        window.MemberEditModule.init({
            getMember: () => currentMemberData,
            setMember: (m) => { currentMemberData = m; },
            refreshList: () => { if (typeof loadMemberList === 'function') loadMemberList(); },
            refreshHistoryModal: (id) => { if (typeof openMemberHistoryModal === 'function') openMemberHistoryModal(id); }
        });
    }
    searchInput.addEventListener('input', loadMemberList);
    [sidebarDistrictFilter, sidebarCategoryFilter, sidebarStatusFilter, document.getElementById('sidebarMaritalFilter')].forEach(f => {
        if (f) f.addEventListener('change', loadMemberList);
    });
    // --- Header Church/Parish Selectors ---
    async function updateHeaderParishOptions(churchId, targetParishId = null) {
        const headerParish = document.getElementById('headerParishSelect');
        if (!headerParish) return;
        if (!churchId) return;

        if (churchId === '전체') {
            const optionsHtml = `<option value="전체" data-name="전체">모든 교구</option>`;
            headerParish.innerHTML = optionsHtml;
            headerParish.value = '전체';
            headerParish.style.display = 'inline-block';
            return;
        }

        const parishes = await fetchParishes(churchId);
        if (parishes.length > 0) {
            const optionsHtml = `<option value="전체" data-name="전체">모든 교구</option>` + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
            headerParish.innerHTML = optionsHtml;
            headerParish.style.display = 'inline-block';
            
            if (targetParishId) {
                const exists = parishes.some(p => p.id == targetParishId);
                if (exists) {
                    headerParish.value = targetParishId;
                } else {
                    const bp = parishes.find(p => p.name.includes('부곡교구'));
                    if (bp) headerParish.value = bp.id;
                    else headerParish.value = '전체';
                }
            } else {
                const bp = parishes.find(p => p.name.includes('부곡교구'));
                if (bp) headerParish.value = bp.id;
                else headerParish.value = '전체';
            }
        } else {
            headerParish.innerHTML = '<option value="">교구 없음</option>';
        }
    }

    async function initHeaderSelectors() {
        const headerChurch = document.getElementById('headerChurchSelect');
        const headerParish = document.getElementById('headerParishSelect');
        if (!headerChurch || !headerParish) return;

        const churches = await fetchChurches();
        const churchesHtml = `<option value="전체" data-name="전체">모든 교회</option>` + churches.map(c => `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`).join('');
        headerChurch.innerHTML = churchesHtml;

        let savedChurchId = localStorage.getItem('activeChurchId');
        let savedParishId = localStorage.getItem('activeParishId');
        let savedDistrict = localStorage.getItem('activeDistrict');

        // 로컬스토리지에 저장된 설정이 없을 경우, 강효근 성도 정보를 디폴트 소속값으로 자동 연동
        if (!savedChurchId) {
            try {
                const defRes = await fetch('/api/users/default-profile');
                const defProfile = await defRes.json();
                
                // 강효근 소속 교회 설정
                const sc = churches.find(c => c.name === defProfile.church);
                if (sc) {
                    savedChurchId = sc.id;
                    localStorage.setItem('activeChurchId', savedChurchId);
                }
                
                // 강효근 소속 구역 설정
                if (defProfile.district) {
                    savedDistrict = defProfile.district;
                    localStorage.setItem('activeDistrict', savedDistrict);
                }
                
                // 강효근 소속 교구 설정 (savedParishId 구하기)
                if (savedChurchId && defProfile.parish) {
                    const parishes = await fetchParishes(savedChurchId);
                    const sp = parishes.find(p => p.name === defProfile.parish);
                    if (sp) {
                        savedParishId = sp.id;
                        localStorage.setItem('activeParishId', savedParishId);
                    }
                }
            } catch (e) {
                console.error('Failed to load default user profile:', e);
            }
        }

        // 강효근 데이터가 없거나 로드에 실패한 경우의 안전장치
        if (!savedChurchId) {
            const sc = churches.find(c => c.name.includes('서울중앙교회'));
            if (sc) savedChurchId = sc.id;
        }

        if (savedChurchId) {
            headerChurch.value = savedChurchId;
        }

        await updateHeaderParishOptions(headerChurch.value, savedParishId);

        // 구역 필터 복구
        if (savedDistrict && sidebarDistrictFilter) {
            sidebarDistrictFilter.value = savedDistrict;
        }

        headerChurch.addEventListener('change', async () => {
            localStorage.setItem('activeChurchId', headerChurch.value);
            await updateHeaderParishOptions(headerChurch.value);
            localStorage.setItem('activeParishId', headerParish.value);
            loadMemberList();
        });

        headerParish.addEventListener('change', () => {
            localStorage.setItem('activeParishId', headerParish.value);
            loadMemberList();
        });

        if (sidebarDistrictFilter) {
            sidebarDistrictFilter.addEventListener('change', () => {
                localStorage.setItem('activeDistrict', sidebarDistrictFilter.value);
            });
        }
    }

    initHeaderSelectors().then(async () => {
        loadMemberList();

        // URL 파라미터가 있는 경우 모임 수정 모달 자동 열기
        const urlParams = new URLSearchParams(window.location.search);
        const editMeetingId = urlParams.get('editMeetingId');
        if (editMeetingId) {
            try {
                const res = await fetch('/api/meetings');
                const ms = await res.json();
                const m = ms.find(x => x.id == editMeetingId);
                if (m) {
                    currentMeetingData = m;
                    openMeetingModal(m.id, m.date, m.title, m.type, m.sermon_title, m.memo, m.church, m.end_date, m.start_time, m.end_time, m.rrule_type, m.rrule_end_date, m.sermon_bible, m.sermon_tags);
                }
            } catch (err) {
                console.error('Failed to auto-open meeting modal from URL parameter:', err);
            }
        }
    });
});

async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }
async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

// Meeting Functions
let currentMeetingId = null, extraAttendees = [], selectedChurch = '', currentSermonTagsList = [];

async function showMeetingDetail(id, date, title, type, sermon, memo, church = '', startTime = '', endTime = '', sermonTags = '', leaderChurchSnapshot = '', leaderParishSnapshot = '') {
    currentMeetingId = id; const c = document.getElementById('meetingPanelsContainer');
    c.classList.remove('hidden'); setTimeout(() => { c.classList.remove('translate-x-full'); c.classList.add('translate-x-0'); }, 10);
    document.getElementById('meetingDetailPanel').classList.remove('hidden'); document.getElementById('meetingModal').classList.add('hidden');
    document.getElementById('detailTitle').textContent = title;
    let timeStr = startTime;
    if (startTime && endTime) {
        timeStr = `${startTime}~${endTime}`;
    }
    document.getElementById('detailDate').textContent = `${date}${timeStr ? ' ' + timeStr : ''} | ${type === '설교' ? '내부설교' : type}`;
    const res = await fetch(`/api/meetings/${id}/attendance`); const att = await res.json();
    const p = att.filter(a => a.is_present);
    const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());
    
    // 미참석자 계산 로직
    let absentHtml = '';
    const typeStr = type || '';
    if (!['설교', '외부설교', '심방', '교회행사', '기타', '상담'].includes(typeStr)) {
        let targetParams = new URLSearchParams({ status: 'active' });
        // 교구전체모임/전체조모임: 강효근 소속 교회(+서울중앙교회인 경우 교구) 성도 전체가 대상.
        // 이 모임에 저장된 소속 스냅샷이 있으면 그걸 우선 사용해서, 관리자 소속이 나중에 바뀌어도
        // 과거 모임의 대상자 명단이 흔들리지 않도록 한다.
        const isParishWide = typeStr.includes('교구전체모임') || typeStr.includes('전체조모임');
        if (isParishWide) {
            const snap = leaderChurchSnapshot ? { church: leaderChurchSnapshot, parish: leaderParishSnapshot } : null;
            await window.applyParishWideTargetFilter(targetParams, snap);
        } else if (typeStr.includes('구역모임') || typeStr.includes('조모임')) {
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
        // 상담만 한 분/전도대상은 성도가 아니므로 대상자에서 제외
        allTargets = window.filterMeetingTargets(allTargets);

        // 교구전체모임 구분이지만 제목이 '조모임'이면 조모임 대상(성도 S, 청년 제외) 기준을 적용
        if (isParishWide && (title || '').includes('조')) {
            allTargets = allTargets.filter(m => m.bs === 'S' && m.category !== '청년회');
        }
        
        if (typeStr.includes('형제모임')) {
            const eRes = await fetch(`/api/members/search?status=active&category=은장회`);
            const eMembers = await eRes.json();
            allTargets = [...allTargets, ...eMembers];
            // '자매' 제외 (성별 컬럼 bs가 'B'(형제)인 사람만 필터링)
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
                <div class="mt-6 pt-4 border-t border-dashed dark:border-slate-800/80">
                    <h4 class="text-xs font-black text-gray-400 dark:text-slate-550 mb-2 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                    <div class="flex flex-wrap gap-1">
                        ${absentees.map(m => `<span class="px-2.5 py-1 bg-gray-100 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 rounded text-xs font-bold">${m.name}</span>`).join('')}
                    </div>
                </div>
            `;
        }
    }

    // 간증 섹션
    let testimonyHtml = '';
    if (pWithTestimony.length > 0) {
        testimonyHtml = `
            <div class="mt-6 pt-4 border-t border-dashed dark:border-slate-800/80">
                <h4 class="text-xs font-black text-blue-700 dark:text-blue-400 mb-2 uppercase tracking-wider">간증 (${pWithTestimony.length}명)</h4>
                <div class="space-y-2">
                    ${pWithTestimony.map(a => `
                        <div class="p-2.5 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-100 dark:border-blue-900/30">
                            <div class="font-bold text-blue-800 dark:text-blue-300 text-base">${a.name}</div>
                            <p class="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-200 mt-2 pl-3 border-l-2 border-blue-500 dark:border-blue-400">${a.testimony_snapshot}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    let detailHTML = '';
    if (typeStr === '교회행사') {
        if (memo && memo.trim()) {
            detailHTML = `
                <div class="mb-4 bg-teal-50/50 dark:bg-teal-950/10 p-4.5 rounded-xl border border-teal-100/70 dark:border-teal-900/30 shadow-sm">
                    <h4 class="text-xs font-black text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-teal-600 dark:text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        행사 메모 / 안내 사항
                    </h4>
                    <p class="text-base text-slate-800 dark:text-slate-200 font-semibold whitespace-pre-wrap leading-relaxed">${memo}</p>
                </div>
            `;
        } else {
            detailHTML = `
                <div class="mb-4 bg-slate-50/50 dark:bg-slate-900/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-800/80 text-center">
                    <p class="text-sm text-slate-400 italic py-2">등록된 행사 메모가 없습니다.</p>
                </div>
            `;
        }
    } else {
        detailHTML = `
            <div class="mb-4 bg-white dark:bg-[#1e293b] p-4.5 rounded-xl shadow-sm border dark:border-slate-800/80 flex justify-between items-center">
                <span class="font-bold text-lg dark:text-slate-200">총 참석</span>
                <span class="text-3xl font-black text-blue-600 dark:text-blue-400">${p.length}명</span>
            </div>
            ${church ? `<div class="mb-4 bg-blue-50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-900/30"><h4 class="text-xs font-black text-blue-700 dark:text-blue-400">외부 교회</h4><p class="font-bold text-lg dark:text-slate-200">${church}</p></div>` : ''}
            ${sermon ? `<div class="mb-4 bg-yellow-50 dark:bg-amber-950/20 p-4 rounded-xl border border-yellow-200 dark:border-amber-900/30"><h4 class="text-xs font-black text-yellow-700 dark:text-amber-400">설교</h4><p class="font-bold text-lg dark:text-slate-100">${sermon}</p></div>` : ''}
            ${sermonTags ? `
                <div class="mb-4 flex flex-wrap gap-1.5">
                    ${sermonTags.split(/[,\s#]+/).map(t => t.trim()).filter(t => t.length > 0).map(t => `<span class="px-2 py-1 bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 dark:border dark:border-amber-900/30 rounded-lg text-xs font-bold">#${t}</span>`).join('')}
                </div>
            ` : ''}
            ${memo ? `
            <div class="mb-4">
                <h4 class="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    메모
                </h4>
                <p class="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-slate-300 dark:border-slate-600">${memo}</p>
            </div>
            ` : ''}
            
            <div class="mb-4">
                <h4 class="text-xs font-black text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">참석자</h4>
                <div class="flex flex-wrap gap-1">
                    ${p.map(a => `<span class="px-2.5 py-1.5 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 dark:border dark:border-blue-900/30 rounded text-xs font-bold">${a.name}</span>`).join('')}
                </div>
            </div>

            ${absentHtml}
            ${testimonyHtml}
        `;
    }

    document.getElementById('detailContent').innerHTML = detailHTML;
}

document.getElementById('editMeetingDetailBtn').addEventListener('click', () => {
    if (currentMeetingId) {
        window.openGlobalMeetingEditor(currentMeetingId, () => {
            if (typeof calendar !== 'undefined' && calendar.refetchEvents) {
                calendar.refetchEvents();
            }
            const modal = document.getElementById('meetingModal');
            if (modal) modal.classList.add('hidden');
            const detailPanel = document.getElementById('meetingDetailPanel');
            if (detailPanel) detailPanel.classList.add('hidden');
            const panelCon = document.getElementById('meetingPanelsContainer');
            if (panelCon) {
                panelCon.classList.add('translate-x-full');
                setTimeout(() => { panelCon.classList.add('hidden'); }, 300);
            }
        }, () => {
            if (typeof calendar !== 'undefined' && calendar.refetchEvents) {
                calendar.refetchEvents();
            }
        });
    }
});

function renderSermonTagBadges() {
    const list = document.getElementById('sermonTagBadgesList');
    if (!list) return;
    list.innerHTML = currentSermonTagsList.map((tag, idx) => `
        <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg text-[11px] font-bold border border-blue-200/50 dark:border-blue-800/40">
            #${tag}
            <button type="button" class="text-blue-500 hover:text-blue-700 font-bold focus:outline-none cursor-pointer text-xs ml-0.5" onclick="removeSermonTag(${idx})">×</button>
        </span>
    `).join('');
    
    // Adjust placeholder based on tags count
    const input = document.getElementById('meetingSermonTags');
    if (input) {
        input.placeholder = currentSermonTagsList.length > 0 ? '' : '태그 입력 (예: 믿음, 기도)...';
    }
}

window.removeSermonTag = function(idx) {
    currentSermonTagsList.splice(idx, 1);
    renderSermonTagBadges();
};

let clickedInstanceDate = null;
let currentMeetingData = null;

async function openMeetingModal(id, date, title = '', type = '', sermon = '', memo = '', church = '', end_date = '', startTime = '', endTime = '', rrule_type = 'none', rrule_end_date = '', sermon_bible = '', sermon_tags = '') {
    currentMeetingId = id; extraAttendees = [];
    window.__meetingModalOwner = 'app'; // 저장/삭제 이중 실행 방지: 이 모듈이 모달 소유 (meeting_editor.js와 상호 배제)

    // 신규 등록 기본 구분: 관리자 설정의 첫 관리 구역 구역모임 (meeting_editor.js 공통 헬퍼)
    if (!type) {
        type = (typeof window.getDefaultMeetingType === 'function') ? await window.getDefaultMeetingType() : '구역모임';
    }

    // 반복 설정 UI 바인딩
    document.getElementById('meetingRecurrence').value = rrule_type || 'none';
    document.getElementById('meetingRecurrenceEndDate').value = rrule_end_date || '';
    
    const recEndDateField = document.getElementById('recurrenceEndDateField');
    if (rrule_type && rrule_type !== 'none') {
        recEndDateField.classList.remove('hidden');
    } else {
        recEndDateField.classList.add('hidden');
    }
    
    if (!document.getElementById('meetingRecurrence')._listenerAdded) {
        document.getElementById('meetingRecurrence').addEventListener('change', (e) => {
            if (e.target.value !== 'none') {
                recEndDateField.classList.remove('hidden');
                if (!document.getElementById('meetingRecurrenceEndDate').value) {
                    const startDateVal = document.getElementById('meetingDate').value;
                    if (startDateVal) {
                        const d = new Date(startDateVal);
                        d.setMonth(d.getMonth() + 3);
                        document.getElementById('meetingRecurrenceEndDate').value = d.toISOString().split('T')[0];
                    }
                }
            } else {
                recEndDateField.classList.add('hidden');
                document.getElementById('meetingRecurrenceEndDate').value = '';
            }
        });
        document.getElementById('meetingRecurrence')._listenerAdded = true;
    }

    const c = document.getElementById('meetingPanelsContainer');
    c.classList.remove('hidden');
    setTimeout(() => { c.classList.remove('translate-x-full'); c.classList.add('translate-x-0'); }, 10);
    
    document.getElementById('meetingModal').classList.remove('hidden'); 
    document.getElementById('meetingDetailPanel').classList.add('hidden');
    document.getElementById('modalTitle').textContent = id ? '기록 수정' : '신규 일정 등록';
    document.getElementById('meetingTitle').value = title;
    document.getElementById('meetingDate').value = date;
    document.getElementById('meetingEndDate').value = end_date || '';
    // 구분/번호 셀렉트 초기화 후 값 세팅 (meeting_editor.js 공통 헬퍼, 저장 포맷은 결합 문자열 유지)
    if (typeof window.initMeetingTypeSelectors === 'function') {
        await window.initMeetingTypeSelectors();
        window.setMeetingTypeValue(type);
    } else {
        document.getElementById('meetingType').value = type;
    }
    document.getElementById('meetingSermonBible').value = sermon_bible || '';
    
    // Parse tags (split by comma, space or hash)
    if (sermon_tags) {
        currentSermonTagsList = sermon_tags.split(/[,\s#]+/).map(t => t.trim()).filter(t => t.length > 0);
    } else {
        currentSermonTagsList = [];
    }
    renderSermonTagBadges();

    const tagsInput = document.getElementById('meetingSermonTags');
    const tagsContainer = document.getElementById('sermonTagsContainer');
    
    if (tagsContainer && tagsInput) {
        tagsInput.value = '';
        
        tagsContainer.onclick = (e) => {
            if (e.target === tagsContainer || e.target === document.getElementById('sermonTagBadgesList')) {
                tagsInput.focus();
            }
        };
        
        function flushTagInput() {
            const tagVal = tagsInput.value.replace(/[#,\s]/g, '').trim();
            if (tagVal && !currentSermonTagsList.includes(tagVal)) {
                currentSermonTagsList.push(tagVal);
                tagsInput.value = '';
                renderSermonTagBadges();
            } else if (tagVal) {
                tagsInput.value = '';
            }
        }
        tagsInput.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                e.preventDefault();
                flushTagInput();
            } else if (e.key === 'Backspace' && !tagsInput.value) {
                currentSermonTagsList.pop();
                renderSermonTagBadges();
            }
        };
        tagsInput.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ',') flushTagInput(); });
        tagsInput.addEventListener('blur', () => { flushTagInput(); });
    }

    let parsedSermonTitle = sermon || '';
    let parsedTag = '';
    if (type === '설교' && sermon) {
        const tagMatch = sermon.match(/^(.*?)\s*\(([^)]+)\)$/);
        if (tagMatch) {
            parsedSermonTitle = tagMatch[1].trim();
            parsedTag = tagMatch[2].trim();
        }
    }

    document.getElementById('meetingSermon').value = parsedSermonTitle;
    document.getElementById('meetingMemo').value = memo;
    document.getElementById('deleteMeeting').classList.toggle('hidden', !id);

    // 설교 태그 필드 제어 및 상태 초기화
    const sermonTagsField = document.getElementById('sermonTagsField');
    if (sermonTagsField) {
        if (type === '설교') {
            sermonTagsField.classList.remove('hidden');
        } else {
            sermonTagsField.classList.add('hidden');
        }
    }
    const directTagInput = document.getElementById('directSermonTag');
    if (directTagInput) {
        directTagInput.value = parsedTag;
    }
    updateSermonTagActiveState(parsedTag);

    // 설교 자동완성 datalist 채우기
    try {
        const res = await fetch('/api/meetings');
        const ms = await res.json();
        const sermonTitles = [...new Set(ms
            .map(m => m.sermon_title)
            .filter(t => t && t.trim() !== '')
        )];
        const datalist = document.getElementById('sermonListOptions');
        if (datalist) {
            datalist.innerHTML = sermonTitles.map(t => `<option value="${t}"></option>`).join('');
        }
    } catch (err) {
        console.error('Failed to load sermon titles for datalist:', err);
    }

    // 종일 체크박스 제어 로직
    const isAllDayEvent = document.getElementById('isAllDayEvent');
    const startTimeEl = document.getElementById('meetingStartTime');
    const endTimeEl = document.getElementById('meetingEndTime');
    const endTimeField = document.getElementById('meetingEndTimeField');
    if (isAllDayEvent && startTimeEl && endTimeEl) {
        let finalStartTime = startTime;
        let finalEndTime = endTime;

        // 신규 등록 시 구역모임이면 19:30 ~ 21:30, 조모임이면 10:30 ~ 14:00 추천
        if (!id && !startTime && type) {
            if (type.includes('구역모임')) {
                finalStartTime = '19:30';
                finalEndTime = '21:30';
            } else if (type.includes('조모임')) {
                finalStartTime = '10:30';
                finalEndTime = '14:00';
            }
        }

        const isAllDay = !finalStartTime;
        isAllDayEvent.checked = isAllDay;
        startTimeEl.value = finalStartTime || '';
        endTimeEl.value = finalEndTime || '';
        
        if (isAllDay) {
            startTimeEl.classList.add('hidden');
            endTimeField.classList.add('hidden');
        } else {
            startTimeEl.classList.remove('hidden');
            endTimeField.classList.remove('hidden');
        }

        if (!isAllDayEvent._listenerAdded) {
            isAllDayEvent.addEventListener('change', (e) => {
                if (e.target.checked) {
                    startTimeEl.classList.add('hidden');
                    endTimeField.classList.add('hidden');
                    startTimeEl.value = '';
                    endTimeEl.value = '';
                } else {
                    startTimeEl.classList.remove('hidden');
                    endTimeField.classList.remove('hidden');
                    startTimeEl.value = '09:00';
                    endTimeEl.value = '10:00';
                }
            });
            isAllDayEvent._listenerAdded = true;
        }

        // 시작 시간 입력 시 종료 시간 +1시간 자동 매핑
        if (!startTimeEl._autoTimeAdded) {
            startTimeEl.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val) {
                    const [h, m] = val.split(':').map(Number);
                    const nextHour = (h + 1) % 24;
                    endTimeEl.value = `${String(nextHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                }
            });
            startTimeEl._autoTimeAdded = true;
        }
    }

    // 당일행사 체크박스 제어 로직
    const isSameDayEvent = document.getElementById('isSameDayEvent');
    const meetingEndDate = document.getElementById('meetingEndDate');
    const meetingDate = document.getElementById('meetingDate');

    const isSame = !end_date || date === end_date;
    isSameDayEvent.checked = isSame;
    if (isSame) {
        meetingEndDate.value = date;
        meetingEndDate.disabled = true;
        meetingEndDate.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    } else {
        meetingEndDate.value = end_date;
        meetingEndDate.disabled = false;
        meetingEndDate.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    }

    const updateEndDateState = () => {
        if (isSameDayEvent.checked) {
            meetingEndDate.value = meetingDate.value;
            meetingEndDate.disabled = true;
            meetingEndDate.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        } else {
            meetingEndDate.disabled = false;
            meetingEndDate.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        }
    };

    isSameDayEvent.onchange = updateEndDateState;
    meetingDate.oninput = updateEndDateState;

    selectedChurch = church || '';

    const updateSelectedChurchUI = () => {
        const container = document.getElementById('selectedChurchContainer');
        const nameSpan = document.getElementById('selectedChurchName');
        if (selectedChurch) {
            nameSpan.textContent = selectedChurch;
            container.classList.remove('hidden');
            container.classList.add('flex');
        } else {
            nameSpan.textContent = '없음';
            container.classList.add('hidden');
            container.classList.remove('flex');
        }
    };
    updateSelectedChurchUI();

    const churchSearchInput = document.getElementById('churchSearchInput');
    const churchSearchResults = document.getElementById('churchSearchResults');
    const clearSelectedChurch = document.getElementById('clearSelectedChurch');

    churchSearchInput.value = '';
    churchSearchResults.innerHTML = '';
    churchSearchResults.classList.add('hidden');

    let allChurches = [];
    fetchChurches().then(data => { allChurches = data; });

    churchSearchInput.oninput = () => {
        const val = churchSearchInput.value.trim().toLowerCase();
        if (!val) {
            churchSearchResults.innerHTML = '';
            churchSearchResults.classList.add('hidden');
            return;
        }

        const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
        if (filtered.length === 0) {
            churchSearchResults.innerHTML = '<div class="p-2 text-xs text-gray-500 italic">검색 결과가 없습니다.</div>';
            churchSearchResults.classList.remove('hidden');
            return;
        }

        churchSearchResults.innerHTML = filtered.map(c => `
            <div class="church-search-item p-2 hover:bg-blue-50 cursor-pointer font-bold text-sm text-gray-700 border-b border-gray-100" data-name="${c.name}">
                ${c.name}
            </div>
        `).join('');
        churchSearchResults.classList.remove('hidden');

        document.querySelectorAll('.church-search-item').forEach(item => {
            item.onclick = () => {
                selectedChurch = item.getAttribute('data-name');
                updateSelectedChurchUI();
                churchSearchInput.value = '';
                churchSearchResults.innerHTML = '';
                churchSearchResults.classList.add('hidden');
            };
        });
    };

    clearSelectedChurch.onclick = () => {
        selectedChurch = '';
        updateSelectedChurchUI();
    };

    const docClickListener = (e) => {
        if (churchSearchInput && !churchSearchInput.contains(e.target) && !churchSearchResults.contains(e.target)) {
            churchSearchResults.classList.add('hidden');
        }
    };
    document.removeEventListener('click', window._churchDocClickListener);
    window._churchDocClickListener = docClickListener;
    document.addEventListener('click', docClickListener);
    // Bible Books Autocomplete Logic
    const bibleBooks = [
        "창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기", "사무엘상", "사무엘하",
        "열왕기상", "열왕기하", "역대상", "역대하", "에스라", "느헤미야", "에스더", "욥기", "시편", "잠언",
        "전도서", "아가", "이사야", "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스",
        "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기",
        "마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서", "고린도전서", "고린도후서", "갈라디아서", "에베소서",
        "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서",
        "베드로전서", "베드로후서", "요한1서", "요한2서", "요한3서", "유다서", "요한계시록"
    ];

    const bibleInput = document.getElementById('meetingSermonBible');
    const bibleResults = document.getElementById('meetingSermonBibleResults');

    if (bibleInput && bibleResults) {
        // bibleInput.value = ''; (Removed to prevent overwriting existing saved value)
        bibleResults.innerHTML = '';
        bibleResults.classList.add('hidden');

        let currentFocus = -1;

        bibleInput.oninput = () => {
            currentFocus = -1;
            const val = bibleInput.value.trim().toLowerCase();
            if (!val) {
                bibleResults.innerHTML = '';
                bibleResults.classList.add('hidden');
                return;
            }

            const filtered = bibleBooks.filter(b => b.toLowerCase().includes(val));
            if (filtered.length === 0) {
                bibleResults.innerHTML = '<div class="p-2 text-xs text-gray-500 italic">검색 결과가 없습니다.</div>';
                bibleResults.classList.remove('hidden');
                return;
            }

            bibleResults.innerHTML = filtered.map(b => `
                <div class="bible-search-item p-2 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer font-bold text-sm text-gray-700 dark:text-slate-300 border-b border-gray-100 dark:border-slate-800/80" data-name="${b}">
                    ${b}
                </div>
            `).join('');
            bibleResults.classList.remove('hidden');

            document.querySelectorAll('.bible-search-item').forEach(item => {
                item.onclick = () => {
                    bibleInput.value = item.getAttribute('data-name');
                    bibleResults.innerHTML = '';
                    bibleResults.classList.add('hidden');
                };
            });
        };

        bibleInput.onkeydown = (e) => {
            const items = bibleResults.querySelectorAll('.bible-search-item');
            if (e.key === 'ArrowDown') {
                currentFocus++;
                addActive(items);
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                currentFocus--;
                addActive(items);
                e.preventDefault();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1) {
                    if (items && items[currentFocus]) items[currentFocus].click();
                } else if (items.length > 0) {
                    items[0].click();
                }
            }
        };

        function addActive(items) {
            if (!items) return false;
            removeActive(items);
            if (currentFocus >= items.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (items.length - 1);
            items[currentFocus].classList.add('bg-blue-100', 'dark:bg-slate-700');
        }

        function removeActive(items) {
            for (let i = 0; i < items.length; i++) {
                items[i].classList.remove('bg-blue-100', 'dark:bg-slate-700');
            }
        }

        const bibleDocListener = (e) => {
            if (bibleInput && !bibleInput.contains(e.target) && !bibleResults.contains(e.target)) {
                bibleResults.classList.add('hidden');
            }
        };
        document.removeEventListener('click', window._bibleDocClickListener);
        window._bibleDocClickListener = bibleDocListener;
        document.addEventListener('click', bibleDocListener);
    }
    
    // 명단 로드 함수 정의
    const refreshAttendanceList = async () => {
        const currentType = document.getElementById('meetingType').value;
        let targetParams = new URLSearchParams({ status: 'active' });

        // 개인상담 패널 제어
        const counselingPanel = document.getElementById('counselingPanel');
        const titleField = document.getElementById('meetingTitleField');
        const recurrenceSection = document.getElementById('meetingRecurrenceSection');
        const sermonSectionEl = document.getElementById('sermonSection');
        const extraAttendeesSection = document.getElementById('extraAttendeesSection');

        if (currentType === '상담' || currentType === '개인상담') {
            if (counselingPanel) counselingPanel.classList.remove('hidden');
            if (titleField) titleField.classList.add('hidden');
            if (recurrenceSection) recurrenceSection.classList.add('hidden');
            if (sermonSectionEl) sermonSectionEl.classList.add('hidden');
            if (extraAttendeesSection) extraAttendeesSection.classList.add('hidden');
            const defaultAttSec2 = document.getElementById('defaultAttendanceSection');
            if (defaultAttSec2) defaultAttSec2.classList.add('hidden');
            const memoField2 = document.getElementById('memoField');
            if (memoField2) memoField2.classList.add('hidden');
            return;
        } else {
            if (counselingPanel) counselingPanel.classList.add('hidden');
            if (titleField) titleField.classList.remove('hidden');
            if (recurrenceSection) recurrenceSection.classList.remove('hidden');
            if (sermonSectionEl) sermonSectionEl.classList.remove('hidden');
            if (extraAttendeesSection) extraAttendeesSection.classList.remove('hidden');
        }

        const endDateField = document.getElementById('meetingEndDateField');
        const dateLabel = document.getElementById('meetingDateLabel');
        const defaultAttSec = document.getElementById('defaultAttendanceSection');
        const extraAttSec = document.getElementById('openExtraMemberSearch')?.closest('.border-t');
        const memoField = document.getElementById('memoField');

        const sermonTagsField = document.getElementById('sermonTagsField');
        if (sermonTagsField) {
            if (currentType === '설교') {
                sermonTagsField.classList.remove('hidden');
            } else {
                sermonTagsField.classList.add('hidden');
            }
        }

        // 교회행사 동적 폼 제어
        if (currentType === '교회행사') {
            if (endDateField) endDateField.classList.remove('hidden');
            if (dateLabel) dateLabel.textContent = '시작일';
            if (defaultAttSec) defaultAttSec.classList.add('hidden');
            if (extraAttSec) extraAttSec.classList.add('hidden');
            if (memoField) memoField.classList.remove('hidden');
            const appAttListChurch = document.getElementById('attendanceList');
            appAttListChurch.className = 'space-y-2 max-h-[600px] overflow-y-auto no-scrollbar';
            appAttListChurch.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">교회 행사는 참석 체크 대상자가 없습니다.</p>';
            if (window.attSetMode) window.attSetMode('check');
            
            const searchSection = document.getElementById('churchSearchSection');
            if (searchSection) {
                searchSection.classList.add('hidden');
                searchSection.style.display = 'none';
            }
            if (window.attSnapshotModalState) window.attSnapshotModalState();
            return;
        } else {
            if (endDateField) endDateField.classList.add('hidden');
            if (dateLabel) dateLabel.textContent = '날짜';
            if (defaultAttSec) defaultAttSec.classList.remove('hidden');
            if (extraAttSec) extraAttSec.classList.remove('hidden');
            
            // 다른 타입의 메모 필드 조절
            if (['심방', '외부설교', '기타', '상담', '설교'].includes(currentType) || currentType.includes('모임')) {
                if (memoField) memoField.classList.remove('hidden');
            } else {
                if (memoField) memoField.classList.add('hidden');
            }
        }
        
        const searchSection = document.getElementById('churchSearchSection');
        if (currentType === '외부설교') {
            searchSection.classList.remove('hidden');
            searchSection.style.display = 'block';
        } else {
            searchSection.classList.add('hidden');
            searchSection.style.display = 'none';
            if (selectedChurch) {
                selectedChurch = '';
                updateSelectedChurchUI();
            }
        }
        
        if (currentType.includes('교구전체모임') || currentType.includes('전체조모임')) {
            // 교구전체모임: 강효근 소속 교회(+서울중앙교회인 경우 교구) 성도 전체가 대상.
            // 기존 모임을 편집 중이면(currentMeetingData 존재) 그 모임에 저장된 스냅샷을 우선 사용.
            const snap = currentMeetingData ? { church: currentMeetingData.leader_church_snapshot, parish: currentMeetingData.leader_parish_snapshot } : null;
            await window.applyParishWideTargetFilter(targetParams, snap);
        } else if (currentType.includes('구역모임') || currentType.includes('조모임')) {
            const distMatch = currentType.match(/\d+/);
            if (distMatch) targetParams.append('district', `${distMatch[0]}구역`);
        } else if (currentType === '교구임원모임') {
            targetParams.append('has_position', 'true');
        } else if (currentType.includes('형제모임')) {
            targetParams.append('category', '봉사회');
        } else if (currentType.includes('청년모임')) {
            targetParams.append('category', '청년회');
        } else if (['설교', '외부설교', '심방', '기타', '상담'].includes(currentType)) {
            const appAttListNone = document.getElementById('attendanceList');
            appAttListNone.className = 'space-y-2 max-h-[600px] overflow-y-auto no-scrollbar';
            appAttListNone.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">대상자가 없습니다. 직접 검색하여 추가해 주세요.</p>';
            if (window.attSetMode) window.attSetMode('check');
            if (id) {
                const aRes = await fetch(`/api/meetings/${id}/attendance`);
                const att = await aRes.json();
                extraAttendees = att.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
                renderExtras();
            } else {
                extraAttendees = [];
                renderExtras();
            }
            if (window.attSnapshotModalState) window.attSnapshotModalState();
            return;
        }

        const mRes = await fetch(`/api/members/search?${targetParams.toString()}`);
        let members = await mRes.json();
        members = window.filterMeetingTargets(members);

        if (currentType.includes('형제모임')) {
            const eRes = await fetch(`/api/members/search?status=active&category=은장회`);
            const eMembers = await eRes.json();
            // 은장회 중 자매님들 이름 목록 (DB 데이터 기반)
            const silverSisters = ['김민주', '정혜숙', '박현숙', '박효순', '이만심', '전계숙', '민승자', '이병숙', '김순임', '김윤연', '허간란'];
            const eBrothers = eMembers.filter(m => !silverSisters.includes(m.name) && !m.name.includes('자매'));
            members = [...members, ...eBrothers];
        }

        if (currentType.includes('조모임')) {
            members = members.filter(m => m.bs === 'S' && m.category !== '청년회');
        }

        if (currentType === '교구임원모임') {
            members = members.filter(m => m.position && m.position.trim().length > 0);
        }

        let att = []; 
        if (id) { 
            const aRes = await fetch(`/api/meetings/${id}/attendance`); 
            att = await aRes.json(); 
        }
        
        const renderRow = (m) => {
            const a = att.find(x => x.member_id === m.id);
            const isP = a ? !!a.is_present : false;
            const test = (a ? (a.testimony_snapshot || '') : '').replace(/"/g, '&quot;');
            const chipCls = isP ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
            return `<div class="attendance-row relative" data-id="${m.id}" data-present="${isP}" data-district="${m.district || ''}">
                <button type="button" class="attend-chip w-full h-full flex items-center justify-center px-1 py-2.5 rounded-xl border-2 transition-all duration-150 active:scale-[0.97] ${chipCls}">
                    <span class="att-name font-extrabold text-[13px] leading-tight truncate">${m.name}</span>
                </button>
                <span class="testimony-dot absolute top-1 right-1.5 w-2 h-2 rounded-full bg-amber-400 shadow ${test ? '' : 'hidden'}"></span>
                <input type="hidden" class="testimony-input" value="${test}">
            </div>`;
        };

        // 구역별 그룹핑 (같은 구역끼리 묶어 헤더 한 번만 표시, 단일 구역이면 헤더 생략)
        const renderGrouped = (list) => {
            const groups = new Map();
            list.forEach(m => {
                const key = m.district || '기타';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(m);
            });
            const single = groups.size <= 1;
            return Array.from(groups.entries()).map(([dist, arr]) => `
                <div class="att-district-group" data-district="${dist}">
                    ${single ? '' : `<div class="flex items-center gap-2 mb-1.5 mt-0.5"><span class="text-[10px] font-black text-blue-500/90 dark:text-blue-400/90 tracking-wider">${dist}</span><span class="flex-1 border-t border-dashed border-slate-200 dark:border-slate-800"></span><span class="text-[9px] font-bold text-slate-300 dark:text-slate-600">${arr.length}명</span></div>`}
                    <div class="grid grid-cols-4 gap-1.5">${arr.map(renderRow).join('')}</div>
                </div>`).join('');
        };

        function appToggleChip(row) {
            const nowPresent = row.dataset.present !== 'true';
            row.dataset.present = String(nowPresent);
            const chip = row.querySelector('.attend-chip');
            if (nowPresent) {
                chip.classList.remove('bg-white', 'dark:bg-slate-800/50', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
                chip.classList.add('bg-blue-600', 'border-blue-600', 'text-white');
            } else {
                chip.classList.remove('bg-blue-600', 'border-blue-600', 'text-white');
                chip.classList.add('bg-white', 'dark:bg-slate-800/50', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
            }
            const total = document.querySelectorAll('.attendance-row[data-present="true"]').length;
            const countEl = document.getElementById('attendanceCount');
            if (countEl) countEl.textContent = `${total}명 선택됨`;
        }

        const appAttListEl = document.getElementById('attendanceList');
        appAttListEl.className = 'space-y-3 max-h-[600px] overflow-y-auto no-scrollbar';
        appAttListEl.innerHTML = renderGrouped(members);
        appAttListEl.onclick = (e) => {
            const chip = e.target.closest('.attend-chip');
            if (!chip) return;
            const row = chip.closest('.attendance-row');
            if (window.__attMode === 'testimony') { window.attOpenTestimonyPanel(row); return; }
            appToggleChip(row);
        };
        {
            const total = document.querySelectorAll('.attendance-row[data-present="true"]').length;
            const countEl = document.getElementById('attendanceCount');
            if (countEl) countEl.textContent = `${total}명 선택됨`;
        }
        if (window.initAttendanceModeUX) {
            window.initAttendanceModeUX();
            // 간증 즉시 저장용 모임 ID — 반복 일정은 인스턴스 저장 시 새 모임이 생성되므로(부모 오염 방지) 비활성
            const isRecurringMeeting = currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none';
            window.__attMeetingId = (id && !isRecurringMeeting) ? id : null;
            // 기존 모임 수정(기록 수정)이고 이미 출석자가 있으면 간증 모드로 바로 진입
            const hasSavedPresent = att.some(a => a.is_present);
            window.attSetMode(id && hasSavedPresent ? 'testimony' : 'check');
        }
        
        // 기존 검색 추가 인원 복구 (수정 시 - 실제 출석했던 추가 인원만 복구)
        if (id) {
            const memberIds = members.map(m => m.id);
            const extras = att.filter(a => !memberIds.includes(a.member_id) && a.is_present === 1);
            extraAttendees = extras.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
            renderExtras();
        } else {
            renderExtras(); // 신규 시 비우기
        }
        if (window.attSnapshotModalState) window.attSnapshotModalState(); // 닫기 가드용 기준 상태 저장
    };

    // 구분 변경 시 명단 갱신 이벤트 리스너
    const meetingTypeEl = document.getElementById('meetingType');
    if (meetingTypeEl) {
        if (window._meetingTypeChangeListener) {
            meetingTypeEl.removeEventListener('change', window._meetingTypeChangeListener);
        }
        window._meetingTypeChangeListener = () => {
            refreshAttendanceList();
            
            // 구역모임(19:30-21:30) 또는 조모임(10:30-14:00) 선택 시 디폴트 시간 추천
            const typeVal = meetingTypeEl.value || '';
            const isAllDayEvent = document.getElementById('isAllDayEvent');
            const startTimeEl = document.getElementById('meetingStartTime');
            const endTimeEl = document.getElementById('meetingEndTime');
            const endTimeField = document.getElementById('meetingEndTimeField');
            
            if (isAllDayEvent && startTimeEl && endTimeEl && endTimeField) {
                if (typeVal.includes('구역모임')) {
                    isAllDayEvent.checked = false;
                    startTimeEl.classList.remove('hidden');
                    endTimeField.classList.remove('hidden');
                    startTimeEl.value = '19:30';
                    endTimeEl.value = '21:30';
                } else if (typeVal.includes('조모임')) {
                    isAllDayEvent.checked = false;
                    startTimeEl.classList.remove('hidden');
                    endTimeField.classList.remove('hidden');
                    startTimeEl.value = '10:30';
                    endTimeEl.value = '14:00';
                }
            }
        };
        meetingTypeEl.addEventListener('change', window._meetingTypeChangeListener);
    }

    await refreshAttendanceList();
}

function renderExtras() {
    const list = document.getElementById('extraAttendanceList');
    if (!extraAttendees.length) { list.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 dark:text-slate-500">없음</p>'; return; }
    const EX_SVG = `<svg class="w-2.5 h-2.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
    list.innerHTML = extraAttendees.map(m => {
        const isP = !!m.is_present;
        const test = (m.testimony_snapshot || '').replace(/"/g, '&quot;');
        const chipCls = isP ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
        const dotCls = isP ? 'bg-white border-white' : 'border-slate-300 dark:border-slate-600 opacity-50';
        const distCls = isP ? 'bg-emerald-500/70 text-emerald-50' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500';
        return `<div class="attendance-row mb-1" data-id="${m.id}" data-present="${isP}" data-extra="true">
            <div class="flex items-center gap-2">
                <button type="button" class="attend-chip flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all duration-150 active:scale-[0.98] ${chipCls}">
                    <span class="attend-dot w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${dotCls}">${isP ? EX_SVG : ''}</span>
                    <span class="font-extrabold text-sm flex-1 text-left">${m.name}</span>
                    <span class="attend-district text-[10px] font-bold px-2 py-0.5 rounded-lg ${distCls}">${m.district || ''}</span>
                </button>
                <button type="button" class="w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/20 text-red-400 hover:bg-red-100 border border-red-100 dark:border-red-900/30 transition-all flex-shrink-0" onclick="removeExtra(${m.id})">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="testimony-wrap ${isP ? '' : 'hidden'} px-1 pt-1.5 pb-0.5">
                <input type="text" class="testimony-input w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-[#1b253b] focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-blue-500/30 focus:border-blue-500" placeholder="간증/기록 입력..." value="${test}">
            </div>
        </div>`;
    }).join('');
    list.onclick = (e) => {
        if (e.target.closest('button[onclick]')) return;
        const chip = e.target.closest('.attend-chip');
        if (!chip) return;
        const row = chip.closest('.attendance-row');
        const nowPresent = row.dataset.present !== 'true';
        row.dataset.present = String(nowPresent);
        const dot = chip.querySelector('.attend-dot');
        const dist = chip.querySelector('.attend-district');
        const wrap = row.querySelector('.testimony-wrap');
        const ESVG = `<svg class="w-2.5 h-2.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
        if (nowPresent) {
            chip.classList.remove('bg-white','border-slate-200','text-slate-700'); chip.classList.add('bg-emerald-600','border-emerald-600','text-white');
            dot.classList.remove('border-slate-300','opacity-50'); dot.classList.add('bg-white','border-white'); dot.innerHTML = ESVG;
            dist.classList.remove('bg-slate-100','text-slate-400'); dist.classList.add('bg-emerald-500/70','text-emerald-50');
            wrap.classList.remove('hidden');
        } else {
            chip.classList.remove('bg-emerald-600','border-emerald-600','text-white'); chip.classList.add('bg-white','border-slate-200','text-slate-700');
            dot.classList.remove('bg-white','border-white'); dot.classList.add('border-slate-300','opacity-50'); dot.innerHTML = '';
            dist.classList.remove('bg-emerald-500/70','text-emerald-50'); dist.classList.add('bg-slate-100','text-slate-400');
            wrap.classList.add('hidden');
        }
    };
}
window.removeExtra = (id) => { extraAttendees = extraAttendees.filter(x => x.id !== id); renderExtras(); };

document.getElementById('saveMeeting').addEventListener('click', async () => {
    // [중복 저장 방지] index.html에서는 이 리스너와 meeting_editor.js의 onclick(handleSaveMeeting)이
    // 같은 버튼에 동시에 바인딩될 수 있다. 모달을 마지막으로 연 모듈(owner)만 저장을 수행한다.
    // (교구전체모임 이중 생성/출석 카운트 오염 버그의 원인)
    if (window.__meetingModalOwner && window.__meetingModalOwner !== 'app') return;

    // 저장 전 입력 중인 주제 태그 텍스트 자동 추가 (모바일에서 엔터 없이 저장하는 경우 대비)
    const tagsInputEl = document.getElementById('meetingSermonTags');
    if (tagsInputEl && tagsInputEl.value) {
        const tagVal = tagsInputEl.value.replace(/[#,\s]/g, '').trim();
        if (tagVal && !currentSermonTagsList.includes(tagVal)) {
            currentSermonTagsList.push(tagVal);
            tagsInputEl.value = '';
            renderSermonTagBadges();
        } else {
            tagsInputEl.value = '';
        }
    }

    const typeCheck = document.getElementById('meetingType').value;
    if (typeCheck === '상담' || typeCheck === '개인상담') {
        if (typeof window.handleSaveCounseling === 'function') { await window.handleSaveCounseling(); return; }
    }

    const title = document.getElementById('meetingTitle').value.trim();
    const date = document.getElementById('meetingDate').value;
    const startTime = document.getElementById('meetingStartTime').value;
    const endTime = document.getElementById('meetingEndTime').value;
    const endDate = document.getElementById('meetingEndDate').value;
    const type = document.getElementById('meetingType').value;
    const sermon = document.getElementById('meetingSermon').value.trim();
    const memo = document.getElementById('meetingMemo').value.trim();
    const sermon_bible = document.getElementById('meetingSermonBible').value.trim();
    const sermon_tags = currentSermonTagsList.map(t => `#${t}`).join(' ');

    const rrule_type = document.getElementById('meetingRecurrence').value;
    const rrule_end_date = document.getElementById('meetingRecurrenceEndDate').value || null;

    if (!title || !date) return alert('제목과 날짜를 입력하세요.');

    // 설교 태그 값 추출 및 결합
    let finalSermon = sermon;
    if (type === '설교') {
        const activeTagBtn = document.querySelector('.sermon-tag.bg-blue-600');
        let tagVal = '';
        if (activeTagBtn) {
            const val = activeTagBtn.getAttribute('data-value');
            if (val === '직접입력') {
                const directTagInput = document.getElementById('directSermonTag');
                tagVal = directTagInput ? directTagInput.value.trim() : '';
            } else {
                tagVal = val;
            }
        }
        if (tagVal) {
            finalSermon = `${sermon} (${tagVal})`;
        }
    }

    const saveAction = async (isSingleOnly = false) => {
        try {
            let finalMemo = memo;
            if (rrule_type && rrule_type !== 'none') {
                const meta = {
                    rrule_type,
                    rrule_end_date,
                    exdates: isSingleOnly ? (currentMeetingData.exdates || null) : (currentMeetingId ? (currentMeetingData.exdates || null) : null)
                };
                finalMemo = `__RECURRING__:${JSON.stringify(meta)}\n${memo}`;
            }

            if (isSingleOnly) {
                // 1. 이 일정만 수정: 부모 일정에 예외 날짜(현재 클릭일) 추가
                let newExdates = currentMeetingData.exdates ? `${currentMeetingData.exdates},${clickedInstanceDate}` : clickedInstanceDate;
                
                const parentMeta = {
                    rrule_type: currentMeetingData.rrule_type,
                    rrule_end_date: currentMeetingData.rrule_end_date,
                    exdates: newExdates
                };
                const parentMemo = `__RECURRING__:${JSON.stringify(parentMeta)}\n${currentMeetingData.memo}`;

                // 부모 일정 업데이트
                await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: currentMeetingData.title,
                        date: currentMeetingData.date,
                        end_date: currentMeetingData.end_date,
                        type: currentMeetingData.type,
                        sermon_title: currentMeetingData.sermon_title,
                        memo: parentMemo,
                        church: currentMeetingData.church,
                        start_time: currentMeetingData.start_time,
                        end_time: currentMeetingData.end_time
                    })
                });

                // 2. 새로운 단일 일정 등록
                const newRes = await fetch('/api/meetings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        date: clickedInstanceDate,
                        end_date: endDate || null,
                        type,
                        sermon_title: finalSermon,
                        memo, // 메타데이터 없는 순수 메모
                        church: selectedChurch,
                        start_time: startTime || null,
                        end_time: endTime || null,
                        sermon_bible,
                        sermon_tags
                    })
                });
                const { id } = await newRes.json();

                const attData = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
                    member_id: parseInt(row.dataset.id),
                    is_present: row.dataset.present === 'true' ? 1 : 0,
                    testimony_snapshot: row.querySelector('.testimony-input').value.trim()
                }));
                await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting_id: id, attendance_data: attData }) });
            } else {
                // 전체 일정 수정 / 등록
                const url = currentMeetingId ? `/api/meetings/${currentMeetingId}` : '/api/meetings';
                const res = await fetch(url, {
                    method: currentMeetingId ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title,
                        date,
                        end_date: endDate || null,
                        type,
                        sermon_title: finalSermon,
                        memo: finalMemo,
                        church: selectedChurch,
                        start_time: startTime || null,
                        end_time: endTime || null,
                        sermon_bible,
                        sermon_tags
                    })
                });
                const { id } = await res.json();
                const mid = currentMeetingId || id;

                const attData = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
                    member_id: parseInt(row.dataset.id),
                    is_present: row.dataset.present === 'true' ? 1 : 0,
                    testimony_snapshot: row.querySelector('.testimony-input').value.trim()
                }));
                await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting_id: mid, attendance_data: attData }) });
            }
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('returnUrl')) {
                window.location.href = urlParams.get('returnUrl');
            } else {
                location.reload();
            }
        } catch (e) { console.error(e); }
    };

    if (currentMeetingId && currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none') {
        openRecurrenceConfirmModal('반복 일정 수정', '이 일정은 반복되는 모임의 일부입니다.<br>어떤 일정을 변경하시겠습니까?', 
            () => saveAction(true),
            () => saveAction(false)
        );
    } else {
        saveAction(false);
    }
});

function closeMeetingPanels() {
    if (window.attConfirmDiscardIfDirty && !window.attConfirmDiscardIfDirty()) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('returnUrl')) {
        window.location.href = urlParams.get('returnUrl');
        return;
    }
    const c = document.getElementById('meetingPanelsContainer');
    if (!c) return;
    c.classList.add('translate-x-full'); c.classList.remove('translate-x-0');
    setTimeout(() => c.classList.add('hidden'), 300);
}

document.getElementById('cancelMeeting').addEventListener('click', closeMeetingPanels);
document.getElementById('closeModal').addEventListener('click', closeMeetingPanels);
document.getElementById('closeDetailPanel').addEventListener('click', closeMeetingPanels);

document.getElementById('deleteMeeting').addEventListener('click', async () => {
    // [중복 삭제 방지] saveMeeting과 동일한 owner 가드
    if (window.__meetingModalOwner && window.__meetingModalOwner !== 'app') return;

    const deleteAction = async (isSingleOnly = false) => {
        try {
            if (isSingleOnly) {
                // 이 일정만 삭제: 부모 일정에 예외 날짜 추가
                let newExdates = currentMeetingData.exdates ? `${currentMeetingData.exdates},${clickedInstanceDate}` : clickedInstanceDate;
                
                const parentMeta = {
                    rrule_type: currentMeetingData.rrule_type,
                    rrule_end_date: currentMeetingData.rrule_end_date,
                    exdates: newExdates
                };
                const parentMemo = `__RECURRING__:${JSON.stringify(parentMeta)}\n${currentMeetingData.memo}`;

                await fetch(`/api/meetings/${currentMeetingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: currentMeetingData.title,
                        date: currentMeetingData.date,
                        end_date: currentMeetingData.end_date,
                        type: currentMeetingData.type,
                        sermon_title: currentMeetingData.sermon_title,
                        memo: parentMemo,
                        church: currentMeetingData.church,
                        start_time: currentMeetingData.start_time,
                        end_time: currentMeetingData.end_time
                    })
                });
            } else {
                // 전체 삭제
                await fetch(`/api/meetings/${currentMeetingId}`, { method: 'DELETE' });
            }
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('returnUrl')) {
                window.location.href = urlParams.get('returnUrl');
            } else {
                location.reload();
            }
        } catch (e) { console.error(e); }
    };

    if (currentMeetingId && currentMeetingData && currentMeetingData.rrule_type && currentMeetingData.rrule_type !== 'none') {
        openRecurrenceConfirmModal('반복 일정 삭제', '이 일정은 반복되는 모임의 일부입니다.<br>어떤 일정을 삭제하시겠습니까?', 
            () => deleteAction(true),
            () => deleteAction(false)
        );
    } else {
        if (confirm('정말로 삭제하시겠습니까?')) {
            deleteAction(false);
        }
    }
});

function openRecurrenceConfirmModal(title, desc, onSingle, onAll) {
    const modal = document.getElementById('recurrenceConfirmModal');
    const titleEl = document.getElementById('recurrenceModalTitle');
    const descEl = document.getElementById('recurrenceModalDesc');
    const btnSingle = document.getElementById('recurrenceActionSingle');
    const btnAll = document.getElementById('recurrenceActionAll');
    const btnCancel = document.getElementById('recurrenceActionCancel');
    
    titleEl.textContent = title;
    descEl.innerHTML = desc;
    
    if (title.includes('삭제')) {
        btnSingle.textContent = '이 일정만 삭제';
        btnAll.textContent = '전체 일정 삭제';
    } else {
        btnSingle.textContent = '이 일정만 적용';
        btnAll.textContent = '전체 일정 적용';
    }

    modal.classList.remove('hidden');
    
    btnSingle.onclick = () => {
        modal.classList.add('hidden');
        onSingle();
    };
    btnAll.onclick = () => {
        modal.classList.add('hidden');
        onAll();
    };
    btnCancel.onclick = () => {
        modal.classList.add('hidden');
    };
}

// Extra member search logic
document.getElementById('openExtraMemberSearch').addEventListener('click', () => document.getElementById('extraMemberSearchModal').classList.remove('hidden'));
document.getElementById('closeExtraMemberModal').addEventListener('click', () => document.getElementById('extraMemberSearchModal').classList.add('hidden'));
document.getElementById('extraMemberSearchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if (q.length < 1) return;
    const res = await fetch(`/api/members/search?q=${encodeURIComponent(q)}&status=active`); const ms = await res.json();
    document.getElementById('extraSearchResults').innerHTML = ms.map(m => `<div class="p-3 bg-white dark:bg-slate-800 border dark:border-slate-700/80 rounded hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer font-bold dark:text-slate-200" onclick="addExtraAttendee(${m.id}, '${m.name}', '${m.district}')">${m.name} (${m.district})</div>`).join('');
});
window.addExtraAttendee = (id, name, district) => {
    if (!extraAttendees.some(x => x.id === id)) { extraAttendees.push({ id, name, district, is_present: true, testimony_snapshot: '' }); renderExtras(); }
    document.getElementById('extraMemberSearchModal').classList.add('hidden'); document.getElementById('extraMemberSearchInput').value = '';
};

// 설교 태그 활성화 상태 업데이트 함수
function updateSermonTagActiveState(tagVal) {
    const tags = document.querySelectorAll('.sermon-tag');
    let matched = false;
    
    tags.forEach(tag => {
        const val = tag.getAttribute('data-value');
        if (val !== '직접입력' && val === tagVal) {
            tag.classList.remove('bg-slate-100', 'text-slate-800');
            tag.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            matched = true;
        } else {
            tag.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            tag.classList.add('bg-slate-100', 'text-slate-800');
        }
    });

    const directInputTag = Array.from(tags).find(t => t.getAttribute('data-value') === '직접입력');
    const directTagField = document.getElementById('directSermonTagField');
    const directTagInput = document.getElementById('directSermonTag');

    if (directInputTag) {
        if (tagVal === '직접입력' || (!matched && tagVal && tagVal.trim() !== '')) {
            directInputTag.classList.remove('bg-slate-100', 'text-slate-800');
            directInputTag.classList.add('bg-blue-600', 'text-white', 'border-blue-600');
            if (directTagField) directTagField.classList.remove('hidden');
            if (directTagInput && tagVal !== '직접입력') directTagInput.value = tagVal;
        } else {
            directInputTag.classList.remove('bg-blue-600', 'text-white', 'border-blue-600');
            directInputTag.classList.add('bg-slate-100', 'text-slate-800');
            if (directTagField) directTagField.classList.add('hidden');
            if (directTagInput && !tagVal) directTagInput.value = '';
        }
    }
}

// 설교 태그 이벤트 초기화
function initSermonTags() {
    const tagsContainer = document.getElementById('sermonTagsList');
    if (!tagsContainer) return;
    
    tagsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.sermon-tag');
        if (!btn) return;
        
        const val = btn.getAttribute('data-value');
        const directTagField = document.getElementById('directSermonTagField');
        const directTagInput = document.getElementById('directSermonTag');
        
        if (val === '직접입력') {
            if (directTagField) directTagField.classList.remove('hidden');
            if (directTagInput) {
                directTagInput.value = '';
                directTagInput.focus();
            }
            updateSermonTagActiveState('직접입력');
        } else {
            if (directTagField) directTagField.classList.add('hidden');
            updateSermonTagActiveState(val);
        }
    });
}

// 스크립트 로드 시 즉시 초기화
initSermonTags();
