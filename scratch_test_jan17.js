import dotenv from 'dotenv';
dotenv.config();

async function test() {
    try {
        console.log('--- Fetching /api/dashboard/attendance?year=2026 ---');
        const res = await fetch('http://localhost:3000/api/dashboard/attendance?year=2026');
        const data = await res.json();
        
        console.log('Meetings count:', data.meetings.length);
        console.log('Members count:', data.members.length);
        
        const m17 = data.meetings.find(m => m.id === 17);
        console.log('Meeting 17 details:', m17);
        
        if (!m17) {
            console.log('Meeting 17 not found in 2026 dashboard data!');
            return;
        }
        
        // Find how many members have attendance record for meeting 17
        let recordsCount = 0;
        let presentCount = 0;
        const list = [];
        
        data.members.forEach(mem => {
            const rec = mem.attendance[17];
            if (rec) {
                recordsCount++;
                if (rec.is_present) {
                    presentCount++;
                    list.push(mem.name);
                }
            }
        });
        
        console.log(`For Meeting 17 in Dashboard Response:`);
        console.log(`- Members with attendance record in JSON: ${recordsCount}`);
        console.log(`- Present count in JSON (rec.is_present is truthy/1): ${presentCount}`);
        console.log(`- Present members list:`, list);
        
    } catch (e) {
        console.error('Fetch error:', e);
    }
}
test();





