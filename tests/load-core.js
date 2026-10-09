// Loads the browser-global core modules in the same order the extension does.
for (const m of ['names', 'rankings', 'scoring', 'espn', 'draft']) require(`../extension/core/${m}.js`);
module.exports = globalThis.HDA;
