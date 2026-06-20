
document.addEventListener('DOMContentLoaded', async () => {
    await fetchStats();
    await fetchAttendanceCharts();
});

async function fetchStats() {
    try {
        const res = await fetch('/api/sermon-stats');
        const data = await res.json();
        
        document.getElementById('kpiTotalMeetings').textContent = data.totalAnalyzed + '개';

        // Render Word Cloud
        if (data.topKeywords.length > 0) {
            anychart.onDocumentReady(function() {
                var chart = anychart.tagCloud(data.topKeywords.map(k => ({x: k.text, value: k.weight})));
                chart.angles([0, -45, 90]);
                chart.colorRange(false);
                chart.container("wordCloudContainer");
                chart.draw();
            });
        }

        // Render Bible Pie Chart
        if (data.bibleDist.length > 0) {
            new Chart(document.getElementById('biblePieChart'), {
                type: 'doughnut',
                data: {
                    labels: data.bibleDist.map(b => b.book),
                    datasets: [{
                        data: data.bibleDist.map(b => b.count),
                        backgroundColor: ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // Render Sermon Log
        const tbody = document.getElementById('sermonLogBody');
        tbody.innerHTML = '';
        data.matchedSermons.slice(0, 20).forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-4 py-3">${new Date(s.date).toLocaleDateString()}</td>
                <td class="px-4 py-3">${s.type}</td>
                <td class="px-4 py-3 font-medium">${s.title}</td>
            `;
            tbody.appendChild(tr);
        });

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
        
        // Generate last 6 months labels
        const months = [];
        const monthKeys = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(currentYear, currentMonth - i, 1);
            months.push(`${d.getMonth() + 1}월`);
            monthKeys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`);
        }
        
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
            if (!monthKeys.includes(monthKey)) return; // Only process last 6 months
            
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
                if (!categories[chartKey][groupName]) {
                    categories[chartKey][groupName] = {};
                    monthKeys.forEach(mk => categories[chartKey][groupName][mk] = 0);
                }
                categories[chartKey][groupName][monthKey] += (m.attendee_count || 0);
            }
        });
        
        document.getElementById('kpiVisitations').textContent = visitations + '건';
        document.getElementById('kpiCounselings').textContent = counselings + '건';
        document.getElementById('kpiAttendance').textContent = '78%'; // Placeholder
        
        const renderChart = (id, catData, isBar = true) => {
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
            
            Object.keys(catData).sort().forEach((group, i) => {
                const dataPoints = monthKeys.map(mk => catData[group][mk]);
                datasets.push({
                    label: group,
                    data: dataPoints,
                    backgroundColor: isBar ? colors[i % colors.length] : undefined,
                    borderColor: colors[i % colors.length],
                    borderWidth: 2,
                    borderRadius: isBar ? 4 : 0,
                    fill: false,
                    tension: 0.1
                });
            });
            
            if (datasets.length === 0) {
                datasets.push({ label: '데이터 없음', data: [0,0,0,0,0,0] });
            }

            new Chart(document.getElementById(id), {
                type: isBar ? 'bar' : 'line',
                data: {
                    labels: months,
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
                                font: { size: 11 }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { precision: 0 }
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
                            const clickedLabel = months[index];
                            const clickedMonthKey = monthKeys[index];
                            const clickedGroup = dataset.label;
                            
                            showDetailPanel(clickedGroup, clickedMonthKey, clickedLabel, meetings);
                        }
                    }
                }
            });
        };
        
        renderChart('distChart', categories['distChart'], true);
        renderChart('grpChart', categories['grpChart'], true);
        renderChart('broChart', categories['broChart'], true);
        renderChart('ythChart', categories['ythChart'], true);

    } catch(e) {
        console.error(e);
    }
}

// Side Panel UI Logic
const detailPanelOverlay = document.getElementById('detailPanelOverlay');
const detailSidePanel = document.getElementById('detailSidePanel');
const closeDetailPanelBtn = document.getElementById('closeDetailPanelBtn');
const detailPanelSubtitle = document.getElementById('detailPanelSubtitle');
const detailMeetingList = document.getElementById('detailMeetingList');
const detailEmptyState = document.getElementById('detailEmptyState');

function openDetailPanel() {
    detailPanelOverlay.classList.remove('hidden');
    // slight delay to allow display:block to apply before opacity transition
    setTimeout(() => {
        detailPanelOverlay.classList.remove('opacity-0');
        detailSidePanel.classList.remove('translate-x-full');
    }, 10);
}

function closeDetailPanel() {
    detailPanelOverlay.classList.add('opacity-0');
    detailSidePanel.classList.add('translate-x-full');
    setTimeout(() => {
        detailPanelOverlay.classList.add('hidden');
    }, 300);
}

if (closeDetailPanelBtn) closeDetailPanelBtn.addEventListener('click', closeDetailPanel);
if (detailPanelOverlay) detailPanelOverlay.addEventListener('click', closeDetailPanel);

function showDetailPanel(groupName, monthKey, monthLabel, allMeetings) {
    detailPanelSubtitle.textContent = `${groupName} - ${monthLabel} 모임 내역`;
    
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
            el.className = 'bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm';
            
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
                    ${m.sermon_title || '(제목 없음)'}
                </h4>
                <div class="text-xs font-medium text-slate-500 dark:text-slate-400 break-words whitespace-pre-wrap mt-2 bg-slate-50 dark:bg-[#0B0F19] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    ${m.memo || '메모가 없습니다.'}
                </div>
            `;
            detailMeetingList.appendChild(el);
        });
    }
    
    openDetailPanel();
}
