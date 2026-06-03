const fs = require('fs');
const path = require('path');
const csv = require('fast-csv');
const sqlite3 = require('sqlite3').verbose();
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const csvPath = path.join(__dirname, 'churches_details.csv');
const db = new sqlite3.Database('./church.db');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const churchAddressMap = {};

async function parseCSV() {
  return new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(csv.parse({ headers: true }))
      .on('data', (row) => {
        const name = row['교회명'] ? row['교회명'].trim() : '';
        const address = row['주소'] ? row['주소'].trim() : '';
        if (name && address) {
          churchAddressMap[name] = address;
        }
      })
      .on('end', () => {
        console.log(`Parsed ${Object.keys(churchAddressMap).length} churches from CSV.`);
        resolve();
      })
      .on('error', (err) => reject(err));
  });
}

async function updateSQLite() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.all("SELECT id, name FROM churches", [], (err, rows) => {
        if (err) return reject(err);
        
        console.log(`SQLite: Found ${rows.length} churches to check.`);
        const stmt = db.prepare("UPDATE churches SET address = ? WHERE id = ?");
        let count = 0;
        
        rows.forEach(row => {
          const addr = churchAddressMap[row.name];
          if (addr) {
            stmt.run(addr, row.id);
            count++;
          }
        });
        
        stmt.finalize();
        console.log(`SQLite: Updated ${count} churches with addresses.`);
        resolve();
      });
    });
  });
}

async function updateSupabase() {
  try {
    const { data: remoteChurches, error: getErr } = await supabase
      .from('churches')
      .select('id, name');
      
    if (getErr) throw getErr;
    
    console.log(`Supabase: Found ${remoteChurches.length} churches to check.`);
    let count = 0;
    
    for (const ch of remoteChurches) {
      const addr = churchAddressMap[ch.name];
      if (addr) {
        const { error: updErr } = await supabase
          .from('churches')
          .update({ address: addr })
          .eq('id', ch.id);
          
        if (updErr) {
          console.warn(`Supabase: Failed to update ${ch.name}. DDL may not have been run yet:`, updErr.message);
          return;
        }
        count++;
      }
    }
    console.log(`Supabase: Updated ${count} churches with addresses.`);
  } catch (err) {
    console.error("Supabase migration check error:", err.message);
  }
}

async function run() {
  try {
    await parseCSV();
    await updateSQLite();
    await updateSupabase();
  } catch (err) {
    console.error("Sync process failed:", err);
  } finally {
    db.close();
  }
}

run();
