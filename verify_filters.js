async function verify() {
  const baseUrl = 'http://localhost:3000/api/members';
  
  const tests = [
    { name: 'Filter by Gender (B)', url: `${baseUrl}/filter?gender=B` },
    { name: 'Filter by Gender (S)', url: `${baseUrl}/filter?gender=S` },
    { name: 'Filter by Category', url: `${baseUrl}/filter?category=${encodeURIComponent('청년회')}` },
    { name: 'Sort by District', url: `${baseUrl}/filter?sort=district` },
    { name: 'Search with Filter', url: `${baseUrl}/search?q=${encodeURIComponent('김')}&gender=B` },
    { name: 'Combined Filters', url: `${baseUrl}/filter?gender=S&district=${encodeURIComponent('581구역')}` }
  ];

  for (const test of tests) {
    console.log(`Running: ${test.name}...`);
    try {
      const res = await fetch(test.url);
      const data = await res.json();
      console.log(`Result: ${data.length} found.`);
      if (data.length > 0) {
        console.log('Sample:', data[0].name, data[0].bs, data[0].category, data[0].district);
      }
    } catch (e) {
      console.error(`Failed: ${test.name}`, e.message);
    }
    console.log('---');
  }
}

verify();
