const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.all("SELECT a.*, m.name, m.category, m.bs FROM attendance a JOIN members m ON a.member_id = m.id WHERE a.meeting_id = 44 AND a.member_id = 214", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
