const fs = require('fs');

const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>모임 현황 - Pastoral Ministry Program</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <!-- AnyChart for Word Cloud -->
    <script src="https://cdn.anychart.com/releases/8.11.0/js/anychart-core.min.js"></script>
    <script src="https://cdn.anychart.com/releases/8.11.0/js/anychart-tag-cloud.min.js"></script>
    <script>
        tailwind.config = { darkMode: 'class' }
    </script>
    <style>
        .dark body { background-color: #0B0F19; color: #f1f5f9; }
        .chart-container { position: relative; height: 250px; width: 100%; }
        #wordCloudContainer { height: 300px; width: 100%; }
    </style>
</head>
<body class="bg-gray-50 dark:bg-[#0B0F19] text-slate-800 dark:text-slate-100 min-h-screen">

    <header class="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 text-white p-3 shadow-md flex justify-between items-center">
        <h1 class="text-xl font-black">Pastoral Ministry Program</h1>
        <div class="flex gap-2 text-sm font-medium">
            <a href="/" class="hover:underline">홈</a>
            <a href="/dashboard.html" class="hover:underline">출석 현황</a>
            <a href="/meeting_dashboard.html" class="font-bold underline">모임 현황</a>
            <a href="/sermon_history.html" class="hover:underline">설교 현황</a>
        </div>
    </header>

    <main class="max-w-7xl mx-auto p-4 space-y-6">
        <div class="flex justify-between items-end">
            <h2 class="text-2xl font-black">모임 현황 및 설교 인사이트</h2>
        </div>

        <!-- KPI Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="kpiContainer">
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p class="text-xs text-gray-500 font-bold">월평균 교구 출석률</p>
                <h3 class="text-2xl font-black text-blue-600" id="kpiAttendance">--%</h3>
            </div>
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p class="text-xs text-gray-500 font-bold">이번 달 심방 건수</p>
                <h3 class="text-2xl font-black text-green-600" id="kpiVisitations">--건</h3>
            </div>
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p class="text-xs text-gray-500 font-bold">이번 달 상담 건수</p>
                <h3 class="text-2xl font-black text-purple-600" id="kpiCounselings">--건</h3>
            </div>
            <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <p class="text-xs text-gray-500 font-bold">옵시디언 연동 원고</p>
                <h3 class="text-2xl font-black text-indigo-600" id="kpiObsidian">--개</h3>
            </div>
        </div>

        <!-- Attendance Charts -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 class="text-lg font-bold mb-4">모임별 출석 인원 추이 (최근 6개월)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div><h4 class="text-sm font-bold text-center mb-2">구역모임</h4><div class="chart-container"><canvas id="distChart"></canvas></div></div>
                <div><h4 class="text-sm font-bold text-center mb-2">조모임</h4><div class="chart-container"><canvas id="grpChart"></canvas></div></div>
                <div><h4 class="text-sm font-bold text-center mb-2">형제모임</h4><div class="chart-container"><canvas id="broChart"></canvas></div></div>
                <div><h4 class="text-sm font-bold text-center mb-2">청년모임</h4><div class="chart-container"><canvas id="ythChart"></canvas></div></div>
            </div>
        </div>

        <!-- Sermon Insights -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Word Cloud -->
            <div class="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
                    <span class="text-blue-500">☁️</span> 설교 키워드 클라우드 (옵시디언 연동)
                </h3>
                <p class="text-xs text-gray-500 mb-4">옵시디언 원고와 제목에서 추출된 핵심 강조 단어입니다.</p>
                <div id="wordCloudContainer"></div>
            </div>
            <!-- Bible Distribution -->
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
                    <span class="text-green-500">📖</span> 성경 본문 분포
                </h3>
                <div class="chart-container">
                    <canvas id="biblePieChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Sermon Log Table -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-10">
            <h3 class="text-lg font-bold mb-4">최근 설교 목록 및 원고 링크</h3>
            <div class="overflow-x-auto">
                <table class="min-w-full text-sm text-left">
                    <thead class="bg-gray-50 text-gray-600 font-bold border-b">
                        <tr>
                            <th class="px-4 py-3">날짜</th>
                            <th class="px-4 py-3">모임 대상</th>
                            <th class="px-4 py-3">설교 제목</th>
                            <th class="px-4 py-3">원고(Obsidian)</th>
                        </tr>
                    </thead>
                    <tbody id="sermonLogBody" class="divide-y divide-gray-100">
                        <tr><td colspan="4" class="text-center py-4">로딩 중...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    </main>

    <script src="/js/meeting_dashboard.js"></script>
</body>
</html>`;

const jsContent = `
document.addEventListener('DOMContentLoaded', async () => {
    await fetchStats();
    await fetchAttendanceCharts();
});

async function fetchStats() {
    try {
        const res = await fetch('/api/sermon-stats');
        const data = await res.json();
        
        document.getElementById('kpiObsidian').textContent = data.obsidianMatches + '개';

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
            const linkHtml = s.has_obsidian ? \`<a href="\${s.path}" class="bg-indigo-100 text-indigo-700 px-2 py-1 rounded text-xs font-bold hover:bg-indigo-200">옵시디언 열기</a>\` : '<span class="text-gray-400 text-xs">매칭 안됨</span>';
            tr.innerHTML = \`
                <td class="px-4 py-3">\${new Date(s.date).toLocaleDateString()}</td>
                <td class="px-4 py-3">\${s.type}</td>
                <td class="px-4 py-3 font-medium">\${s.title}</td>
                <td class="px-4 py-3">\${linkHtml}</td>
            \`;
            tbody.appendChild(tr);
        });

    } catch(e) {
        console.error(e);
    }
}

async function fetchAttendanceCharts() {
    try {
        const res = await fetch('/api/meetings');
        const meetingsData = await res.json();
        
        // Basic filtering for last 6 months
        // For simplicity in this demo snippet, we'll just show mock counts if processing is complex
        // In a real scenario, reuse the logic from dashboard.js
        
        let visitations = 0;
        let counselings = 0;
        const currentMonth = new Date().getMonth();
        
        meetingsData.forEach(m => {
            const mDate = new Date(m.date);
            if (mDate.getMonth() === currentMonth) {
                if(m.type.includes('심방')) visitations++;
                if(m.type.includes('상담')) counselings++;
            }
        });
        
        document.getElementById('kpiVisitations').textContent = visitations + '건';
        document.getElementById('kpiCounselings').textContent = counselings + '건';
        document.getElementById('kpiAttendance').textContent = '78%'; // Placeholder
        
        // Initialize dummy charts for now to ensure layout works
        const ctxs = ['distChart', 'grpChart', 'broChart', 'ythChart'];
        ctxs.forEach(id => {
            new Chart(document.getElementById(id), {
                type: 'bar',
                data: {
                    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
                    datasets: [{ label: '참석자 수', data: [12, 19, 15, 17, 22, 24], backgroundColor: '#3b82f6' }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        });

    } catch(e) {
        console.error(e);
    }
}
`;

fs.writeFileSync('public/meeting_dashboard.html', htmlContent);
fs.writeFileSync('public/js/meeting_dashboard.js', jsContent);
console.log('Successfully wrote meeting_dashboard HTML and JS.');
