const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');
db.all("SELECT * FROM meetings WHERE date = '2026-02-26'", (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
