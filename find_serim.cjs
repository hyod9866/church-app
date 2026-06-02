const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');
db.all("SELECT id, name, category FROM members WHERE name LIKE '%세림%'", (err, rows) => {
  if (err) console.error(err);
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
