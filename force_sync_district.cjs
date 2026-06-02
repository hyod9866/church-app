const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

console.log("=== 구역 데이터 강제 동기화 (최종) ===");

db.all("SELECT id, name FROM members", (err, members) => {
    let completed = 0;
    members.forEach(m => {
        db.get("SELECT remark FROM member_records WHERE member_id = ? AND status = 'DISTRICT' ORDER BY date DESC, id DESC LIMIT 1", [m.id], (err, record) => {
            if (record && record.remark) {
                db.run("UPDATE members SET district = ? WHERE id = ?", [record.remark, m.id], () => {
                    completed++;
                    if (completed === members.length) {
                        console.log("동기화 완료");
                        db.close();
                    }
                });
            } else {
                completed++;
                if (completed === members.length) {
                    console.log("동기화 완료");
                    db.close();
                }
            }
        });
    });
});
