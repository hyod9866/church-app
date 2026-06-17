import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function isMandatoryMeeting(member, meeting) {
  const mType = meeting.type || '';
  const mDistMatch = mType.match(/\d+/);
  const mDistNum = mDistMatch ? mDistMatch[0] : null;
  const memDistNum = (member.district || '').replace(/[^0-9]/g, '');

  if (mType.includes('조모임')) {
    if (member.category === '청년회' && member.bs === 'S') return false;
    if (member.bs === 'B') return false;
  }

  if (mType.includes('구역모임')) {
    if (!mDistNum || mDistNum === memDistNum) return true;
  }

  if (mType.includes('조모임')) {
    if (!mDistNum || mDistNum === memDistNum) return true;
  }

  if (mType.includes('교구전체모임')) return true;
  if (mType.includes('교구형제모임') && member.bs === 'B') return true;
  if (mType.includes('교구임원모임') && (member.position || '').trim() !== '') return true;
  if (mType.includes('청년') && member.category === '청년회' && member.id !== 270) return true;

  return false;
}

async function test() {
  try {
    const today = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

    const { data: meetings, error: meetErr } = await supabase
      .from('meetings')
      .select('id, type, date')
      .neq('type', '심방')
      .neq('type', '설교')
      .neq('type', '외부설교')
      .lte('date', today);
    if (meetErr) throw meetErr;

    const meetingMap = {};
    meetings.forEach(m => {
      meetingMap[m.id] = m;
    });

    const { data: members, error: memErr } = await supabase
      .from('members')
      .select('id, name, category, bs, district, position')
      .limit(5);
    if (memErr) throw memErr;

    let allAttendance = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data: pageData, error: attErr } = await supabase
        .from('attendance')
        .select('meeting_id, member_id, is_present')
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (attErr) throw attErr;

      allAttendance = allAttendance.concat(pageData || []);
      if (!pageData || pageData.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }

    const memberAtts = {};
    allAttendance.forEach(a => {
      const mt = meetingMap[a.meeting_id];
      if (mt) {
        if (!memberAtts[a.member_id]) memberAtts[a.member_id] = [];
        memberAtts[a.member_id].push({
          meeting_id: a.meeting_id,
          is_present: a.is_present,
          type: mt.type,
          date: mt.date
        });
      }
    });

    const rates = {};
    members.forEach(member => {
      const atts = memberAtts[member.id] || [];
      const filtered = atts.filter(h => {
        return isMandatoryMeeting(member, h) || h.is_present;
      });

      const totalCount = filtered.length;
      const attendCount = filtered.filter(h => h.is_present).length;
      const ratePercent = totalCount > 0 ? Math.round((attendCount / totalCount) * 100) : 0;

      rates[member.id] = {
        name: member.name,
        ratePercent,
        attendCount,
        totalCount
      };
    });

    console.log("Calculated rates sample:", rates);
  } catch (err) {
    console.error(err);
  }
}

test();
