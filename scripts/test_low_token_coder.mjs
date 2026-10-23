import { config } from '../src/config.js';

const candidates = [
  'gemini-3.5-flash-lite',
  'deepseek-v4-flash',
  'kimi-k2.7-code',
];

const bugPrompt = `Fix this Python async queue producer/consumer bug with minimal tokens:

import asyncio

async def worker(queue):
    while True:
        item = await queue.get()
        if item is None:
            break
        print('Processing', item)
        # Bug: queue.task_done() is missing

async def main():
    q = asyncio.Queue()
    tasks = [asyncio.create_task(worker(q)) for _ in range(3)]
    for i in range(10):
        await q.put(i)
    await q.join()
    for _ in tasks:
        await q.put(None)
    await asyncio.gather(*tasks)

Provide only the fixed worker function and 1-sentence explanation of what was fixed.`;

async function test(model) {
  const t0 = performance.now();
  const res = await fetch(config.scaleMaxBaseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + config.scaleMaxApiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: bugPrompt }],
      temperature: 0.1,
      max_tokens: 250,
    }),
  });
  const lat = Math.round(performance.now() - t0);
  const data = await res.json();
  const usage = data.usage || {};
  const content = data.choices?.[0]?.message?.content || '';
  console.log('====================================================');
  console.log('MODEL:', model);
  console.log('LATENCY:', lat + 'ms');
  console.log('TOKENS -> In:', usage.prompt_tokens, '| Out:', usage.completion_tokens, '| Total:', usage.total_tokens);
  console.log('REPLY:\n' + content.trim());
}

async function run() {
  for (const m of candidates) {
    await test(m);
  }
}
run().catch(console.error);
