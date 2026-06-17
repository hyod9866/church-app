const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./church.db');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error(err);
    db.close();
    return;
  }
  console.log('Tables:', tables.map(t => t.name));

  // 각 테이블의 컬럼이나 데이터 수도 확인해본다.
  const promises = tables.map(t => {
    return new Promise((resolve) => {
      db.get(`SELECT COUNT(*) as count FROM ${t.name}`, (err2, row) => {
        resolve({ table: t.name, count: err2 ? -1 : row.count });
      });
    });
  });

  Promise.all(promises).then(results => {
    console.log('Counts:', results);
    db.close();
  });
});
