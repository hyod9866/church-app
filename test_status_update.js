async function test() {
  const res = await fetch('http://localhost:3000/api/members/1/status', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'inactive' })
  });
  if (res.status === 200) {
    const data = await res.json();
    console.log('Success:', data);
    process.exit(0);
  } else {
    console.error('Failed:', res.status, await res.text());
    process.exit(1);
  }
}
test();
