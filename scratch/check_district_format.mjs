import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data: members } = await supabase
  .from('members')
  .select('district')
  .not('district', 'is', null)
  .limit(10);

console.log('=== 성도 테이블 구역 포맷 ===');
console.log(members);
