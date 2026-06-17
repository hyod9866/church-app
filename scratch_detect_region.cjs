const { Client } = require('pg');

const awsRegions = [
  'ap-northeast-2',
  'ap-northeast-1',
  'ap-northeast-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'sa-east-1',
  'ca-central-1'
];

async function detect() {
    for (const r of awsRegions) {
        const host = `aws-0-${r}.pooler.supabase.com`;
        console.log(`Testing host: ${host}...`);
        const client = new Client({
          host: host,
          port: 6543,
          user: 'postgres.castdxotoypktiusslpk',
          password: 'qhrdmaemfrh1!',
          database: 'postgres',
          ssl: { rejectUnauthorized: false }
        });
        try {
            await client.connect();
            console.log(`Successfully connected to AWS ${r}!`);
            await client.end();
            return r;
        } catch (err) {
            console.log(`${r} failed: ${err.message}`);
            if (!err.message.toLowerCase().includes('tenant') && !err.message.toLowerCase().includes('user') && !err.message.toLowerCase().includes('enotfound')) {
                console.log(`-> Correct region detected (non-tenant error): ${r}`);
                await client.end().catch(() => {});
                return r;
            }
        }
    }
    console.log("No AWS region matched.");
    return null;
}

detect().catch(console.error);
