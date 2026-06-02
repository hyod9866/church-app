# 부곡교구 성도 관리 시스템 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부곡교구 성도들의 인적 사항 관리, CSV 기반 데이터 마이그레이션, 그리고 달력 기반의 지능형 출석/간증 기록 시스템 구축.

**Architecture:** Express.js 백엔드와 SQLite3 데이터베이스를 사용하며, 프론트엔드는 Vanilla JS와 Tailwind CSS를 사용하여 독립적인 정적 페이지로 구성함.

**Tech Stack:** Node.js, Express, SQLite3, FullCalendar, Tailwind CSS (CDN), Multer (file upload), Fast-csv.

---

### Task 1: 프로젝트 초기화 및 서버 설정

**Files:**
- Create: `package.json` (업데이트)
- Create: `server.js`
- Create: `public/index.html` (임시)

- [ ] **Step 1: 필요한 패키지 설치**
Run: `npm install express sqlite3 multer fast-csv`

- [ ] **Step 2: 기본 Express 서버 및 SQLite 초기화 코드 작성**
```javascript
// server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const db = new sqlite3.Database('./church.db');

app.use(express.json());
app.use(express.static('public'));

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    birth_year INTEGER,
    bs TEXT,
    district TEXT,
    salvation_date TEXT,
    phone TEXT,
    address TEXT,
    family_relation TEXT,
    visitation_note TEXT,
    testimony TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    type TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER,
    member_id INTEGER,
    is_present INTEGER DEFAULT 0,
    testimony_snapshot TEXT,
    FOREIGN KEY(meeting_id) REFERENCES meetings(id),
    FOREIGN KEY(member_id) REFERENCES members(id)
  )`);
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
```

- [ ] **Step 3: 서버 기동 확인**
Run: `node server.js`
Expected: "Server running on http://localhost:3000" 메시지 확인

---

### Task 2: CSV 데이터 마이그레이션 기능 구현

**Files:**
- Modify: `server.js` (API 추가)
- Create: `public/upload.html` (테스트용 업로드 화면)

- [ ] **Step 1: CSV 업로드 엔드포인트 작성**
```javascript
// server.js에 추가
const multer = require('multer');
const csv = require('fast-csv');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });

app.post('/api/upload-members', upload.single('file'), (req, res) => {
  const fileRows = [];
  csv.parseFile(req.file.path, { headers: true })
    .on('data', (data) => fileRows.push(data))
    .on('end', () => {
      const stmt = db.prepare(`INSERT INTO members (name, category, birth_year, bs, district, salvation_date, phone, address, family_relation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      fileRows.forEach(row => {
        stmt.run(row.name, row.category, row.birth_year, row.bs, row.district, row.salvation_date, row.phone, row.address, row.family_relation);
      });
      stmt.finalize();
      fs.unlinkSync(req.file.path);
      res.json({ message: `${fileRows.length} members imported successfully` });
    });
});
```

- [ ] **Step 2: 간단한 업로드 UI 작성 및 테스트**
`public/upload.html` 생성 후 파일 선택 필드와 업로드 버튼 추가.

---

### Task 3: 메인 대시보드 및 달력 구현

**Files:**
- Modify: `public/index.html`
- Create: `public/js/app.js`

- [ ] **Step 1: Tailwind CSS 및 FullCalendar CDN 포함**
- [ ] **Step 2: 대시보드 레이아웃(사이드바 + 달력) 마크업**
- [ ] **Step 3: FullCalendar 초기화 및 이벤트 로드 로직 작성**

---

### Task 4: 지능형 출석 체크 팝업 구현

**Files:**
- Modify: `public/js/app.js`
- Modify: `server.js` (API 추가: 모임 생성 및 성도 필터 조회)

- [ ] **Step 1: 모임 종류별 필터링 API 작성**
```javascript
app.get('/api/members/filter', (req, res) => {
  const { type, district } = req.query;
  let query = "SELECT * FROM members WHERE 1=1";
  const params = [];

  if (type === '조모임') {
    query += " AND bs = 'S' AND district = ?";
    params.push(district);
  } else if (type === '교구형제모임') {
    query += " AND bs = 'B'";
  } else if (type === '교구청년모임') {
    query += " AND category = '청년회'";
  } else if (type.includes('구역모임')) {
    const distNum = type.replace('구역모임', '').trim();
    query += " AND district = ?";
    params.push(distNum);
  }

  db.all(query, params, (err, rows) => {
    res.json(rows);
  });
});
```

- [ ] **Step 2: 출석 및 간증 저장 기능 구현**

---

### Task 5: 성도 상세 히스토리 화면

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: 성도 클릭 시 개인별 출석/간증 히스토리 조회 API 및 UI 구현**
