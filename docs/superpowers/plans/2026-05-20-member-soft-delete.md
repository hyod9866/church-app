# 성도 상태 관리 (소프트 삭제) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성도를 삭제하는 대신 '이동 또는 교제 안나옴' 상태로 변경하여 목록에서 제외하고 데이터를 보존함.

**Architecture:** DB에 `status` 컬럼을 추가하고, API와 프론트엔드 필터링 로직을 수정하여 활성 성도만 기본 표시함.

**Tech Stack:** Node.js (Express), SQLite, React, Vanilla JS/HTML

---

### Task 1: 데이터베이스 스키마 및 API 수정

**Files:**
- Modify: `server.js`

- [ ] **Step 1: DB 초기화 로직에 `status` 컬럼 추가**
  - `initializeDatabase` 함수에서 `members` 테이블 생성 쿼리에 `status TEXT DEFAULT 'active'` 추가.
  - 기존 데이터들을 위해 `ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'active'` 쿼리 실행 로직 추가.
- [ ] **Step 2: 상태 업데이트를 위한 PATCH API 추가**
  - `PATCH /api/members/:id/status` 엔드포인트 구현.
- [ ] **Step 3: 기존 조회 API(`filter`, `search`)에 `status = 'active'` 조건 추가**
- [ ] **Step 4: 서버 재시작 및 API 동작 확인**

### Task 2: HTML/JS 프론트엔드 수정

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: 상세 모달 하단에 '이동/교제 안나옴' 버튼 UI 추가**
  - `public/index.html`의 성도 수정 모달 영역에 버튼 추가.
- [ ] **Step 2: 버튼 클릭 시 상태 변경 이벤트 리스너 등록**
  - `public/js/app.js`에서 PATCH 요청 및 UI 갱신 로직 구현.

### Task 3: React 프론트엔드 수정

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: `filteredMembers` 로직에 `status === 'active'` 필터 추가**
- [ ] **Step 2: 성도 상세 뷰 하단에 상태 변경 버튼 추가 및 핸들러 구현**
- [ ] **Step 3: 상태 변경 후 로컬 상태 갱신 로직 추가**
