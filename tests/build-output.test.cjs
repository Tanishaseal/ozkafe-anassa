const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Server traces exclude static assets, tests and local runtime data', () => {
  const root = process.cwd();
  const directory = path.join(root, '.next/server/app');
  const traces = fs.readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.nft.json'));
  assert.ok(traces.length > 0, 'Run the production build first');
  for (const file of traces) {
    const trace = path.join(directory, file);
    for (const dependency of JSON.parse(fs.readFileSync(trace, 'utf8')).files) {
      const relative = path.relative(root, path.resolve(path.dirname(trace), dependency)).replaceAll('\\', '/');
      const unwanted = /^(public|tests|scratch)\//.test(relative)
        || /^\.env(?:\.|$)/.test(relative) || relative === '.anassa_store.json';
      assert.equal(unwanted, false, `${file} includes non-server data: ${relative}`);
    }
  }
});
