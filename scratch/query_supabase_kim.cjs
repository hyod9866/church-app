const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .ilike('name', '%김경민%');

  if (error) {
    console.error(error);
    return;
  }

  console.log('--- Supabase Members ---');
  console.log(JSON.stringify(data, null, 2));

  if (data && data.length > 0) {
    const memberIds = data.map(m => m.id);
    const { data: records, error: recError } = await supabase
      .from('member_records')
      .select('*')
      .in('member_id', memberIds);

    if (recError) {
      console.error(recError);
      return;
    }
    console.log('--- Supabase Member Records ---');
    console.log(JSON.stringify(records, null, 2));
  }
}

main();
