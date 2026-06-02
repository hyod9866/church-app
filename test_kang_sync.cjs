const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('church.db');

const memberId = 270; // 강효근
const memberName = '강효근';
const memberBs = 'B';
const familyRelation = '권정윤(아내)';
const providedFid = null;

function getSymmetricRelation(targetRel) {
  if (targetRel.includes('남편')) return '아내';
  if (targetRel.includes('아내')) return '남편';
  if (targetRel.includes('자녀')) return '부모';
  if (targetRel.includes('부모')) return '자녀';
  return '기타';
}

const entries = familyRelation.split(',').map(s => s.trim()).filter(s => s);
const inputMap = {};
entries.forEach(e => { const m = e.match(/^(.+?)\((.+?)\)$/); if (m) inputMap[m[1].trim()] = m[2]; });
const familyNames = Object.keys(inputMap);

const allNamesInvolved = [memberName.trim(), ...familyNames];
const placeholders = allNamesInvolved.map(() => '?').join(',');

db.all(`SELECT id, name, bs, family_id, family_relation FROM members WHERE TRIM(name) IN (${placeholders}) AND status = 'active'`, allNamesInvolved, (err, groupMembers) => {
    if (err) return console.error(err);
    console.log("Found members in group:", groupMembers.map(m => m.name));
    
    const meId = parseInt(memberId);
    let fid = (providedFid && providedFid !== 'null' && providedFid !== '') ? parseInt(providedFid) : null;
    if (!fid) {
        const hasFid = groupMembers.find(m => m.family_id !== null && m.family_id !== '');
        if (hasFid) fid = parseInt(hasFid.family_id);
    }
    
    if (!fid) {
        db.get("SELECT MAX(family_id) as maxFid FROM members", (err, row) => {
            const newFid = (parseInt(row?.maxFid) || 0) + 1;
            console.log("New FID generated:", newFid);
            runSync(newFid);
        });
    } else {
        console.log("Existing FID used:", fid);
        runSync(fid);
    }

    function runSync(targetFid) {
      groupMembers.forEach(target => {
        const others = groupMembers.filter(o => o.id !== target.id);
        const rels = others.map(other => {
          let r = '기타';
          if (target.id === meId) {
            r = inputMap[other.name.trim()] || '기타';
          } else if (other.id === meId) {
            const meRelToTarget = inputMap[target.name.trim()] || '기타';
            r = getSymmetricRelation(meRelToTarget);
          } else {
            const mRT = inputMap[target.name.trim()] || '기타', mRO = inputMap[other.name.trim()] || '기타';
            if (mRT.includes('남편') || mRT.includes('아내')) r = mRO;
            else if (mRO.includes('남편') || mRO.includes('아내')) r = mRT;
          }
          return `${other.name.trim()}(${r})`;
        });
        console.log(`Plan: Update ${target.name} (ID: ${target.id}) -> FID: ${targetFid}, REL: ${rels.join(', ')}`);
      });
    }
});