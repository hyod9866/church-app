const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  
  // 1. Clean up ALL names (Remove D, B, S, P and spaces)
  db.all("SELECT id, name FROM members", (err, rows) => {
    if (err) return console.error(err);
    
    const stmt = db.prepare("UPDATE members SET name = ?, family_id = NULL, family_relation = '' WHERE id = ?");
    rows.forEach(row => {
      const cleanName = row.name.replace(/[DBS P]$/i, '').trim();
      stmt.run(cleanName, row.id);
    });
    
    stmt.finalize(() => {
      db.run("COMMIT", (err) => {
        if (err) console.error("마이그레이션 실패:", err);
        else console.log("성명 정제 및 가족 데이터 초기화 완료. 이제 모든 이름이 깨끗합니다.");
      });
    });
  });
});