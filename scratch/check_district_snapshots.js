import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/D-kanghyodgeun/church-app/.env' });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function check() {
    try {
        console.log("Checking district snapshots in attendance table...");
        
        const { data, error } = await supabase
            .from('attendance')
            .select('district_snapshot, is_present')
            .eq('is_present', 1);
            
        if (error) throw error;
        
        const counts = {};
        data.forEach(row => {
            const dist = row.district_snapshot || 'null/empty';
            counts[dist] = (counts[dist] || 0) + 1;
        });
        
        console.log("District snapshot counts in present attendance:", counts);
        
        // Also check some meetings to see if district_attendees are calculated properly
        const { data: meetings, error: meetErr } = await supabase
            .from('meetings')
            .select('id, type, date')
            .order('date', { ascending: false })
            .limit(10);
            
        if (meetErr) throw meetErr;
        
        console.log("\nLast 10 meetings types and dates:");
        meetings.forEach(m => {
            console.log(`- ID: ${m.id}, Date: ${m.date}, Type: ${m.type}`);
        });
        
    } catch (e) {
        console.error(e);
    }
}
check();
