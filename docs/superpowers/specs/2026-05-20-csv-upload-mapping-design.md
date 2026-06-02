# Design Spec: Korean/English CSV Upload Header Mapping

Update the CSV upload API to support flexible header naming in both Korean and English, ensuring accurate data mapping to the `members` table.

## 1. Architecture
The system uses `express`, `multer` for file uploads, `fast-csv` for parsing, and `sqlite3` for storage. We will introduce a mapping layer between the CSV parser and the database insertion logic.

## 2. Header Mapping
A static mapping object will be defined to translate various header aliases to the canonical database column names.

| Database Column | Korean/English Aliases |
| :--- | :--- |
| `name` | 성명, 이름, name |
| `category` | 소속, 교구, 구분, category |
| `birth_year` | 생년, 출생년도, birth_year |
| `bs` | 성별, 구분(B/S), bs |
| `district` | 구역, district |
| `salvation_date` | 구원일, 침례일, salvation_date |
| `phone` | 연락처, 전화번호, phone |
| `address` | 주소, address |
| `family_relation` | 가족관계, family_relation |
| `visitation_note` | 심방내용, 비고, visitation_note |
| `testimony` | 간증, testimony |

## 3. Implementation Plan
1.  **Define Mapping:** Add a `columnMapping` object to `server.js`.
2.  **Refactor Upload Logic:**
    *   Update `POST /api/upload-members`.
    *   In the `on('data')` handler, transform the raw row using `columnMapping`.
    *   Ensure all 11 fields are correctly extracted and passed to the SQL statement.
3.  **Encoding Support:** Maintain the existing `iconv-lite` decoding stream for EUC-KR support.

## 4. Verification Strategy
1.  **Test CSV Creation:** Create `test_korean.csv` containing Korean headers and sample data in EUC-KR encoding.
2.  **Automated Test Script:** Create `test_upload_korean.js` that:
    *   Sends a `POST` request to `/api/upload-members` with `test_korean.csv`.
    *   Queries the database to verify the record was inserted correctly with all fields populated.
3.  **Manual Verification:** Check server logs for successful parsing and insertion.

## 5. Scope & Constraints
*   Focuses strictly on the `/api/upload-members` endpoint.
*   Does not address the encoding issues observed in `buildMemberQuery` (outside requested scope).
*   Assumes CSV headers are provided in the first row.
