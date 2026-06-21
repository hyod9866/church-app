window.myCharts = [];

let currentSermons = [];
let sortKey = 'date';
let sortDirection = 'desc'; // 'asc' or 'desc'

let selectedMeetingTypes = new Set();
let wordCloudChart = null;

// 키워드 분석을 위한 한국어 불용어(StopWords) 목록 (백엔드와 정렬)
const KEYWORD_STOP_WORDS = ['수', '있', '하', '것', '들', '그', '되', '이', '보', '않', '없', '나', '사람', '주', '아니', '등', '같', '우리', '때', '년', '가', '한', '지', '대하', '오', '말', '일', '그렇', '위하', '때문', '그것', '두', '말하', '알', '그러나', '받', '못하', '그런', '또', '문제', '더', '사회', '많', '그리고', '좋', '크', '따르', '중', '나오', '가지', '씨', '시키', '만들', '지금', '생각하', '그러', '속', '하나', '집', '살', '모르', '적', '월', '데', '자신', '안', '어떤', '내', '경우', '명', '생각', '시간', '그녀', '다시', '이런', '앞', '보이', '번', '나', '다른', '어떻', '여자', '개', '전', '들', '사실', '이렇', '점', '싶', '말', '정도', '좀', '원', '잘', '통하', '소리', '놓', '위해', '대한'];

// Old & New Testament book constants
const OLD_TESTAMENT_BOOKS = ["창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기", "사무엘상", "사무엘하", "열왕기상", "열왕기하", "역대상", "역대하", "에스라", "느헤미야", "에스더", "욥기", "시편", "잠언", "전도서", "아가", "이사야", "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스", "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기"];
const NEW_TESTAMENT_BOOKS = ["마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서", "고린도전서", "고린도후서", "갈라디아서", "에베소서", "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서", "베드로전서", "베드로후서", "요한1서", "요한2서", "요한3서", "유다서", "요한계시록"];

// 해시태그 필터 버튼 렌더링 함수
function renderKeywordFilters() {
    const container = document.getElementById('keywordCloudFilterContainer');
    if (!container) return;

    // 현재 로드된 설교가 있는 모임들의 고유 타입 추출 (정렬)
    const types = new Set();
    currentSermons.forEach(s => {
        if (s.type) {
            types.add(s.type);
        }
    });
    const typeList = Array.from(types).sort();

    container.innerHTML = '';

    // 1. "전체" 필터 버튼 생성
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    const isAllActive = selectedMeetingTypes.size === 0;
    
    allBtn.className = isAllActive 
        ? "px-3.5 py-1.5 rounded-full text-xs font-black transition-all duration-150 cursor-pointer shadow-sm bg-blue-600 text-white border border-blue-600 dark:bg-blue-500 dark:border-blue-500"
        : "px-3.5 py-1.5 rounded-full text-xs font-black transition-all duration-150 cursor-pointer shadow-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-slate-800/85 dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60";
    
    allBtn.innerHTML = isAllActive ? "✓ 전체" : "전체";
    allBtn.onclick = () => {
        selectedMeetingTypes.clear();
        renderKeywordFilters();
        updateWordCloud();
    };
    container.appendChild(allBtn);

    // 2. 개별 모임 구분 버튼 생성
    typeList.forEach(type => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isActive = selectedMeetingTypes.has(type);
        const displayType = type === '설교' ? '내부설교' : type;

        btn.className = isActive
            ? "px-3.5 py-1.5 rounded-full text-xs font-black transition-all duration-150 cursor-pointer shadow-sm bg-blue-600 text-white border border-blue-600 dark:bg-blue-500 dark:border-blue-500"
            : "px-3.5 py-1.5 rounded-full text-xs font-black transition-all duration-150 cursor-pointer shadow-sm bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 dark:bg-slate-800/85 dark:hover:bg-slate-800 dark:text-slate-300 dark:border-slate-700/60";

        btn.innerHTML = isActive ? `✓ ${displayType}` : displayType;
        btn.onclick = () => {
            if (selectedMeetingTypes.has(type)) {
                selectedMeetingTypes.delete(type);
            } else {
                selectedMeetingTypes.add(type);
            }
            renderKeywordFilters();
            updateWordCloud();
        };
        container.appendChild(btn);
    });
}

// 필터링된 데이터를 바탕으로 키워드 재집계 및 워드클라우드 갱신
function updateWordCloud() {
    const container = document.getElementById("wordCloudContainer");
    if (!container) return;

    // 필터링된 모임 선별
    const filteredSermons = selectedMeetingTypes.size === 0 
        ? currentSermons 
        : currentSermons.filter(s => selectedMeetingTypes.has(s.type));

    // 키워드 빈도 추출 및 분석 (명사/태그 기반)
    const keywordsCount = {};
    filteredSermons.forEach(s => {
        if (s.sermon_tags) {
            // 태그 파싱 로직 (# 제거, 특수문자 제거, 공백 split)
            const words = s.sermon_tags.replace(/[#]/g, '').replace(/[^\w\s가-힣]/g, ' ').split(/\s+/);
            words.forEach(word => {
                const cleanWord = word.trim();
                if (cleanWord.length > 1 && !KEYWORD_STOP_WORDS.includes(cleanWord) && isNaN(cleanWord)) {
                    keywordsCount[cleanWord] = (keywordsCount[cleanWord] || 0) + 1;
                }
            });
        }
    });

    // 상위 30개 가공
    const topKeywords = Object.entries(keywordsCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([text, weight]) => ({ x: text, value: weight }));

    if (topKeywords.length === 0) {
        container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 font-bold italic py-8">선택된 모임의 설교 키워드 데이터가 없습니다.</div>';
        wordCloudChart = null; // 인스턴스 해제
        return;
    }

    if (wordCloudChart) {
        // 기존 인스턴스가 존재하면 데이터만 부드럽게 교체
        wordCloudChart.data(topKeywords);
    } else {
        container.innerHTML = '';
        wordCloudChart = anychart.tagCloud(topKeywords);
        wordCloudChart.angles([0, -45, 90]);
        wordCloudChart.colorRange(false);
        wordCloudChart.background().fill("transparent");
        wordCloudChart.palette(['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1']);
        
        // 키워드 클릭 시 이력 모달 연동
        wordCloudChart.listen("pointClick", function(e) {
            const clickedTag = e.point.get("x");
            if (clickedTag) {
                openTagSermonsModal(clickedTag);
            }
        });

        wordCloudChart.container("wordCloudContainer");
        wordCloudChart.draw();
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const sermonSearch = document.getElementById('sermonSearch');
    if (sermonSearch) {
        sermonSearch.addEventListener('input', applyFilters);
    }
    await fetchStats();
    await fetchAttendanceCharts();
});

// Setup MutationObserver to dynamically update Chart.js colors on dark mode toggle
const themeObserver = new MutationObserver(() => {
    if (window.myCharts) {
        window.myCharts.forEach(chart => {
            if (chart && typeof chart.update === 'function') {
                chart.update();
            }
        });
    }
});
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

let selectedType = '전체';

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

const getBadgeStyles = (type) => {
    if (type === '설교') return 'bg-amber-50 text-amber-700 border-amber-250/50 dark:bg-amber-950/30 dark:text-amber-450 dark:border-amber-900/50';
    if (type === '외부설교') return 'bg-emerald-50 text-emerald-700 border-emerald-250/50 dark:bg-emerald-950/30 dark:text-emerald-450 dark:border-emerald-900/50';
    if (type.includes('조모임')) return 'bg-rose-50 text-rose-700 border-rose-250/50 dark:bg-rose-950/30 dark:text-rose-450 dark:border-rose-900/50';
    if (type.includes('구역모임')) return 'bg-orange-50 text-orange-700 border-orange-250/50 dark:bg-orange-950/30 dark:text-orange-450 dark:border-orange-900/50';
    if (type.includes('형제')) return 'bg-teal-50 text-teal-700 border-teal-250/50 dark:bg-teal-950/30 dark:text-teal-450 dark:border-teal-900/50';
    if (type.includes('청년')) return 'bg-purple-50 text-purple-700 border-purple-250/50 dark:bg-purple-950/30 dark:text-purple-450 dark:border-purple-900/50';
    if (type.includes('봉사')) return 'bg-indigo-50 text-indigo-700 border-indigo-250/50 dark:bg-indigo-950/30 dark:text-indigo-450 dark:border-indigo-900/50';
    if (type.includes('심방')) return 'bg-cyan-50 text-cyan-700 border-cyan-250/50 dark:bg-cyan-950/30 dark:text-cyan-450 dark:border-cyan-900/50';
    return 'bg-sky-50 text-sky-700 border-sky-250/50 dark:bg-sky-950/30 dark:text-sky-450 dark:border-sky-900/50';
};

const isUpcoming = (meeting) => {
    const now = new Date();
    const [year, month, day] = meeting.date.split('-');
    
    let meetingDate;
    let timeStr = meeting.end_time || meeting.start_time;
    if (timeStr) {
        const [hours, minutes] = timeStr.split(':');
        meetingDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    } else {
        meetingDate = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10), 23, 59, 59, 999);
    }
    
    return meetingDate >= now;
};

