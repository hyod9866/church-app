const sqlite3 = require('sqlite3');
const XLSX = require('xlsx');

async function migrate() {
    const db = new sqlite3.Database('./church.db');
    const workbook = XLSX.readFile('church_division.xlsx');

    // 1. Migrate Churches
    const churchSheet = workbook.Sheets['church'];
    const churchData = XLSX.utils.sheet_to_json(churchSheet, { header: 1 });
    const churches = churchData.flat().filter(x => x && x !== '교회명');

    console.log(`Migrating ${churches.length} churches...`);
    for (const name of churches) {
        await new Promise((resolve) => {
            db.run('INSERT OR IGNORE INTO churches (name) VALUES (?)', [name + '교회'], resolve);
        });
    }

    // 2. Migrate Parishes and Districts
    const divisionSheet = workbook.Sheets['division'];
    const divisionData = XLSX.utils.sheet_to_json(divisionSheet);

    console.log(`Migrating divisions...`);
    for (const row of divisionData) {
        const churchName = row['교회'];
        const parishName = row['교구'];
        const districtName = row['구역'];

        if (!churchName || !parishName) continue;

        // Get or Create Church
        const churchId = await new Promise((resolve) => {
            db.get('SELECT id FROM churches WHERE name = ?', [churchName], (err, res) => {
                if (res) resolve(res.id);
                else {
                    db.run('INSERT INTO churches (name) VALUES (?)', [churchName], function() {
                        resolve(this.lastID);
                    });
                }
            });
        });

        // Get or Create Parish
        const parishId = await new Promise((resolve) => {
            db.get('SELECT id FROM parishes WHERE church_id = ? AND name = ?', [churchId, parishName], (err, res) => {
                if (res) resolve(res.id);
                else {
                    db.run('INSERT INTO parishes (church_id, name) VALUES (?, ?)', [churchId, parishName], function() {
                        resolve(this.lastID);
                    });
                }
            });
        });

        // Insert District if exists
        if (districtName) {
            await new Promise((resolve) => {
                db.run('INSERT OR IGNORE INTO districts (parish_id, name) VALUES (?, ?)', [parishId, districtName], resolve);
            });
        }
    }

    console.log('Migration complete.');
    db.close();
}

migrate().catch(console.error);
