const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./church.db');

const names = ['정만호', '최정례', '정호연', '정세민', '이만심'];
const placeholders = names.map(() => '?').join(',');

db.all(`SELECT id, name, district, address, family_relation, bs, birth_year, position FROM members WHERE name IN (${placeholders})`, names, (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('--- Data for requested members ---');
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
