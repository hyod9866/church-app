const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, district, status FROM members WHERE name LIKE '%최슬기%'", (err, rows) => {
  console.log(rows);
});