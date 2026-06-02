const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, bs, family_id, family_relation FROM members WHERE name IN ('도병수', '이묘영')", (err, rows) => {
  console.log(rows);
});