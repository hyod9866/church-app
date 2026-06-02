const fs = require('fs');
const content = fs.readFileSync('public/js/app.js', 'utf8');
if (content.includes('moveMemberIndex')) {
  console.log("app.js has moveMemberIndex!");
} else {
  console.log("app.js DOES NOT have moveMemberIndex.");
}