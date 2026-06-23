import http from 'http';

const getJSON = (url) => {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
};

async function check() {
    try {
        console.log("Fetching local /api/meetings...");
        http.get('http://localhost:3000/api/meetings', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log("Raw response body:", data.substring(0, 500));
            });
        });
    } catch (e) {
        console.error("Error:", e.message);
    }
}
check();
