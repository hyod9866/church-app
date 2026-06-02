import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import iconv from 'iconv-lite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testKoreanUpload() {
  const csvPath = path.join(__dirname, 'test_korean.csv');
  
  // Create test_korean.csv with EUC-KR encoding
  const content = '성명,소속,생년,성별,구역,구원일,연락처,주소,가족관계,심방내용,간증\n' +
                  '한글이름,청년회,1990,S,581,2021-01-01,010-1111-2222,지구 어딘가,나홀로,심방 잘 받음,믿음 충만\n' +
                  '이순신,봉사회,1545,B,582,1592-05-23,010-3333-4444,거북선,나라 사랑,심방 불필요,필사즉생 필생즉사';
  
  const encodedContent = iconv.encode(content, 'euc-kr');
  fs.writeFileSync(csvPath, encodedContent);

  const formData = new FormData();
  const file = new File([encodedContent], 'test_korean.csv', { type: 'text/csv' });
  formData.append('file', file);

  try {
    const response = await fetch('http://localhost:3000/api/upload-members', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    console.log('Upload Response:', data);
    
    // Verify in DB
    const dbRes = await fetch('http://localhost:3000/api/members/search?q=한글이름');
    const members = await dbRes.json();
    console.log('Found member:', members[0]);
    
    if (members.length > 0 && members[0].name === '한글이름' && members[0].visitation_note === '심방 잘 받음') {
      console.log('Test Passed: Korean header mapping and new fields verified!');
    } else {
      console.log('Test Failed: Member not found or fields mismatch');
    }
  } catch (error) {
    console.error('Test Failed with error:', error);
  }
}

testKoreanUpload();
