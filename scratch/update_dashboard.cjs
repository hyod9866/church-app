const fs = require('fs');

let c = fs.readFileSync('public/js/meeting_dashboard.js', 'utf8');

const regex = /if \(!categories\[chartKey\]\[groupName\]\) \{[\s\S]*?\}\s*if \(categories\[chartKey\]\[groupName\]\[monthKey\] !== null\) \{\s*categories\[chartKey\]\[groupName\]\[monthKey\] \+= \(m\.attendee_count \|\| 0\);\s*\}/m;

const replacement = `if (!categories[chartKey][groupName]) {
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
                }`;

c = c.replace(regex, replacement);

const renderChartRegex = /const renderChart = \(id, catData, targetMonths, targetKeys, isBar = true\) => \{[\s\S]*?window\.myCharts\.push\(c\);\s*\};/m;

const newRenderChart = `const renderChart = (id, catData, targetMonths, targetKeys, isBar = true, kpiContainerId = null, alertContainerId = null) => {
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6', '#6366f1'];
            
            // Calculate overall averages per month
            const monthAverages = targetKeys.map(mk => {
                let totalAtt = 0;
                let groupCount = 0;
                Object.keys(catData).forEach(group => {
                    const d = catData[group][mk];
                    if (d !== null) {
                        totalAtt += d.att;
                        groupCount++;
                    }
                });
                return groupCount > 0 ? (totalAtt / groupCount) : null;
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
                    if (cm) {
                        currentMonthTotalAtt += cm.att;
                        currentMonthTotalTest += cm.test;
                        currentMonthGroupCount++;
                    }
                }
                if (currIdx >= 1) {
                    const pm = catData[group][targetKeys[currIdx-1]];
                    if (pm) prevMonthTotalAtt += pm.att;
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
                        if (prevMonthTotalAtt > 0) {
                            const mom = Math.round(((currentMonthTotalAtt - prevMonthTotalAtt) / prevMonthTotalAtt) * 100);
                            const momColor = mom >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500';
                            const momIcon = mom >= 0 ? '▲' : '▼';
                            momHtml = \`<span class="text-xs font-bold \${momColor} ml-1">\${momIcon} \${Math.abs(mom)}%</span>\`;
                        }

                        kpiEl.innerHTML = \`
                            <div class="px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs shadow-sm flex items-center">
                                <span class="text-slate-500 dark:text-slate-400 mr-1">평균 출석:</span>
                                <span class="font-bold text-slate-800 dark:text-slate-200">\${avgAtt}명</span>
                                \${momHtml}
                            </div>
                            <div class="px-2 py-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs shadow-sm flex items-center">
                                <span class="text-slate-500 dark:text-slate-400 mr-1">나눔 참여율:</span>
                                <span class="font-bold text-blue-600 dark:text-blue-400">\${sharingRate}%</span>
                            </div>
                        \`;
                    } else {
                        kpiEl.innerHTML = '';
                    }
                }
                if (alertEl) {
                    if (atRiskGroups.length > 0) {
                        alertEl.classList.remove('hidden');
                        alertEl.innerHTML = \`🚨 심방/격려 필요: \${atRiskGroups.join(', ')} (최근 3개월 지속 하락)\`;
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
                                        return \`전체 평균: \${context.parsed.y.toFixed(1)}명\`;
                                    }
                                    const group = context.dataset.label;
                                    const mk = targetKeys[context.dataIndex];
                                    const raw = catData[group][mk];
                                    if(raw && raw.att > 0) {
                                        const rate = Math.round((raw.test / raw.att)*100);
                                        return \`\${group}: \${raw.att}명 (나눔 \${raw.test}명, \${rate}%)\`;
                                    }
                                    return \`\${group}: \${context.parsed.y}명\`;
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
        };`;

c = c.replace(renderChartRegex, newRenderChart);

const callRegex = /renderChart\('distChart'.*\n\s*renderChart\('grpChart'.*\n\s*renderChart\('broChart'.*\n\s*renderChart\('ythChart'.*/g;

c = c.replace(callRegex, `renderChart('distChart', categories['distChart'], months12, monthKeys12, true, 'distKpiContainer', 'distAlertContainer');
        renderChart('grpChart', categories['grpChart'], months12, monthKeys12, true, 'grpKpiContainer', 'grpAlertContainer');
        renderChart('broChart', categories['broChart'], months6, monthKeys6, true, 'broKpiContainer', 'broAlertContainer');
        renderChart('ythChart', categories['ythChart'], months6, monthKeys6, true, 'ythKpiContainer', 'ythAlertContainer');`);

fs.writeFileSync('public/js/meeting_dashboard.js', c);
console.log('done');
