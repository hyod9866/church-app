import pg from 'pg';

const hosts = [
  'aws-0-ap-northeast-2.pooler.supabase.com',
  'aws-1-ap-northeast-2.pooler.supabase.com',
  'aws-2-ap-northeast-2.pooler.supabase.com',
  'aws-3-ap-northeast-2.pooler.supabase.com',
  'aws-0-ap-southeast-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com'
];

async function tryConnect(host) {
  const client = new pg.Client({
    host: host,
    port: 6543,
    user: 'postgres.castdxotoypktiusslpk',
    password: 'qhrdmaemfrh1!',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log(`Successfully connected via ${host}`);
    return client;
  } catch (err) {
    console.log(`Failed for ${host}: ${err.message}`);
    return null;
  }
}

async function run() {
  let client = null;
  for (const host of hosts) {
    client = await tryConnect(host);
    if (client) break;
  }

  if (!client) {
    console.error('All pooler hosts failed.');
    return;
  }

  try {
    // Check if column exists
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='members' AND column_name='marital_status'
    `);
    
    if (checkRes.rows.length === 0) {
      console.log('Adding marital_status column to members table...');
      await client.query('ALTER TABLE members ADD COLUMN marital_status VARCHAR(20);');
      console.log('Column added successfully.');
    } else {
      console.log('Column marital_status already exists.');
    }
    
    console.log('Reloading PostgREST schema cache...');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Schema reload notified.');
    
  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await client.end();
  }
}

run();
