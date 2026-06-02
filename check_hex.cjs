const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');
db.all("SELECT id, name, CAST(name AS BLOB) as hex_name FROM members WHERE name LIKE '%최슬기%' OR name LIKE '%최기현%' OR name LIKE '%민옥순%'", (err, rows) => {
  rows.forEach(r => {
    console.log(`${r.name} (ID: ${r.id}) - HEX: ${r.hex_name.toString('hex')}`);
  });
});