const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.serialize(() => {
  db.run("BEGIN TRANSACTION");
  
  // 1. Force FID 2 for Choi and Min (based on previous check)
  db.run("UPDATE members SET family_id = 2, family_relation = '민옥순(아내), 최슬기(기타)' WHERE name = '최기현'");
  db.run("UPDATE members SET family_id = 2, family_relation = '최기현(남편), 최슬기(기타)' WHERE name = '민옥순'");
  
  // 2. Ensure all other empty strings are NULL
  db.run("UPDATE members SET family_id = NULL WHERE family_id = '' OR family_id = 'null'");

  db.run("COMMIT", (err) => {
    if (err) console.error(err);
    else {
      console.log("최기현-민옥순 부부 강제 동기화 완료.");
      db.all("SELECT id, name, family_id, family_relation FROM members WHERE name IN ('최기현', '민옥순')", (err, rows) => {
        console.log("DB 확인 결과:", rows);
      });
    }
  });
});