const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');
db.all("SELECT id, name FROM members WHERE name LIKE '%효근%'", (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows));
  db.close();
});
