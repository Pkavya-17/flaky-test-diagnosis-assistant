/**
 * sync.test.js
 * The browser app inlines its own copy of RunAnalyzer + HeuristicEngine
 * (single-file HTML can't import modules). This test extracts that inlined
 * code from the HTML and checks it behaves identically to src/heuristics.js
 * on every bundled example scenario, so the two copies can't silently drift.
 * Run with: node tests/sync.test.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const { extractEvidence, parseRuns, computeEvidenceScore } = require('../src/heuristics');

const html = fs.readFileSync(path.join(__dirname, '..', 'flaky-test-diagnoser.html'), 'utf8');
const start = html.indexOf('const RunAnalyzer');
const end = html.lastIndexOf('/* ====', html.indexOf('MODULE: DiagnosisEngine'));
assert.ok(start > -1 && end > start, 'could not locate inlined modules in HTML');
const { RunAnalyzer, HeuristicEngine } = vm.runInNewContext(
  html.slice(start, end) + '; ({ RunAnalyzer, HeuristicEngine })'
);

const plain = (x) => JSON.parse(JSON.stringify(x)); // normalize cross-realm (vm) objects
const scenarios = require('../examples/scenarios.json');
let n = 0;
for (const key of Object.keys(scenarios)) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'examples', `${key}.test-code.js`), 'utf8');
  const runs = fs.readFileSync(path.join(__dirname, '..', 'examples', `${key}.runs.txt`), 'utf8');

  assert.deepStrictEqual(plain(HeuristicEngine.extract(code)), extractEvidence(code), `${key}: evidence differs`);

  const a = RunAnalyzer.parse(runs), b = parseRuns(runs);
  for (const f of ['runs', 'total', 'passed', 'failed', 'failureRate', 'isIntermittent']) {
    assert.deepStrictEqual(plain(a[f]), b[f], `${key}: run stat "${f}" differs`);
  }
  assert.strictEqual(HeuristicEngine.computeScore(extractEvidence(code), a),
                     computeEvidenceScore(extractEvidence(code), b), `${key}: evidence score differs`);
  console.log(`✔ ${key}: browser copy matches src/heuristics.js`);
  n++;
}
console.log(`\n${n} scenario(s) in sync.`);