function renderFilterChips() {
    const filterChipsContainer = document.getElementById('filterChipsContainer');
    if (!filterChipsContainer) return;
    
    filterChipsContainer.innerHTML = CATEGORIES.map(cat => {
        const isActive = selectedType === cat.value;
        const activeClass = isActive 
            ? 'bg-blue-600 text-white shadow-sm border-blue-600 font-extrabold dark:bg-blue-500 dark:border-blue-500' 
            : 'bg-slate-50 hover:bg-slate-100 dark:bg-[#131B2E] dark:hover:bg-[#1E293B] text-slate-650 dark:text-slate-350 border-slate-200/60 dark:border-slate-800/85 font-bold transition-colors';
        return `
            <button type="button" class="filter-chip px-3.5 py-1.5 rounded-full text-xs border transition duration-150 whitespace-nowrap cursor-pointer ${activeClass}" data-value="${cat.value}">
                ${cat.label}
            </button>
        `;
    }).join('');

    filterChipsContainer.querySelectorAll('.filter-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedType = btn.dataset.value;
            renderFilterChips();
            applyFilters();
        });
    });
}

function applyFilters() {
    const sermonSearch = document.getElementById('sermonSearch');
    if (!sermonSearch) return;
    const query = sermonSearch.value.toLowerCase();

    const filtered = currentSermons.filter(s => {
        const matchesSearch = (s.sermon_title && s.sermon_title.toLowerCase().includes(query)) ||
                            (s.meeting_title && s.meeting_title.toLowerCase().includes(query)) ||
                            (s.date && s.date.includes(query)) ||
                            (s.sermon_tags && s.sermon_tags.toLowerCase().includes(query));
        
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

function renderSermonCard(sermon, isUpcomingVal) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const date = new Date(sermon.date);
    const dayOfWeek = days[date.getDay()];
    
    const badgeClass = getBadgeStyles(sermon.type);
    const displayType = sermon.type === '설교' ? '내부설교' : sermon.type;
    
    const borderSelectClass = 'border-slate-100 dark:border-slate-800/80 hover:border-blue-250 dark:hover:border-blue-900 bg-white dark:bg-[#131B2E] transition-colors duration-150';

    return `
        <div class="sermon-card cursor-pointer rounded-xl border p-0 flex items-stretch transition duration-150 ${borderSelectClass}" data-id="${sermon.id}">
            <div class="${isUpcomingVal ? 'bg-blue-500/5 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400' : 'bg-slate-50 text-slate-650 dark:bg-[#0B0F19] dark:text-slate-400'} w-20 p-2 flex flex-col justify-center items-center border-r border-slate-100 dark:border-slate-800/80 shrink-0 transition-colors">
                <span class="text-[9px] font-bold opacity-60 leading-none mb-0.5">${date.getFullYear()}</span>
                <span class="text-sm font-black leading-none">${date.getMonth() + 1}/${date.getDate()}</span>
                <span class="text-[9px] font-bold opacity-60 mt-1">${dayOfWeek}</span>
            </div>
            <div class="p-3.5 flex-1 flex items-center justify-between min-w-0">
                <div class="flex-1 min-w-0 pr-3">
                    <h3 class="text-xs font-black text-slate-800 dark:text-slate-200 truncate leading-snug">
                        ${sermon.sermon_title || sermon.meeting_title}
                    </h3>
                    ${sermon.meeting_title && sermon.sermon_title && sermon.meeting_title !== sermon.sermon_title ? `<p class="text-[10px] text-slate-450 dark:text-slate-500 font-bold truncate mt-0.5">${sermon.meeting_title}</p>` : ''}
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    <span class="${badgeClass} px-2 py-0.5 rounded-full text-[9px] font-black border dark:border-none whitespace-nowrap">${displayType}</span>
                    ${isUpcomingVal ? `<span class="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9px] font-black shadow-sm whitespace-nowrap animate-pulse">예정</span>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderSermons(sermons) {
    const sermonList = document.getElementById('sermonList');
    if (!sermonList) return;

    if (sermons.length === 0) {
        sermonList.innerHTML = '<p class="text-slate-400 italic text-center py-20 font-bold text-xs bg-white dark:bg-[#131B2E] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800/80 transition-colors">조건에 맞는 설교 기록이 없습니다.</p>';
        return;
    }

    const upcoming = sermons.filter(s => isUpcoming(s)).sort((a, b) => new Date(a.date) - new Date(b.date));
    const completed = sermons.filter(s => !isUpcoming(s)).sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = '';

    if (upcoming.length > 0) {
        html += `
            <div class="mb-4">
                <h2 class="text-xs font-black text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1.5 px-1 uppercase tracking-wider">
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
                <h2 class="text-xs font-black text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5 px-1 uppercase tracking-wider">
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
                    <h3 class="text-[11px] font-black text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5 opacity-80 uppercase tracking-widest pl-1">
                        ㆍ${type} (${groups[type].length})
                    </h3>
                    <div class="space-y-2 border-l border-slate-100 dark:border-slate-800/60 pl-3 transition-colors">
                        ${groups[type].map(s => renderSermonCard(s, false)).join('')}
                    </div>
                </div>
            `;
        });
    }

    sermonList.innerHTML = html;

    document.querySelectorAll('.sermon-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = card.dataset.id;
            const sermon = currentSermons.find(s => s.id == id);
            if (!sermon) return;

            const dateObj = new Date(sermon.date);
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const yy = String(dateObj.getFullYear()).slice(-2);
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            const dateStr = `${yy}.${mm}.${dd}(${days[dateObj.getDay()]})`;

            const mockMeetingObj = {
                id: sermon.id,
                date: sermon.date,
                title: sermon.meeting_title,
                type: sermon.type,
                sermon_title: sermon.sermon_title,
                sermon_tags: sermon.sermon_tags || '',
                start_time: sermon.start_time,
                end_time: sermon.end_time
            };

            showSingleMeetingDetail(mockMeetingObj, sermon.type || '모임 상세', dateStr);
            openDetailPanel();
        });
    });
}

