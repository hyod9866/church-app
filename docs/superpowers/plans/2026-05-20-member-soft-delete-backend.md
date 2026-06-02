# Member Soft Delete (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement "soft delete" for church members by adding a `status` column and updating API endpoints.

**Architecture:** Update SQLite schema with a migration, add a PATCH endpoint for status updates, and filter GET requests to only show active members by default.

**Tech Stack:** Node.js, Express, SQLite3

---

### Task 1: Database Schema Update & Migration

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Write a verification script to check for the `status` column**
  Create `verify_db_schema.js`:
  ```javascript
  import sqlite3 from 'sqlite3';
  const db = new sqlite3.Database('./church.db');
  db.all("PRAGMA table_info(members)", (err, rows) => {
    const hasStatus = rows.some(row => row.name === 'status');
    if (hasStatus) {
      console.log('Status column exists');
      process.exit(0);
    } else {
      console.error('Status column missing');
      process.exit(1);
    }
  });
  ```

- [ ] **Step 2: Run the verification script and verify it fails**
  Run: `node verify_db_schema.js`
  Expected: FAIL with "Status column missing"

- [ ] **Step 3: Update `initializeDatabase` and add migration in `server.js`**
  Modify `server.js`:
  - Update `CREATE TABLE IF NOT EXISTS members` to include `status TEXT DEFAULT 'active'`.
  - Add `ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'active'` migration block.

- [ ] **Step 4: Run the verification script and verify it passes**
  Run: `node verify_db_schema.js`
  Expected: PASS

---

### Task 2: API Endpoint for Status Update

**Files:**
- Modify: `server.js`
- Create: `test_status_update.js`

- [ ] **Step 1: Write a failing test for the PATCH endpoint**
  Create `test_status_update.js`:
  ```javascript
  import fetch from 'node-fetch';
  async function test() {
    const res = await fetch('http://localhost:3000/api/members/1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' })
    });
    if (res.status === 200) {
      const data = await res.json();
      console.log('Success:', data);
    } else {
      console.error('Failed:', res.status, await res.text());
      process.exit(1);
    }
  }
  test();
  ```

- [ ] **Step 2: Run the test and verify it fails**
  Ensure server is running, then run: `node test_status_update.js`
  Expected: FAIL with 404 (Not Found)

- [ ] **Step 3: Implement the `PATCH /api/members/:id/status` endpoint in `server.js`**

- [ ] **Step 4: Run the test and verify it passes**
  Run: `node test_status_update.js`
  Expected: PASS

---

### Task 3: Query Filtering for Active Members

**Files:**
- Modify: `server.js`
- Create: `test_member_filtering.js`

- [ ] **Step 1: Write a failing test for member filtering**
  Create `test_member_filtering.js`:
  ```javascript
  import fetch from 'node-fetch';
  async function test() {
    // 1. Set member 1 to inactive
    await fetch('http://localhost:3000/api/members/1/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' })
    });

    // 2. Search for member 1
    const searchRes = await fetch('http://localhost:3000/api/members/search?q=');
    const searchData = await searchRes.json();
    const foundInSearch = searchData.some(m => m.id === 1);

    // 3. Filter members
    const filterRes = await fetch('http://localhost:3000/api/members/filter');
    const filterData = await filterRes.json();
    const foundInFilter = filterData.some(m => m.id === 1);

    if (foundInSearch || foundInFilter) {
      console.error('Inactive member still found in results');
      process.exit(1);
    } else {
      console.log('Inactive member correctly filtered out');
    }
  }
  test();
  ```

- [ ] **Step 2: Run the test and verify it fails**
  Run: `node test_member_filtering.js`
  Expected: FAIL with "Inactive member still found in results"

- [ ] **Step 3: Update `GET /api/members/filter` and `GET /api/members/search` in `server.js`**
  Add `AND status = 'active'` to the queries.

- [ ] **Step 4: Run the test and verify it passes**
  Run: `node test_member_filtering.js`
  Expected: PASS

---

### Task 4: Final Verification

- [ ] **Step 1: Run all verification scripts**
- [ ] **Step 2: Clean up test scripts**
