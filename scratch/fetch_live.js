// Use native fetch


async function check() {
    try {
        const res = await fetch('https://church-app-gray.vercel.app/js/meeting_dashboard.js');
        const text = await res.text();
        console.log("Length:", text.length);
        console.log("Contains [DEBUG]:", text.includes("[DEBUG]"));
        
        // Find index of [DEBUG]
        let idx = text.indexOf("[DEBUG]");
        while(idx !== -1) {
            console.log("Snippet:", text.substring(idx - 20, idx + 80));
            idx = text.indexOf("[DEBUG]", idx + 1);
        }
    } catch (e) {
        console.error(e);
    }
}
check();
