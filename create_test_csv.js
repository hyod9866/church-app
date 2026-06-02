import fs from 'fs';
import iconv from 'iconv-lite';

const headers = '성명,소속,생년,성별,구역,구원일,연락처,주소,가족관계,심방내용,간증';
const data = '홍길동,일반,1990,B,123구역,2023-01-01,010-1234-5678,서울시 강남구,부모님,열심히 신앙생활 중,구원의 확신이 있음';
const content = headers + '\n' + data;

const buffer = iconv.encode(content, 'euc-kr');
fs.writeFileSync('test_korean.csv', buffer);
console.log('test_korean.csv created with EUC-KR encoding');
