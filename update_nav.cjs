const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

const newNavLink = `
                <!-- 모임 현황 (New Dashboard) -->
                <a href="/meeting_dashboard.html" class="bg-white/10 hover:bg-white/20 text-white border border-white/20 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/50 px-3 py-1.5 rounded-lg font-medium transition text-xs md:text-sm whitespace-nowrap flex items-center gap-1.5">
                    <svg class="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path></svg>
                    모임 현황
                </a>`;

files.forEach(file => {
    if (file === 'meeting_dashboard.html') return; // Skip for now
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if already added
    if (content.includes('href="/meeting_dashboard.html"')) {
        console.log(`Skipping ${file}, already updated.`);
        return;
    }

    // Find the Sermon History link to insert after
    const sermonLinkRegex = /(<!-- 설교 현황[\s\S]*?<a href="\/sermon_history\.html"[\s\S]*?<\/a>)/;
    
    if (sermonLinkRegex.test(content)) {
        content = content.replace(sermonLinkRegex, `$1\n${newNavLink}`);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`Could not find Sermon History link in ${file}`);
    }
});
