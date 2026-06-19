async function test() {
    const res = await fetch('https://church-app-gray.vercel.app/js/sermon_history.js');
    const text = await res.text();
    console.log(text.substring(0, 1000));
}
test();
