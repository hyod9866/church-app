const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./church.db');

db.all("SELECT id, name, church, parish, district FROM members", (err, rows) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  console.log('Total members count:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
