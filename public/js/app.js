window.onerror = function(message, source, lineno, colno, error) {
    alert("자바스크립트 오류: " + message + " (라인: " + lineno + ")");
    return false;
};

document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');

    function injectTimeGuides() {
        const cols = document.querySelectorAll('.fc-timegrid-col');
        if (cols.length === 0) return;
        
        cols.forEach(colEl => {
            // data-date 속성이 없으면 요일 시간 컬럼이 아니므로(제일 왼쪽 시간 축 등) 건너뜀
            if (!colEl.hasAttribute('data-date')) return;
            
            if (colEl.querySelector('.custom-time-guide-container')) return;
            
            // td 엘리먼트 자체를 기준으로 강제 relative 정렬 지정
            colEl.style.position = 'relative';
            
            const startHour = 5;
            const endHour = 24;
            const totalMinutes = (endHour - startHour) * 60;
            
            const container = document.createElement('div');
            container.className = 'custom-time-guide-container';
            container.style.position = 'absolute';
            container.style.inset = '0';
            container.style.pointerEvents = 'none';
            container.style.userSelect = 'none';
            container.style.overflow = 'hidden';
            container.style.zIndex = '0';
            
            for (let h = startHour; h < endHour; h++) {
                const currentMinutes = (h - startHour) * 60;
                const topPercent = (currentMinutes / totalMinutes) * 100;
                
                const timeStr = String(h).padStart(2, '0');
                const label = document.createElement('div');
                label.style.position = 'absolute';
                label.style.left = '10px';
                label.style.fontSize = '11px';
                label.style.color = 'rgba(100, 116, 139, 0.15)'; // 다소 연하게
                label.style.fontWeight = '600';
                label.style.top = `${topPercent}%`;
                label.style.transform = 'translateY(-50%)';
                label.textContent = timeStr;
                container.appendChild(label);
            }
            colEl.appendChild(container); // td에 직접 추가하여 위치 오프셋 방지
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
        eventOrder: ['order', 'start_time', 'title'],
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
            
            openMeetingModal(null, startDate, '', '581구역모임', '', '', '', endDateVal, startTimeVal, endTimeVal);
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
                const meetings = await res.json();
                successCallback(meetings.map(m => {
                    const t = m.type || '';
                    let bg, tc, br;
                    let ord = 1;
                    if (t.includes('조모임')) { bg = '#fce7f3'; tc = '#831843'; br = '#fbcfe8'; }
                    else if (t.includes('구역모임')) { bg = '#ffedd5'; tc = '#7c2d12'; br = '#fed7aa'; }
                    else if (t.includes('교구')) { bg = '#e0f2fe'; tc = '#1e3a8a'; br = '#bae6fd'; }
                    else if (t.includes('심방')) { bg = '#f0fdfa'; tc = '#134e4a'; br = '#ccfbf1'; }
                    else if (t.includes('교회행사')) { bg = '#f3e8ff'; tc = '#6b21a8'; br = '#e9d5ff'; }
                    else if (t.includes('구원기념일')) { bg = 'transparent'; tc = '#0f172a'; br = 'transparent'; ord = 2; }
                    else { bg = '#f3f4f6'; tc = '#111827'; br = '#e5e7eb'; }
                    
                    let startVal = m.date;
                    if (m.start_time) {
                        startVal = `${m.date}T${m.start_time}:00`;
                    }
                    
                    let endVal = m.end_date ? addOneDay(m.end_date) : undefined;
                    if (m.start_time && m.end_time) {
                        endVal = `${m.end_date || m.date}T${m.end_time}:00`;
                    }

                    return { 
                        ...m, 
                        start: startVal, 
                        end: endVal, 
                        backgroundColor: bg, 
                        textColor: tc, 
                        borderColor: br,
                        order: ord,
                        classNames: t.includes('구원기념일') ? ['salvation-event'] : []
                    };
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
            return { html: `<div class="p-1 overflow-hidden"><div class="font-bold text-[13px] truncate">${timePrefix}${arg.event.title}${(type === '설교' || type === '외부설교' || type === '교회행사' || type === '구원기념일') ? '' : ` (${count})`}</div>${subtext}</div>` };
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
            
            openMeetingModal(null, clickedDate, '', '581구역모임', '', '', '', '', clickedTime, endTimeVal);
        },
        eventClick: (info) => {
            const id = info.event.id;
            if (id && id.toString().startsWith('salvation-')) {
                const memberId = id.split('-')[1];
                if (typeof openMemberHistoryModal === 'function') {
                    openMemberHistoryModal(memberId);
                }
                return;
            }
            showMeetingDetail(id, info.event.startStr.split('T')[0], info.event.title, info.event.extendedProps.type, info.event.extendedProps.sermon_title, info.event.extendedProps.memo, info.event.extendedProps.church, info.event.extendedProps.start_time, info.event.extendedProps.end_time);
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

    const getDC = (d) => {
        if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
        if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
        if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
        return 'bg-amber-100 text-amber-800 border-amber-200';
    };

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
                const ps = (m.position || '').split(',').filter(p=>p.trim()).map(p => `<span class="bg-yellow-100 text-yellow-800 text-[9px] px-1 py-0.5 rounded border border-yellow-200 font-black ml-0.5">${p}</span>`).join('');
                return `<div class="p-3 border rounded-xl hover:bg-blue-50 cursor-pointer transition member-item shadow-sm bg-white mb-2" data-id="${m.id}"><div class="flex justify-between items-start mb-1"><div><span class="font-bold text-blue-800 text-[16px]">${m.name}</span><span class="text-[11px] text-gray-400 ml-1">(${age}세)</span>${ps}</div><div class="text-[10px] font-bold px-1.5 py-0.5 rounded ${m.bs === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}">${m.bs || '-'}</div></div><div class="text-[12px] text-gray-600 font-bold"><span class="${getDC(m.district)} px-1.5 py-0.5 rounded-full border text-[10px] mr-1">${m.district || ''}</span>${m.category || ''}</div>${m.family_relation ? `<div class="text-[11px] text-gray-400 mt-1 truncate">가족: ${m.family_relation}</div>` : ''}</div>`;
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

    function calculateAge(birthYear) {
        if (!birthYear) return '-';
        const year = parseInt(birthYear);
        return isNaN(year) ? '-' : (2026 - year + 1);
    }

    window.openMemberHistoryModal = async function(id) {
        try {
            // 탭 상태 리셋 (출석 탭 활성화)
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="attendance"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const res = await fetch(`/api/members/${id}/history`); const { member, history, family } = await res.json(); currentMemberData = member;
            
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
                member.church ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">${member.church}</span>` : '',
                member.parish ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">${member.parish}</span>` : '',
                member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
                member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
                member.marital_status ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">${member.marital_status}</span>` : '',
                ...calculatedPosArray.map(p => `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${p}</span>`)
            ].filter(x => x).join(' ');

            document.getElementById('memberBasicInfo').innerHTML = `
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
            const filteredHistory = history.filter(h => h.type !== '심방' && h.type !== '설교' && h.type !== '외부설교' && h.date <= today);
            
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
                                        <th class="p-3.5 w-[110px] border-r">날짜</th>
                                        <th class="p-3.5 min-w-[150px] border-r">모임정보</th>
                                        <th class="p-3.5 text-center w-[90px] border-r">출석 여부</th>
                                        <th class="p-3.5">간증 스냅샷</th>
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
    }

    window.deleteRecord = async (id) => { if (confirm('삭제할까요?')) { try { await fetch(`/api/members/records/${id}`, { method: 'DELETE' }); openMemberHistoryModal(currentMemberData.id); } catch (e) { console.error(e); } } };

    const RECORD_STATUS_MAP = { 'DISTRICT': '구역 변경', 'CATEGORY': '소속 변경', 'POSITION': '직분 임명', 'POSITION_DISMISS': '직분 면직', 'SERVICE': '봉사 임무', 'SERVICE_DISMISS': '봉사 면직', 'FELLOWSHIP': '교제 상태', 'TRANSFER': '전입/전출', 'CHURCH_IN': '교회 전입', 'CHURCH_MOVE': '교회 이동', 'PARISH_MOVE': '교구 이동', 'ETC': '기타' };

    const familySearchInput = document.getElementById('familySearchInput');
    const btnSearchFamily = document.getElementById('btnSearchFamily');
    const familySearchModal = document.getElementById('familySearchModal');
    const familySearchResultList = document.getElementById('familySearchResultList');
    const familyRelationText = document.getElementById('familyRelationText');
    const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
    const hiddenFamilyId = document.getElementById('hiddenFamilyId');
    let pendingRelationData = null;

    function updateFamilyUI() {
        const linkedFamilyContainer = document.getElementById('linkedFamilyContainer');
        const familyRelationText = document.getElementById('familyRelationText');
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
        const familyRelationText = document.getElementById('familyRelationText');
        const currentText = familyRelationText.value.trim();
        const entries = currentText.split(',').map(n => n.trim()).filter(n => n);
        familyRelationText.value = entries.filter(e => e !== entry).join(', ');
        const nameMatch = entry.match(/^(.+?)\(/);
        if (window._sessionLinkedNames) window._sessionLinkedNames.delete(nameMatch ? nameMatch[1].trim() : entry.trim());
        updateFamilyUI();
    };

    async function handleFamilySearchOrAdd() {
        const familySearchInput = document.getElementById('familySearchInput');
        const familySearchResultList = document.getElementById('familySearchResultList');
        const familySearchModal = document.getElementById('familySearchModal');
        
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
        document.getElementById('familySearchModal').classList.add('hidden');
        document.getElementById('familyRelationSelectModal').classList.remove('hidden');
    };

    window.confirmRelation = function(type) {
        if (!pendingRelationData) return;
        const familyRelationText = document.getElementById('familyRelationText');
        const hiddenFamilyId = document.getElementById('hiddenFamilyId');
        
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

    if (document.getElementById('btnSearchFamily')) document.getElementById('btnSearchFamily').addEventListener('click', handleFamilySearchOrAdd);
    if (document.getElementById('familySearchInput')) document.getElementById('familySearchInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); handleFamilySearchOrAdd(); } });

    const recordStatus = document.getElementById('recordStatus');
    const recordRemark = document.getElementById('recordRemark');
    const recordDate = document.getElementById('recordDate');
    const addRecordBtn = document.getElementById('addRecordBtn');

    window.deleteRecordFromModal = async function(recordId, memberId) {
        if (!confirm('이 기록을 정말 삭제하시겠습니까?')) return;
        
        if (memberId && memberId !== 'null') {
            // 서버에 저장된 기록 삭제
            try {
                const res = await fetch(`/api/members/records/${recordId}`, { method: 'DELETE' });
                if (res.ok) {
                    const r = await fetch(`/api/members/${memberId}/records`);
                    const newRecs = await r.json();
                    renderEditModalRecords(newRecs);
                    if (typeof loadData === 'function') loadData();
                    else if (typeof loadMemberList === 'function') loadMemberList();
                }
            } catch (e) { console.error(e); }
        } else {
            // 새 성도 등록 시 임시 기록 목록에서 삭제
            pendingRecords = pendingRecords.filter((_, idx) => idx !== parseInt(recordId));
            renderEditModalRecords(pendingRecords);
        }
    };

    function renderEditModalRecords(recs) {
        const b = document.getElementById('editModalRecordTableBody'); if (!b) return;
        const mid = currentMemberData ? currentMemberData.id : 'null';
        b.innerHTML = recs.length ? recs.map((r, idx) => `
            <tr class="text-[12px] border-b hover:bg-gray-50 transition">
                <td class="p-2 text-gray-500">${r.date}</td>
                <td class="p-2 font-bold text-blue-700">${RECORD_STATUS_MAP[r.status] || r.status}</td>
                <td class="p-2 text-gray-700 text-[11px]">${r.remark || ''}</td>
                <td class="p-2 text-right">
                    <button type="button" class="text-red-400 hover:text-red-600 font-bold p-1 transition" onclick="deleteRecordFromModal(${currentMemberData ? r.id : idx}, ${mid})">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            </tr>
        `).join('') : '<tr><td colspan="4" class="p-4 text-center text-gray-400 text-xs italic">없음</td></tr>';
    }

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

        // --- 교회 & 교구 동적 바인딩 로직 ---
        const churchSelect = memberAddForm.querySelector('select[name="church"]');
        const parishSelect = memberAddForm.querySelector('select[name="parish"]');

        const loadParishes = async (churchId, selectVal = null) => {
            if (!churchId) {
                parishSelect.innerHTML = '<option value="">교구 선택</option>';
                return;
            }
            try {
                const res = await fetch(`/api/parishes?church_id=${churchId}`);
                const parishes = await res.json();
                parishSelect.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
                if (selectVal) {
                    parishSelect.value = selectVal;
                }
            } catch (e) {
                console.error('Failed to load parishes:', e);
            }
        };

        const loadChurchesAndInit = async () => {
            try {
                const res = await fetch('/api/churches/all');
                const churches = await res.json();
                churchSelect.innerHTML = '<option value="">교회 선택</option>' + churches.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name}</option>`).join('');
                
                if (isEdit && currentMemberData) {
                    churchSelect.value = currentMemberData.church || '';
                    const selectedOpt = churchSelect.options[churchSelect.selectedIndex];
                    const churchId = selectedOpt ? selectedOpt.getAttribute('data-id') : null;
                    await loadParishes(churchId, currentMemberData.parish);
                } else {
                    const activeChurchSelect = document.getElementById('headerChurchSelect');
                    if (activeChurchSelect) {
                        churchSelect.value = activeChurchSelect.value || '';
                        const selectedOpt = churchSelect.options[churchSelect.selectedIndex];
                        const churchId = selectedOpt ? selectedOpt.getAttribute('data-id') : null;
                        
                        const activeParishName = getSelectedParishName();
                        await loadParishes(churchId, activeParishName);
                    }
                }
            } catch (e) {
                console.error('Failed to load churches:', e);
            }
        };

        churchSelect.onchange = async () => {
            const selectedOpt = churchSelect.options[churchSelect.selectedIndex];
            const churchId = selectedOpt ? selectedOpt.getAttribute('data-id') : null;
            await loadParishes(churchId);
        };

        await loadChurchesAndInit();

        if (!isEdit) {
            currentMemberData = null;
            memberAddForm.reset();
            await loadChurchesAndInit(); // reset 이후 기본값 재설정
            if (sec) sec.classList.remove('hidden');
            if (deleteMemberFullyBtn) deleteMemberFullyBtn.classList.add('hidden');
            window._sessionLinkedNames = new Set();
            updateFamilyUI();
            if (recordDate) recordDate.value = new Date().toISOString().split('T')[0];
        }
        else {
            const ipts = memberAddForm.querySelectorAll('input, select, textarea');
            ipts.forEach(i => {
                if (i.name === 'church' || i.name === 'parish') return;
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

    document.getElementById('editMemberBtn').addEventListener('click', () => { memberHistoryModal.classList.add('hidden'); openAddModal(true); });
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
                    if (typeof loadMemberList === 'function') loadMemberList();
                } else {
                    alert('처리에 실패하였습니다.');
                }
            } catch (e) {
                console.error(e);
                alert('에러가 발생했습니다.');
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
                    loadMemberList();
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

    // --- Sidebar Toggle Logic (Mobile & iPad/PC) ---
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebar');
    
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', () => {
            sidebar.classList.toggle('closed');
            // Trigger FullCalendar resize after transition completes (300ms)
            setTimeout(() => {
                if (typeof calendar !== 'undefined' && calendar.updateSize) {
                    calendar.updateSize();
                }
            }, 310);
        });
    }
    if (closeSidebarBtn && sidebar) {
        closeSidebarBtn.addEventListener('click', () => {
            sidebar.classList.add('closed');
            setTimeout(() => {
                if (typeof calendar !== 'undefined' && calendar.updateSize) {
                    calendar.updateSize();
                }
            }, 310);
        });
    }



    async function setupOrgSelectors(container, status) {
        const churches = await fetchChurches();
        container.innerHTML = `
            <div class="flex flex-col gap-2">
                <select id="subChurch" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white">
                    <option value="">교회 선택</option>
                    ${churches.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                </select>
                <select id="subParish" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden">
                    <option value="">교구 선택</option>
                </select>
                <select id="subDistrict" class="w-full border rounded px-3 py-2 text-sm font-bold text-blue-800 bg-white hidden">
                    <option value="">구역 선택</option>
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
                subParish.innerHTML = '<option value="">교구 선택</option>' + parishes.map(p => `<option value="${p.id}" data-name="${p.name}">${p.name}</option>`).join('');
                subParish.classList.remove('hidden');
            } else {
                subParish.innerHTML = '<option value="none">교구 정보 없음</option>';
                subParish.classList.remove('hidden');
            }
            subDistrict.classList.add('hidden');
        });

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
        
        if (status === 'CHURCH_MOVE') {
            subParish.classList.add('hidden');
            subDistrict.classList.add('hidden');
        }
    }

    if (addRecordBtn) {
        addRecordBtn.addEventListener('click', async () => {
            const date = recordDate.value, statusKey = recordStatus.value;
            let remark = recordRemark.value.trim();
            
            // 구역, 소속 또는 직분/봉사 변경인 경우 선택된 값을 remark로 사용
            if (statusKey === 'DISTRICT') {
                const subDist = document.getElementById('recordSubDistrict');
                if (subDist) remark = subDist.value;
            } else if (statusKey === 'CATEGORY') {
                const subCat = document.getElementById('recordSubCategory');
                if (subCat) remark = subCat.value;
            } else if (statusKey === 'SERVICE') {
                const checked = Array.from(document.querySelectorAll('.record-sub-svc:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('봉사 항목을 최소 하나 이상 선택하세요.');
            } else if (statusKey === 'POSITION' || statusKey === 'POSITION_DISMISS') {
                const checked = Array.from(document.querySelectorAll('.record-sub-pos:checked')).map(cb => cb.value);
                if (checked.length > 0) remark = checked.join(', ');
                else return alert('직분을 최소 하나 이상 선택하세요.');
            } else if (statusKey === 'CHURCH_IN') {
                const c = document.getElementById('subChurch'), p = document.getElementById('subParish'), d = document.getElementById('subDistrict');
                const cName = c ? (c.options[c.selectedIndex]?.text || '') : '', pName = p ? (p.options[p.selectedIndex]?.text || '') : '', dName = d ? (d.options[d.selectedIndex]?.text || '') : '';
                if (!cName || cName === '교회 선택') return alert('교회를 선택하세요.');
                remark = `${cName}${pName && pName !== '교구 선택' && pName !== '교구 정보 없음' ? ' > ' + pName : ''}${dName && dName !== '구역 선택' && dName !== '구역 정보 없음' ? ' > ' + dName : ''}`;
            } else if (statusKey === 'CHURCH_MOVE') {
                const c = document.getElementById('subChurch'), p = document.getElementById('subParish'), d = document.getElementById('subDistrict');
                const cName = c ? (c.options[c.selectedIndex]?.text || '') : '', pName = p ? (p.options[p.selectedIndex]?.text || '') : '', dName = d ? (d.options[d.selectedIndex]?.text || '') : '';
                if (!cName || cName === '교회 선택') return alert('이동할 교회를 선택하세요.');
                if (cName === '서울중앙교회') {
                    remark = `${cName}${pName && pName !== '교구 선택' && pName !== '교구 정보 없음' ? ' > ' + pName : ''}${dName && dName !== '구역 선택' && dName !== '구역 정보 없음' ? ' > ' + dName : ''}`;
                } else {
                    remark = cName;
                }
            } else if (statusKey === 'PARISH_MOVE') {
                const p = document.getElementById('subParish');
                remark = p ? (p.options[p.selectedIndex]?.text || '') : '';
                if (!remark || remark === '교구 선택' || remark === '교구 정보 없음') return alert('이동할 교구를 선택하세요.');
            }

            if (!date || !statusKey || !remark) return;

            if (currentMemberData) {
                // 기존 성도 수정 시: 즉시 서버 저장
                try {
                    const res = await fetch(`/api/members/${currentMemberData.id}/records`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, status: statusKey, remark }) });
                    if (res.ok) { 
                        fetch(`/api/members/${currentMemberData.id}/records`).then(r => r.json()).then(recs => renderEditModalRecords(recs)); 
                        if (typeof loadData === 'function') loadData(); 
                        else if (typeof loadMemberList === 'function') loadMemberList();
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
            } else if (val === 'SERVICE') {
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
        data.crossUpdates = pendingCrossUpdates;
        data.pendingRecords = pendingRecords; // 새 성도용 임시 기록 포함

        try {
            const url = currentMemberData ? `/api/members/${currentMemberData.id}` : '/api/members';
            const res = await fetch(url, { method: currentMemberData ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            if (res.ok) { memberAddModal.classList.add('hidden'); loadMemberList(); if (currentMemberData) openMemberHistoryModal(currentMemberData.id); }
        } catch (e) { console.error(e); }
    });

    document.getElementById('openAddMemberModal').addEventListener('click', () => openAddModal(false));
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

    initHeaderSelectors().then(() => {
        loadMemberList();
    });
});

async function fetchChurches() { const res = await fetch('/api/churches'); return await res.json(); }
async function fetchParishes(churchId) { const res = await fetch(`/api/parishes?church_id=${churchId}`); return await res.json(); }
async function fetchDistricts(parishId) { const res = await fetch(`/api/districts?parish_id=${parishId}`); return await res.json(); }

// Meeting Functions
let currentMeetingId = null, extraAttendees = [], selectedChurch = '';

async function showMeetingDetail(id, date, title, type, sermon, memo, church = '', startTime = '', endTime = '') {
    currentMeetingId = id; const c = document.getElementById('meetingPanelsContainer');
    c.classList.remove('hidden'); setTimeout(() => { c.classList.remove('translate-x-full'); c.classList.add('translate-x-0'); }, 10);
    document.getElementById('meetingDetailPanel').classList.remove('hidden'); document.getElementById('meetingModal').classList.add('hidden');
    document.getElementById('detailTitle').textContent = title;
    let timeStr = startTime;
    if (startTime && endTime) {
        timeStr = `${startTime}~${endTime}`;
    }
    document.getElementById('detailDate').textContent = `${date}${timeStr ? ' ' + timeStr : ''} | ${type}`;
    const res = await fetch(`/api/meetings/${id}/attendance`); const att = await res.json();
    const p = att.filter(a => a.is_present);
    const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());
    
    // 미참석자 계산 로직
    let absentHtml = '';
    const typeStr = type || '';
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
                <div class="mt-6 pt-4 border-t border-dashed">
                    <h4 class="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                    <div class="flex flex-wrap gap-1">
                        ${absentees.map(m => `<span class="px-2 py-1 bg-gray-100 text-gray-500 rounded text-[11px] font-bold">${m.name}</span>`).join('')}
                    </div>
                </div>
            `;
        }
    }

    // 간증 섹션
    let testimonyHtml = '';
    if (pWithTestimony.length > 0) {
        testimonyHtml = `
            <div class="mt-6 pt-4 border-t border-dashed">
                <h4 class="text-[10px] font-black text-blue-700 mb-2 uppercase tracking-wider">간증 (${pWithTestimony.length}명)</h4>
                <div class="space-y-2">
                    ${pWithTestimony.map(a => `
                        <div class="p-2 bg-blue-50 rounded border border-blue-100">
                            <div class="font-bold text-blue-800 text-sm">${a.name}</div>
                            <p class="text-xs text-gray-700 mt-1 pl-2 border-l-2 border-blue-200">${a.testimony_snapshot}</p>
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
                <div class="mb-4 bg-teal-50/50 p-4.5 rounded-xl border border-teal-100/70 shadow-sm">
                    <h4 class="text-[10px] font-black text-teal-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <svg class="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        행사 메모 / 안내 사항
                    </h4>
                    <p class="text-sm text-slate-800 font-semibold whitespace-pre-wrap leading-relaxed">${memo}</p>
                </div>
            `;
        } else {
            detailHTML = `
                <div class="mb-4 bg-slate-50/50 p-4.5 rounded-xl border border-slate-200 text-center">
                    <p class="text-xs text-slate-400 italic py-2">등록된 행사 메모가 없습니다.</p>
                </div>
            `;
        }
    } else {
        detailHTML = `
            <div class="mb-4 bg-white p-4 rounded-xl shadow-sm border flex justify-between items-center">
                <span class="font-bold">총 참석</span>
                <span class="text-2xl font-black text-blue-600">${p.length}명</span>
            </div>
            ${church ? `<div class="mb-4 bg-blue-50 p-4 rounded-xl border border-blue-200"><h4 class="text-[10px] font-black text-blue-700">외부 교회</h4><p class="font-bold">${church}</p></div>` : ''}
            ${sermon ? `<div class="mb-4 bg-yellow-50 p-4 rounded-xl border border-yellow-200"><h4 class="text-[10px] font-black text-yellow-700">설교</h4><p class="font-bold">${sermon}</p></div>` : ''}
            ${memo ? `<div class="mb-4 bg-slate-50 p-4.5 rounded-xl border border-slate-200"><h4 class="text-[10px] font-black text-slate-450 uppercase tracking-wider mb-1">메모</h4><p class="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">${memo}</p></div>` : ''}
            
            <div class="mb-4">
                <h4 class="text-[10px] font-black text-blue-600 mb-2 uppercase tracking-wider">참석자</h4>
                <div class="flex flex-wrap gap-1">
                    ${p.map(a => `<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded text-[11px] font-bold">${a.name}</span>`).join('')}
                </div>
            </div>

            ${absentHtml}
            ${testimonyHtml}
        `;
    }

    document.getElementById('detailContent').innerHTML = detailHTML;
}

document.getElementById('editMeetingDetailBtn').addEventListener('click', async () => {
    const res = await fetch(`/api/meetings`); const ms = await res.json();
    const m = ms.find(x => x.id == currentMeetingId);
    if (m) openMeetingModal(m.id, m.date, m.title, m.type, m.sermon_title, m.memo, m.church, m.end_date, m.start_time, m.end_time);
});

async function openMeetingModal(id, date, title = '', type = '581구역모임', sermon = '', memo = '', church = '', end_date = '', startTime = '', endTime = '') {
    currentMeetingId = id; extraAttendees = [];
    const c = document.getElementById('meetingPanelsContainer');
    c.classList.remove('hidden');
    setTimeout(() => { c.classList.remove('translate-x-full'); c.classList.add('translate-x-0'); }, 10);
    
    document.getElementById('meetingModal').classList.remove('hidden'); 
    document.getElementById('meetingDetailPanel').classList.add('hidden');
    document.getElementById('modalTitle').textContent = id ? '기록 수정' : '신규 일정 등록';
    document.getElementById('meetingTitle').value = title;
    document.getElementById('meetingDate').value = date;
    document.getElementById('meetingEndDate').value = end_date || '';
    document.getElementById('meetingType').value = type;
    document.getElementById('meetingSermon').value = sermon;
    document.getElementById('meetingMemo').value = memo;
    document.getElementById('deleteMeeting').classList.toggle('hidden', !id);

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
    
    // 명단 로드 함수 정의
    const refreshAttendanceList = async () => {
        const currentType = document.getElementById('meetingType').value;
        let targetParams = new URLSearchParams({ status: 'active' });
        
        const endDateField = document.getElementById('meetingEndDateField');
        const dateLabel = document.getElementById('meetingDateLabel');
        const defaultAttSec = document.getElementById('defaultAttendanceSection');
        const extraAttSec = document.getElementById('openExtraMemberSearch')?.closest('.border-t');
        const memoField = document.getElementById('memoField');

        // 교회행사 동적 폼 제어
        if (currentType === '교회행사') {
            if (endDateField) endDateField.classList.remove('hidden');
            if (dateLabel) dateLabel.textContent = '시작일';
            if (defaultAttSec) defaultAttSec.classList.add('hidden');
            if (extraAttSec) extraAttSec.classList.add('hidden');
            if (memoField) memoField.classList.remove('hidden');
            document.getElementById('attendanceList').innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">교회 행사는 참석 체크 대상자가 없습니다.</p>';
            
            const searchSection = document.getElementById('churchSearchSection');
            if (searchSection) {
                searchSection.classList.add('hidden');
                searchSection.style.display = 'none';
            }
            return;
        } else {
            if (endDateField) endDateField.classList.add('hidden');
            if (dateLabel) dateLabel.textContent = '날짜';
            if (defaultAttSec) defaultAttSec.classList.remove('hidden');
            if (extraAttSec) extraAttSec.classList.remove('hidden');
            
            // 다른 타입의 메모 필드 조절
            if (['심방', '외부설교', '기타'].includes(currentType)) {
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
        
        if (currentType.includes('구역모임') || currentType.includes('조모임')) {
            const distMatch = currentType.match(/\d+/);
            if (distMatch) targetParams.append('district', `${distMatch[0]}구역`);
        } else if (currentType === '교구임원모임') {
            targetParams.append('has_position', 'true');
        } else if (currentType.includes('형제모임')) {
            targetParams.append('category', '봉사회');
        } else if (currentType.includes('청년모임')) {
            targetParams.append('category', '청년회');
        } else if (['설교', '외부설교', '심방', '기타'].includes(currentType)) {
            document.getElementById('attendanceList').innerHTML = '<p class="text-gray-400 italic text-xs text-center py-4">대상자가 없습니다. 직접 검색하여 추가해 주세요.</p>';
            if (id) {
                const aRes = await fetch(`/api/meetings/${id}/attendance`);
                const att = await aRes.json();
                extraAttendees = att.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
                renderExtras();
            } else {
                extraAttendees = [];
                renderExtras();
            }
            return;
        }

        const mRes = await fetch(`/api/members/search?${targetParams.toString()}`);
        let members = await mRes.json();

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
            const isP = a ? a.is_present : false;
            const test = a ? (a.testimony_snapshot || '') : '';
            return `<div class="attendance-row p-3 bg-white border rounded-xl flex flex-col gap-2 shadow-sm" data-id="${m.id}">
                <div class="flex items-center gap-3">
                    <input type="checkbox" class="w-5 h-5 rounded is-present-check" ${isP ? 'checked' : ''}>
                    <span class="font-bold text-gray-800">${m.name}</span>
                    <span class="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">${m.district}</span>
                </div>
                <input type="text" class="testimony-input w-full border rounded px-3 py-1.5 text-xs" placeholder="간증/기록 입력..." value="${test}">
            </div>`;
        };

        document.getElementById('attendanceList').innerHTML = members.map(renderRow).join('');
        
        // 기존 검색 추가 인원 복구 (수정 시 - 실제 출석했던 추가 인원만 복구)
        if (id) {
            const memberIds = members.map(m => m.id);
            const extras = att.filter(a => !memberIds.includes(a.member_id) && a.is_present === 1);
            extraAttendees = extras.map(e => ({ id: e.member_id, name: e.name, district: e.district, is_present: e.is_present, testimony_snapshot: e.testimony_snapshot }));
            renderExtras();
        } else {
            renderExtras(); // 신규 시 비우기
        }
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
    if (!extraAttendees.length) { list.innerHTML = '<p class="text-gray-400 italic text-xs text-center py-2">없음</p>'; return; }
    list.innerHTML = extraAttendees.map(m => `<div class="attendance-row p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex flex-col gap-2 shadow-sm" data-id="${m.id}" data-extra="true">
        <div class="flex items-center gap-3">
            <input type="checkbox" class="w-5 h-5 rounded is-present-check" ${m.is_present ? 'checked' : ''}>
            <span class="font-bold text-emerald-900">${m.name}</span>
            <span class="text-[10px] bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-600">${m.district || ''}</span>
            <button class="ml-auto text-red-400 text-xs" onclick="removeExtra(${m.id})">삭제</button>
        </div>
        <input type="text" class="testimony-input w-full border rounded px-3 py-1.5 text-xs" placeholder="간증/기록 입력..." value="${m.testimony_snapshot || ''}">
    </div>`).join('');
}
window.removeExtra = (id) => { extraAttendees = extraAttendees.filter(x => x.id !== id); renderExtras(); };

document.getElementById('saveMeeting').addEventListener('click', async () => {
    const title = document.getElementById('meetingTitle').value.trim();
    const date = document.getElementById('meetingDate').value;
    const startTime = document.getElementById('meetingStartTime').value;
    const endTime = document.getElementById('meetingEndTime').value;
    const endDate = document.getElementById('meetingEndDate').value;
    const type = document.getElementById('meetingType').value;
    const sermon = document.getElementById('meetingSermon').value.trim();
    const memo = document.getElementById('meetingMemo').value.trim();
    if (!title || !date) return alert('제목과 날짜를 입력하세요.');

    try {
        const url = currentMeetingId ? `/api/meetings/${currentMeetingId}` : '/api/meetings';
        const res = await fetch(url, { method: currentMeetingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, date, end_date: endDate || null, type, sermon_title: sermon, memo, church: selectedChurch, start_time: startTime || null, end_time: endTime || null }) });
        const { id } = await res.json();
        const mid = currentMeetingId || id;

        const attData = Array.from(document.querySelectorAll('.attendance-row')).map(row => ({
            member_id: parseInt(row.dataset.id),
            is_present: row.querySelector('.is-present-check').checked ? 1 : 0,
            testimony_snapshot: row.querySelector('.testimony-input').value.trim()
        }));

        await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meeting_id: mid, attendance_data: attData }) });
        location.reload();
    } catch (e) { console.error(e); }
});

function closeMeetingPanels() {
    const c = document.getElementById('meetingPanelsContainer');
    if (!c) return;
    c.classList.add('translate-x-full'); c.classList.remove('translate-x-0');
    setTimeout(() => c.classList.add('hidden'), 300);
}

document.getElementById('cancelMeeting').addEventListener('click', closeMeetingPanels);
document.getElementById('closeModal').addEventListener('click', closeMeetingPanels);
document.getElementById('closeDetailPanel').addEventListener('click', closeMeetingPanels);
document.getElementById('deleteMeeting').addEventListener('click', async () => { if (confirm('삭제할까요?')) { await fetch(`/api/meetings/${currentMeetingId}`, { method: 'DELETE' }); location.reload(); } });

// Extra member search logic
document.getElementById('openExtraMemberSearch').addEventListener('click', () => document.getElementById('extraMemberSearchModal').classList.remove('hidden'));
document.getElementById('closeExtraMemberModal').addEventListener('click', () => document.getElementById('extraMemberSearchModal').classList.add('hidden'));
document.getElementById('extraMemberSearchInput').addEventListener('input', async (e) => {
    const q = e.target.value.trim(); if (q.length < 1) return;
    const res = await fetch(`/api/members/search?q=${encodeURIComponent(q)}&status=active`); const ms = await res.json();
    document.getElementById('extraSearchResults').innerHTML = ms.map(m => `<div class="p-3 bg-white border rounded hover:bg-blue-50 cursor-pointer font-bold" onclick="addExtraAttendee(${m.id}, '${m.name}', '${m.district}')">${m.name} (${m.district})</div>`).join('');
});
window.addExtraAttendee = (id, name, district) => {
    if (!extraAttendees.some(x => x.id === id)) { extraAttendees.push({ id, name, district, is_present: true, testimony_snapshot: '' }); renderExtras(); }
    document.getElementById('extraMemberSearchModal').classList.add('hidden'); document.getElementById('extraMemberSearchInput').value = '';
};
