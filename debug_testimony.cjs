const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name FROM members WHERE name LIKE '%희찬%'", (err, rows) => {
    if (err) { console.error(err); return; }
    console.log('Members:', rows);
    if (rows.length > 0) {
        const id = rows[0].id;
        db.all("SELECT a.testimony_snapshot, mt.title, mt.date FROM attendance a JOIN meetings mt ON a.meeting_id = mt.id WHERE a.member_id = ?", [id], (err, history) => {
            if (err) { console.error(err); return; }
            console.log('History for', rows[0].name, ':', history);
            db.close();
        });
    } else {
        db.close();
    }
});
