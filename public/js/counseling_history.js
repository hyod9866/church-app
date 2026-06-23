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

    const counselingList = document.getElementById('counselingList');
    const sortOption = document.getElementById('sortOption');
    const counselingCount = document.getElementById('counselingCount');

    let allStatus = [];
    let currentMemberData = null;

    async function loadStatus() {
        try {
            const response = await fetch('/api/visitation/status');
            const data = await response.json();
            // 상담 이력이 1회 이상 존재하는 대상자만 관리 대상으로 정의
            allStatus = data.filter(s => s.counseling_count > 0);
            applyFilters();
        } catch (error) {
            console.error('Error loading counseling status:', error);
            counselingList.innerHTML = '<p class="text-red-500 text-center py-20 font-bold">데이터를 불러오지 못했습니다.</p>';
        }
    }

    function applyFilters() {
        const sort = sortOption.value;
        const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();

        let filtered = allStatus.filter(s => {
            // 통합 검색 필터링 (상담 날짜, 상담 메모 내용 중심)
            if (query) {
                const nameMatch = (s.name || '').toLowerCase().includes(query);
                const dateMatch = (s.last_counseling_date || '').includes(query);
                const memoMatch = (s.last_counseling_memo || '').toLowerCase().includes(query);
                const positionMatch = (s.position || '').toLowerCase().includes(query);
                const categoryMatch = (s.category || '').toLowerCase().includes(query);
                const districtTextMatch = (s.district || '').toLowerCase().includes(query);

                if (!nameMatch && !dateMatch && !memoMatch && !positionMatch && !categoryMatch && !districtTextMatch) {
                    return false;
                }
            }
            return true;
        });

        // Sorting
        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'last_counseling') {
                if (!a.last_counseling_date) return 1;
                if (!b.last_counseling_date) return -1;
                return new Date(b.last_counseling_date) - new Date(a.last_counseling_date);
            }
            if (sort === 'oldest_counseling') {
                if (!a.last_counseling_date) return -1;
                if (!b.last_counseling_date) return 1;
                return new Date(a.last_counseling_date) - new Date(b.last_counseling_date);
            }
            if (sort === 'count') return b.counseling_count - a.counseling_count;
            return 0;
        });

        renderList(filtered);
    }

    function renderList(data) {
        counselingCount.textContent = `총 ${data.length}명 상담 대상자`;
        
        if (data.length === 0) {
            counselingList.innerHTML = '<p class="text-gray-500 text-center py-20 font-medium">상담 이력이 존재하는 대상자가 없습니다.</p>';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        counselingList.innerHTML = data.map(member => {
            let statusHtml = '';
            let detailHtml = '';
            let daysDiff = null;

            if (member.last_counseling_date) {
                const lastDate = new Date(member.last_counseling_date);
                lastDate.setHours(0, 0, 0, 0);
                daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
                
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-indigo-600 dark:text-indigo-400 font-bold text-sm">${member.last_counseling_date}</span>
                        <span class="text-[10px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/40 font-bold">${daysDiff}일 전(최근 상담)</span>
                    </div>
                `;

                if (member.last_counseling_memo) {
                    detailHtml = `
                        <div class="mt-2 p-2 bg-gray-50 dark:bg-[#0B0F19] rounded-lg border border-gray-100 dark:border-slate-800 text-xs">
                            <div class="text-gray-500 dark:text-slate-400 italic">📝 ${member.last_counseling_memo}</div>
                        </div>
                    `;
                }
            } else {
                statusHtml = `<span class="text-red-400 font-bold text-sm italic">상담 기록 없음</span>`;
            }

            const displayDistrict = member.district ? (String(member.district).includes('구역') ? member.district : member.district + '구역') : '구역 미정';

            return `
                <div class="bg-white dark:bg-[#131B2E] rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden flex items-start p-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span onclick="openMemberHistoryModal(${member.id})" class="text-lg font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:underline cursor-pointer transition-colors">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-2 py-0.5 rounded font-bold">${displayDistrict} | ${member.category}</span>
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${statusHtml}
                        ${detailHtml}
                    </div>
                    <div class="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 상담 <span class="text-indigo-600 dark:text-indigo-400 font-black">${member.counseling_count}</span>회</div>
                        <div class="flex flex-col gap-1">
                            <button onclick="openNewCounselingWithMember('${member.name}', ${member.id})" 
                                    class="bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-500 dark:hover:text-white transition-colors whitespace-nowrap">
                                추가 상담 등록
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    sortOption.addEventListener('change', applyFilters);
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }

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
        'COUNSELING': '상담',
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
            // 상담 탭 디폴트 활성화
            const defaultTabBtn = document.querySelector('.member-tab-btn[data-tab="counseling"]');
            if (defaultTabBtn) defaultTabBtn.click();

            const res = await fetch(`/api/members/${id}/history`); 
            const { member, history, family } = await res.json(); 
            currentMemberData = member; 
            
            // Fetch records for real-time position calculation
            const recRes = await fetch(`/api/members/${id}/records`);
            const records = await recRes.json();
            
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
                    <span class="text-slate-400 text-[10px] font-black uppercase tracking-wider">가족 관계</span>
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

            // Attendance Rows Rendering
            const historyTableBody = document.getElementById('historyTableBody');
            if (historyTableBody) {
                const memberAttendanceStats = document.getElementById('memberAttendanceStats');
                if (memberAttendanceStats) {
                    memberAttendanceStats.textContent = `${getRate(stats.all)}% (${stats.all.present}/${stats.all.count})`;
                }
                historyTableBody.innerHTML = filteredHistory.map(h => `
                    <tr class="text-sm border-b hover:bg-slate-50/50 transition-colors">
                        <td class="py-1.5 px-2.5 text-slate-500 font-medium text-center">${h.date}</td>
                        <td class="py-1.5 px-2.5 font-bold text-slate-800">${h.title}</td>
                        <td class="py-1.5 px-2.5 text-center font-bold ${h.is_present ? 'text-emerald-600' : 'text-rose-500'}">${h.is_present ? '출석' : '결석'}</td>
                        <td class="py-1.5 px-2.5 text-slate-600 text-xs">${h.testimony_snapshot || '-'}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4" class="p-8 text-center text-slate-400 font-medium">출석 기록이 존재하지 않습니다.</td></tr>';
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
                                <div class="bg-blue-50/50 border-blue-100/30 p-2.5 rounded-lg border">
                                    <span class="block text-[10px] font-black text-blue-700 uppercase tracking-wider mb-1">🎙️ 심방 간증</span>
                                    <p class="text-xs text-blue-900 whitespace-pre-wrap font-bold leading-relaxed">${testimonyVal}</p>
                                </div>
                            `;
                        }
                        if (!memoVal && !testimonyVal) {
                            contentHTML = `<p class="text-slate-400 italic text-[11px] py-1">기록된 상세 내용이 없습니다.</p>`;
                        }

                        return `
                            <div class="bg-teal-50 border-teal-100 dark:bg-slate-800/40 dark:border-slate-700/60 p-4 rounded-xl border shadow-sm flex flex-col gap-2">
                                <div class="text-xs font-black text-teal-805 border-teal-200/30 dark:text-slate-350 dark:border-slate-700/30 border-b pb-1">
                                    <span>📅 ${h.date} 심방 기록</span>
                                </div>
                                ${contentHTML}
                            </div>
                        `;
                    }).join('');
                }
            } 
            else {
                if (visList) visList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">심방 기록이 없습니다.</p>';
            }

            // Counseling Memos (개인 상담 기록 탭)
            const counselingMemoList = document.getElementById('counselingMemoList');
            const cMemos = records.filter(r => r.status === 'COUNSELING');
            if (counselingMemoList) {
                if (cMemos.length) {
                    counselingMemoList.innerHTML = cMemos.map(r => {
                        const memoText = r.remark || '';
                        return `
                            <div class="counsel-card bg-indigo-50 dark:bg-[#131B2E] border border-indigo-100 dark:border-slate-850 p-4 rounded-xl shadow-sm flex flex-col gap-2" data-record-id="${r.id}">
                                <div class="text-xs font-black text-indigo-800 dark:text-indigo-400 border-b dark:border-slate-800 pb-1 flex justify-between items-center">
                                    <span>📅 <span class="counsel-date-text">${r.date}</span> 개인 상담</span>
                                    <button type="button" class="edit-counsel-btn text-indigo-700 dark:text-indigo-400 hover:text-indigo-905 dark:hover:text-indigo-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer">
                                        <i class="fa-regular fa-pen-to-square"></i> 수정
                                    </button>
                                </div>
                                <div class="counsel-body-area mb-2 bg-white/60 dark:bg-[#0B0F19] p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                                    <p class="counsel-remark-text text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-bold leading-relaxed">${memoText}</p>
                                </div>
                            </div>
                        `;
                    }).join('');

                    // 상담 기록 수정 버튼 이벤트 연결
                    counselingMemoList.querySelectorAll('.counsel-card').forEach(card => {
                        const recordId = card.dataset.recordId;
                        const editBtn = card.querySelector('.edit-counsel-btn');
                        const bodyArea = card.querySelector('.counsel-body-area');

                        editBtn.addEventListener('click', () => {
                            if (card.querySelector('.counsel-edit-textarea')) return; // 이미 수정 모드

                            const dateTextSpan = card.querySelector('.counsel-date-text');
                            const currentDate = dateTextSpan.textContent.trim();
                            const remarkTextPara = card.querySelector('.counsel-remark-text');
                            const currentRemark = remarkTextPara.textContent.trim();

                            bodyArea.innerHTML = `
                                <div class="flex flex-col gap-2 w-full">
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">상담 날짜</label>
                                        <input type="date" class="counsel-edit-date w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-bold bg-white dark:bg-slate-800 focus:outline-none text-slate-700 dark:text-slate-200" value="${currentDate}">
                                    </div>
                                    <div>
                                        <label class="block text-[9px] font-black text-slate-400 dark:text-slate-550 uppercase tracking-wider mb-1">상담 내용</label>
                                        <textarea class="counsel-edit-textarea w-full border border-slate-200 dark:border-slate-700/60 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200 resize-y" rows="4">${currentRemark}</textarea>
                                    </div>
                                    <div class="flex justify-end gap-1.5 mt-1">
                                        <button type="button" class="save-counsel-btn bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer shadow-sm">저장</button>
                                        <button type="button" class="cancel-counsel-btn bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black transition active:scale-95 cursor-pointer border dark:border-slate-700">취소</button>
                                    </div>
                                </div>
                            `;

                            const saveBtn = bodyArea.querySelector('.save-counsel-btn');
                            const cancelBtn = bodyArea.querySelector('.cancel-counsel-btn');
                            const editDateInput = bodyArea.querySelector('.counsel-edit-date');
                            const editTextarea = bodyArea.querySelector('.counsel-edit-textarea');

                            cancelBtn.addEventListener('click', () => {
                                openMemberHistoryModal(id);
                            });

                            saveBtn.addEventListener('click', async () => {
                                const newDate = editDateInput.value;
                                const newRemark = editTextarea.value.trim();

                                if (!newDate) return alert('날짜를 입력해주세요.');
                                if (!newRemark) return alert('상담 내용을 입력해주세요.');

                                saveBtn.disabled = true;
                                saveBtn.textContent = '저장중...';

                                try {
                                    const response = await fetch(`/api/members/records/${recordId}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            date: newDate,
                                            status: 'COUNSELING',
                                            remark: newRemark
                                        })
                                    });

                                    if (response.ok) {
                                        openMemberHistoryModal(id);
                                        if (typeof loadStatus === 'function') {
                                            loadStatus();
                                        }
                                    } else {
                                        alert('상담 기록 수정에 실패했습니다.');
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = '저장';
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert('서버 오류로 인해 실패했습니다.');
                                    saveBtn.disabled = false;
                                    saveBtn.textContent = '저장';
                                }
                            });
                        });
                    });
                } else {
                    counselingMemoList.innerHTML = '<p class="text-slate-400 italic text-xs text-center py-8 bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700/60">상담 기록이 없습니다.</p>';
                }
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
            document.querySelectorAll('.member-tab-btn').forEach(b => {
                b.classList.remove('active', 'border-blue-600', 'text-blue-600');
                b.classList.add('text-slate-500', 'border-transparent');
            });
            btn.classList.add('active', 'border-blue-600', 'text-blue-600');
            btn.classList.remove('text-slate-500', 'border-transparent');

            document.querySelectorAll('.member-tab-content').forEach(c => c.classList.add('hidden'));
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
                loadStatus();
            } else {
                alert('저장에 실패했습니다.');
            }
        } catch (e) {
            console.error(e);
            alert('에러가 발생했습니다.');
        }
    };

    loadStatus();

    // --- New Counseling Modal Logic (새 상담 등록) ---
    const newCounselingModal = document.getElementById('newCounselingModal');
    const openNewCounselingBtn = document.getElementById('openNewCounselingBtn');
    const closeNewCounselingModal = document.getElementById('closeNewCounselingModal');
    const cancelNewCounselingBtn = document.getElementById('cancelNewCounselingBtn');
    const saveNewCounselingBtn = document.getElementById('saveNewCounselingBtn');

    const counselingName = document.getElementById('counselingName');
    const counselingNameSuggestions = document.getElementById('counselingNameSuggestions');
    const counselingMemberId = document.getElementById('counselingMemberId');
    const newMemberBadgeContainer = document.getElementById('newMemberBadgeContainer');

    const counselingChurchId = document.getElementById('counselingChurchId');
    const counselingChurchInput = document.getElementById('counselingChurchInput');
    const counselingChurchSuggestions = document.getElementById('counselingChurchSuggestions');
    const counselingParish = document.getElementById('counselingParish');
    const counselingDistrict = document.getElementById('counselingDistrict');

    let allChurches = [];

    window.openNewCounselingWithMember = (memberName, memberId) => {
        openNewCounselingBtn.click();
        
        // 특정 회원 지정해서 자동완성 처리
        setTimeout(async () => {
            counselingName.value = memberName;
            counselingName.dispatchEvent(new Event('input'));
            
            // 자동 선택 수행
            counselingMemberId.value = memberId;
            newMemberBadgeContainer.classList.add('hidden');
            
            // 기존 회원 소속 정보 조회 및 바인딩
            const targetMember = allStatus.find(s => s.id === memberId);
            if (targetMember && targetMember.church && targetMember.church !== '교회정보없음') {
                counselingChurchInput.value = targetMember.church;
                const matchedChurch = allChurches.find(c => c.name.trim() === targetMember.church.trim());
                if (matchedChurch) {
                    counselingChurchId.value = matchedChurch.id;
                    await loadParishes(matchedChurch.id);
                    if (targetMember.parish && targetMember.parish !== '교구정보없음') {
                        counselingParish.value = targetMember.parish;
                        const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;
                        if (parishId) {
                            await loadDistricts(parishId);
                            if (targetMember.district && targetMember.district !== '구역정보없음') {
                                counselingDistrict.value = targetMember.district;
                            }
                        }
                    }
                }
            }
        }, 100);
    };

    if (openNewCounselingBtn) {
        openNewCounselingBtn.addEventListener('click', async () => {
            document.getElementById('newCounselingForm').reset();
            counselingMemberId.value = '';
            counselingChurchId.value = '';
            newMemberBadgeContainer.classList.add('hidden');
            counselingNameSuggestions.classList.add('hidden');
            counselingChurchSuggestions.classList.add('hidden');
            document.getElementById('counselingDate').value = new Date().toISOString().split('T')[0];

            counselingParish.innerHTML = '<option value="">교구 선택</option>';
            counselingDistrict.innerHTML = '<option value="">구역 선택</option>';
            counselingParish.disabled = true;
            counselingDistrict.disabled = true;

            await loadChurches();
            newCounselingModal.classList.remove('hidden');
        });
    }

    const closeNewCounseling = () => {
        newCounselingModal.classList.add('hidden');
        counselingNameSuggestions.classList.add('hidden');
        counselingChurchSuggestions.classList.add('hidden');
    };

    if (closeNewCounselingModal) closeNewCounselingModal.addEventListener('click', closeNewCounseling);
    if (cancelNewCounselingBtn) cancelNewCounselingBtn.addEventListener('click', closeNewCounseling);

    async function loadChurches() {
        try {
            const res = await fetch('/api/churches/all');
            allChurches = await res.json();
        } catch (e) {
            console.error('Error loading churches:', e);
        }
    }

    counselingChurchInput.addEventListener('input', () => {
        const val = counselingChurchInput.value.trim().toLowerCase();
        counselingChurchId.value = '';

        counselingParish.innerHTML = '<option value="">교구 선택</option>';
        counselingDistrict.innerHTML = '<option value="">구역 선택</option>';
        counselingParish.disabled = true;
        counselingDistrict.disabled = true;

        if (!val) {
            counselingChurchSuggestions.classList.add('hidden');
            return;
        }

        const filtered = allChurches.filter(c => c.name.toLowerCase().includes(val));
        if (filtered.length > 0) {
            counselingChurchSuggestions.innerHTML = filtered.map(c => `
                <div class="church-search-item p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800" 
                     data-id="${c.id}" data-name="${c.name}">
                    ${c.name}
                </div>
            `).join('');
            counselingChurchSuggestions.classList.remove('hidden');
        } else {
            counselingChurchSuggestions.innerHTML = '<div class="p-3 text-xs text-slate-500 italic">검색 결과가 없습니다.</div>';
            counselingChurchSuggestions.classList.remove('hidden');
        }
    });

    counselingChurchSuggestions.addEventListener('click', async (e) => {
        const item = e.target.closest('.church-search-item');
        if (!item) return;

        const id = item.dataset.id;
        const name = item.dataset.name;

        counselingChurchInput.value = name;
        counselingChurchId.value = id;
        counselingChurchSuggestions.classList.add('hidden');

        await loadParishes(id);
    });

    async function loadParishes(churchId) {
        counselingParish.innerHTML = '<option value="">교구 선택</option>';
        counselingDistrict.innerHTML = '<option value="">구역 선택</option>';
        counselingDistrict.disabled = true;

        if (!churchId) {
            counselingParish.disabled = true;
            return;
        }

        try {
            const res = await fetch(`/api/parishes?church_id=${churchId}`);
            const parishes = await res.json();
            counselingParish.innerHTML = '<option value="">교구 선택</option>' +
                parishes.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
            counselingParish.disabled = false;
        } catch (e) {
            console.error(e);
        }
    }

    async function loadDistricts(parishId) {
        counselingDistrict.innerHTML = '<option value="">구역 선택</option>';

        if (!parishId) {
            counselingDistrict.disabled = true;
            return;
        }

        try {
            const res = await fetch(`/api/districts?parish_id=${parishId}`);
            const districts = await res.json();
            counselingDistrict.innerHTML = '<option value="">구역 선택</option>' +
                districts.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
            counselingDistrict.disabled = false;
        } catch (e) {
            console.error(e);
        }
    }

    counselingParish.addEventListener('change', async () => {
        const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
        const parishId = selectedOpt.dataset.id;
        await loadDistricts(parishId);
    });

    counselingName.addEventListener('input', async () => {
        const val = counselingName.value.trim();
        if (!val) {
            counselingNameSuggestions.classList.add('hidden');
            counselingMemberId.value = '';
            newMemberBadgeContainer.classList.add('hidden');
            return;
        }

        try {
            const res = await fetch(`/api/members/filter?q=${encodeURIComponent(val)}`);
            const suggestions = await res.json();

            if (suggestions.length > 0) {
                counselingNameSuggestions.innerHTML = suggestions.map(s => `
                    <div class="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer border-b border-slate-100 dark:border-slate-800 flex justify-between items-center" 
                         data-id="${s.id}" data-name="${s.name}" data-church="${s.church || ''}" data-parish="${s.parish || ''}" data-district="${s.district || ''}">
                        <span>${s.name} <span class="text-xs font-medium text-slate-400 flex items-center gap-1">(${s.position || '성도'})</span></span>
                        <span class="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded font-bold">${s.church || '교회정보없음'}</span>
                    </div>
                `).join('');
                counselingNameSuggestions.classList.remove('hidden');
            } else {
                counselingNameSuggestions.classList.add('hidden');
            }
            
            const exactMatch = suggestions.find(s => s.name === val);
            if (!exactMatch) {
                counselingMemberId.value = '';
                newMemberBadgeContainer.classList.remove('hidden');
            } else {
                newMemberBadgeContainer.classList.add('hidden');
            }
        } catch (e) {
            console.error(e);
        }
    });

    counselingNameSuggestions.addEventListener('click', async (e) => {
        const item = e.target.closest('[data-id]');
        if (!item) return;

        const id = item.dataset.id;
        const name = item.dataset.name;
        const church = item.dataset.church;
        const parish = item.dataset.parish;
        const district = item.dataset.district;

        counselingName.value = name;
        counselingMemberId.value = id;
        counselingNameSuggestions.classList.add('hidden');
        newMemberBadgeContainer.classList.add('hidden');

        if (church && church !== '교회정보없음') {
            await loadChurches();
            counselingChurchInput.value = church;
            const matchedChurch = allChurches.find(c => c.name.trim() === church.trim());
            const churchId = matchedChurch ? matchedChurch.id : null;
            counselingChurchId.value = churchId || '';

            if (churchId) {
                await loadParishes(churchId);
                setTimeout(async () => {
                    if (parish && parish !== '교구정보없음') {
                        counselingParish.value = parish;
                        const selectedOpt = counselingParish.options[counselingParish.selectedIndex];
                        const parishId = selectedOpt ? selectedOpt.dataset.id : null;

                        if (parishId) {
                            await loadDistricts(parishId);
                            setTimeout(() => {
                                if (district && district !== '구역정보없음') {
                                    counselingDistrict.value = district;
                                }
                            }, 300);
                        }
                    }
                }, 300);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (counselingName && !counselingName.contains(e.target) && !counselingNameSuggestions.contains(e.target)) {
            counselingNameSuggestions.classList.add('hidden');
        }
        if (counselingChurchInput && !counselingChurchInput.contains(e.target) && !counselingChurchSuggestions.contains(e.target)) {
            counselingChurchSuggestions.classList.add('hidden');
        }
    });

    saveNewCounselingBtn.addEventListener('click', async () => {
        const name = counselingName.value.trim();
        const memberId = counselingMemberId.value;
        const church = counselingChurchInput.value.trim();
        const parish = counselingParish.value;
        const district = counselingDistrict.value;
        const date = document.getElementById('counselingDate').value;
        const counseling_memo = document.getElementById('counselingMemoContent').value.trim();
        const remark_memo = document.getElementById('counselingRemark').value.trim();

        if (!name) return alert('상담 대상자 이름을 입력하세요.');
        if (!date) return alert('상담 날짜를 입력하세요.');
        if (!counseling_memo) return alert('상담 내용을 입력하세요.');

        saveNewCounselingBtn.disabled = true;
        saveNewCounselingBtn.innerHTML = '<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> 저장 중...';

        try {
            const res = await fetch('/api/visitation/counseling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    member_id: memberId ? parseInt(memberId) : null,
                    name,
                    date,
                    counseling_memo,
                    remark_memo,
                    church: church || null,
                    parish: parish || null,
                    district: district || null
                })
            });

            if (!res.ok) throw new Error('상담 기록 저장 실패');
            
            closeNewCounseling();
            loadStatus();
        } catch (err) {
            console.error(err);
            alert('상담 기록 저장 중 오류가 발생했습니다.');
        } finally {
            saveNewCounselingBtn.disabled = false;
            saveNewCounselingBtn.innerHTML = '<i class="fa-solid fa-check"></i> 상담 저장하기';
        }
    });
});
