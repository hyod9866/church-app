document.addEventListener('DOMContentLoaded', () => {
    function sortFamilyRelations(relationsArray) {
        const priority = (entry) => {
            const match = entry.match(/\(([^)]+)\)/);
            if (!match) return 999;
            const rel = match[1].trim();
            if (rel.includes('아내') || rel.includes('남편') || rel.includes('배우자') || rel.includes('부부')) return 1;
            if (rel.includes('자녀') || rel.includes('아들') || rel.includes('딸')) return 2;
            if (rel.includes('부모') || rel.includes('아버지') || rel.includes('어머니') || rel.includes('아빠') || rel.includes('엄마')) return 3;
            if (rel.includes('기타')) return 4;
            return 5;
        };
        return [...relationsArray].sort((a, b) => priority(a) - priority(b));
    }

    const visitationList = document.getElementById('visitationList');
    const districtFilter = document.getElementById('districtFilter');
    const sortOption = document.getElementById('sortOption');
    const visitationCount = document.getElementById('visitationCount');

    let allStatus = [];
    let currentMemberData = null;

    async function loadStatus() {
        try {
            const response = await fetch('/api/visitation/status');
            allStatus = await response.json();
            applyFilters();
        } catch (error) {
            console.error('Error loading visitation status:', error);
            visitationList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const district = districtFilter.value;
        const sort = sortOption.value;

        let filtered = allStatus.filter(s => {
            if (district === '전체') return true;
            const memberDistNum = String(s.district || '').replace(/[^0-9]/g, '');
            const filterDistNum = String(district).replace(/[^0-9]/g, '');
            return memberDistNum === filterDistNum && memberDistNum !== '';
        });

        // Sorting
        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'last_visitation') {
                if (!a.last_visitation) return 1;
                if (!b.last_visitation) return -1;
                return new Date(b.last_visitation) - new Date(a.last_visitation);
            }
            if (sort === 'oldest') {
                if (!a.last_visitation) return -1;
                if (!b.last_visitation) return 1;
                return new Date(a.last_visitation) - new Date(b.last_visitation);
            }
            if (sort === 'visited_first') {
                if (a.last_visitation && !b.last_visitation) return -1;
                if (!a.last_visitation && b.last_visitation) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sort === 'not_visited_first') {
                if (!a.last_visitation && b.last_visitation) return -1;
                if (a.last_visitation && !b.last_visitation) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sort === 'count') return b.total_count - a.total_count;
            return 0;
        });

        renderList(filtered);
    }

    function renderList(data) {
        visitationCount.textContent = `총 ${data.length}명 관리 중`;
        
        if (data.length === 0) {
            visitationList.innerHTML = '<p class="text-gray-500 text-center py-20 font-medium">조회된 성도가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        visitationList.innerHTML = data.map(member => {
            let statusHtml = '';
            let detailHtml = '';
            let daysDiff = null;

            if (member.last_visitation) {
                const lastDate = new Date(member.last_visitation);
                lastDate.setHours(0, 0, 0, 0);
                daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                
                const isLastCounseling = member.last_type === '상담';
                const textColor = isLastCounseling ? 'text-indigo-600' : 'text-teal-600';
                const bgBadge = isLastCounseling ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-teal-50 text-teal-600 border-teal-100';
                const typeText = isLastCounseling ? '상담' : '심방';

                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="${textColor} font-bold text-sm">${member.last_visitation}</span>
                        <span class="text-[10px] ${bgBadge} px-2 py-0.5 rounded border font-bold">${daysDiff}일 전(${typeText})</span>
                    </div>
                `;

                if (member.last_sermon || member.last_memo) {
                    detailHtml = `
                        <div class="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                            ${member.last_sermon ? `<div class="font-bold text-gray-700 mb-0.5">ㆍ${member.last_sermon}</div>` : ''}
                            ${member.last_memo ? `<div class="text-gray-500 italic">📝 ${member.last_memo}</div>` : ''}
                        </div>
                    `;
                }
            } else {
                statusHtml = `<span class="text-red-400 font-bold text-sm italic">심방/상담 기록 없음</span>`;
            }

            const displayDistrict = member.district ? (String(member.district).includes('구역') ? member.district : member.district + '구역') : '구역 미정';

            return `
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex items-start p-4 hover:border-blue-300 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg font-black text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">${displayDistrict} | ${member.category}</span>
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${statusHtml}
                        ${detailHtml}
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 <span class="text-blue-600">${member.total_count}</span>회</div>
                        <div class="flex flex-col gap-1">
                            <button onclick="openRecordPanel(${member.id}, '${member.name}', '심방')" 
                                    class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white transition-colors whitespace-nowrap">
                                심방 기록
                            </button>
                            <button onclick="openRecordPanel(${member.id}, '${member.name}', '상담')" 
                                    class="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white transition-colors whitespace-nowrap">
                                상담 기록
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    districtFilter.addEventListener('change', applyFilters);
    sortOption.addEventListener('change', applyFilters);

    // --- Member Detail Modal Logic (Read-Only) ---
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

    function calculateAge(birthYear) {
        if (!birthYear) return '-';
        const year = parseInt(birthYear);
        return isNaN(year) ? '-' : (2026 - year + 1);
    }

    function getDC(d) {
        if (!d || d === '-') return 'bg-gray-100 text-gray-400 border-gray-200';
        if (d.includes('581')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (d.includes('582')) return 'bg-green-100 text-green-800 border-green-200';
        if (d.includes('583')) return 'bg-purple-100 text-purple-800 border-purple-200';
        return 'bg-amber-100 text-amber-800 border-amber-200';
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
            
            const todayStr = new Date().toISOString().split('T')[0];
            [...records].filter(rec => rec.date <= todayStr).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(rec => {
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

            const fEnt = sortFamilyRelations((member.family_relation || '').split(',').map(s => s.trim()).filter(s => s));
            
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
                member.district ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold ${getDC(member.district)} border">${member.district}</span>` : '',
                member.category ? `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">${member.category}</span>` : '',
                ...calculatedPosArray.map(p => `<span class="px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">${p}</span>`)
            ].filter(x => x).join(' ');

            const memberBasicInfo = document.getElementById('memberBasicInfo');
            if (memberBasicInfo) {
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
                <div class="col-span-2 md:col-span-4 bg-yellow-50/30 p-4 rounded-xl border border-yellow-100/50 flex flex-col gap-1 relative group">
                    <div class="flex items-center justify-between">
                        <span class="text-yellow-700 text-[10px] font-black uppercase tracking-wider">간증 및 기타 메모</span>
                        <button type="button" id="testimonyEditBtn" onclick="toggleTestimonyEdit(true)" class="text-yellow-700 hover:text-yellow-900 text-xs font-bold transition flex items-center gap-1">
                            <i class="fa-regular fa-pen-to-square"></i> 수정
                        </button>
                    </div>
                    <div id="testimonyViewMode" class="font-medium text-slate-700 text-xs whitespace-pre-wrap leading-relaxed mt-1">
                        ${member.testimony || '내용 없음'}
                    </div>
                    <div id="testimonyEditMode" class="hidden flex flex-col gap-2 mt-1">
                        <textarea id="testimonyTextarea" class="w-full border border-slate-200 focus:ring-2 focus:ring-yellow-500/20 focus:border-yellow-500 rounded-xl px-3 py-2 h-24 outline-none text-xs leading-relaxed text-slate-700 transition duration-150 resize-y" placeholder="간증 및 기타 메모 내용을 입력하세요...">${member.testimony || ''}</textarea>
                        <div class="flex justify-end gap-1.5">
                            <button type="button" onclick="toggleTestimonyEdit(false)" class="px-2.5 py-1.5 text-[11px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-lg transition active:scale-[0.97]">
                                취소
                            </button>
                            <button type="button" onclick="saveTestimonyDirect(${member.id})" class="px-2.5 py-1.5 text-[11px] font-bold text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition active:scale-[0.97] shadow-sm">
                                저장
                            </button>
                        </div>
                    </div>
                </div>`;
            }

            // Attendance History
            const rawFilteredHistory = history.filter(h => h.type !== '심방' && h.type !== '설교' && h.type !== '외부설교' && h.date <= todayStr);
            
            function isMandatoryMeeting(member, meeting) {
                const mType = meeting.type || '';
                const mDistMatch = mType.match(/\d+/);
                const mDistNum = mDistMatch ? mDistMatch[0] : null;
                const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

                if (mType.includes('조모임')) {
                    if (member.category === '청년회' && member.bs === 'S') return false;
                    if (member.bs === 'B') return false;
                }
                if (mType.includes('구역모임')) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }
                if (mType.includes('조모임')) {
                    if (!mDistNum || mDistNum === memDistNum) return true;
                }
                if (mType.includes('교구전체모임')) return true;
                if (mType.includes('교구형제모임') && member.bs === 'B') return true;
                if (mType.includes('교구임원모임') && (member.position || '').trim() !== '') return true;
                if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

                return false;
            }

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
                        const statusBadge = `
                            <button type="button" class="toggle-attendance-btn inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold border transition duration-150 active:scale-95 cursor-pointer ${h.is_present ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}" data-meeting-id="${h.meeting_id}" data-member-id="${id}" data-present="${h.is_present ? 1 : 0}">
                                ${h.is_present ? '출석' : '결석'}
                            </button>
                        `;

                        return `
                            <tr class="text-sm border-b hover:bg-slate-50/50 transition-colors">
                                <td class="p-3 text-slate-500 font-medium whitespace-nowrap">${h.date}</td>
                                <td class="p-3 font-bold text-slate-800">${h.title}</td>
                                <td class="p-3 text-center">${statusBadge}</td>
                                <td class="p-3 text-slate-600 font-medium text-xs md:text-sm whitespace-pre-wrap leading-relaxed">${h.testimony_snapshot || '<span class="text-slate-350 italic">-</span>'}</td>
                            </tr>
                        `;
                    }).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">출석 기록이 존재하지 않습니다.</td></tr>';

                    // 출석 토글 이벤트 바인딩
                    historyTableBody.querySelectorAll('.toggle-attendance-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            const meetingId = btn.dataset.meetingId;
                            const memberId = btn.dataset.memberId;
                            const currentPresent = parseInt(btn.dataset.present);
                            const newPresent = currentPresent === 1 ? 0 : 1;

                            btn.disabled = true;
                            btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin mr-1"></i> 저장`;

                            try {
                                const response = await fetch('/api/attendance/toggle', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ member_id: memberId, meeting_id: meetingId, is_present: newPresent })
                                });

                                if (response.ok) {
                                    openMemberHistoryModal(memberId);
                                } else {
                                    alert('출석 상태 변경에 실패했습니다.');
                                    btn.disabled = false;
                                    btn.innerHTML = currentPresent === 1 ? '출석' : '결석';
                                }
                            } catch (err) {
                                console.error('Toggle error:', err);
                                alert('서버 오류로 인해 실패했습니다.');
                                btn.disabled = false;
                                btn.innerHTML = currentPresent === 1 ? '출석' : '결석';
                            }
                        });
                    });
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
            const recordTableBody = document.getElementById('recordTableBody');
            if (recordTableBody) {
                recordTableBody.innerHTML = records.length ? records.map(r => `
                    <tr class="text-[12px] border-b border-gray-50 hover:bg-gray-50 transition">
                        <td class="p-2 text-gray-500">${r.date}</td>
                        <td class="p-2"><span class="px-1.5 py-0.5 rounded text-[9px] font-black border">${RECORD_STATUS_MAP[r.status] || r.status}</span></td>
                        <td class="p-2 text-gray-700 font-bold">${r.remark || ''}</td>
                    </tr>
                `).join('') : '<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs italic">기록이 없습니다.</td></tr>';
            }
            
            // 타임라인 그리기
            const timelineContainer = document.getElementById('timelineContainer');
            if (timelineContainer) {
                if (records.length > 0) {
                    timelineContainer.classList.remove('hidden');
                    timelineContainer.innerHTML = `
                        <div class="relative border-l-2 border-slate-100 ml-4 my-2 space-y-6">
                            ${records.map(r => {
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
                                    textBg = 'bg-blue-50 text-blue-855 border-blue-100/50';
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

            const memberHistoryModal = document.getElementById('memberHistoryModal');
            if (memberHistoryModal) {
                memberHistoryModal.classList.remove('hidden');
            }
        } catch (e) { console.error(e); }
    };

    // 탭 버튼 클릭 이벤트 바인딩
    document.querySelectorAll('.member-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // 모든 탭 버튼 비활성화
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            // 클릭한 탭 버튼 활성화
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');

            // 모든 탭 콘텐츠 숨김
            document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
            // 해당하는 탭 콘텐츠 표시
            const targetTab = btn.dataset.tab;
            const targetContent = document.getElementById(`tabContent_${targetTab}`);
            if (targetContent) targetContent.classList.remove('hidden');
        });
    });

    const memberHistoryModal = document.getElementById('memberHistoryModal');
    const closeHistoryModal = document.getElementById('closeHistoryModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    
    if (closeHistoryModal) {
        closeHistoryModal.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    }
    if (closeHistoryModalBtn) {
        closeHistoryModalBtn.addEventListener('click', () => memberHistoryModal.classList.add('hidden'));
    }

    window.toggleTestimonyEdit = function(isEdit) {
        const viewMode = document.getElementById('testimonyViewMode');
        const editMode = document.getElementById('testimonyEditMode');
        const editBtn = document.getElementById('testimonyEditBtn');
        if (isEdit) {
            viewMode.classList.add('hidden');
            editMode.classList.remove('hidden');
            editBtn.classList.add('hidden');
            const textarea = document.getElementById('testimonyTextarea');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        } else {
            viewMode.classList.remove('hidden');
            editMode.classList.add('hidden');
            editBtn.classList.remove('hidden');
            document.getElementById('testimonyTextarea').value = currentMemberData.testimony || '';
        }
    };

    window.saveTestimonyDirect = async function(id) {
        try {
            const text = document.getElementById('testimonyTextarea').value;
            const updatedData = { ...currentMemberData, testimony: text };
            
            const response = await fetch(`/api/members/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedData)
            });
            
            if (response.ok) {
                currentMemberData = updatedData;
                document.getElementById('testimonyViewMode').textContent = text || '내용 없음';
                window.toggleTestimonyEdit(false);
                if (typeof loadStatus === 'function') {
                    loadStatus();
                }
            } else {
                alert('저장에 실패했습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('에러가 발생했습니다.');
        }
    };

    loadStatus();

    // --- Record Side Panel Logic ---
    const recordSidePanel = document.getElementById('recordSidePanel');
    const recordPanelContent = document.getElementById('recordPanelContent');
    const recordPanelBackdrop = document.getElementById('recordPanelBackdrop');
    const closeRecordPanelBtn = document.getElementById('closeRecordPanelBtn');
    const cancelRecordBtn = document.getElementById('cancelRecordBtn');
    const saveRecordBtn = document.getElementById('saveRecordBtn');

    window.openRecordPanel = (memberId, memberName, type) => {
        document.getElementById('recordMemberId').value = memberId;
        document.getElementById('recordType').value = type;
        
        document.getElementById('recordPanelTitle').textContent = `${type} 기록 작성`;
        document.getElementById('recordPanelSubtitle').textContent = `성도: ${memberName}`;
        
        document.getElementById('recordDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('recordMemo').value = '';

        recordSidePanel.classList.remove('hidden');
        // Trigger reflow
        void recordSidePanel.offsetWidth;
        recordPanelBackdrop.classList.add('opacity-100');
        recordPanelContent.classList.remove('translate-x-full');
    };

    const closeRecordPanel = () => {
        recordPanelBackdrop.classList.remove('opacity-100');
        recordPanelContent.classList.add('translate-x-full');
        setTimeout(() => {
            recordSidePanel.classList.add('hidden');
        }, 300);
    };

    closeRecordPanelBtn.addEventListener('click', closeRecordPanel);
    cancelRecordBtn.addEventListener('click', closeRecordPanel);
    recordPanelBackdrop.addEventListener('click', closeRecordPanel);

    saveRecordBtn.addEventListener('click', async () => {
        const memberId = document.getElementById('recordMemberId').value;
        const type = document.getElementById('recordType').value;
        const date = document.getElementById('recordDate').value;
        const memo = document.getElementById('recordMemo').value.trim();

        if (!date) return alert('날짜를 선택해주세요.');

        saveRecordBtn.disabled = true;
        saveRecordBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 저장 중...';

        try {
            // 1. Create meeting
            const memberName = document.getElementById('recordPanelSubtitle').textContent.replace('성도: ', '');
            const title = `${memberName} ${type}`;
            
            const meetRes = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    date,
                    type,
                    memo
                })
            });
            
            if (!meetRes.ok) throw new Error('모임 생성 실패');
            const { id: meetingId } = await meetRes.json();

            // 2. Create attendance
            const attData = [{
                member_id: parseInt(memberId),
                is_present: 1,
                testimony_snapshot: memo
            }];
            
            const attRes = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meeting_id: meetingId,
                    attendance_data: attData
                })
            });

            if (!attRes.ok) throw new Error('출석 기록 생성 실패');

            closeRecordPanel();
            loadStatus(); // Reload data to update counts and UI
        } catch (error) {
            console.error(error);
            alert('기록 저장 중 오류가 발생했습니다.');
        } finally {
            saveRecordBtn.disabled = false;
            saveRecordBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                저장하기
            `;
        }
    });
});