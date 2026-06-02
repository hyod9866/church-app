
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const vaultPath = 'C:\\Users\\D-kanghyodgeun\\Documents\\KHG';

const scanDir = (dir) => {
  try {
    const files = fs.readdirSync(dir);
    let mdFiles = [];
    for (const file of files) {
      const winFullPath = `${dir}\\${file}`;
      
      try {
        const stat = fs.statSync(winFullPath);
        if (stat.isDirectory()) {
          if (!file.startsWith('.')) {
            mdFiles = [...mdFiles, ...scanDir(winFullPath)];
          }
        } else if (file.endsWith('.md') && (file.includes('mcs') || file.includes('mss'))) {
          mdFiles.push(winFullPath);
        }
      } catch (e) {
        console.error(`Error stating file ${winFullPath}:`, e.message);
      }
    }
    return mdFiles;
  } catch (e) {
    console.error(`Error reading directory ${dir}:`, e.message);
    return [];
  }
};

console.log('Scanning vault...');
const allFiles = scanDir(vaultPath);
console.log(`Found ${allFiles.length} files.`);

for (const filePath of allFiles.slice(0, 5)) {
  console.log(`Testing file: ${filePath}`);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const dateMatch = content.match(/날짜\s*\n\s*\n\s*(\d{4}-\d{2}-\d{2})/);
    const titleMatch = filePath.match(/([^\\]+)\s*(mcs|mss)\.md$/);
    console.log(`  Date Match: ${dateMatch ? dateMatch[1] : 'None'}`);
    console.log(`  Title Match: ${titleMatch ? titleMatch[1] : 'None'}`);
  } catch (e) {
    console.error(`Error reading file ${filePath}:`, e.message);
  }
}
