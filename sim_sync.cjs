const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

function getSymmetricRelation(targetRel) {
  if (targetRel.includes('남편')) return '아내';
  if (targetRel.includes('아내')) return '남편';
  if (targetRel.includes('자녀')) return '부모';
  if (targetRel.includes('부모')) return '자녀';
  return '기타';
}

const memberId = 273; // 최기현
const memberName = '최기현';
const memberBs = 'B';
const familyRelation = '민옥순(아내), 최슬기(기타)';
const providedFid = null;

const entries = familyRelation.split(',').map(s => s.trim()).filter(s => s);
const inputMap = {};
entries.forEach(e => { const m = e.match(/^(.+?)\((.+?)\)$/); if (m) inputMap[m[1].trim()] = m[2]; });
const familyNames = Object.keys(inputMap);

const meName = memberName.trim();
const allNamesInvolved = [meName, ...familyNames];
const placeholders = allNamesInvolved.map(() => '?').join(',');

console.log("Searching for:", allNamesInvolved);

db.all(`SELECT id, name, bs, family_id, family_relation FROM members WHERE TRIM(name) IN (${placeholders})`, allNamesInvolved, (err, groupMembers) => {
  if (err) return console.error(err);
  
  console.log("Found members:", groupMembers.map(m => m.name));
  
  const meId = parseInt(memberId);
  let fid = 2; // Fixed for test
  
  groupMembers.forEach(target => {
    const others = groupMembers.filter(o => o.id !== target.id);
    const rels = others.map(other => {
      let r = '기타';
      const tName = target.name.trim();
      const oName = other.name.trim();

      if (target.id === meId) {
        r = inputMap[oName] || '기타';
      } else if (other.id === meId) {
        const meRelToTarget = inputMap[tName] || '기타';
        r = getSymmetricRelation(meRelToTarget);
      } else {
        const meRelToTarget = inputMap[tName] || '기타';
        const meRelToOther = inputMap[oName] || '기타';
        
        if (meRelToTarget.includes('남편') || meRelToTarget.includes('아내')) {
            r = meRelToOther;
        } else if (meRelToOther.includes('남편') || meRelToOther.includes('아내')) {
            r = getSymmetricRelation(meRelToTarget);
        } else {
            r = '기타';
        }
      }
      return `${oName}(${r})`;
    });
    console.log(`Update ${target.name} (ID: ${target.id}) -> family_id: ${fid}, relation: ${rels.join(', ')}`);
  });
});