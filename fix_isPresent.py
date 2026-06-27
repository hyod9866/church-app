with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = ".eq('is_present', true);"
new = ".eq('is_present', 1);"
if old in content:
    content = content.replace(old, new, 1)
    print("수정 완료: .eq('is_present', true) -> .eq('is_present', 1)")
else:
    print("ERROR: 해당 문자열을 찾지 못했습니다")

with open('server.js', 'w', encoding='utf-8') as f:
    f.write(content)
