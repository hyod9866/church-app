import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host: '2406:da12:557:f802:f78e:4591:9fd3:4ad7', // IPv6 Address
  port: 5432,
  user: 'postgres',
  password: 'qhrdmaemfrh1!',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected directly to Supabase DB via IPv6 address!");

    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='meetings' AND column_name='start_time'
    `);

    if (checkRes.rows.length === 0) {
      console.log("Adding column 'start_time' to 'meetings' table...");
      await client.query("ALTER TABLE meetings ADD COLUMN start_time TEXT;");
      console.log("Column 'start_time' added successfully.");
    } else {
      console.log("Column 'start_time' already exists.");
    }

    console.log("Reloading schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("Success!");
  } catch (err) {
    console.error("Connection error:", err.message);
  } finally {
    await client.end();
  }
}

run();
