import re

# server.js 수정
with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = "      .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present, members(district)')"
new = "      .select('meeting_id, testimony_snapshot, district_snapshot, member_id, is_present')"
if old in content:
    content = content.replace(old, new, 1)
    print("server.js: members(district) 조인 제거 완료")
else:
    print("server.js: 해당 문자열 없음 - 이미 수정됐거나 확인 필요")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)

# public/js/app.js 수정
with open('public/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """            try {
                const res = await fetch('/api/meetings');
                const rawMeetings = await res.json();
                const meetings = rawMeetings.map(parseRecurringMetadata);"""
new = """            try {
                const res = await fetch('/api/meetings');
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    console.error('[Calendar] /api/meetings 오류:', res.status, errData);
                    failureCallback(new Error(errData.error || 'HTTP ' + res.status));
                    return;
                }
                const rawMeetings = await res.json();
                if (!Array.isArray(rawMeetings)) {
                    console.error('[Calendar] 응답이 배열 아님:', rawMeetings);
                    failureCallback(new Error('모임 데이터 형식 오류'));
                    return;
                }
                const meetings = rawMeetings.map(parseRecurringMetadata);"""
if old in content:
    content = content.replace(old, new, 1)
    print("app.js: 오류 처리 코드 추가 완료")
else:
    print("app.js: 해당 문자열 없음 - 이미 수정됐거나 확인 필요")

with open('public/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("모든 수정 완료!")
