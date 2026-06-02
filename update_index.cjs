const fs = require('fs');
const indexHtml = fs.readFileSync('public/index.html', 'utf8');
const memberHtml = fs.readFileSync('public/member_management.html', 'utf8');

const modalStart = memberHtml.indexOf('<!-- Member Add Modal -->');
const modalContentEnd = memberHtml.indexOf('<script src="/js/member_management.js"></script>');
const modalContent = memberHtml.substring(modalStart, modalContentEnd).trim();

const indexModalStart = indexHtml.indexOf('<!-- Member Edit Form Modal -->');
const indexExtraSearch = indexHtml.indexOf('<!-- Extra Member Search -->');

if (indexModalStart === -1 || indexExtraSearch === -1) {
    console.error('Could not find markers in index.html', indexModalStart, indexExtraSearch);
    process.exit(1);
}

const newIndexHtml = indexHtml.substring(0, indexModalStart) + modalContent + '\n\n    ' + indexHtml.substring(indexExtraSearch);

fs.writeFileSync('public/index.html', newIndexHtml);
console.log('Done replacing modal in index.html');
