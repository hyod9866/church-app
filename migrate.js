import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

async function run() {
  console.log("Starting Supabase Direct IPv6 migration from GitHub Actions...");
  const client = new Client({
    host: 'db.castdxotoypktiusslpk.supabase.co',
    port: 5432,
    user: 'postgres',
    password: 'qhrdmaemfrh1!',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(">> Connected to Supabase Direct IPv6!");

    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='parishes' AND column_name='parish_no'
    `);
    
    if (checkRes.rows.length === 0) {
      console.log("parish_no does not exist. Adding column...");
      await client.query("ALTER TABLE parishes ADD COLUMN parish_no INTEGER;");
      console.log("Column parish_no added successfully.");
    } else {
      console.log("Column parish_no already exists.");
    }

    console.log("Reloading schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema cache reloaded successfully!");

    await client.end();
    console.log("MIGRATION LOGGED AS SUCCESSFUL.");
    
    // Write success log
    fs.writeFileSync('migration_result.txt', 'SUCCESS: Migration completed successfully.');
  } catch (err) {
    console.error("Migration failed:", err.message);
    // Write error log to file
    fs.writeFileSync('migration_result.txt', `FAILED: ${err.message}`);
  }
}

run();
