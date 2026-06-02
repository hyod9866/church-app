import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./church.db');

db.all('SELECT status, COUNT(*) as count FROM members GROUP BY status', [], (err, rows) => {
  if (err) {
    console.error(err);
  } else {
    console.log('Status counts:', rows);
  }
  db.get('SELECT COUNT(*) as total FROM members', [], (err, row) => {
    console.log('Total members:', row.total);
    db.close();
  });
});
