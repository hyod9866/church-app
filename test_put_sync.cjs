const axios = require('axios');

async function testApi() {
  try {
    const res = await axios.put('http://localhost:3000/api/members/270', {
      name: '강효근',
      family_relation: '권정윤(아내)',
      family_id: '',
      bs: 'B'
    });
    console.log("API Response:", res.data);
  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
  }
}

testApi();