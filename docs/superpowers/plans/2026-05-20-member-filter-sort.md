# 성도 목록 필터 및 정렬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구역, 성별, 구분(부서) 필터와 이름/구역순 정렬 기능을 추가하여 성도 관리를 용이하게 함.

**Architecture:** 백엔드 API에서 필터 및 정렬 파라미터를 처리하고, 프론트엔드 UI에 필터 선택창과 정렬 버튼을 추가함.

**Tech Stack:** Node.js, Express, SQLite, React, Vanilla JS/HTML

---

### Task 1: 백엔드 API 확장

**Files:**
- Modify: `server.js`

- [ ] **Step 1: `GET /api/members/filter` API 수정**
  - `gender` (bs), `category` (구분), `sort` 파라미터 추가 처리.
  - SQL 쿼리에 필터 조건 동적 추가.
  - `ORDER BY` 절에 정렬 기준 적용.
- [ ] **Step 2: `GET /api/members/search` API 수정**
  - 검색 시에도 필터와 정렬 기준이 적용되도록 수정.
- [ ] **Step 3: 테스트 스크립트로 API 동작 확인**

### Task 2: HTML/JS 프론트엔드 UI 및 로직 수정

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: 사이드바에 필터(구역, 성별, 구분) 및 정렬 버튼 UI 추가**
- [ ] **Step 2: 필터 및 정렬 변경 시 데이터를 새로 불러오는 로직 구현**
  - `updateMemberList` 함수를 만들어 필터 값을 쿼리 스트링으로 전달.
- [ ] **Step 3: 달력 크기 조정을 위한 CSS 수정**
  - `#calendar`의 높이를 소폭 줄여 필터 영역 공간 확보.

### Task 3: React 프론트엔드 수정

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: 필터 및 정렬 상태 변수 추가 (`useState`)**
- [ ] **Step 2: 필터 및 정렬이 적용된 `filteredMembers` 로직 수정**
- [ ] **Step 3: UI에 필터 선택창 및 정렬 버튼 배치**

---

### Task 4: 모임 출석 모달 확장

**Files:**
- Modify: `public/index.html`
- Modify: `public/js/app.js`

- [ ] **Step 1: 모임 생성 모달에 성별 및 구분 필터 추가**
- [ ] **Step 2: 모달 내 성도 목록 로딩 시 다중 필터 적용**
