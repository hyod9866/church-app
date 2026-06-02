const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.all("SELECT id, title, type, date FROM meetings WHERE date = '2026-06-11'", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
