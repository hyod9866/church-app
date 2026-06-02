const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

console.log("=== 인적사항 히스토리(member_records) 구역 데이터 원천 정화 시작 ===");

db.serialize(() => {
    // 1. member_records 테이블에서 DISTRICT 상태인 기록들의 remark 정화
    db.all("SELECT id, remark FROM member_records WHERE status = 'DISTRICT' AND remark LIKE '%->%'", (err, rows) => {
        if (err) {
            console.error(err);
            return;
        }

        console.log(`정화 대상 기록: ${rows.length}건`);
        
        const stmt = db.prepare("UPDATE member_records SET remark = ? WHERE id = ?");
        rows.forEach(row => {
            const parts = row.remark.split('->');
            const cleanRemark = parts[parts.length - 1].trim();
            stmt.run(cleanRemark, row.id);
        });
        stmt.finalize();

        console.log("히스토리 기록 정화 완료. 이제 메인 프로필과 동기화합니다...");

        // 2. 정화된 히스토리를 바탕으로 members 테이블 일괄 동기화 (force_sync_all.cjs 로직 활용)
        // 이 부분은 외부 스크립트를 호출하거나 로직을 내장할 수 있습니다.
        // 여기서는 안전하게 로직을 내장하여 한 번에 처리합니다.
        
        db.all("SELECT id, name FROM members", (err, members) => {
            if (err) {
                console.error(err);
                return;
            }

            let completed = 0;
            const total = members.length;

            members.forEach(m => {
                // 특정 성도의 모든 히스토리를 다시 분석하여 프로필 갱신
                db.all("SELECT * FROM member_records WHERE member_id = ? ORDER BY date ASC, id ASC", [m.id], (err, records) => {
                    db.get("SELECT * FROM members WHERE id = ?", [m.id], (err, member) => {
                        let currentPosition = [];
                        let currentDistrict = member.district;
                        let currentCategory = member.category;
                        let currentService = [];

                        records.forEach(rec => {
                            if (rec.status === 'DISTRICT') {
                                currentDistrict = rec.remark;
                            } else if (rec.status === 'CATEGORY') {
                                currentCategory = rec.remark;
                            } else if (rec.status === 'POSITION') {
                                const newPos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
                                currentPosition = Array.from(new Set([...currentPosition, ...newPos]));
                            } else if (rec.status === 'POSITION_DISMISS') {
                                const removePos = rec.remark.split(',').map(p => p.trim()).filter(p => p);
                                currentPosition = currentPosition.filter(p => !removePos.includes(p));
                            } else if (rec.status === 'SERVICE') {
                                const newSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
                                currentService = Array.from(new Set([...currentService, ...newSvc]));
                            } else if (rec.status === 'SERVICE_DISMISS') {
                                const removeSvc = rec.remark.split(',').map(s => s.trim()).filter(s => s);
                                currentService = currentService.filter(s => !removeSvc.includes(s));
                            }
                        });

                        const q = `UPDATE members SET district = ?, category = ?, position = ?, church_service = ? WHERE id = ?`;
                        db.run(q, [currentDistrict, currentCategory, currentPosition.join(', '), currentService.length ? currentService.join(', ') : '없음', m.id], (err) => {
                            completed++;
                            if (completed === total) {
                                console.log(`=== 모든 정화 및 동기화 작업 완료: 총 ${total}명 처리됨 ===`);
                                db.close();
                            }
                        });
                    });
                });
            });
        });
    });
});
