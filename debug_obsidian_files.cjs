const fs = require('fs');
const { join } = require('path');

const vaultPath = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG';

const scanDir = (dir) => {
    try {
        const files = fs.readdirSync(dir);
        let mdFiles = [];
        for (const file of files) {
            const fullPath = join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (!file.startsWith('.')) {
                    mdFiles = [...mdFiles, ...scanDir(fullPath)];
                }
            } else if (file.endsWith('.md') && (file.includes('mcs') || file.includes('mss'))) {
                mdFiles.push(fullPath);
            }
        }
        return mdFiles;
    } catch (e) {
        return [];
    }
};

const allFiles = scanDir(vaultPath);
console.log(`Total files found: ${allFiles.length}`);

for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('2026-05-02') || content.includes('2026-05-16')) {
        console.log(`--- File: ${filePath} ---`);
        const dateMatches = [...content.matchAll(/날짜\s*[:\n]\s*(\d{4}-\d{2}-\d{2})/g)];
        const categoryMatch = content.match(/성격\s*[:\n]\s*([^\n\r]+)/);
        const districtMatch = content.match(/조,구역\s*[:\n]\s*([^\n\r]+)/);
        
        console.log('Dates found:', dateMatches.map(m => m[1]).join(', '));
        console.log('Category:', categoryMatch ? categoryMatch[1].trim() : 'None');
        console.log('District:', districtMatch ? districtMatch[1].trim() : 'None');
        console.log('---');
    }
}
