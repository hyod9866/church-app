async function testAttendanceFlow() {
  const baseUrl = 'http://localhost:3000';

  try {
    // 1. Filter members
    console.log('Testing GET /api/members/filter...');
    const filterRes = await fetch(`${baseUrl}/api/members/filter?type=조모임&district=전체`);
    const members = await filterRes.json();
    console.log(`Found ${members.length} members for 조모임`);

    // 2. Create meeting
    console.log('Testing POST /api/meetings...');
    const meetingRes = await fetch(`${baseUrl}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '테스트 조모임',
        date: '2026-05-19',
        type: '조모임'
      })
    });
    const meetingData = await meetingRes.json();
    console.log('Created meeting ID:', meetingData.id);

    // 3. Save attendance
    console.log('Testing POST /api/attendance...');
    const attendanceData = members.slice(0, 2).map(m => ({
      member_id: m.id,
      is_present: true,
      testimony_snapshot: '테스트 간증 내용'
    }));

    const attendanceRes = await fetch(`${baseUrl}/api/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meeting_id: meetingData.id,
        attendance_data: attendanceData
      })
    });
    const attendanceResult = await attendanceRes.json();
    console.log('Attendance save result:', attendanceResult);

    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testAttendanceFlow();
