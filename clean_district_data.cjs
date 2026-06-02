const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

console.log("=== 구역 데이터 일괄 정화 및 동기화 시작 ===");

// 모든 활성 성도 조회
db.all("SELECT id, name FROM members WHERE status = 'active'", (err, members) => {
    if (err) {
        console.error(err);
        return;
    }

    let completed = 0;
    const total = members.length;

    if (total === 0) {
        console.log("처리할 성도가 없습니다.");
        db.close();
        return;
    }

    members.forEach(m => {
        // 해당 성도의 가장 최신 구역 변경 기록 조회
        db.get(`
            SELECT remark FROM member_records 
            WHERE member_id = ? AND status = 'DISTRICT' 
            ORDER BY date DESC, id DESC LIMIT 1
        `, [m.id], (err, record) => {
            if (err) {
                console.error(`조회 실패 [${m.name}]:`, err.message);
                next();
                return;
            }

            if (record && record.remark) {
                let finalDistrict = record.remark;
                
                // 만약 remark에도 화살표가 있다면 최종값만 추출 (예: "581 -> 581구역" -> "581구역")
                if (finalDistrict.includes('->')) {
                    const parts = finalDistrict.split('->');
                    finalDistrict = parts[parts.length - 1].trim();
                }

                // members 테이블 업데이트
                db.run("UPDATE members SET district = ? WHERE id = ?", [finalDistrict, m.id], (err) => {
                    if (err) console.error(`업데이트 실패 [${m.name}]:`, err.message);
                    next();
                });
            } else {
                // 기록이 없는 경우 패스
                next();
            }
        });
    });

    function next() {
        completed++;
        if (completed === total) {
            console.log(`=== 정화 완료: 총 ${total}명 검사 및 처리됨 ===`);
            db.close();
        }
    }
});
