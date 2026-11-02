import { createWebServer } from '../src/web/server.js';
import { initRock3tDb } from '../src/rock3t/rock3tDb.js';

async function runBenchmark() {
  console.log('🚀 Running Comprehensive Latency & Performance Benchmark...\n');
  initRock3tDb();

  const app = createWebServer();
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const results = [];

  async function measure(name, fn) {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    results.push({ name, duration: parseFloat(duration.toFixed(2)) });
    console.log(`⏱️  ${name.padEnd(45)}: ${duration.toFixed(2)} ms`);
  }

  try {
    // 1. Static Compressed HTML
    await measure('GET /rock3t/index.html (HTML)', async () => {
      const res = await fetch(`${baseUrl}/rock3t/index.html`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      await res.text();
    });

    // 2. Static Compressed CSS
    await measure('GET /rock3t/os.css (CSS)', async () => {
      const res = await fetch(`${baseUrl}/rock3t/os.css`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      await res.text();
    });

    // 3. Static Compressed JS
    await measure('GET /rock3t/os.js (JS)', async () => {
      const res = await fetch(`${baseUrl}/rock3t/os.js`);
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      await res.text();
    });

    // 4. Companion Chat Fast-Path (Greeting)
    await measure('POST /api/rock3t/companion/chat (Greeting)', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/companion/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ message: 'hello rocket', appContext: 'homescreen' })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Chat failed');
    });

    // 5. Companion Chat Fast-Path (Open App Command)
    await measure('POST /api/rock3t/companion/chat (Open App)', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/companion/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ message: 'open games', appContext: 'homescreen' })
      });
      const data = await res.json();
      if (!data.ok || !data.toolResult) throw new Error('Tool trigger failed');
    });

    // 6. Connect 4 Move
    await measure('POST /api/rock3t/games/connect4/move', async () => {
      const board = Array(42).fill(null);
      const res = await fetch(`${baseUrl}/api/rock3t/games/connect4/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ board, col: 3 })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('C4 failed');
    });

    // 7. Cyber RPS Turn
    await measure('POST /api/rock3t/games/rps/play', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/games/rps/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ choice: 'pizza' })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('RPS failed');
    });

    // 8. Tic Tac Toe Move
    await measure('POST /api/rock3t/games/tictactoe/move (TTT)', async () => {
      const board = Array(9).fill(null);
      const res = await fetch(`${baseUrl}/api/rock3t/games/tictactoe/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ board, cellIndex: 4 })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('TTT failed');
    });

    // 9. Random Thought Vault
    await measure('GET /api/rock3t/thoughts/random', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/thoughts/random`, {
        headers: { 'x-dashboard-access-key': 'master_dashboard_key_2026' }
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Thought failed');
    });

    // 10. Study Explain (Cached / Local Fast Fallback)
    await measure('POST /api/rock3t/study/explain (Fresh)', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/study/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ topic: 'Quantum Computing' })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Study explain failed');
    });

    // 10b. Study Explain (Repeat from Memory Cache)
    await measure('POST /api/rock3t/study/explain (Cached)', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/study/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ topic: 'Quantum Computing' })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Study explain cached failed');
    });

    // 11. Study Flashcards Cached
    await measure('POST /api/rock3t/study/flashcards (Cached)', async () => {
      const res = await fetch(`${baseUrl}/api/rock3t/study/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-dashboard-access-key': 'master_dashboard_key_2026' },
        body: JSON.stringify({ topic: 'Calculus' })
      });
      const data = await res.json();
      if (!data.ok) throw new Error('Flashcards failed');
    });

    // 12. Rocket Life State
    await measure('GET /api/rocket/state', async () => {
      const res = await fetch(`${baseUrl}/api/rocket/state`, {
        headers: { 'x-dashboard-access-key': 'master_dashboard_key_2026' }
      });
      const data = await res.json();
      if (!data.ok) throw new Error('State failed');
    });

    console.log('\n✅ All Latency Tests Completed Successfully!');
    const avg = results.reduce((a, b) => a + b.duration, 0) / results.length;
    console.log(`📊 Average Latency Across Everything: ${avg.toFixed(2)} ms`);
  } finally {
    server.close();
  }
}

runBenchmark().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