async function fetchStats() {
    try {
        const res = await fetch('/api/sermon-stats');
        const data = await res.json();
        
        document.getElementById('kpiTotalMeetings').textContent = data.totalAnalyzed + '개';

        // 1. 데이터 캐싱 및 목록 렌더링
        currentSermons = data.matchedSermons || [];
        renderFilterChips();
        applyFilters();

        // 2. 모임 구분 해시태그 필터 칩 렌더링
        renderKeywordFilters();

        // 3. 필터 기준에 따른 실시간 워드 클라우드 렌더링
        updateWordCloud();

        // 4. 성경 분포 세로 막대 차트 (신구약 분리) 렌더링
        if (data.bibleDist && data.bibleDist.length > 0) {
            renderBibleCharts(data.bibleDist);
        }

    } catch(e) {
        console.error(e);
    }
}

// Register ChartDataLabels plugin
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

async function fetchAttendanceCharts() {
    try {
        const res = await fetch('/api/meetings');
        const data = await res.json();
        // /api/meetings returns an array of meetings
        const meetings = Array.isArray(data) ? data : (data.meetings || []);
        
        let visitations = 0;
        let counselings = 0;
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        
        // Generate 12 months for the current year
        const months12 = [];
        const monthKeys12 = [];
        for (let i = 1; i <= 12; i++) {
            months12.push(`${i}월`);
            monthKeys12.push(`${currentYear}-${String(i).padStart(2, '0')}`);
        }

        // Generate last 6 months labels
        const months6 = [];
        const monthKeys6 = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(currentYear, currentMonth - i, 1);
            months6.push(`${d.getMonth() + 1}월`);
            monthKeys6.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`);
        }
        
        const currentMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
        
        // Data structure
        const categories = {
            'distChart': {}, // 구역모임
            'grpChart': {},  // 조모임
            'broChart': {},  // 형제모임
            'ythChart': {}   // 청년모임
        };
        
        meetings.forEach(m => {
            const mDate = new Date(m.date);
            if (mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear) {
                if(m.type.includes('심방')) visitations++;
                if(m.type.includes('상담')) counselings++;
            }
            
            const monthKey = `${mDate.getFullYear()}-${String(mDate.getMonth()+1).padStart(2, '0')}`;
            
            let chartKey = null;
            let groupName = '전체';
            
            if (m.type.includes('구역모임')) {
                chartKey = 'distChart';
                groupName = m.type.replace('구역모임', '').trim() || '구역';
            } else if (m.type.includes('조모임')) {
                chartKey = 'grpChart';
                groupName = m.type.replace('조모임', '').trim() || '조';
            } else if (m.type.includes('형제모임')) {
                chartKey = 'broChart';
                groupName = m.type.replace('형제모임', '').trim() || '형제';
            } else if (m.type.includes('청년모임')) {
                chartKey = 'ythChart';
                groupName = m.type.replace('청년모임', '').trim() || '청년';
            }
            
            if (chartKey) {
                const targetKeys = (chartKey === 'distChart' || chartKey === 'grpChart') ? monthKeys12 : monthKeys6;
                if (!targetKeys.includes(monthKey)) return;
                
                if (chartKey === 'broChart' || chartKey === 'ythChart') {
                    const distAttendees = m.district_attendees && Object.keys(m.district_attendees).length > 0
                        ? m.district_attendees
                        : { '미지정': m.attendee_count || 0 };
                    
                    const distTestimonies = m.district_testimonies || {};

                    Object.keys(distAttendees).forEach(dist => {
                        const count = distAttendees[dist] || 0;
                        if (count === 0) return;
                        
                        const subGroupName = dist;
                        
                        if (!categories[chartKey][subGroupName]) {
                            categories[chartKey][subGroupName] = {};
                            targetKeys.forEach(mk => {
                                if (mk > currentMonthKey) {
                                    categories[chartKey][subGroupName][mk] = null;
                                } else {
                                    categories[chartKey][subGroupName][mk] = { att: 0, test: 0 };
                                }
                            });
                        }
                        
                        if (categories[chartKey][subGroupName][monthKey] !== null) {
                            categories[chartKey][subGroupName][monthKey].att += count;
                            categories[chartKey][subGroupName][monthKey].test += (distTestimonies[dist] || 0);
                        }
                    });
                } else {
                    if (!categories[chartKey][groupName]) {
                        categories[chartKey][groupName] = {};
                        targetKeys.forEach(mk => {
                            if (mk > currentMonthKey) {
                                categories[chartKey][groupName][mk] = null;
                            } else {
                                categories[chartKey][groupName][mk] = { att: 0, test: 0 };
                            }
                        });
                    }
                    
                    if (categories[chartKey][groupName][monthKey] !== null) {
                        categories[chartKey][groupName][monthKey].att += (m.attendee_count || 0);
                        categories[chartKey][groupName][monthKey].test += (m.testimony_count || 0);
                    }
                }
            }
        });
        
        document.getElementById('kpiVisitations').textContent = visitations + '건';
        document.getElementById('kpiCounselings').textContent = counselings + '건';
        document.getElementById('kpiAttendance').textContent = '78%'; // Placeholder
        
        // 누적 세로막대 상단에 총합 표시 플러그인
        const stackedBarTotalPlugin = {
            id: 'stackedBarTotal',
            afterDatasetsDraw(chart) {
                const { ctx, scales: { x, y } } = chart;
                if (!x.options.stacked) return;

                const numDataPoints = chart.data.labels.length;
                const sums = Array(numDataPoints).fill(0);
                
                const visibleDatasets = chart.data.datasets.filter((ds, index) => {
                    const meta = chart.getDatasetMeta(index);
                    return meta.visible && ds.label !== '전체 평균' && ds.type !== 'line';
                });

                visibleDatasets.forEach(ds => {
                    ds.data.forEach((val, i) => {
                        if (val !== null && val !== undefined) {
                            sums[i] += val;
                        }
                    });
                });

                ctx.save();
                ctx.font = 'bold 10px ui-sans-serif, system-ui';
                ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                sums.forEach((sum, i) => {
                    if (sum === 0) return;
                    const xPos = x.getPixelForValue(chart.data.labels[i]);
                    const yPos = y.getPixelForValue(sum) - 4;
                    ctx.fillText(sum, xPos, yPos);
                });
                ctx.restore();
            }
        };

        const renderChart = (id, catData, targetMonths, targetKeys, isBar = true, kpiContainerId = null, alertContainerId = null, isStacked = false) => {
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
            
            const getGroupColor = (name, index) => {
                const fixedColors = {
                    '581구역': '#3b82f6', // 파랑
                    '582구역': '#10b981', // 초록
                    '583구역': '#f59e0b', // 노랑
                    '581': '#3b82f6',
                    '582': '#10b981',
                    '583': '#f59e0b',
                    '미지정': '#64748b'
                };
                return fixedColors[name] || colors[index % colors.length];
            };
            
            // Calculate global average across all visible months
            let globalTotalAtt = 0;
            let globalGroupCount = 0;
            targetKeys.forEach(mk => {
                if (mk > currentMonthKey) return;
                Object.keys(catData).forEach(group => {
                    const d = catData[group][mk];
                    if (d !== null && d.att > 0) {
                        globalTotalAtt += d.att;
                        globalGroupCount++;
                    }
                });
            });
            const globalAvg = globalGroupCount > 0 ? (globalTotalAtt / globalGroupCount) : null;

            const monthAverages = targetKeys.map(mk => {
                if (mk > currentMonthKey) return null;
                return globalAvg;
            });

            // At-Risk Calculation
            const atRiskGroups = [];
            
            // Current month stats for KPIs
            let currentMonthTotalAtt = 0;
            let currentMonthTotalTest = 0;
            let currentMonthGroupCount = 0;
            let prevMonthTotalAtt = 0;
            
            // Find current and prev month index from targetKeys (which are sorted)
            let currIdx = -1;
            for(let i=targetKeys.length-1; i>=0; i--) {
                if(targetKeys[i] <= currentMonthKey) {
                    currIdx = i; break;
                }
            }

            Object.keys(catData).sort().forEach((group, i) => {
                const dataPoints = targetKeys.map(mk => {
                    const d = catData[group][mk];
                    return d ? d.att : null;
                });
                
                // Add individual group bar dataset
                const groupColor = getGroupColor(group, i);
                datasets.push({
                    label: group,
                    data: dataPoints,
                    backgroundColor: isBar ? groupColor : undefined,
                    borderColor: groupColor,
                    borderWidth: 2,
                    borderRadius: isBar ? (isStacked ? 0 : 4) : 0,
                    fill: false,
                    tension: 0.1,
                    spanGaps: false
                });

                // Check At-Risk (last 3 months dropping or < half of average)
                if (currIdx >= 2) {
                    const m0 = catData[group][targetKeys[currIdx]];
                    const m1 = catData[group][targetKeys[currIdx-1]];
                    const m2 = catData[group][targetKeys[currIdx-2]];
                    
                    if (m0 && m1 && m2) {
                        // 3 months consecutive drop
                        if (m0.att < m1.att && m1.att < m2.att && m0.att > 0) {
                            atRiskGroups.push(group);
                        }
                    }
                }

                // Gather KPI data
                if (currIdx >= 0) {
                    const cm = catData[group][targetKeys[currIdx]];
                    if (cm && cm.att > 0) {
                        currentMonthTotalAtt += cm.att;
                        currentMonthTotalTest += cm.test;
                        currentMonthGroupCount++;
                    }
                }
            });
            
            // Add Overall Average Line Dataset
            if (Object.keys(catData).length > 0) {
                datasets.push({
                    label: '전체 평균',
                    data: monthAverages,
                    type: 'line',
                    borderColor: '#ef4444',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    backgroundColor: 'transparent',
                    pointBackgroundColor: '#ef4444',
                    tension: 0.1,
                    spanGaps: false,
                    order: -1 // draw on top
                });
            }
            
            if (datasets.length === 0) {
                datasets.push({ label: '데이터 없음', data: targetKeys.map(() => 0) });
            }

            // Render KPIs and Alerts
            if (kpiContainerId) {
                const kpiEl = document.getElementById(kpiContainerId);
                const alertEl = document.getElementById(alertContainerId);
                if (kpiEl) {
                    if (currentMonthGroupCount > 0) {
                        const avgAtt = (currentMonthTotalAtt / currentMonthGroupCount).toFixed(1);
                        const sharingRate = currentMonthTotalAtt > 0 ? Math.round((currentMonthTotalTest / currentMonthTotalAtt)*100) : 0;
                        let momHtml = '';
                        let prevTotalAtt = 0, prevGroupCount = 0, prevTotalTest = 0;
                        if (currIdx >= 1) {
                            Object.keys(catData).forEach(group => {
                                const pm = catData[group][targetKeys[currIdx-1]];
                                if (pm && pm.att > 0) {
                                    prevTotalAtt += pm.att;
                                    prevTotalTest += pm.test;
                                    prevGroupCount++;
                                }
                            });
                        }
                        const prevAvg = prevGroupCount > 0 ? (prevTotalAtt / prevGroupCount) : 0;
                        const prevSharingRate = prevTotalAtt > 0 ? Math.round((prevTotalTest / prevTotalAtt)*100) : 0;
                        
                        if (currIdx >= 1 && prevAvg > 0) {
                            const avgAttVal = currentMonthTotalAtt / currentMonthGroupCount;
                            const mom = Math.round(((avgAttVal - prevAvg) / prevAvg) * 100);
                            if (mom > 0) {
                                momHtml = `<span class="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1 opacity-80">ㅣ전월비 ▲${mom}%</span>`;
                            } else if (mom < 0) {
                                momHtml = `<span class="text-xs font-bold text-red-500 ml-1 opacity-80">ㅣ전월비 ▼${Math.abs(mom)}%</span>`;
                            } else {
                                momHtml = `<span class="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1 opacity-80">ㅣ전월비 -</span>`;
                            }
                        }

                        let momTestHtml = '';
                        if (currIdx >= 1) {
                            const momTest = sharingRate - prevSharingRate;
                            if (momTest > 0) {
                                momTestHtml = `<span class="text-xs font-bold text-blue-600 dark:text-blue-400 ml-1 opacity-80">ㅣ전월비 ▲${momTest}%p</span>`;
                            } else if (momTest < 0) {
                                momTestHtml = `<span class="text-xs font-bold text-red-500 ml-1 opacity-80">ㅣ전월비 ▼${Math.abs(momTest)}%p</span>`;
                            } else {
                                momTestHtml = `<span class="text-xs font-bold text-gray-500 dark:text-gray-400 ml-1 opacity-80">ㅣ전월비 -</span>`;
                            }
                        }

                        kpiEl.innerHTML = `
                            <div class="px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs shadow-sm flex items-center">
                                <span class="text-slate-500 dark:text-slate-400 mr-1">당월 평균 출석:</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">${avgAtt}명</span>
                                ${momHtml}
                            </div>
                            <div class="px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs shadow-sm flex items-center">
                                <span class="text-slate-500 dark:text-slate-400 mr-1">당월 간증 참여:</span>
                                <span class="font-bold text-blue-600 dark:text-blue-400">${sharingRate}%</span>
                                ${momTestHtml}
                            </div>
                        `;
                    } else {
                        kpiEl.innerHTML = '';
                    }
                }
                if (alertEl) {
                    if (atRiskGroups.length > 0) {
                        alertEl.classList.remove('hidden');
                        alertEl.innerHTML = `🚨 심방/격려 필요: ${atRiskGroups.join(', ')} (최근 3개월 지속 하락)`;
                    } else {
                        alertEl.classList.add('hidden');
                        alertEl.innerHTML = '';
                    }
                }
            }

            const existingChart = Chart.getChart(id);
            if (existingChart) {
                existingChart.destroy();
                window.myCharts = window.myCharts.filter(c => c !== existingChart);
            }

            const c = new Chart(document.getElementById(id), {
                type: isBar ? 'bar' : 'line',
                data: {
                    labels: targetMonths,
                    datasets: datasets
                },
                plugins: [stackedBarTotalPlugin],
                options: { 

                    responsive: true, 
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 20 }
                    },
                    plugins: {
                        datalabels: {
                            display: function(context) {
                                // Don't show labels for the average line
                                if(context.dataset.label === '전체 평균') return false;
                                return context.dataset.data[context.dataIndex] > 0;
                            },
                            color: function() {
                                if (isStacked) return '#ffffff';
                                return document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
                            },
                            anchor: isStacked ? 'center' : 'end',
                            align: isStacked ? 'center' : 'top',
                            offset: isStacked ? 0 : -2,
                            font: {
                                weight: 'bold',
                                size: isStacked ? 9 : 10
                            },
                            formatter: Math.round
                        },
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                boxWidth: 8,
                                font: { size: 11 },
                                color: () => document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#1e293b'
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if(context.dataset.label === '전체 평균') {
                                        return `전체 기간 평균: ${context.parsed.y.toFixed(1)}명`;
                                    }
                                    const group = context.dataset.label;
                                    const mk = targetKeys[context.dataIndex];
                                    const raw = catData[group][mk];
                                    if(raw && raw.att > 0) {
                                        const rate = Math.round((raw.test / raw.att)*100);
                                        return `${group}: ${raw.att}명 (간증 ${raw.test}명, ${rate}%)`;
                                    }
                                    return `${group}: ${context.parsed.y}명`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: isStacked,
                            grid: {
                                color: () => document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                            },
                            ticks: {
                                color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569'
                            }
                        },
                        y: {
                            stacked: isStacked,
                            beginAtZero: true,
                            ticks: { 
                                precision: 0,
                                color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569'
                            },
                            grid: {
                                color: () => document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                            }
                        }
                    },
                    onHover: (event, chartElement) => {
                        event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                    },
                    onClick: (e, elements) => {
                        if (elements.length > 0) {
                            const datasetIndex = elements[0].datasetIndex;
                            const index = elements[0].index;
                            const dataset = datasets[datasetIndex];
                            
                            // Average line click doesn't open detail
                            if (dataset.label === '전체 평균') return;

                            const clickedLabel = targetMonths[index];
                            const clickedMonthKey = targetKeys[index];
                            const clickedGroup = dataset.label;
                            
                            showDetailPanel(clickedGroup, clickedMonthKey, clickedLabel, meetings, id);
                        }
                    }
                }
            });
            window.myCharts.push(c);
        };
        
        renderChart('distChart', categories['distChart'], months12, monthKeys12, true, 'distKpiContainer', 'distAlertContainer');
        renderChart('grpChart', categories['grpChart'], months12, monthKeys12, true, 'grpKpiContainer', 'grpAlertContainer');
        renderChart('broChart', categories['broChart'], months6, monthKeys6, true, 'broKpiContainer', 'broAlertContainer', true);
        renderChart('ythChart', categories['ythChart'], months6, monthKeys6, true, 'ythKpiContainer', 'ythAlertContainer', true);

    } catch(e) {
        console.error(e);
    }
}

// Side Panel UI Logic
const detailPanelOverlay = document.getElementById('detailPanelOverlay');
const meetingPanelsContainer = document.getElementById('meetingPanelsContainer');
const closeDetailPanelBtn = document.getElementById('closeDetailPanelBtn');
const backToMeetingListBtn = document.getElementById('backToMeetingListBtn');
const detailPanelTitle = document.getElementById('detailPanelTitle');
const detailPanelSubtitle = document.getElementById('detailPanelSubtitle');
const detailMeetingList = document.getElementById('detailMeetingList');
const detailEmptyState = document.getElementById('detailEmptyState');
const editBtnContainer = document.getElementById('editBtnContainer');
const editMeetingDetailBtn = document.getElementById('editMeetingDetailBtn');

let lastActiveGroup = '';
let lastActiveMonthLabel = '';

function openDetailPanel() {
    detailPanelOverlay.classList.remove('hidden');
    // slight delay to allow display:block to apply before opacity transition
    setTimeout(() => {
        detailPanelOverlay.classList.remove('opacity-0');
        meetingPanelsContainer.classList.remove('translate-x-full');
    }, 10);
}

function closeDetailPanel() {
    detailPanelOverlay.classList.add('opacity-0');
    meetingPanelsContainer.classList.add('translate-x-full');
    setTimeout(() => {
        detailPanelOverlay.classList.add('hidden');
    }, 300);
}

if (closeDetailPanelBtn) closeDetailPanelBtn.addEventListener('click', closeDetailPanel);
if (detailPanelOverlay) detailPanelOverlay.addEventListener('click', closeDetailPanel);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && detailPanelOverlay && !detailPanelOverlay.classList.contains('hidden')) {
        closeDetailPanel();
    }
});

if (backToMeetingListBtn) {
    backToMeetingListBtn.addEventListener('click', () => {
        backToMeetingListBtn.classList.add('hidden');
        document.getElementById('singleMeetingDetailContainer').classList.add('hidden');
        document.getElementById('detailMeetingList').classList.remove('hidden');
        if (editBtnContainer) editBtnContainer.classList.add('hidden');
        
        detailPanelTitle.textContent = lastActiveGroup;
        detailPanelSubtitle.textContent = lastActiveMonthLabel + ' 전체 모임 내역';
    });
}

async function showSingleMeetingDetail(m, groupName, monthLabel) {
    console.log("[DEBUG] showSingleMeetingDetail called with m:", m);
    const container = document.getElementById('singleMeetingDetailContainer');
    const listContainer = document.getElementById('detailMeetingList');
    
    if (backToMeetingListBtn) backToMeetingListBtn.classList.remove('hidden');
    if (listContainer) listContainer.classList.add('hidden');
    if (editBtnContainer) {
        editBtnContainer.classList.remove('hidden');
        const activeEditBtn = document.getElementById('editMeetingDetailBtn');
        if (activeEditBtn) {
            activeEditBtn.onclick = () => {
                console.log("[DEBUG] editMeetingDetailBtn clicked. Target m.id:", m.id);
                window.openGlobalMeetingEditor(m.id, async () => {
                    await fetchStats();
                    const updated = currentSermons.find(item => item.id == m.id);
                    if (updated) {
                        showSingleMeetingDetail(updated, groupName, monthLabel);
                    }
                }, () => {
                    const listContainer = document.getElementById('detailMeetingList');
                    const singleContainer = document.getElementById('singleMeetingDetailContainer');
                    const editBtnCon = document.getElementById('editBtnContainer');
                    const backBtn = document.getElementById('backToMeetingListBtn');
                    
                    if (backBtn && !backBtn.classList.contains('hidden')) {
                        backBtn.click();
                    } else {
                        closeDetailPanel();
                    }
                    fetchStats();
                });
            };
        }
    }
    
    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = '<div class="text-center py-8 text-slate-400 font-bold">상세 정보 로딩 중...</div>';
    }
    
    detailPanelTitle.textContent = m.title || groupName;
    
    let timeStr = m.start_time || '';
    if (m.start_time && m.end_time) {
        timeStr = `${m.start_time}~${m.end_time}`;
    }
    detailPanelSubtitle.textContent = `${new Date(m.date).toLocaleDateString()}${timeStr ? ' ' + timeStr : ''} | ${m.type === '설교' ? '내부설교' : m.type}`;
    
    try {
        const id = m.id;
        const res = await fetch(`/api/meetings/${id}/attendance`);
        const att = await res.json();
        const p = att.filter(a => a.is_present);
        const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());
        
        // Absent list logic matching app.js
        let absentHtml = '';
        const typeStr = m.type || '';
        if (!['설교', '외부설교', '심방', '교회행사', '기타', '상담'].includes(typeStr)) {
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
                allTargets = allTargets.filter(member => member.bs === 'B');
            }

            if (typeStr.includes('조모임')) {
                allTargets = allTargets.filter(member => member.bs === 'S' && member.category !== '청년회');
            }

            if (typeStr === '교구임원모임') {
                allTargets = allTargets.filter(member => member.position && member.position.trim().length > 0);
            }

            const presentIds = p.map(a => a.member_id);
            const absentees = allTargets.filter(member => !presentIds.includes(member.id));

            if (absentees.length > 0) {
                absentHtml = `
                    <div class="mt-6 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800/80">
                        <h4 class="text-xs font-black text-gray-400 dark:text-slate-500 mb-2 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                        <div class="flex flex-wrap gap-1">
                            ${absentees.map(member => `<span class="px-2.5 py-1 bg-gray-100 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 rounded text-xs font-bold">${member.name}</span>`).join('')}
                        </div>
                    </div>
                `;
            }
        }

        // Testimony matching app.js
        let testimonyHtml = '';
        if (pWithTestimony.length > 0) {
            testimonyHtml = `
                <div class="mt-6 pt-4 border-t border-dashed border-slate-200 dark:border-slate-800/80">
                    <h4 class="text-xs font-black text-blue-700 dark:text-blue-400 mb-2 uppercase tracking-wider">간증 (${pWithTestimony.length}명)</h4>
                    <div class="space-y-2">
                        ${pWithTestimony.map(a => `
                            <div class="p-2.5 bg-blue-50/50 dark:bg-blue-950/20 rounded border border-blue-100 dark:border-blue-900/30">
                                <div class="font-bold text-blue-850 dark:text-blue-300 text-base">${a.members?.name || a.name || ''}</div>
                                <p class="text-base md:text-lg font-semibold text-slate-800 dark:text-slate-200 mt-2 pl-3 border-l-2 border-blue-500 dark:border-blue-400">${a.testimony_snapshot}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        let detailHTML = '';
        if (typeStr === '교회행사') {
            if (m.memo && m.memo.trim()) {
                detailHTML = `
                    <div class="mb-4 bg-teal-50/50 dark:bg-teal-950/10 p-4.5 rounded-xl border border-teal-100/70 dark:border-teal-900/30 shadow-sm">
                        <h4 class="text-xs font-black text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-teal-600 dark:text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            행사 메모 / 안내 사항
                        </h4>
                        <p class="text-base text-slate-800 dark:text-slate-200 font-semibold whitespace-pre-wrap leading-relaxed">${m.memo}</p>
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
                <div class="mb-4 bg-white dark:bg-[#1e293b] p-4.5 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                    <span class="font-bold text-lg dark:text-slate-200">총 참석</span>
                    <span class="text-3xl font-black text-blue-600 dark:text-blue-400">${p.length}명</span>
                </div>
                ${m.church ? `<div class="mb-4 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-900/30"><h4 class="text-xs font-black text-blue-700 dark:text-blue-400">외부 교회</h4><p class="font-bold text-lg dark:text-slate-200">${m.church}</p></div>` : ''}
                ${m.sermon_title ? `<div class="mb-4 bg-yellow-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-yellow-200 dark:border-amber-900/30"><h4 class="text-xs font-black text-yellow-700 dark:text-amber-400">설교</h4><p class="font-bold text-lg dark:text-slate-100">${m.sermon_title}</p></div>` : ''}
                ${m.sermon_tags ? `
                    <div class="mb-4 flex flex-wrap gap-1.5">
                        ${m.sermon_tags.split(/[,\s#]+/).map(t => t.trim()).filter(t => t.length > 0).map(t => `<span class="px-2 py-1 bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 dark:border dark:border-amber-900/30 rounded-lg text-xs font-bold">#${t}</span>`).join('')}
                    </div>
                ` : ''}
                ${m.memo ? `<div class="mb-4 bg-slate-50 dark:bg-[#172237]/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-850/50"><h4 class="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">메모</h4><p class="text-base font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">${m.memo}</p></div>` : ''}
                
                <div class="mb-4">
                    <h4 class="text-xs font-black text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">참석자</h4>
                    <div class="flex flex-wrap gap-1">
                        ${p.map(a => `<span class="px-2.5 py-1.5 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 dark:border dark:border-blue-900/30 rounded text-xs font-bold">${a.members?.name || a.name || ''}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            ${detailHTML}
            ${absentHtml}
            ${testimonyHtml}
        `;

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div class="text-center py-8 text-red-500">상세 정보를 불러오는 중 에러가 발생했습니다.</div>';
    }
}

function showDetailPanel(groupName, monthKey, monthLabel, allMeetings, chartId = null) {
    lastActiveGroup = groupName;
    lastActiveMonthLabel = monthLabel;
    
    if (backToMeetingListBtn) backToMeetingListBtn.classList.add('hidden');
    document.getElementById('singleMeetingDetailContainer').classList.add('hidden');
    document.getElementById('detailMeetingList').classList.remove('hidden');
    
    let displayTitle = groupName;
    if (chartId === 'broChart') {
        displayTitle = `형제모임 (${groupName})`;
    } else if (chartId === 'ythChart') {
        displayTitle = `청년모임 (${groupName})`;
    }
    detailPanelTitle.textContent = displayTitle;
    detailPanelSubtitle.textContent = `${monthLabel} 전체 모임 내역`;
    
    // Filter meetings matching the exact monthKey (YYYY-MM) and the groupName
    const filtered = allMeetings.filter(m => {
        const mDate = new Date(m.date);
        const mk = `${mDate.getFullYear()}-${String(mDate.getMonth()+1).padStart(2, '0')}`;
        if (mk !== monthKey) return false;
        
        if (chartId === 'broChart') {
            return m.type.includes('형제모임');
        }
        if (chartId === 'ythChart') {
            return m.type.includes('청년모임');
        }
        
        return m.type.includes(groupName);
    });
    
    detailMeetingList.innerHTML = '';
    
    if (filtered.length === 0) {
        detailMeetingList.classList.add('hidden');
        detailEmptyState.classList.remove('hidden');
    } else {
        detailMeetingList.classList.remove('hidden');
        detailEmptyState.classList.add('hidden');
        
        filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(m => {
            const el = document.createElement('div');
            el.className = 'bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors';
            el.onclick = () => showSingleMeetingDetail(m, groupName, monthLabel);
            
            const badgeColor = m.attendee_count > 0 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
            
            el.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs font-black px-2 py-1 rounded-lg ${badgeColor}">
                        참석 ${m.attendee_count}명
                    </span>
                    <span class="text-xs font-bold text-slate-400">
                        ${new Date(m.date).toLocaleDateString()}
                    </span>
                </div>
                <h4 class="font-bold text-sm text-slate-800 dark:text-slate-100 mb-1 leading-tight">
                    ${m.sermon_title || m.title || '(제목 없음)'}
                </h4>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                    ${(m.memo || '메모가 없습니다.').replace(/\{.*?\}/, '').trim() || '메모가 없습니다.'}
                </p>
            `;
            detailMeetingList.appendChild(el);
        });
    }
    
    openDetailPanel();
}

// Bible Sermons Modal Elements
const bibleSermonsModal = document.getElementById('bibleSermonsModal');
const bibleSermonsModalBackdrop = document.getElementById('bibleSermonsModalBackdrop');
const closeBibleSermonsModal = document.getElementById('closeBibleSermonsModal');
const closeBibleSermonsModalBtn = document.getElementById('closeBibleSermonsModalBtn');
const bibleModalTitle = document.getElementById('bibleModalTitle');
const bibleSermonsTableBody = document.getElementById('bibleSermonsTableBody');

function openBibleModal(bookName, list) {
    if (!bibleSermonsModal) return;
    if (bibleModalTitle) bibleModalTitle.textContent = bookName;
    if (bibleSermonsTableBody) {
        bibleSermonsTableBody.innerHTML = '';
        
        if (list.length === 0) {
            bibleSermonsTableBody.innerHTML = `<tr><td colspan="3" class="text-center py-6 text-slate-400 dark:text-slate-505 font-bold italic">설교 이력이 없습니다.</td></tr>`;
        } else {
            // Sort by date desc
            const sortedList = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
            sortedList.forEach(s => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group";
                
                const d = new Date(s.date);
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const yy = String(d.getFullYear()).slice(-2);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const dateStr = `${yy}.${mm}.${dd}(${days[d.getDay()]})`;

                tr.onclick = () => {
                    closeBibleModal();
                    // Show detail panel
                    const mockMeetingObj = {
                        id: s.id,
                        date: s.date,
                        title: s.meeting_title,
                        type: s.type,
                        sermon_title: s.sermon_title,
                        sermon_tags: s.sermon_tags || '',
                        start_time: s.start_time,
                        end_time: s.end_time
                    };
                    showSingleMeetingDetail(mockMeetingObj, s.type || '모임 상세', dateStr);
                    openDetailPanel();
                };

                tr.innerHTML = `
                    <td class="px-3 py-2.5 whitespace-nowrap group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-bold">${dateStr}</td>
                    <td class="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${s.sermon_title || '(제목 없음)'}</td>
                    <td class="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-semibold min-w-[120px]">${s.meeting_title || (s.type === '설교' ? '내부설교' : s.type) || ''}</td>
                `;
                bibleSermonsTableBody.appendChild(tr);
            });
        }
    }

    bibleSermonsModal.classList.remove('hidden');
    setTimeout(() => {
        const modalContent = bibleSermonsModal.querySelector('.bg-white, .dark\\:bg-\\[\\#131B2E\\]');
        if (modalContent) {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
}

function closeBibleModal() {
    if (!bibleSermonsModal) return;
    const modalContent = bibleSermonsModal.querySelector('.bg-white, .dark\\:bg-\\[\\#131B2E\\]');
    if (modalContent) {
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-95', 'opacity-0');
    }
    setTimeout(() => {
        bibleSermonsModal.classList.add('hidden');
    }, 200);
}

if (closeBibleSermonsModal) closeBibleSermonsModal.onclick = closeBibleModal;
if (closeBibleSermonsModalBtn) closeBibleSermonsModalBtn.onclick = closeBibleModal;
if (bibleSermonsModalBackdrop) bibleSermonsModalBackdrop.onclick = closeBibleModal;

// Tag Sermons Modal Elements
const tagSermonsModal = document.getElementById('tagSermonsModal');
const tagSermonsModalBackdrop = document.getElementById('tagSermonsModalBackdrop');
const closeTagSermonsModal = document.getElementById('closeTagSermonsModal');
const closeTagSermonsModalBtn = document.getElementById('closeTagSermonsModalBtn');
const tagModalTitle = document.getElementById('tagModalTitle');
const tagSermonsTableBody = document.getElementById('tagSermonsTableBody');

function openTagSermonsModal(tag) {
    if (!tagSermonsModal) return;
    if (tagModalTitle) tagModalTitle.textContent = `#${tag}`;
    if (tagSermonsTableBody) {
        tagSermonsTableBody.innerHTML = '';

        // s.sermon_tags에서 정규식 파싱 후 단어 목록 추출하여 비교
        const matches = currentSermons.filter(s => {
            if (!s.sermon_tags) return false;
            const tagList = s.sermon_tags.replace(/[#]/g, '').replace(/[^\w\s가-힣]/g, ' ').split(/\s+/).map(t => t.trim());
            return tagList.includes(tag);
        });

        if (matches.length === 0) {
            tagSermonsTableBody.innerHTML = `<tr><td colspan="3" class="text-center py-6 text-slate-400 dark:text-slate-505 font-bold italic">설교 및 모임 이력이 없습니다.</td></tr>`;
        } else {
            // Sort by date desc
            const sortedList = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date));
            sortedList.forEach(s => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group";
                
                const d = new Date(s.date);
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const yy = String(d.getFullYear()).slice(-2);
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const dateStr = `${yy}.${mm}.${dd}(${days[d.getDay()]})`;

                tr.onclick = () => {
                    closeTagModal();
                    // Show detail panel
                    const mockMeetingObj = {
                        id: s.id,
                        date: s.date,
                        title: s.meeting_title,
                        type: s.type,
                        sermon_title: s.sermon_title,
                        sermon_tags: s.sermon_tags || '',
                        start_time: s.start_time,
                        end_time: s.end_time
                    };
                    showSingleMeetingDetail(mockMeetingObj, s.type || '모임 상세', dateStr);
                    openDetailPanel();
                };

                tr.innerHTML = `
                    <td class="px-3 py-2.5 whitespace-nowrap group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-bold">${dateStr}</td>
                    <td class="px-3 py-2.5 font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${s.sermon_title || '(제목 없음)'}</td>
                    <td class="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-semibold min-w-[120px]">${s.meeting_title || (s.type === '설교' ? '내부설교' : s.type) || ''}</td>
                `;
                tagSermonsTableBody.appendChild(tr);
            });
        }
    }

    tagSermonsModal.classList.remove('hidden');
    setTimeout(() => {
        const modalContent = tagSermonsModal.querySelector('.bg-white, .dark\\:bg-\\[\\#131B2E\\]');
        if (modalContent) {
            modalContent.classList.remove('scale-95', 'opacity-0');
            modalContent.classList.add('scale-100', 'opacity-100');
        }
    }, 10);
}

function closeTagModal() {
    if (!tagSermonsModal) return;
    const modalContent = tagSermonsModal.querySelector('.bg-white, .dark\\:bg-\\[\\#131B2E\\]');
    if (modalContent) {
        modalContent.classList.remove('scale-100', 'opacity-100');
        modalContent.classList.add('scale-95', 'opacity-0');
    }
    setTimeout(() => {
        tagSermonsModal.classList.add('hidden');
    }, 200);
}

if (closeTagSermonsModal) closeTagSermonsModal.onclick = closeTagModal;
if (closeTagSermonsModalBtn) closeTagSermonsModalBtn.onclick = closeTagModal;
if (tagSermonsModalBackdrop) tagSermonsModalBackdrop.onclick = closeTagModal;

function renderBibleCharts(bibleDist) {
    // Separate New and Old Testament
    const newBibleDist = bibleDist.filter(b => NEW_TESTAMENT_BOOKS.includes(b.book));
    const oldBibleDist = bibleDist.filter(b => OLD_TESTAMENT_BOOKS.includes(b.book));

    // Calculate totals and update headers
    const newTotal = newBibleDist.reduce((sum, item) => sum + (item.count || 0), 0);
    const oldTotal = oldBibleDist.reduce((sum, item) => sum + (item.count || 0), 0);
    
    const newTitleEl = document.getElementById('newTestamentTitle');
    const oldTitleEl = document.getElementById('oldTestamentTitle');
    if (newTitleEl) newTitleEl.textContent = `신약 (${newTotal}회)`;
    if (oldTitleEl) oldTitleEl.textContent = `구약 (${oldTotal}회)`;

    // Render function for each chart
    const renderSingleBibleChart = (canvasId, wrapperId, dataList, themeColor) => {
        const wrapper = document.getElementById(wrapperId);
        const canvas = document.getElementById(canvasId);
        if (!canvas || !wrapper) return;

        // Destroy existing chart if any
        const existingChart = Chart.getChart(canvasId);
        if (existingChart) {
            existingChart.destroy();
            window.myCharts = window.myCharts.filter(c => c !== existingChart);
        }

        // Adjust wrapper width dynamically for horizontal scrolling
        // If dataList length > 10, set wrapper width to length * 45px, otherwise 100%
        if (dataList.length > 10) {
            wrapper.style.width = `${dataList.length * 45}px`;
        } else {
            wrapper.style.width = '100%';
        }

        const labels = dataList.map(b => b.book);
        const counts = dataList.map(b => b.count);

        const chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: counts,
                    backgroundColor: themeColor,
                    borderRadius: 6,
                    maxBarThickness: 24
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569',
                        font: { weight: 'bold', size: 10 },
                        formatter: (val) => val
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569',
                            font: { weight: 'bold', size: 10 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { 
                            color: () => document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'
                        },
                        ticks: {
                            color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569',
                            precision: 0,
                            font: { size: 10 }
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                },
                onClick: (e, elements) => {
                    if (elements.length > 0) {
                        const index = elements[0].index;
                        const clickedBook = labels[index];
                        const related = currentSermons.filter(s => s.sermon_bible === clickedBook);
                        openBibleModal(clickedBook, related);
                    }
                }
            }
        });
        window.myCharts.push(chart);
    };

    // Render New Testament Chart (Blue theme)
    renderSingleBibleChart('newBibleChart', 'newBibleChartWrapper', newBibleDist, '#3b82f6');
    // Render Old Testament Chart (Amber/Orange theme)
    renderSingleBibleChart('oldBibleChart', 'oldBibleChartWrapper', oldBibleDist, '#f59e0b');
}
