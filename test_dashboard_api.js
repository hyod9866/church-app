import http from 'http';

const testYear = 2026;
const url = `http://localhost:3000/api/dashboard/attendance?year=${testYear}`;

function testApi() {
  console.log(`Testing API: ${url}`);
  
  http.get(url, (res) => {
    const { statusCode } = res;
    console.log(`Status Code: ${statusCode}`);

    if (statusCode !== 200) {
      console.error(`Test Failed: Expected 200, got ${statusCode}`);
      process.exit(1);
    }

    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const parsedData = JSON.parse(rawData);
        console.log('Response received successfully');
        
        if (!Array.isArray(parsedData.meetings)) {
          console.error('Test Failed: meetings should be an array');
          process.exit(1);
        }
        
        if (!Array.isArray(parsedData.members)) {
          console.error('Test Failed: members should be an array');
          process.exit(1);
        }

        console.log(`Found ${parsedData.meetings.length} meetings and ${parsedData.members.length} members.`);
        
        // Verify date range for meetings
        const startDate = `${testYear - 1}-12-01`;
        const endDate = `${testYear}-11-30`;
        
        parsedData.meetings.forEach(m => {
          if (m.date < startDate || m.date > endDate) {
            console.error(`Test Failed: Meeting ${m.id} (${m.date}) is out of range [${startDate}, ${endDate}]`);
            process.exit(1);
          }
        });

        console.log('Test Passed!');
        process.exit(0);
      } catch (e) {
        console.error(`Test Failed: Error parsing JSON - ${e.message}`);
        process.exit(1);
      }
    });
  }).on('error', (e) => {
    console.error(`Test Failed: Request error - ${e.message}`);
    process.exit(1);
  });
}

testApi();
