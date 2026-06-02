const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');

async function check() {
    const member = await new Promise(resolve => {
        db.get("SELECT id, name, bs, category FROM members WHERE name LIKE '%김명단%'", (err, row) => resolve(row));
    });
    
    if (!member) {
        console.log("김명단 성도를 찾을 수 없습니다.");
        db.close();
        return;
    }

    const meetings = await new Promise(resolve => {
        db.all("SELECT id, title, date FROM meetings WHERE type LIKE '%형제%' AND (date LIKE '2026-01%' OR date LIKE '2026-03%')", (err, rows) => resolve(rows));
    });

    for (const m of meetings) {
        const att = await new Promise(resolve => {
            db.get("SELECT * FROM attendance WHERE meeting_id = ? AND member_id = ?", [m.id, member.id], (err, row) => resolve(row));
        });
        console.log(`모임: ${m.date} ${m.title} | 기록: ${JSON.stringify(att || '데이터 없음')}`);
    }
    db.close();
}

check();
