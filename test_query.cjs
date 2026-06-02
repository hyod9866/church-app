const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

const allNamesInvolved = ['최기현', '민옥순', '최슬기'];
const placeholders = allNamesInvolved.map(() => '?').join(',');

db.all(`SELECT id, name, status FROM members WHERE TRIM(name) IN (${placeholders})`, allNamesInvolved, (err, rows) => {
  console.log("Found rows:", rows);
});