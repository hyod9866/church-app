const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');
c = c.replace(/    const \{ data: presentAttendance, error: attErr \} = await supabase\r?\n      \.from\('attendance'\)\r?\n      \.select\('meeting_id'\)\r?\n      \.eq\('is_present', 1\);\r?\n    if \(attErr\) throw attErr;\r?\n\r?\n    const countMap = \{\};\r?\n    if \(presentAttendance\) \{\r?\n      presentAttendance\.forEach\(a => \{\r?\n        countMap\[a\.meeting_id\] = \(countMap\[a\.meeting_id\] \|\| 0\) \+ 1;\r?\n      \}\);\r?\n    \}/, `    const { data: presentAttendance, error: attErr } = await supabase
      .from('attendance')
      .select('meeting_id, testimony_snapshot')
      .eq('is_present', 1);
    if (attErr) throw attErr;

    const countMap = {};
    const testimonyCountMap = {};
    if (presentAttendance) {
      presentAttendance.forEach(a => {
        countMap[a.meeting_id] = (countMap[a.meeting_id] || 0) + 1;
        if (a.testimony_snapshot && a.testimony_snapshot.trim() !== '') {
            testimonyCountMap[a.meeting_id] = (testimonyCountMap[a.meeting_id] || 0) + 1;
        }
      });
    }`);

c = c.replace(/attendee_count: countMap\[m.id\] \|\| 0\r?\n      \};/, `attendee_count: countMap[m.id] || 0,
        testimony_count: testimonyCountMap[m.id] || 0
      };`);
fs.writeFileSync('server.js', c);
console.log('done');
