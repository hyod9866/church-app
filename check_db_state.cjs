const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, family_id, family_relation FROM members WHERE name IN ('강효근', '권정윤')", (err, rows) => {
  console.log("Current DB State:", rows);
});