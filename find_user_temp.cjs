const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

db.all("SELECT id, name, category, bs, district FROM members WHERE name LIKE ?", ['%현소라%'], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  rows.forEach(r => {
    console.log(`ID: ${r.id}, Name: ${r.name}, Category: ${r.category}, BS: ${r.bs}, District: ${r.district}`);
  });
  db.close();
});
