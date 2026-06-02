const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

console.log("=== 성도별 구역 데이터 대조 현황 (성명 | 현재 구역 필드 | 기록의 구역 비고) ===");
console.log("-".repeat(70));

const query = `
    SELECT 
        m.name, 
        m.district as current_district, 
        (SELECT remark FROM member_records 
         WHERE member_id = m.id AND status = 'DISTRICT' 
         ORDER BY date DESC, id DESC LIMIT 1) as record_remark
    FROM members m
    WHERE m.status = 'active'
    ORDER BY m.district, m.name
`;

db.all(query, (err, rows) => {
    if (err) {
        console.error(err);
        return;
    }
    rows.forEach(row => {
        const status = (row.current_district === row.record_remark) ? "정상" : "불일치";
        console.log(`${row.name.padEnd(8)} | ${String(row.current_district || '').padEnd(15)} | ${String(row.record_remark || '').padEnd(15)} | [${status}]`);
    });
    db.close();
});
