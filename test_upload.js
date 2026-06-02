import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testUpload() {
  const csvPath = path.join(__dirname, 'test.csv');
  const formData = new FormData();
  const file = new File([fs.readFileSync(csvPath)], 'test.csv', { type: 'text/csv' });
  formData.append('file', file);

  try {
    const response = await fetch('http://localhost:3000/api/upload-members', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    console.log('Upload Response:', data);
    if (data.count === 2) {
      console.log('Test Passed!');
    } else {
      console.log('Test Failed: Expected 2 rows, got', data.count);
    }
  } catch (error) {
    console.error('Test Failed with error:', error);
  }
}

testUpload();
