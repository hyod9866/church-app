
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
