const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./church.db');

db.serialize(() => {
  // 1. Add family_id column to members table (to link families)
  db.run("ALTER TABLE members ADD COLUMN family_id INTEGER", (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error("Error adding family_id column:", err.message);
    } else {
      console.log("Column 'family_id' ensured.");
    }
  });

  // 2. Initialize family_id based on address (simple heuristic for existing data)
  db.all("SELECT id, address FROM members WHERE address IS NOT NULL AND address != ''", [], (err, rows) => {
    if (err) return console.error(err);
    
    const addrMap = {};
    let nextFamilyId = 1;

    rows.forEach(row => {
      const normalized = row.address.replace(/\s+/g, '');
      if (!addrMap[normalized]) {
        addrMap[normalized] = nextFamilyId++;
      }
      db.run("UPDATE members SET family_id = ? WHERE id = ?", [addrMap[normalized], row.id]);
    });
    console.log(`Initialized family_id for ${rows.length} members based on address.`);
  });
});
