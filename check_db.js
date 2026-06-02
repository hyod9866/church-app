import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./church.db');

db.all('SELECT category, COUNT(*) as count FROM members GROUP BY category', [], (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('Categories in database:');
  console.log(rows);
  db.close();
});
