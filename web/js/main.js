import { start } from './app.js';

if (/[?&]selftest\b/.test(location.search)) {
  // 自动化测试：使用独立的存储空间，不影响真实学习进度
  const { useNamespace } = await import('./store.js');
  useNamespace('wordbuddy.selftest');
  start();
  const { runSelfTest } = await import('./selftest.js');
  runSelfTest();
} else {
  start();
}
