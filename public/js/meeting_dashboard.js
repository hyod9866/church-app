window.myCharts = [];

let currentSermons = [];
let sortKey = 'date';
let sortDirection = 'desc'; // 'asc' or 'desc'

let selectedMeetingTypes = new Set();
let wordCloudChart = null;
let selectedWordFilter = null;
let leaderProfile = null;

// 키워드 분석을 위한 한국어 불용어(StopWords) 목록 (백엔드와 정렬)
const KEYWORD_STOP_WORDS = ['수', '있', '하', '것', '들', '그', '되', '이', '보', '않', '없', '나', '사람', '주', '아니', '등', '같', '우리', '때', '년', '가', '한', '지', '대하', '오', '말', '일', '그렇', '위하', '때문', '그것', '두', '말하', '알', '그러나', '받', '못하', '그런', '또', '문제', '더', '사회', '많', '그리고', '좋', '크', '따르', '중', '나오', '가지', '씨', '시키', '만들', '지금', '생각하', '그러', '속', '하나', '집', '살', '모르', '적', '월', '데', '자신', '안', '어떤', '내', '경우', '명', '생각', '시간', '그녀', '다시', '이런', '앞', '보이', '번', '나', '다른', '어떻', '여자', '개', '전', '들', '사실', '이렇', '점', '싶', '말', '정도', '좀', '원', '잘', '통하', '소리', '놓', '위해', '대한'];

// Old & New Testament book constants
const OLD_TESTAMENT_BOOKS = ["창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기", "사무엘상", "사무엘하", "열왕기상", "열왕기하", "역대상", "역대하", "에스라", "느헤미야", "에스더", "욥기", "시편", "잠언", "전도서", "아가", "이사야", "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스", "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기"];
const NEW_TESTAMENT_BOOKS = ["마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서", "고린도전서", "고린도후서", "갈라디아서", "에베소서", "빌립보서", "골로새서", "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서", "빌레몬서", "히브리서", "야고보서", "베드로전서", "베드로후서", "요한1서", "요한2서", "요한3서", "유다서", "요한계시록"];

// 해시태그 필터 버튼 렌더링 함수
function renderKeywordFilters() {
    const container = document.getElementById('keywordCloudFilterContainer');
    if (!container) return;

    // 1. 관리자 구역 정보 기반 필터 버튼 조합 (예: 581구역모임, 581조모임 등)
    const activeTypes = [];
    if (leaderProfile && leaderProfile.districts && leaderProfile.districts.length > 0) {
        leaderProfile.districts.forEach(distNum => {
            activeTypes.push(`${distNum}구역모임`);
        });
        leaderProfile.districts.forEach(distNum => {
            activeTypes.push(`${distNum}조모임`);
        });
    }

    // 2. 공통 교구 전체 모임들 순서 정의
    const globalTypes = ['교구전체모임', '교구형제모임', '전체조모임', '교구임원모임', '교구청년모임', '설교', '외부설교'];
    globalTypes.forEach(g => {
        if (!activeTypes.includes(g)) activeTypes.push(g);
    });

    // 3. 폴백: 현재 DB 상의 모임 중 activeTypes에 지정되지 않은 기타/과거 모임들이 있으면 맨 뒤에 덧붙임
    const dbTypes = new Set();
    currentSermons.forEach(s => {
        if (s.type) dbTypes.add(s.type);
    });
    dbTypes.forEach(t => {
        if (!activeTypes.includes(t)) {
            activeTypes.push(t);
        }
    });

    // 4. 실제로 데이터가 존재하는 종류만 최종 노출
    const typeList = activeTypes.filter(t => dbTypes.has(t));

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
        applyFilters();
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
            applyFilters();
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
        
        // 키워드 클릭 시 최근 설교 목록 필터링 연동
        wordCloudChart.listen("pointClick", function(e) {
            const clickedTag = e.point.get("x");
            if (clickedTag) {
                selectedWordFilter = clickedTag;
                const badgeContainer = document.getElementById("activeKeywordContainer");
                const badgeText = document.getElementById("activeKeywordText");
                if (badgeContainer && badgeText) {
                    badgeText.textContent = `#${clickedTag}`;
                    badgeContainer.classList.remove("hidden");
                }
                applyFilters();
            }
        });

        wordCloudChart.container("wordCloudContainer");
        wordCloudChart.draw();
    }
}

