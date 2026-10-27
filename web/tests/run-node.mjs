// 在 Node 中运行逻辑测试：node web/tests/run-node.mjs
import { runSuites } from '../js/tests/suites.js';

const results = runSuites();
let suite = '';
for (const r of results) {
  if (r.suite !== suite) { suite = r.suite; console.log(`\n${suite}`); }
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `\n      ${r.error}`}`);
}
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
