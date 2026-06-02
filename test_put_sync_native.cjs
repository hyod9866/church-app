const http = require('http');

const data = JSON.stringify({
  name: '강효근',
  family_relation: '권정윤(아내)',
  family_id: '',
  bs: 'B'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/members/270',
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Body:", body);
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
});

req.write(data);
req.end();