function applyFilters() {
    const searchInput = document.getElementById('sermonSearch');
    const query = searchInput ? searchInput.value.toLowerCase() : '';

    const filtered = currentSermons.filter(s => {
        // 1. 텍스트 검색 필터
        const matchesSearch = (s.sermon_title && s.sermon_title.toLowerCase().includes(query)) ||
                            (s.meeting_title && s.meeting_title.toLowerCase().includes(query)) ||
                            (s.date && s.date.includes(query)) ||
                            (s.memo && s.memo.toLowerCase().includes(query));
        
        // 2. 모임 구분 필터 (상단 칩 동기화)
        let matchesType = true;
        if (selectedMeetingTypes && selectedMeetingTypes.size > 0) {
            matchesType = selectedMeetingTypes.has(s.type);
        }

        // 3. 키워드 클릭 필터 (워드 클라우드 연동)
        let matchesWord = true;
        if (selectedWordFilter) {
            if (!s.sermon_tags) {
                matchesWord = false;
            } else {
                const tagList = s.sermon_tags.replace(/[#]/g, '').replace(/[^\w\s가-힣]/g, ' ').split(/\s+/).map(t => t.trim());
                matchesWord = tagList.includes(selectedWordFilter);
            }
        }
        
        return matchesSearch && matchesType && matchesWord;
    });

    renderSermonTable(filtered);
}

document.addEventListener('DOMContentLoaded', async () => {
    await fetchStats();
    await fetchAttendanceCharts();

    const searchInput = document.getElementById('sermonSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            applyFilters();
        });
    }

    const clearKeywordBtn = document.getElementById('clearKeywordFilter');
    if (clearKeywordBtn) {
        clearKeywordBtn.addEventListener('click', () => {
            selectedWordFilter = null;
            const badgeContainer = document.getElementById("activeKeywordContainer");
            if (badgeContainer) badgeContainer.classList.add("hidden");
            applyFilters();
        });
    }
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

let lastFilteredSermons = [];

function renderSermonTable(sermons = currentSermons) {
    lastFilteredSermons = sermons;
    const tbody = document.getElementById('sermonLogBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort
    const sorted = [...sermons].sort((a, b) => {
        let valA = a[sortKey];
        let valB = b[sortKey];
        
        if (sortKey === 'date') {
            valA = new Date(valA);
            valB = new Date(valB);
        } else if (sortKey === 'attendee_count') {
            valA = Number(valA) || 0;
            valB = Number(valB) || 0;
        } else {
            valA = String(valA || '').toLowerCase();
            valB = String(valB || '').toLowerCase();
        }
        
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    sorted.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group";
        
        const d = new Date(s.date);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yy}.${mm}.${dd}(${days[d.getDay()]})`;
        
        // Calculate if the meeting date is in the future
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const sDateObj = new Date(s.date);
        const sDateTime = new Date(sDateObj.getFullYear(), sDateObj.getMonth(), sDateObj.getDate()).getTime();
        const isUpcoming = sDateTime > todayStart;
        const upcomingBadge = isUpcoming ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-black bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 dark:border dark:border-blue-900/40 mr-1.5 whitespace-nowrap align-middle">예정</span>` : '';

        const attendeeText = s.attendee_count ? `${s.attendee_count}명` : '-';
        const attendeeClass = s.attendee_count ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 font-medium';

        tr.onclick = () => {
            console.log("[DEBUG] Table Row Clicked. s:", s);
            // Need to mock title and type for the detail panel mapping
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
            console.log("[DEBUG] Calling showSingleMeetingDetail with mock:", mockMeetingObj);
            showSingleMeetingDetail(mockMeetingObj, s.type || '모임 상세', dateStr);
            openDetailPanel();
        };

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${dateStr}</td>
            <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${upcomingBadge}${s.meeting_title || '(모임 제목 없음)'}</td>
            <td class="px-4 py-3 min-w-[120px]">${s.type === '설교' ? '내부설교' : s.type}</td>
            <td class="px-4 py-3 font-medium text-slate-650 dark:text-slate-400">${s.sermon_title || '(설교 제목 없음)'}</td>
            <td class="px-4 py-3 font-bold ${attendeeClass}">${attendeeText}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update icons
    const keys = ['date', 'meeting_title', 'type', 'sermon_title', 'attendee_count'];
    keys.forEach(k => {
        const icon = document.getElementById(`sort-icon-${k}`);
        if (icon) {
            if (k === sortKey) {
                icon.textContent = sortDirection === 'asc' ? '▲' : '▼';
                icon.classList.remove('opacity-0', 'text-slate-400', 'dark:text-slate-500');
                icon.classList.add('text-blue-600', 'dark:text-blue-400');
            } else {
                icon.textContent = '▲';
                icon.classList.add('opacity-0', 'text-slate-400', 'dark:text-slate-500');
                icon.classList.remove('text-blue-600', 'dark:text-blue-400');
            }
        }
    });
}

window.sortSermons = function(key) {
    if (sortKey === key) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey = key;
        sortDirection = 'asc';
    }
    renderSermonTable(lastFilteredSermons);
};

async function fetchStats() {
    try {
        // 관리자 프로필 정보 동적 조회
        if (!leaderProfile) {
            try {
                const uRes = await fetch('/api/users/default-profile');
                leaderProfile = await uRes.json();
            } catch (err) {
                console.error('관리자 프로필 로드 실패:', err);
            }
        }

        const res = await fetch('/api/sermon-stats');
        const data = await res.json();
        
        document.getElementById('kpiTotalMeetings').textContent = data.totalAnalyzed + '개';

        // 1. 데이터 캐싱 및 목록 렌더링
        currentSermons = data.matchedSermons || [];
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

// [2026-07-06] "이번 달 교구 출석률" KPI 실계산.
// 예전에는 '78%' 하드코딩 표시였음 (통계 오류). 대시보드(dashboard.js)와 완전히
// 동일한 데이터(/api/dashboard/attendance)와 동일한 판정(js/mandatory_meeting.js)으로,
// 이번 달에 이미 지난 모임들에 대해 [참석 연인원 ÷ 의무대상(또는 실제 참석) 연인원]을 계산한다.
// 계산할 데이터가 없으면 숫자를 지어내지 않고 '--%'로 둔다.
async function updateAttendanceKpi() {
    const kpiEl = document.getElementById('kpiAttendance');
    if (!kpiEl) return;
    try {
        // 한국시간 기준 오늘/올해 (UTC 기준을 쓰면 새벽 0~9시에 어제로 계산되는 버그가 있음)
        const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
        const kstYear = parseInt(kstToday.substring(0, 4));
        const kstMonthPrefix = kstToday.substring(0, 7); // 'YYYY-MM'

        const res = await fetch(`/api/dashboard/attendance?year=${kstYear}`);
        if (!res.ok) throw new Error('attendance data fetch failed');
        const data = await res.json();

        const excludedTypes = ['심방', '상담', '설교', '외부설교'];
        const monthMeetings = (data.meetings || []).filter(m =>
            m.date && m.date.startsWith(kstMonthPrefix) &&
            m.date <= kstToday &&
            !excludedTypes.some(t => (m.type || '').includes(t))
        );

        if (monthMeetings.length === 0 || typeof window.isMandatoryMeeting !== 'function') {
            kpiEl.textContent = '--%';
            kpiEl.title = '이번 달에 집계할 모임이 아직 없습니다.';
            return;
        }

        let denom = 0;
        let numer = 0;
        (data.members || []).forEach(member => {
            const positionRecords = (data.positionRecords && data.positionRecords[member.id]) || [];
            monthMeetings.forEach(m => {
                const rec = member.attendance ? member.attendance[m.id] : null;
                const present = !!(rec && rec.is_present);
                if (window.isMandatoryMeeting(member, m, data.leaderProfile || null, positionRecords) || present) {
                    denom++;
                    if (present) numer++;
                }
            });
        });

        if (denom === 0) {
            kpiEl.textContent = '--%';
            kpiEl.title = '이번 달에 집계할 대상이 없습니다.';
            return;
        }
        kpiEl.textContent = Math.round((numer / denom) * 100) + '%';
        kpiEl.title = `이번 달 모임 ${monthMeetings.length}회 · 참석 ${numer} / 대상 ${denom} (연인원)`;
    } catch (e) {
        console.error('출석률 KPI 계산 실패:', e);
        kpiEl.textContent = '--%';
        kpiEl.title = '출석률을 불러오지 못했습니다.';
    }
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
            let useDistrictBreakdown = false; // 통합 모임: 구역별(581/582/583)로 쪼개 집계

            if (m.type.includes('교구전체모임')) {
                // 편집 드롭다운에 '전체조모임' 항목이 없어 전체구역/전체조모임을 모두 '교구전체모임' 구분으로 기록한다.
                // 따라서 제목으로 구역/조를 구분한다. (예: "전체 조모임" → 조모임, "전체구역모임" → 구역모임)
                if ((m.title || '').includes('조')) {
                    chartKey = 'grpChart';   // 전체 조모임 → 조모임 차트에 구역별로 분배
                    useDistrictBreakdown = true;
                } else if ((m.title || '').includes('구역')) {
                    chartKey = 'distChart';  // 전체구역모임 → 구역모임 차트에 구역별로 분배
                    useDistrictBreakdown = true;
                }
            } else if (m.type.includes('전체조모임')) {
                // 전체로 진행된 조모임 → 조모임 차트에 구역별로 분배
                chartKey = 'grpChart';
                useDistrictBreakdown = true;
            } else if (m.type.includes('구역모임')) {
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
                
                if (chartKey === 'broChart' || chartKey === 'ythChart' || useDistrictBreakdown) {
                    const distAttendees = m.district_attendees && Object.keys(m.district_attendees).length > 0
                        ? m.district_attendees
                        : { '미지정': m.attendee_count || 0 };

                    const distTestimonies = m.district_testimonies || {};

                    Object.keys(distAttendees).forEach(dist => {
                        const count = distAttendees[dist] || 0;
                        if (count === 0) return;

                        // 구역/조모임 차트는 기존 계열 키가 "581" 형태이므로 "581구역" → "581"로 정규화해 합친다.
                        const subGroupName = (chartKey === 'distChart' || chartKey === 'grpChart')
                            ? (dist.replace('구역', '').trim() || dist)
                            : dist;

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
        // [2026-07-06] 예전엔 '78%' 하드코딩(Placeholder)이었음 — 실제 데이터로 계산해 채운다.
        updateAttendanceKpi();
        
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
                ctx.font = 'bold 11px ui-sans-serif, system-ui';
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
            let globalAvg = null;
            if (isStacked) {
                // For stacked charts: average of monthly TOTALS (sum of all groups per month)
                let monthlyTotals = [];
                targetKeys.forEach(mk => {
                    if (mk > currentMonthKey) return;
                    let monthSum = 0;
                    let hasData = false;
                    Object.keys(catData).forEach(group => {
                        const d = catData[group][mk];
                        if (d !== null && d.att > 0) {
                            monthSum += d.att;
                            hasData = true;
                        }
                    });
                    if (hasData) monthlyTotals.push(monthSum);
                });
                if (monthlyTotals.length > 0) {
                    globalAvg = monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length;
                }
            } else {
                // For non-stacked charts: average of individual group data points
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
                globalAvg = globalGroupCount > 0 ? (globalTotalAtt / globalGroupCount) : null;
            }

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
                                size: 11
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
                                color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569',
                                font: {
                                    size: 11
                                }
                            }
                        },
                        y: {
                            stacked: isStacked,
                            beginAtZero: true,
                            ticks: { 
                                precision: 0,
                                color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569',
                                font: {
                                    size: 11
                                }
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
        const p = att.filter(a => Number(a.is_present) === 1);
        const pWithTestimony = p.filter(a => a.testimony_snapshot && a.testimony_snapshot.trim());
        
        // Absent list logic matching app.js
        let absentHtml = '';
        const typeStr = m.type || '';
        if (!['설교', '외부설교', '심방', '교회행사', '기타', '상담'].includes(typeStr)) {
            let targetParams = new URLSearchParams({ status: 'active' });
            // 교구전체모임/전체조모임: 특정 구역이 아니라 강효근이 소속된 교구 전체가 대상
            const isParishWide = typeStr.includes('교구전체모임') || typeStr.includes('전체조모임');
            if (isParishWide) {
                // 강효근 소속 교회(+서울중앙교회인 경우 교구) 성도 전체가 대상 (meeting_editor.js 공통 헬퍼).
                // 이 모임에 저장된 소속 스냅샷을 우선 사용 — 관리자 소속이 나중에 바뀌어도 과거 모임의 대상자가 흔들리지 않도록.
                const snap = { church: m.leader_church_snapshot, parish: m.leader_parish_snapshot };
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
            if (isParishWide && (m.title || '').includes('조')) {
                allTargets = allTargets.filter(member => member.bs === 'S' && member.category !== '청년회');
            }

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
                ${m.memo ? `
                <div class="mb-4">
                    <h4 class="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        메모
                    </h4>
                    <p class="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-slate-300 dark:border-slate-600">${m.memo}</p>
                </div>
                ` : ''}
                
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
            // 현재 활성화된 모임 종류 필터 적용
            if (selectedMeetingTypes && selectedMeetingTypes.size > 0 && !selectedMeetingTypes.has(s.type)) {
                return false;
            }
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
