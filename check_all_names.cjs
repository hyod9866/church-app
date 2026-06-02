const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, family_id FROM members WHERE district = '581구역'", (err, rows) => {
  console.log(rows);
});