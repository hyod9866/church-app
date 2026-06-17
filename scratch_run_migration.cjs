const pg = require('pg');

const regions = [
  'ap-northeast-2', // Seoul
  'ap-northeast-1', // Tokyo
  'ap-southeast-1', // Singapore
  'ap-southeast-2', // Sydney
  'ap-south-1',     // Mumbai
  'us-east-1',      // N. Virginia
  'us-east-2',      // Ohio
  'us-west-1',      // N. California
  'us-west-2',      // Oregon
  'eu-west-1',      // Ireland
  'eu-central-1',   // Frankfurt
];

async function testRegion(region) {
  const { Client } = pg;
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new Client({
    host: host,
    port: 6543,
    user: 'postgres.castdxotoypktiusslpk',
    password: 'qhrdmaemfrh1!',
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000 // 5 seconds timeout
  });

  try {
    await client.connect();
    console.log(`[SUCCESS] Connected to ${region} (${host})`);
    
    // Run DDL as well since we are connected!
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='churches' AND column_name='address'
    `);

    if (checkRes.rows.length === 0) {
      console.log(`[${region}] Column 'address' does not exist in 'churches'. Adding column...`);
      await client.query("ALTER TABLE churches ADD COLUMN address TEXT;");
      console.log(`[${region}] Column 'address' added successfully.`);
    } else {
      console.log(`[${region}] Column 'address' already exists in 'churches'.`);
    }

    console.log(`[${region}] Reloading schema cache...`);
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log(`[${region}] Schema cache reloaded successfully!`);
    
    await client.end();
    return true;
  } catch (err) {
    console.log(`[FAILED] ${region} (${host}): ${err.message}`);
    try { await client.end(); } catch(e) {}
    return false;
  }
}

async function run() {
  console.log("Starting Supabase regional pooler discovery...");
  for (const region of regions) {
    const ok = await testRegion(region);
    if (ok) {
      console.log(`Found active region: ${region}`);
      break;
    }
  }
  console.log("Discovery finished.");
}

run();
