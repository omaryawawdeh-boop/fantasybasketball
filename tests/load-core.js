// Loads the browser-global core modules in the same order the extension does.
for (const m of ['names', 'rankings', 'rankings-edit', 'scoring', 'espn', 'draft', 'live-picks']) require(`../extension/core/${m}.js`);
require('../extension/data/tier-sheet-stats.js');
module.exports = globalThis.HDA;
