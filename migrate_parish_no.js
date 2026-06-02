import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./church.db');

db.serialize(() => {
  // 1. members 테이블에 parish_no(교구 번호) 컬럼 추가
  db.run("ALTER TABLE members ADD COLUMN parish_no INTEGER", (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error('Error adding parish_no:', err.message);
    } else {
      console.log('Column parish_no checked/added.');
    }
  });

  // 2. 기존 부곡교구 데이터를 교구 번호 58로 업데이트
  db.run("UPDATE members SET parish_no = 58 WHERE parish = '부곡교구'", (err) => {
    if (err) console.error('Error updating parish_no:', err.message);
    else console.log('Updated existing members to parish_no 58.');
  });
  
  db.close();
});
