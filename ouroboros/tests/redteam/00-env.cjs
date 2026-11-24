// Which Playwright browsers can actually launch here?
const pw = require('/opt/node-tools/node_modules/playwright');
(async () => {
  for (const name of ['chromium', 'webkit', 'firefox']) {
    try { const b = await pw[name].launch(); console.log(name, 'OK', b.version()); await b.close(); }
    catch (e) { console.log(name, 'UNAVAILABLE:', String(e.message).split('\n')[0]); }
  }
})();
