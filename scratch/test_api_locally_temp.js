import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
    try {
        const { data: meetings, error } = await supabase
            .from('meetings')
            .select('date, title, type, sermon_title, memo, attendance(count)')
            .not('sermon_title', 'is', null)
            .neq('sermon_title', '')
            .eq('attendance.is_present', 1)
            .order('date', { ascending: false })
            .limit(100);

        if (error) throw error;

        let bibleBooksCount = {};
        let keywordsCount = {};
        let matchedSermons = [];

        meetings.forEach(meeting => {
            const title = meeting.sermon_title.trim();
            let sermon_bible = '';
            let sermon_tags = '';
            let cleanMemo = meeting.memo || '';
            
            if (cleanMemo.startsWith('{')) {
                const firstLine = cleanMemo.split('\\n')[0];
                try {
                    if (firstLine.endsWith('}')) {
                        const meta = JSON.parse(firstLine);
                        if (meta.bible !== undefined || meta.tags !== undefined) {
                            sermon_bible = meta.bible || '';
                            sermon_tags = meta.tags || '';
                        }
                    }
                } catch(e) {
                    console.log("JSON Parse error:", e.message, "on line:", firstLine);
                }
            }

            matchedSermons.push({
                date: meeting.date,
                meeting_title: meeting.title || '',
                type: meeting.type,
                sermon_title: title,
                attendee_count: meeting.attendance && meeting.attendance.length > 0 ? meeting.attendance[0].count : 0
            });

            // Bible Counting
            if (sermon_bible) {
                bibleBooksCount[sermon_bible] = (bibleBooksCount[sermon_bible] || 0) + 1;
            }

            // Keyword Extraction from explicit tags or fallback to title
            let targetText = sermon_tags ? sermon_tags : title;
            const words = targetText.replace(/[#]/g, '').replace(/[^\w\s가-힣]/g, ' ').split(/\s+/);
            const stopWords = ['수', '있', '하', '것', '들', '그', '되', '이', '보', '않', '없', '나', '사람', '주', '아니', '등', '같', '우리', '때', '년', '가', '한', '지', '대하', '오', '말', '일', '그렇', '위하', '때문', '그것', '두', '말하', '알', '그러나', '받', '못하', '그런', '또', '문제', '더', '사회', '많', '그리고', '좋', '크', '따르', '중', '나오', '가지', '씨', '시키', '만들', '지금', '생각하', '그러', '속', '하나', '집', '살', '모르', '적', '월', '데', '자신', '안', '어떤', '내', '경우', '명', '생각', '시간', '그녀', '다시', '이런', '앞', '보이', '번', '나', '다른', '어떻', '여자', '개', '전', '들', '사실', '이렇', '점', '싶', '말', '정도', '좀', '원', '잘', '통하', '소리', '놓', '위해', '대한'];
            
            words.forEach(word => {
                if (word.length > 1 && !stopWords.includes(word) && isNaN(word)) {
                    keywordsCount[word] = (keywordsCount[word] || 0) + 1;
                }
            });
        });

        const topKeywords = Object.entries(keywordsCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 30)
            .map(([text, weight]) => ({ text, weight }));

        const bibleDist = Object.entries(bibleBooksCount)
            .sort((a, b) => b[1] - a[1])
            .map(([book, count]) => ({ book, count }));

        console.log("Top Keywords length:", topKeywords.length);
        console.log("Top Keywords:", topKeywords.slice(0, 5));
        console.log("Bible Dist length:", bibleDist.length);
        console.log("Bible Dist:", bibleDist);
        console.log("Total meetings found:", meetings.length);
    } catch (e) {
        console.error(e);
    }
}
run();

console.log(JSON.stringify(matchedSermons[0]));