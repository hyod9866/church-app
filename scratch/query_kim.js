const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./church.db');

db.all("SELECT * FROM members WHERE name LIKE '%김경민%'", (err, rows) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log('--- members ---');
  console.log(JSON.stringify(rows, null, 2));

  if (rows.length > 0) {
    const memberIds = rows.map(r => r.id);
    const placeholders = memberIds.map(() => '?').join(',');
    db.all(`SELECT * FROM member_records WHERE member_id IN (${placeholders})`, memberIds, (err2, records) => {
      if (err2) {
        console.error(err2);
        return;
      }
      console.log('--- member_records ---');
      console.log(JSON.stringify(records, null, 2));
      db.close();
    });
  } else {
    db.close();
  }
});
