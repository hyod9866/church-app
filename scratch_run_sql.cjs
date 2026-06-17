const fs = require('fs');
const content = fs.readFileSync('C:/Users/D-kanghyodgeun/church-app/server_backup_sqlite.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('SUPABASE') || line.includes('supabase')) {
        console.log(`${index + 1}: ${line.trim()}`);
    }
});
