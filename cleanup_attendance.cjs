const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

const query = `
  DELETE FROM attendance 
  WHERE meeting_id IN (SELECT id FROM meetings WHERE type LIKE '%조모임%') 
  AND member_id IN (SELECT id FROM members WHERE category = '청년회')
`;

db.run(query, function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Cleaned up ${this.changes} Youth attendance records from Group meetings.`);
  db.close();
});
