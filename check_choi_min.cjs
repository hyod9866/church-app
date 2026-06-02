const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, bs, family_id, family_relation FROM members WHERE name LIKE '%최기현%' OR name LIKE '%민옥순%'", (err, rows) => {
  console.log(rows);
});