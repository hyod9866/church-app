import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing in env!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Querying all churches...');
  const { data: churches, error } = await supabase
    .from('churches')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching churches:', error);
    return;
  }

  console.log(`Found ${churches.length} churches.`);
  const central = churches.filter(c => c.name.includes('중앙') || c.name.includes('서울'));
  console.log('Churches containing "중앙" or "서울":');
  console.log(JSON.stringify(central, null, 2));
}

main().catch(console.error);
