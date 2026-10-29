const key = 'nero_labs_secret_key_2026';
const bases = [
  'https://nero-labs-bot-production.up.railway.app',
  'https://empty-oclc-grass-abstracts.trycloudflare.com'
];

async function runAudit() {
  for (const base of bases) {
    console.log('\n========================================');
    console.log('AUDITING HOST:', base);
    console.log('========================================');

    const headers = {
      'x-dashboard-access-key': key,
      'Content-Type': 'application/json'
    };

    const checks = [
      { name: 'Health check (/healthz)', fn: () => fetch(base + '/healthz').then(r => r.json()) },
      { name: 'Universe HTML (/universe)', fn: () => fetch(base + '/universe').then(r => r.status === 200 ? { ok: true } : { ok: false, status: r.status }) },
      { name: 'Workspace HTML (/workspace)', fn: () => fetch(base + '/workspace').then(r => r.status === 200 ? { ok: true } : { ok: false, status: r.status }) },
      { name: 'System Status (/api/status)', fn: () => fetch(base + '/api/status', { headers }).then(r => r.json()) },
      { name: 'WhatsApp Status (/api/whatsapp/status)', fn: () => fetch(base + '/api/whatsapp/status', { headers }).then(r => r.json()) },
      { name: 'Workspace Dashboard (/api/workspace/dashboard)', fn: () => fetch(base + '/api/workspace/dashboard', { headers }).then(r => r.json()) },
      { name: 'Skill Tree (/api/skills/tree)', fn: () => fetch(base + '/api/skills/tree', { headers }).then(r => r.json()) },
      { name: 'MyraScript Execute (/api/myrascript/execute)', fn: () => fetch(base + '/api/myrascript/execute', {
          method: 'POST',
          headers,
          body: JSON.stringify({ code: 'let a = 100\nlet b = 250\nreturn a + b' })
        }).then(r => r.json())
      },
      { name: 'MyraScript Transpile (/api/myrascript/transpile)', fn: () => fetch(base + '/api/myrascript/transpile', {
          method: 'POST',
          headers,
          body: JSON.stringify({ code: 'let x = 1\nreturn x', target: 'javascript' })
        }).then(r => r.json())
      },
      { name: 'Research Dossiers (/api/research/dossiers)', fn: () => fetch(base + '/api/research/dossiers', { headers }).then(r => r.json()) },
      { name: 'Download Wizard Start (/api/download/start)', fn: () => fetch(base + '/api/download/start', {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        }).then(r => r.json())
      },
      { name: 'Generated Tools List (/api/tools)', fn: () => fetch(base + '/api/tools', { headers }).then(r => r.json()) },
      { name: 'MCP Servers (/api/mcp/servers)', fn: () => fetch(base + '/api/mcp/servers', { headers }).then(r => r.json()) },
      { name: 'Minecraft Profiles (/api/minecraft/framework/profiles)', fn: () => fetch(base + '/api/minecraft/framework/profiles', { headers }).then(r => r.json()) },
      { name: 'Bedrock Pack Generator (/api/minecraft/framework/packs/generate)', fn: () => fetch(base + '/api/minecraft/framework/packs/generate', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            packName: 'LiveAuditPack',
            items: [{ identifier: 'myra:audit_crystal', displayName: 'Audit Crystal' }]
          })
        }).then(r => r.json())
      },
      { name: 'Workspace Budget (/api/workspace/budget)', fn: () => fetch(base + '/api/workspace/budget', { headers }).then(r => r.json()) },
      { name: 'Workspace Permissions (/api/workspace/permissions)', fn: () => fetch(base + '/api/workspace/permissions', { headers }).then(r => r.json()) },
    ];

    for (const chk of checks) {
      try {
        const start = Date.now();
        const res = await chk.fn();
        const ms = Date.now() - start;
        const passed = res && (res.ok === true || res.status === 'connected' || res.operational === true || res.tree !== undefined || res.dossiers !== undefined || res.servers !== undefined || res.tools !== undefined || res.profiles !== undefined);
        console.log((passed ? '✅ ' : '❌ ') + '[' + chk.name + ']: ' + ms + 'ms');
        if (!passed) console.log('   Response:', JSON.stringify(res));
      } catch (err) {
        console.log('❌ [' + chk.name + ']: ERROR: ' + err.message);
      }
    }
  }
}

runAudit();
