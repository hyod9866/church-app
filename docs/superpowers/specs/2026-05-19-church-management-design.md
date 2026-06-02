# 부곡교구 통합 성도 관리 시스템 설계서 (Spec)

## 1. 개요
부곡교구 성도들의 인적 사항, 구역 모임 출석, 그리고 간증 기록을 체계적으로 관리하기 위한 독립형 웹 애플리케이션입니다.

## 2. 기술 스택
- **Backend**: Node.js (Express.js)
- **Database**: SQLite3 (로컬 파일 저장)
- **Frontend**: Vanilla HTML/JS + Tailwind CSS (CDN) + FullCalendar (라이브러리)
- **Data Migration**: CSV 파일 업로드 기능

## 3. 데이터 구조 (Database Schema)

### 3.1 members (성도 정보)
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| id | INTEGER (PK) | 고유 식별자 |
| name | TEXT | 성명 |
| category | TEXT | 봉사회, 어머니회, 청년회, 은장회 |
| birth_year | INTEGER | 출생년도 (예: 1982) |
| bs | TEXT | B(형제), S(자매) |
| district | TEXT | 구역 (예: 581, 582, 583) |
| salvation_date | TEXT | 구원일 (YYYY-MM-DD) |
| phone | TEXT | 연락처 |
| address | TEXT | 주소 |
| family_relation | TEXT | 가족 관계 |
| visitation_note | TEXT | 심방 내용 |
| testimony | TEXT | 기본 간증 |

### 3.2 meetings (모임 정보)
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| id | INTEGER (PK) | 고유 식별자 |
| title | TEXT | 모임 제목 |
| date | TEXT | 날짜 (YYYY-MM-DD) |
| type | TEXT | 종류 (구역모임, 조모임, 교구형제모임, 교구청년모임 등) |

### 3.3 attendance (출석 및 모임 기록)
| 필드명 | 타입 | 설명 |
| :--- | :--- | :--- |
| id | INTEGER (PK) | 고유 식별자 |
| meeting_id | INTEGER (FK) | 모임 ID |
| member_id | INTEGER (FK) | 성도 ID |
| is_present | INTEGER | 출석 여부 (1: 참석, 0: 불참) |
| testimony_snapshot| TEXT | 해당 모임에서의 구체적 간증 내용 |

## 4. 핵심 UI/UX 기능

### 4.1 대시보드 (메인 화면)
- **FullCalendar 통합**: 월별 일정을 한눈에 확인.
- **모임 생성**: 날짜 클릭 시 모임 종류 선택 및 제목 입력.
- **출석 체크 오버레이**:
    - 모임 종류에 따른 **자동 필터링**:
        - '581구역모임' -> 구역 581 성도 전체
        - '조모임' -> 해당 구역의 자매(S)만
        - '교구형제모임' -> 전체 형제(B)만
        - '교구청년모임' -> 소속회 '청년회'만

### 4.2 성도 관리 및 데이터 마이그레이션
- **CSV 업로드**: 기존 엑셀 데이터를 CSV로 변환하여 업로드하면 `members` 테이블에 일괄 삽입.
- **성도 상세 조회**: 특정 성도 클릭 시 개인 정보 및 참여했던 모든 모임의 간증 히스토리 노출.

## 5. 구현 계획
1.  `server.js` 작성: Express 서버 및 SQLite 초기화.
2.  `public/index.html` 작성: 메인 대시보드 및 달력 UI.
3.  `public/app.js` 작성: API 통신 및 필터링 로직.
4.  CSV 업로드 API 구현: 대량 데이터 마이그레이션 지원.
