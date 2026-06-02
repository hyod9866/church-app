async function testFilter() {
    const baseUrl = 'http://localhost:3000/api/members/filter';
    
    try {
        console.log('Testing "조모임" filter...');
        const res1 = await fetch(`${baseUrl}?type=${encodeURIComponent('조모임')}&district=${encodeURIComponent('581구역')}`);
        const data1 = await res1.json();
        console.log('Res1 (조모임, 581구역):', data1.length, data1.map(m => m.name));
        
        console.log('Testing "교구형제모임" filter...');
        const res2 = await fetch(`${baseUrl}?type=${encodeURIComponent('교구형제모임')}`);
        const data2 = await res2.json();
        console.log('Res2 (교구형제모임):', data2.length, data2.map(m => m.name));
        
        console.log('Testing "교구청년모임" filter...');
        const res3 = await fetch(`${baseUrl}?type=${encodeURIComponent('교구청년모임')}`);
        const data3 = await res3.json();
        console.log('Res3 (교구청년모임):', data3.length, data3.map(m => m.name));
        
        console.log('Testing "581구역모임" filter...');
        const res4 = await fetch(`${baseUrl}?type=${encodeURIComponent('581구역모임')}`);
        const data4 = await res4.json();
        console.log('Res4 (581구역모임):', data4.length, data4.map(m => m.name));
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testFilter();
