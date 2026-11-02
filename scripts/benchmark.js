const base = 'https://nero-labs-bot-production.up.railway.app';
const endpoints = [
  { name: 'Static index.html', url: base + '/rock3t/index.html' },
  { name: 'Static os.css', url: base + '/rock3t/os.css' },
  { name: 'Static os.js', url: base + '/rock3t/os.js' },
  { name: 'Random Thought GET', url: base + '/api/rock3t/thoughts/random' },
  { name: 'Profile GET', url: base + '/api/rock3t/profile', headers: { 'x-user-id': '8685232094' } },
  { name: 'Store Apps GET', url: base + '/api/rock3t/store/apps' },
  { name: 'Connect4 Reset POST', url: base + '/api/rock3t/games/connect4/reset', method: 'POST', headers: { 'x-user-id': '8685232094' } },
  { name: 'Connect4 Move POST', url: base + '/api/rock3t/games/connect4/move', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': '8685232094' }, body: JSON.stringify({ board: Array(42).fill(null), col: 3 }) },
  { name: 'Cyber RPS Play POST', url: base + '/api/rock3t/games/rps/play', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': '8685232094' }, body: JSON.stringify({ choice: 'pizza' }) }
];

async function run() {
  for (const ep of endpoints) {
    const start = performance.now();
    try {
      const res = await fetch(ep.url, {
        method: ep.method || 'GET',
        headers: ep.headers,
        body: ep.body
      });
      const duration = (performance.now() - start).toFixed(1);
      console.log(`${ep.name.padEnd(25)}: ${res.status} in ${duration}ms`);
    } catch (err) {
      console.log(`${ep.name.padEnd(25)}: FAIL - ${err.message}`);
    }
  }
}

run();
