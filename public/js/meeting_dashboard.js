window.myCharts = [];

let currentSermons = [];
let sortKey = 'date';
let sortDirection = 'desc'; // 'asc' or 'desc'

document.addEventListener('DOMContentLoaded', async () => {
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

function renderSermonTable() {
    const tbody = document.getElementById('sermonLogBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Sort
    const sorted = [...currentSermons].sort((a, b) => {
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
        
        const attendeeText = s.attendee_count ? `${s.attendee_count}명` : '-';
        const attendeeClass = s.attendee_count ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 font-medium';

        tr.onclick = () => {
            // Need to mock title and type for the detail panel mapping
            const mockMeetingObj = {
                id: s.id,
                date: s.date,
                title: s.meeting_title,
                type: s.type,
                sermon_title: s.sermon_title,
                start_time: s.start_time,
                end_time: s.end_time
            };
            showSingleMeetingDetail(mockMeetingObj, s.type || '모임 상세', dateStr);
            openDetailPanel();
        };

        tr.innerHTML = `
            <td class="px-4 py-3 whitespace-nowrap group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${dateStr}</td>
            <td class="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${s.meeting_title || '(모임 제목 없음)'}</td>
            <td class="px-4 py-3">${s.type}</td>
            <td class="px-4 py-3 font-medium text-slate-600 dark:text-slate-400">${s.sermon_title || '(설교 제목 없음)'}</td>
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
    renderSermonTable();
};

async function fetchStats() {
    try {
        const res = await fetch('/api/sermon-stats');
        const data = await res.json();
        
        document.getElementById('kpiTotalMeetings').textContent = data.totalAnalyzed + '개';

        // Render Word Cloud
        if (data.topKeywords.length > 0) {
            const container = document.getElementById("wordCloudContainer");
            if (container) {
                container.innerHTML = '';
                var chart = anychart.tagCloud(data.topKeywords.map(k => ({x: k.text, value: k.weight})));
                chart.angles([0, -45, 90]);
                chart.colorRange(false);
                chart.background().fill("transparent");
                chart.palette(['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1']);
                chart.container("wordCloudContainer");
                chart.draw();
            }
        }

        // Render Bible Pie Chart
        if (data.bibleDist.length > 0) {
            const canvasId = 'biblePieChart';
            const existingChart = Chart.getChart(canvasId);
            if (existingChart) {
                existingChart.destroy();
                window.myCharts = window.myCharts.filter(c => c !== existingChart);
            }

            const bibleChart = new Chart(document.getElementById(canvasId), {
                type: 'doughnut',
                data: {
                    labels: data.bibleDist.map(b => b.book),
                    datasets: [{
                        data: data.bibleDist.map(b => b.count),
                        backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b']
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                boxWidth: 8,
                                font: { size: 11 },
                                color: () => document.documentElement.classList.contains('dark') ? '#e2e8f0' : '#1e293b'
                            }
                        }
                    }
                }
            });
            window.myCharts.push(bibleChart);
        }

        // Render Sermon Log
        currentSermons = data.matchedSermons || [];
        renderSermonTable();

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
        });
        
        document.getElementById('kpiVisitations').textContent = visitations + '건';
        document.getElementById('kpiCounselings').textContent = counselings + '건';
        document.getElementById('kpiAttendance').textContent = '78%'; // Placeholder
        
        const renderChart = (id, catData, targetMonths, targetKeys, isBar = true, kpiContainerId = null, alertContainerId = null) => {
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
            
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
                datasets.push({
                    label: group,
                    data: dataPoints,
                    backgroundColor: isBar ? colors[i % colors.length] : undefined,
                    borderColor: colors[i % colors.length],
                    borderWidth: 2,
                    borderRadius: isBar ? 4 : 0,
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
                                return document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b';
                            },
                            anchor: 'end',
                            align: 'top',
                            offset: -2,
                            font: {
                                weight: 'bold',
                                size: 10
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
                            grid: {
                                color: () => document.documentElement.classList.contains('dark') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                            },
                            ticks: {
                                color: () => document.documentElement.classList.contains('dark') ? '#94a3b8' : '#475569'
                            }
                        },
                        y: {
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
                            
                            showDetailPanel(clickedGroup, clickedMonthKey, clickedLabel, meetings);
                        }
                    }
                }
            });
            window.myCharts.push(c);
        };
        
        renderChart('distChart', categories['distChart'], months12, monthKeys12, true, 'distKpiContainer', 'distAlertContainer');
        renderChart('grpChart', categories['grpChart'], months12, monthKeys12, true, 'grpKpiContainer', 'grpAlertContainer');
        renderChart('broChart', categories['broChart'], months6, monthKeys6, true, 'broKpiContainer', 'broAlertContainer');
        renderChart('ythChart', categories['ythChart'], months6, monthKeys6, true, 'ythKpiContainer', 'ythAlertContainer');

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
    const container = document.getElementById('singleMeetingDetailContainer');
    const listContainer = document.getElementById('detailMeetingList');
    
    if (backToMeetingListBtn) backToMeetingListBtn.classList.remove('hidden');
    if (listContainer) listContainer.classList.add('hidden');
    if (editBtnContainer) {
        editBtnContainer.classList.remove('hidden');
        if (editMeetingDetailBtn) {
            editMeetingDetailBtn.onclick = () => {
                window.location.href = `/?editMeetingId=${m.id}`;
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
    detailPanelSubtitle.textContent = `${new Date(m.date).toLocaleDateString()}${timeStr ? ' ' + timeStr : ''} | ${m.type}`;
    
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
                        <h4 class="text-[10px] font-black text-gray-400 dark:text-slate-500 mb-2 uppercase tracking-wider">미참석자 (${absentees.length}명)</h4>
                        <div class="flex flex-wrap gap-1">
                            ${absentees.map(member => `<span class="px-2 py-1 bg-gray-100 dark:bg-slate-800/40 text-gray-500 dark:text-slate-400 rounded text-[11px] font-bold">${member.name}</span>`).join('')}
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
                    <h4 class="text-[10px] font-black text-blue-700 dark:text-blue-400 mb-2 uppercase tracking-wider">간증 (${pWithTestimony.length}명)</h4>
                    <div class="space-y-2">
                        ${pWithTestimony.map(a => `
                            <div class="p-2.5 bg-blue-50/50 dark:bg-blue-950/20 rounded border border-blue-100 dark:border-blue-900/30">
                                <div class="font-bold text-blue-850 dark:text-blue-300 text-sm">${a.members?.name || a.name || ''}</div>
                                <p class="text-sm md:text-base font-semibold text-slate-800 dark:text-slate-200 mt-2 pl-3 border-l-2 border-blue-500 dark:border-blue-400">${a.testimony_snapshot}</p>
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
                        <h4 class="text-[10px] font-black text-teal-700 dark:text-teal-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-teal-600 dark:text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            행사 메모 / 안내 사항
                        </h4>
                        <p class="text-sm text-slate-800 dark:text-slate-200 font-semibold whitespace-pre-wrap leading-relaxed">${m.memo}</p>
                    </div>
                `;
            } else {
                detailHTML = `
                    <div class="mb-4 bg-slate-50/50 dark:bg-slate-900/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-800/80 text-center">
                        <p class="text-xs text-slate-400 italic py-2">등록된 행사 메모가 없습니다.</p>
                    </div>
                `;
            }
        } else {
            detailHTML = `
                <div class="mb-4 bg-white dark:bg-[#1e293b] p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                    <span class="font-bold dark:text-slate-200">총 참석</span>
                    <span class="text-2xl font-black text-blue-600 dark:text-blue-400">${p.length}명</span>
                </div>
                ${m.church ? `<div class="mb-4 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-200 dark:border-blue-900/30"><h4 class="text-[10px] font-black text-blue-700 dark:text-blue-400">외부 교회</h4><p class="font-bold dark:text-slate-200">${m.church}</p></div>` : ''}
                ${m.sermon_title ? `<div class="mb-4 bg-yellow-50/50 dark:bg-amber-950/20 p-4 rounded-xl border border-yellow-200 dark:border-amber-900/30"><h4 class="text-[10px] font-black text-yellow-700 dark:text-amber-400">설교</h4><p class="font-bold dark:text-slate-100">${m.sermon_title}</p></div>` : ''}
                ${m.sermon_tags ? `
                    <div class="mb-4 flex flex-wrap gap-1.5">
                        ${m.sermon_tags.split(/[,\s#]+/).map(t => t.trim()).filter(t => t.length > 0).map(t => `<span class="px-2 py-1 bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 dark:border dark:border-amber-900/30 rounded-lg text-[10px] font-bold">#${t}</span>`).join('')}
                    </div>
                ` : ''}
                ${m.memo ? `<div class="mb-4 bg-slate-50 dark:bg-[#172237]/40 p-4.5 rounded-xl border border-slate-200 dark:border-slate-850/50"><h4 class="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">메모</h4><p class="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">${m.memo}</p></div>` : ''}
                
                <div class="mb-4">
                    <h4 class="text-[10px] font-black text-blue-600 dark:text-blue-400 mb-2 uppercase tracking-wider">참석자</h4>
                    <div class="flex flex-wrap gap-1">
                        ${p.map(a => `<span class="px-2 py-1 bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 dark:border dark:border-blue-900/30 rounded text-[11px] font-bold">${a.members?.name || a.name || ''}</span>`).join('')}
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

function showDetailPanel(groupName, monthKey, monthLabel, allMeetings) {
    lastActiveGroup = groupName;
    lastActiveMonthLabel = monthLabel;
    
    if (backToMeetingListBtn) backToMeetingListBtn.classList.add('hidden');
    document.getElementById('singleMeetingDetailContainer').classList.add('hidden');
    document.getElementById('detailMeetingList').classList.remove('hidden');
    
    detailPanelTitle.textContent = `${groupName}`;
    detailPanelSubtitle.textContent = `${monthLabel} 전체 모임 내역`;
    
    // Filter meetings matching the exact monthKey (YYYY-MM) and the groupName
    const filtered = allMeetings.filter(m => {
        const mDate = new Date(m.date);
        const mk = `${mDate.getFullYear()}-${String(mDate.getMonth()+1).padStart(2, '0')}`;
        if (mk !== monthKey) return false;
        
        // Exact match or includes depending on how groupName was derived. 
        // groupName is like "581", m.type is like "581구역모임"
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
