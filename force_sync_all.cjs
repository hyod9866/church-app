const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

// server.js의 로직과 동일한 동기화 함수
function syncMemberProfileFromRecords(memberId, callback) {
    db.all("SELECT * FROM member_records WHERE member_id = ? ORDER BY date ASC, id ASC", [memberId], (err, records) => {
        if (err) return callback && callback(err);

        db.get("SELECT * FROM members WHERE id = ?", [memberId], (err, member) => {
            if (err) return callback && callback(err);
            if (!member) return callback && callback(new Error('Member not found'));

            let currentPosition = [];
            let currentDistrict = member.district;
            let currentCategory = member.category;
            let currentService = member.church_service;

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
                    currentService = rec.remark;
                } else if (rec.status === 'SERVICE_DISMISS') {
                    currentService = '없음';
                }
            });

            const q = `UPDATE members SET district = ?, category = ?, position = ?, church_service = ? WHERE id = ?`;
            db.run(q, [currentDistrict, currentCategory, currentPosition.join(', '), currentService, memberId], (err) => {
                if (callback) callback(err);
            });
        });
    });
}

console.log("=== 모든 성도 데이터 일괄 동기화 시작 ===");

db.all("SELECT id, name FROM members", (err, members) => {
    if (err) {
        console.error(err);
        return;
    }

    let completed = 0;
    const total = members.length;

    if (total === 0) {
        console.log("동기화할 성도가 없습니다.");
        db.close();
        return;
    }

    members.forEach(m => {
        syncMemberProfileFromRecords(m.id, (err) => {
            completed++;
            if (err) {
                console.error(`실패 [${m.name}]:`, err.message);
            } else {
                // 성공 로그 생략 (너무 많을 수 있으므로)
            }

            if (completed === total) {
                console.log(`=== 동기화 완료: 총 ${total}명 처리됨 ===`);
                db.close();
            }
        });
    });
});
