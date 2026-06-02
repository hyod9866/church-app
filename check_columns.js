import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./church.db');
db.all("PRAGMA table_info(members)", (err, rows) => {
    if (err) console.error(err);
    console.log(JSON.stringify(rows, null, 2));
    db.close();
});
