const Database = require('better-sqlite3');
const db = new Database('./church.db');
const rows = db.prepare(
  "SELECT id, type, meeting_title, sermon_tags, date FROM meetings WHERE type='교구임원모임' ORDER BY date DESC LIMIT 5"
).all();
console.log(JSON.stringify(rows, null, 2));
db.close();
