const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./church.db');
db.get("SELECT COUNT(*) as count FROM members WHERE salvation_date IS NOT NULL AND salvation_date != ''", (err, row) => {
    console.log('Members with salvation date:', row);
    db.close();
});
