# CSV Upload Korean/English Header Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the CSV upload API to support both Korean and English headers by implementing a header mapping layer.

**Architecture:** Add a `columnMapping` object in `server.js` and use it to transform CSV rows during parsing before database insertion.

**Tech Stack:** Node.js, Express, fast-csv, iconv-lite, SQLite3.

---

### Task 1: Create Korean Test CSV

**Files:**
- Create: `test_korean.csv`

- [ ] **Step 1: Create `test_korean.csv` with Korean headers in EUC-KR encoding**

We'll use a temporary script to create the file with the correct encoding.

```javascript
// create_test_csv.js
import fs from 'fs';
import iconv from 'iconv-lite';

const headers = '성명,소속,생년,성별,구역,구원일,연락처,주소,가족관계,심방내용,간증';
const data = '홍길동,일반,1990,B,123구역,2023-01-01,010-1234-5678,서울시 강남구,부모님,열심히 신앙생활 중,구원의 확신이 있음';
const content = headers + '\n' + data;

const buffer = iconv.encode(content, 'euc-kr');
fs.writeFileSync('test_korean.csv', buffer);
console.log('test_korean.csv created with EUC-KR encoding');
```

Run: `node create_test_csv.js`
Expected: `test_korean.csv` created.

- [ ] **Step 2: Commit (Local only, do not commit test files to repo if possible, but for this task we will keep it for verification)**

---

### Task 2: Implement Header Mapping in `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Define `columnMapping` object**

Add this before the CSV Upload API endpoint:

```javascript
const columnMapping = {
  '성명': 'name', '이름': 'name', 'name': 'name',
  '소속': 'category', '교구': 'category', '구분': 'category', 'category': 'category',
  '생년': 'birth_year', '출생년도': 'birth_year', 'birth_year': 'birth_year',
  '성별': 'bs', '구분(B/S)': 'bs', 'bs': 'bs',
  '구역': 'district', 'district': 'district',
  '구원일': 'salvation_date', '침례일': 'salvation_date', 'salvation_date': 'salvation_date',
  '연락처': 'phone', '전화번호': 'phone', 'phone': 'phone',
  '주소': 'address', 'address': 'address',
  '가족관계': 'family_relation', 'family_relation': 'family_relation',
  '심방내용': 'visitation_note', '비고': 'visitation_note', 'visitation_note': 'visitation_note',
  '간증': 'testimony', 'testimony': 'testimony'
};
```

- [ ] **Step 2: Update the `on('data')` handler in `/api/upload-members`**

Replace:
```javascript
    .on('data', (row) => {
      results.push(row);
    })
```
With:
```javascript
    .on('data', (row) => {
      const mappedRow = {};
      Object.entries(row).forEach(([key, value]) => {
        const dbColumn = columnMapping[key.trim()];
        if (dbColumn) {
          mappedRow[dbColumn] = value;
        }
      });
      // Only push if we have a name (minimum requirement)
      if (mappedRow.name) {
        results.push(mappedRow);
      }
    })
```

- [ ] **Step 3: Update database insertion to use mapped keys**

Ensure `stmt.run` uses the correct keys from `row`.

```javascript
        results.forEach((row) => {
          stmt.run(
            row.name || null,
            row.category || null,
            row.birth_year || null,
            row.bs || null,
            row.district || null,
            row.salvation_date || null,
            row.phone || null,
            row.address || null,
            row.family_relation || null,
            row.visitation_note || null,
            row.testimony || null,
            (err) => {
              if (err) console.error('Insert Row Error:', err);
            }
          );
        });
```

---

### Task 3: Verification

**Files:**
- Create: `test_upload_korean.js`

- [ ] **Step 1: Create verification script**

```javascript
// test_upload_korean.js
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import sqlite3 from 'sqlite3';

async function test() {
  const form = new FormData();
  form.append('file', fs.createReadStream('test_korean.csv'));

  try {
    console.log('Uploading test_korean.csv...');
    const response = await axios.post('http://localhost:3000/api/upload-members', form, {
      headers: form.getHeaders(),
    });
    console.log('Upload response:', response.data);

    // Verify in DB
    const db = new sqlite3.Database('./church.db');
    db.get("SELECT * FROM members WHERE name = '홍길동'", (err, row) => {
      if (err) {
        console.error('DB Error:', err);
      } else if (row) {
        console.log('Verification Success: Row found in DB');
        console.log(row);
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
```

- [ ] **Step 2: Run verification**

1. Start the server: `node server.js` (in background if needed)
2. Run test: `node test_upload_korean.js`
Expected: "Verification Success" and data correctly mapped.

- [ ] **Step 3: Cleanup**

Remove temporary test files if appropriate.
```bash
rm create_test_csv.js test_korean.csv test_upload_korean.js
```
