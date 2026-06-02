const fs = require('fs');
const memberJs = fs.readFileSync('public/js/member_management.js', 'utf8');
const appJs = fs.readFileSync('public/js/app.js', 'utf8');

const memberStart = memberJs.indexOf('function openAddModal(isEdit = false) {');
const memberEnd = memberJs.indexOf('// --- Filter Event Listeners ---');
const memberLogic = memberJs.substring(memberStart, memberEnd).trim();

const appStart = appJs.indexOf('function openAddModal(isEdit = false) {');
const appEnd = appJs.indexOf('document.getElementById(\'editMemberBtn\').addEventListener(\'click\'');

if(memberStart === -1 || appStart === -1 || appEnd === -1) {
    console.error('Failed to find replace regions', memberStart, appStart, appEnd);
    process.exit(1);
}

const newAppJs = appJs.substring(0, appStart) + memberLogic + '\n\n    ' + appJs.substring(appEnd);

fs.writeFileSync('public/js/app.js', newAppJs);
console.log('Updated app.js');
