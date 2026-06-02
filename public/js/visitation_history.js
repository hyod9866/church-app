document.addEventListener('DOMContentLoaded', () => {
    const visitationList = document.getElementById('visitationList');
    const districtFilter = document.getElementById('districtFilter');
    const sortOption = document.getElementById('sortOption');
    const visitationCount = document.getElementById('visitationCount');

    let allStatus = [];

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
                
                statusHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-teal-600 font-bold text-sm">${member.last_visitation}</span>
                        <span class="text-[10px] bg-teal-50 text-teal-600 px-2 py-0.5 rounded border border-teal-100 font-bold">${daysDiff}일 전</span>
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
                statusHtml = `<span class="text-red-400 font-bold text-sm italic">심방 기록 없음</span>`;
            }

            const displayDistrict = member.district ? (String(member.district).includes('구역') ? member.district : member.district + '구역') : '구역 미정';

            return `
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex items-start p-4 hover:border-blue-300 transition-colors">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-lg font-black text-gray-800">${member.name}</span>
                            <span class="text-xs text-gray-400 font-bold">${member.position || ''}</span>
                            <span class="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-bold">${displayDistrict} | ${member.category}</span>
                        </div>
                        ${member.family_relation ? `<div class="text-[11px] text-gray-500 mb-2 font-medium italic">가족: ${member.family_relation}</div>` : ''}
                        ${statusHtml}
                        ${detailHtml}
                    </div>
                    <div class="flex flex-col items-end gap-2 shrink-0 ml-4">
                        <div class="text-xs font-bold text-gray-400">누적 <span class="text-blue-600">${member.total_count}</span>회</div>
                        <button onclick="location.href='/?date=${new Date().toISOString().split('T')[0]}&type=심방&target=${member.id}'" 
                                class="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white transition-colors">
                            심방 기록
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    districtFilter.addEventListener('change', applyFilters);
    sortOption.addEventListener('change', applyFilters);

    loadStatus();
});