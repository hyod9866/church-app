// 현재 Supabase parishes/districts 데이터 현황 확인
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data: churches } = await supabase.from('churches').select('*').order('name');
console.log('\n=== 교회 목록 ===');
console.log(JSON.stringify(churches, null, 2));

const { data: parishes } = await supabase.from('parishes').select('*').order('name');
console.log('\n=== 교구 목록 ===');
console.log(JSON.stringify(parishes, null, 2));

const { data: districts } = await supabase.from('districts').select('*').order('name');
console.log('\n=== 구역 목록 ===');
console.log(JSON.stringify(districts, null, 2));
