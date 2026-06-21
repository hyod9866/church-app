import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    const { data: meetings, error } = await supabase
        .from('meetings')
        .select('*')
        .not('sermon_title', 'is', null)
        .neq('sermon_title', '')
        .order('date', { ascending: false })
        .limit(20);

    if (error) {
        console.error(error);
        return;
    }

    console.log("Recent meetings with sermon title:");
    meetings.forEach(m => {
        console.log(`Date: ${m.date}, Title: ${m.title}, Type: ${m.type}, Sermon Title: ${m.sermon_title}`);
        console.log(`Memo snippet: ${m.memo ? m.memo.substring(0, 100) : 'null'}`);
        console.log("------------------------");
    });
}
run();
