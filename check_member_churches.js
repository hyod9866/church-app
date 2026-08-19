import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
    // 멤버 테이블의 church 필드 목록
    const { data: memberRows } = await supabase
        .from('members')
        .select('church')
        .not('church', 'is', null)
        .not('church', 'eq', '');
    
    const memberChurches = [...new Set(memberRows.map(m => m.church).filter(Boolean))].sort();
    console.log('\n=== 멤버 테이블의 church 필드 값 목록 ===');
    console.log('총 고유 교회 수:', memberChurches.length);
    memberChurches.forEach(c => console.log(' -', c));

    console.log('\n청주오송교회 포함 여부:', memberChurches.some(c => c.includes('청주오송')));
    console.log('평택 포함 여부:', memberChurches.some(c => c.includes('평택')));
}
main().catch(console.error);
