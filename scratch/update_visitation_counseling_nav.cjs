const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

// Visitation (심방)
const inactiveVisitationLink = `<!-- 심방 관리 -->
                <a href="/visitation_history.html" class="bg-white/10 hover:bg-white/20 text-white border border-white/20 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/50 px-3 py-1.5 rounded-lg font-medium transition text-xs md:text-sm whitespace-nowrap flex items-center gap-1.5 duration-200">
                    <svg class="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                    심방 관리
                </a>`;

// Counseling (상담)
const inactiveCounselingLink = `<!-- 상담 관리 -->
                <a href="/counseling_history.html" class="bg-white/10 hover:bg-white/20 text-white border border-white/20 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:text-slate-300 dark:border-slate-700/50 px-3 py-1.5 rounded-lg font-medium transition text-xs md:text-sm whitespace-nowrap flex items-center gap-1.5 duration-200">
                    <svg class="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                    상담 관리
                </a>`;

files.forEach(file => {
    // 이미 분리된 파일은 스킵 (visitation_history.html과 counseling_history.html은 이미 직접 수정함)
    if (file === 'visitation_history.html' || file === 'counseling_history.html') {
        console.log(`Skipping ${file} as it is already handled manually.`);
        return;
    }
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // 정규식으로 visitation_history.html 링크 찾기 (class 및 padding 차이가 있어 유연하게 매칭)
    const regex = /(<!--\s*심방\/상담\s*-->\s*)?<a\s+href="\/visitation_history\.html"[\s\S]*?<\/a>/g;

    if (regex.test(content)) {
        content = content.replace(regex, `${inactiveVisitationLink}\n                ${inactiveCounselingLink}`);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated navigation in ${file}`);
    } else {
        console.log(`Could not find visitation link in ${file}`);
    }
});
