import fs from 'fs';
import sqlite3 from 'sqlite3';

async function test() {
  const fileData = fs.readFileSync('test_korean.csv');
  const blob = new Blob([fileData], { type: 'text/csv' });
  const formData = new FormData();
  formData.append('file', blob, 'test_korean.csv');

  try {
    console.log('Uploading test_korean.csv...');
    const response = await fetch('http://localhost:3000/api/upload-members', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    console.log('Upload response:', result);

    // Verify in DB
    const db = new sqlite3.Database('./church.db');
    db.get("SELECT * FROM members WHERE name = '홍길동' ORDER BY id DESC LIMIT 1", (err, row) => {
      if (err) {
        console.error('DB Error:', err);
      } else if (row) {
        console.log('Verification Success: Row found in DB');
        console.log(row);
        
        // Check if all fields are mapped correctly
        const expected = {
          name: '홍길동',
          category: '일반',
          birth_year: 1990,
          bs: 'B',
          district: '123구역',
          salvation_date: '2023-01-01',
          phone: '010-1234-5678',
          address: '서울시 강남구',
          family_relation: '부모님',
          visitation_note: '열심히 신앙생활 중',
          testimony: '구원의 확신이 있음'
        };
        
        let allMatch = true;
        for (const [key, value] of Object.entries(expected)) {
          if (row[key] != value) {
            console.error(`Field mismatch: ${key}. Expected: ${value}, Got: ${row[key]}`);
            allMatch = false;
          }
        }
        if (allMatch) {
          console.log('All fields mapped correctly!');
        } else {
          console.error('Some fields did not map correctly.');
        }
      } else {
        console.error('Verification Failed: Row not found');
      }
      db.close();
    });
  } catch (error) {
    console.error('Upload Failed:', error.message);
  }
}

test();
