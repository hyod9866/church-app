const { Client } = require('pg');

const client = new Client({
  host: 'castdxotoypktiusslpk.supabase.co',
  port: 5432,
  user: 'postgres.castdxotoypktiusslpk',
  password: 'qhrdmaemfrh1!',
  database: 'postgres',
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL!");

    // 1. Column check / add
    console.log("Checking if parish_no exists...");
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

    // 2. Reload schema cache
    console.log("Reloading schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Schema cache reloaded successfully!");

  } catch (err) {
    console.error("Migration Error:", err);
  } finally {
    await client.end();
  }
}

run();
