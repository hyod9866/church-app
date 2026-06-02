const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT m.type, m.title, a.testimony_snapshot FROM attendance a JOIN meetings m ON a.meeting_id = m.id WHERE a.member_id = 154", (err, rows) => {
    if (err) { console.error(err); return; }
    console.log(rows);
    db.close();
});
