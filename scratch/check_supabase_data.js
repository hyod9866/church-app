import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/D-kanghyodgeun/church-app/.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function check() {
    try {
        console.log("Connecting to Supabase...");
        
        // 1. Fetch meetings as done in /api/meetings
        const { data: meetings, error: meetErr } = await supabase
            .from('meetings')
            .select('*')
            .order('date', { ascending: false });
        if (meetErr) throw meetErr;
        console.log("All meetings count:", meetings.length);
        
        // 2. Fetch stats meetings as done in /api/sermon-stats
        const { data: statsMeetings, error: statsErr } = await supabase
            .from('meetings')
            .select('id, date, title, type, sermon_title, memo, start_time, end_time')
            .not('sermon_title', 'is', null)
            .neq('sermon_title', '')
            .order('date', { ascending: false })
            .limit(100);
        if (statsErr) throw statsErr;
        console.log("Stats meetings (limit 100 with sermon_title) count:", statsMeetings.length);
        
        const meetIds = meetings.map(m => m.id);
        const statsIds = statsMeetings.map(s => s.id);
        
        console.log("First 5 Meetings IDs:", meetIds.slice(0, 5));
        console.log("First 5 Stats IDs:", statsIds.slice(0, 5));
        
        const missing = statsIds.filter(id => !meetIds.includes(id));
        console.log("Missing IDs count (should be 0):", missing.length);
        
        console.log("\nFirst 5 stats meetings details:");
        statsMeetings.slice(0, 5).forEach(s => {
            console.log(`- ID: ${s.id}, Date: ${s.date}, Title: ${s.title}, Type: ${s.type}, Sermon: ${s.sermon_title}`);
        });
        
    } catch (e) {
        console.error(e);
    }
}
check();
