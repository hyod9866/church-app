import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./church.db');
db.all("PRAGMA table_info(members)", (err, rows) => {
  if (err) {
    console.error('Error fetching table info:', err.message);
    process.exit(1);
  }
  const hasStatus = rows.some(row => row.name === 'status');
  if (hasStatus) {
    console.log('Status column exists');
    process.exit(0);
  } else {
    console.error('Status column missing');
    process.exit(1);
  }
});
