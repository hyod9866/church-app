import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function check() {
    try {
        console.log("Fetching meetings directly from Supabase...");
        // This query matches what server.js /api/sermon-stats does
        const { data: meetings, error } = await supabase
            .from('meetings')
            .select('id, date, title, type, sermon_title, memo, start_time, end_time, attendance(count)')
            .not('sermon_title', 'is', null)
            .neq('sermon_title', '')
            .eq('attendance.is_present', 1)
            .order('date', { ascending: false })
            .limit(100);

        if (error) throw error;
        
        console.log("Fetched meetings count:", meetings.length);
        
        // Let's see if there are duplicate IDs or if the IDs are all identical.
        const idCounts = {};
        meetings.forEach(m => {
            idCounts[m.id] = (idCounts[m.id] || 0) + 1;
        });
        
        const duplicates = Object.keys(idCounts).filter(id => idCounts[id] > 1);
        console.log("Duplicate IDs count:", duplicates.length);
        if (duplicates.length > 0) {
            console.log("Duplicates:", duplicates);
        }
        
        console.log("First 10 meetings details:");
        meetings.slice(0, 10).forEach((s, index) => {
            console.log(`${index + 1}. ID: ${s.id}, Date: ${s.date}, Title: ${s.title}, Type: ${s.type}, Sermon: ${s.sermon_title}`);
        });

    } catch (e) {
        console.error("Error:", e);
    }
}

check();
