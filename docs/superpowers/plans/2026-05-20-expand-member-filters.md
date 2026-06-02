# Expand Member Filtering and Searching APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the member filtering and searching APIs in `server.js` to support multi-filter (gender, category, district) and sorting (name, district).

**Architecture:** Refactor `GET /api/members/filter` and `GET /api/members/search` to use a shared dynamic query builder helper function. This ensures consistency and reduces code duplication.

**Tech Stack:** Node.js, Express, SQLite3

---

### Task 1: Refactor and Expand Filtering Logic in `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Define `buildMemberQuery` helper function**
Add this function before the route definitions to handle dynamic SQL construction.

```javascript
function buildMemberQuery(queryParams) {
  const { q, gender, category, district, sort, type } = queryParams;
  let query = "SELECT * FROM members WHERE status = 'active'";
  const params = [];

  // Existing 'type' logic (preserving backward compatibility/specific meeting logic)
  if (type && type.includes('조모임')) {
    const match = type.match(/(\d+)조모임/);
    if (match) {
      query += " AND bs = 'S' AND district = ?";
      params.push(match[1] + '구역');
    }
  } else if (type === '교구형제모임' || type === '형제모임') {
    query += " AND bs = 'B'";
  } else if (type === '교구청년모임') {
    query += " AND category = '청년회'";
  } else if (type && type.includes('구역모임')) {
    const match = type.match(/(\d+)구역/);
    if (match) {
      query += ' AND district = ?';
      params.push(match[1] + '구역');
    }
  }

  // Search query
  if (q) {
    query += ' AND name LIKE ?';
    params.push(`%${q}%`);
  }

  // Multi-filters
  if (gender && gender !== '전체') {
    query += ' AND bs = ?';
    params.push(gender);
  }
  if (category && category !== '전체') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (district && district !== '전체') {
    query += ' AND district = ?';
    params.push(district);
  }

  // Sorting
  if (sort === 'district') {
    query += ' ORDER BY district ASC, name ASC';
  } else {
    // Default sort by name
    query += ' ORDER BY name ASC';
  }

  return { query, params };
}
```

- [ ] **Step 2: Update `GET /api/members/filter` to use `buildMemberQuery`**

```javascript
app.get('/api/members/filter', (req, res) => {
  const { query, params } = buildMemberQuery(req.query);
  console.log('Filter request:', req.query, 'SQL:', query);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error filtering members:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});
```

- [ ] **Step 3: Update `GET /api/members/search` to use `buildMemberQuery`**

```javascript
app.get('/api/members/search', (req, res) => {
  const { query, params } = buildMemberQuery(req.query);
  console.log('Search request:', req.query, 'SQL:', query);

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error searching members:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});
```

### Task 2: Verification

**Files:**
- Create: `verify_filters.js`

- [ ] **Step 1: Create `verify_filters.js`**

```javascript
async function verify() {
  const baseUrl = 'http://localhost:3000/api/members';
  
  const tests = [
    { name: 'Filter by Gender (B)', url: `${baseUrl}/filter?gender=B` },
    { name: 'Filter by Gender (S)', url: `${baseUrl}/filter?gender=S` },
    { name: 'Filter by Category', url: `${baseUrl}/filter?category=${encodeURIComponent('청년회')}` },
    { name: 'Sort by District', url: `${baseUrl}/filter?sort=district` },
    { name: 'Search with Filter', url: `${baseUrl}/search?q=${encodeURIComponent('김')}&gender=B` },
    { name: 'Combined Filters', url: `${baseUrl}/filter?gender=S&district=${encodeURIComponent('581구역')}` }
  ];

  for (const test of tests) {
    console.log(`Running: ${test.name}...`);
    try {
      const res = await fetch(test.url);
      const data = await res.json();
      console.log(`Result: ${data.length} found.`);
      if (data.length > 0) {
        console.log('Sample:', data[0].name, data[0].bs, data[0].category, data[0].district);
      }
    } catch (e) {
      console.error(`Failed: ${test.name}`, e.message);
    }
    console.log('---');
  }
}

verify();
```

- [ ] **Step 2: Run the server and verification script**
Since I cannot easily run a persistent server and a script simultaneously in this environment without backgrounding, I will use `run_shell_command` with `is_background: true` for the server, wait a bit, then run the test script.

1. Start server: `node server.js` (background)
2. Run test: `node verify_filters.js`
3. Stop server.

---
