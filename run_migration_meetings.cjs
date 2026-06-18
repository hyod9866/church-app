const pg = require('pg');

const regions = [
  'ap-northeast-2', // Seoul
  'ap-northeast-1', // Tokyo
  'ap-southeast-1', // Singapore
  'us-east-4',      // N. Virginia (GCP)
  'us-west-1',      // N. California
  'europe-west-3',  // Frankfurt
  'europe-west-1'   // Ireland
];

async function tryConnect(host, name) {
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
    console.log(`\n>>> Connected successfully to GCP ${name} (${host})!`);
    
    console.log('Running migrations...');
    await client.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS rrule_type TEXT DEFAULT 'none';
    `);
    await client.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS rrule_end_date TEXT;
    `);
    await client.query(`
      ALTER TABLE meetings ADD COLUMN IF NOT EXISTS exdates TEXT;
    `);
    
    console.log('Reloading PostgREST schema...');
    await client.query("NOTIFY pgrst, 'reload schema';");
    
    console.log('Migration SUCCESS!');
    await client.end();
    return true;
  } catch (e) {
    if (e.message.includes('tenant/user') && e.message.includes('not found')) {
      process.stdout.write('.');
    } else {
      console.log(`\nConnection failed for ${name} with error:`, e.message);
    }
    try { await client.end(); } catch(err) {}
    return false;
  }
}

async function run() {
  console.log('Scanning GCP Supabase pooler regions...');
  for (const region of regions) {
    const host = `gcp-0-${region}.pooler.supabase.com`;
    const ok = await tryConnect(host, region);
    if (ok) {
      console.log(`Scan finished. Found working region: ${region}`);
      return;
    }
  }
  console.log('\nScan finished. No working GCP region found.');
}

run();
