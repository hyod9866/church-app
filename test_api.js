async function test() {
    try {
        const res = await fetch('http://localhost:3000/api/meetings');
        const data = await res.json();
        const anniversaries = data.filter(e => e.type === '구원기념일');
        
        // Let's find anything on 2026-06-01
        const june1st = anniversaries.filter(a => a.start === '2026-06-01');
        console.log('Events on 2026-06-01:', june1st.map(a => a.title));
        
        // Find by name pattern if possible, or just dump all on that date
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}
test();
