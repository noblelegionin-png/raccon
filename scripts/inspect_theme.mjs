async function run() {
  const cssUrl = 'https://nero-labs.pages.dev/assets/main-fgMk1L4g.css';
  const res = await fetch(cssUrl);
  const css = await res.text();
  console.log('CSS STATUS:', res.status);
  console.log('CSS LENGTH:', css.length);

  // Look for CSS variables
  const rootMatches = css.match(/:root\s*\{[^}]+\}/gi) || [];
  console.log('ROOT BLOCKS FOUND:', rootMatches.length);
  for (const r of rootMatches) {
    console.log('--- ROOT VARS ---');
    console.log(r);
  }

  // Look for all hex colors
  const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  const uniqueHex = [...new Set(hexes.map(h => h.toUpperCase()))];
  console.log('UNIQUE HEX COLORS:', uniqueHex);

  // Look for dark/light theme classes or background colors
  const bgMatches = css.match(/background(?:-color)?\s*:\s*[^;]+/gi) || [];
  console.log('UNIQUE BACKGROUNDS (sample):', [...new Set(bgMatches)].slice(0, 30));

  // Print first 3000 chars of CSS
  console.log('--- CSS PREVIEW ---');
  console.log(css.slice(0, 3000));
}

run().catch(console.error);
