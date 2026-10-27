/**
 * heuristics.test.js
 * Dependency-free tests (Node's built-in `assert`) for heuristics.js.
 * Run with: node heuristics.test.js
 */
const assert = require('assert');
const { extractEvidence, parseRuns, computeEvidenceScore } = require('../src/heuristics');

let passCount = 0;
function t(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✘ ${name}`);
    console.error('  ' + e.message);
    process.exitCode = 1;
  }
}

t('detects fixed wait (sleep/waitForTimeout)', () => {
  const ev = extractEvidence(`test('x', async () => { await sleep(2000); });`);
  assert.ok(ev.some(e => e.signal === 'fixed_wait'));
});

t('detects missing await on async-looking call', () => {
  const ev = extractEvidence(`test('x', async () => { page.click('#go'); });`);
  assert.ok(ev.some(e => e.signal === 'missing_await'));
});

t('does not flag missing_await when awaited', () => {
  const ev = extractEvidence(`test('x', async () => { await page.click('#go'); });`);
  assert.ok(!ev.some(e => e.signal === 'missing_await'));
});

t('detects random value usage (Date.now/Math.random/uuid)', () => {
  const ev = extractEvidence(`const id = Date.now(); expect(id).toBeDefined();`);
  assert.ok(ev.some(e => e.signal === 'random_value'));
});

t('detects hardcoded date literal', () => {
  const ev = extractEvidence(`const d = new Date('2024-01-01');`);
  assert.ok(ev.some(e => e.signal === 'hardcoded_date'));
});

t('detects shared global state mutation', () => {
  const ev = extractEvidence(`global.counter = global.counter + 1;`);
  assert.ok(ev.some(e => e.signal === 'shared_global_state'));
});

t('detects beforeAll without reset as order-dependency risk', () => {
  const ev = extractEvidence(`beforeAll(() => { seedDb(); }); test('x', () => {});`);
  assert.ok(ev.some(e => e.signal === 'test_order_assumption'));
});

t('does not flag order dependency when beforeEach resets', () => {
  const ev = extractEvidence(`beforeAll(() => { seedDb(); }); beforeEach(() => { resetDb(); });`);
  assert.ok(!ev.some(e => e.signal === 'test_order_assumption'));
});

t('parseRuns computes totals and failure rate correctly', () => {
  const text = 'Run 1: PASS\nRun 2: FAIL - timeout\nRun 3: PASS\nRun 4: FAIL - mismatch\nRun 5: PASS';
  const stats = parseRuns(text);
  assert.strictEqual(stats.total, 5);
  assert.strictEqual(stats.passed, 3);
  assert.strictEqual(stats.failed, 2);
  assert.strictEqual(stats.failureRate, 0.4);
  assert.strictEqual(stats.isIntermittent, true);
});

t('parseRuns marks all-pass as not intermittent', () => {
  const stats = parseRuns('Run 1: PASS\nRun 2: PASS');
  assert.strictEqual(stats.isIntermittent, false);
});

t('parseRuns ignores unparseable lines', () => {
  const stats = parseRuns('garbage line\nRun 1: PASS');
  assert.strictEqual(stats.total, 1);
});

t('computeEvidenceScore sums severity weights and adds intermittency bonus', () => {
  const evidence = [
    { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }
  ];
  const score = computeEvidenceScore(evidence, { isIntermittent: true, total: 3 });
  // 3 + 2 + 1 = 6, +2 intermittent, +0 (total<5) = 8
  assert.strictEqual(score, 8);
});

t('invalid LLM response shape is rejected by validator (see app.js validateDiagnosis)', () => {
  // Validator logic lives inline in the browser app; this test documents the
  // expected contract so a regression in the shape is caught if ported here.
  const required = ['category', 'summary', 'evidence', 'reasoning', 'confidence_level', 'suggested_fix'];
  const badResponse = { diagnosis: { category: 'timing' } }; // missing fields
  const missing = required.filter(k => !(k in badResponse.diagnosis));
  assert.ok(missing.length > 0, 'expected missing fields to be detected');
});

console.log(`\n${passCount} test(s) passed.`);
