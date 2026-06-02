import http from 'http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/visitation/status',
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Response:', data);
    if (res.statusCode === 404) {
      console.log('Test Passed: Endpoint not found as expected.');
      process.exit(0);
    } else {
      console.log('Test Failed: Expected 404 but got ' + res.statusCode);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

req.end();
