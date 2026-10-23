async function run() {
  const cssUrl = 'https://nero-labs.pages.dev/assets/main-fgMk1L4g.css';
  const res = await fetch(cssUrl);
  const css = await res.text();

  function findSelectors(...patterns) {
    for (const pat of patterns) {
      console.log(`\n=== MATCHING: ${pat} ===`);
      const regex = new RegExp(`([^}{]+${pat}[^}{]*\\{[^}]+\\})`, 'gi');
      const matches = [...css.matchAll(regex)];
      for (const m of matches.slice(0, 5)) {
        console.log(m[1].trim());
      }
    }
  }

  findSelectors('btn', 'card', 'header', 'nav', 'input', 'badge', 'pill', 'status');
}

run().catch(console.error);
