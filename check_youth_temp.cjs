const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.all("SELECT m.name, m.category, a.is_present FROM attendance a JOIN members m ON a.member_id = m.id WHERE a.meeting_id = 44 AND m.category LIKE '%청년%'", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
