import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  let allAtts = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('attendance')
      .select('id, meeting_id, member_id')
      .range(from, to);
      
    if (error) {
      console.error(error);
      break;
    }
    
    if (!data || data.length === 0) {
      break;
    }
    
    allAtts = allAtts.concat(data);
    if (data.length < pageSize) {
      break;
    }
    page++;
  }

  console.log(`Fetched ${allAtts.length} records in total.`);

  const seen = {};
  const duplicates = [];
  for (const a of allAtts) {
    const key = `${a.meeting_id}_${a.member_id}`;
    if (seen[key]) {
      duplicates.push(a.id);
    } else {
      seen[key] = true;
    }
  }

  console.log(`Found ${duplicates.length} duplicate attendance records.`);

  if (duplicates.length > 0) {
    // Delete in chunks of 100 to avoid long query limits
    const chunkSize = 100;
    for (let i = 0; i < duplicates.length; i += chunkSize) {
      const chunk = duplicates.slice(i, i + chunkSize);
      const { error: delErr } = await supabase
        .from('attendance')
        .delete()
        .in('id', chunk);
      if (delErr) {
        console.error('Delete error:', delErr);
      } else {
        console.log(`Successfully deleted duplicate chunk ${i / chunkSize + 1}!`);
      }
    }
  }
}
run();
