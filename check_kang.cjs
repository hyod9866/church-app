const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');
db.all("SELECT * FROM members WHERE name LIKE '%강민희%'", (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
