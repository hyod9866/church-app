const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

console.log("=== 직분 기록과 현재 상태 비교 ===");
db.all(`
    SELECT 
        m.id, 
        m.name, 
        m.position AS current_position, 
        r.date, 
        r.status, 
        r.remark AS record_remark
    FROM members m
    JOIN member_records r ON m.id = r.member_id
    WHERE r.status = 'POSITION' OR r.status = 'POSITION_DISMISS'
    ORDER BY m.name, r.date DESC
`, (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    rows.forEach(row => {
        const isSynced = row.current_position && row.current_position.includes(row.record_remark);
        console.log(`성함: ${row.name} | 현재직분: [${row.current_position || ''}] | 기록: ${row.status}(${row.record_remark}) | 동기화여부: ${isSynced ? 'O' : 'X'}`);
    });
    db.close();
});
