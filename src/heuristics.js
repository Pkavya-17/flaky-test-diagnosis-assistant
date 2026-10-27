/**
 * heuristics.js
 * Canonical evidence-extraction engine for the Flaky Test Diagnosis Assistant.
 *
 * This module is the source of truth for detector logic and is what the
 * automated tests (heuristics.test.js) exercise. The browser app
 * (flaky-test-diagnoser.html) inlines an equivalent copy of these detectors
 * because published artifacts must be a single self-contained HTML file
 * with no external script imports. Keep the two in sync when editing.
 *
 * A detector never returns a boolean. It returns zero or more structured
 * evidence objects:
 *   { signal, category, source, evidence, severity }
 */

const DETECTORS = [
  {
    signal: 'fixed_wait',
    category: 'timing',
    severity: 'medium',
    test: (code) => {
      const re = /\b(sleep|waitForTimeout|setTimeout)\s*\(\s*\d+/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'missing_await',
    category: 'timing',
    severity: 'high',
    test: (code) => {
      // Lines that call a known-async pattern but do not have `await` on the same line
      const asyncCallPattern = /\b(page\.\w+|fetch|axios\.\w+|query|\.then)\s*\(/;
      return code.split('\n')
        .filter(line => asyncCallPattern.test(line) && !/\bawait\b/.test(line))
        .map(line => line.trim())
        .filter(Boolean);
    }
  },
  {
    signal: 'hardcoded_date',
    category: 'environment',
    severity: 'medium',
    test: (code) => {
      const re = /(new Date\(['"][^)]*['"]\)|\b20\d{2}-\d{2}-\d{2}\b)/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'random_value',
    category: 'assertion',
    severity: 'medium',
    test: (code) => {
      const re = /\b(Math\.random\(\)|uuid\(\)|Date\.now\(\))/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'unsorted_collection_assertion',
    category: 'assertion',
    severity: 'low',
    test: (code) => {
      const hasArrayAssert = /(toEqual|toMatchObject)\s*\(\s*\[/.test(code);
      const hasSort = /\.sort\s*\(/.test(code);
      return (hasArrayAssert && !hasSort) ? ['array assertion without .sort() before comparison'] : [];
    }
  },
  {
    signal: 'shared_global_state',
    category: 'order',
    severity: 'high',
    test: (code) => {
      const re = /\b(global\.\w+|process\.env\.\w+\s*=|module\.exports\.\w+\s*=)/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'test_order_assumption',
    category: 'order',
    severity: 'medium',
    test: (code) => {
      const hasSharedSetup = /beforeAll\s*\(/.test(code);
      const hasReset = /beforeEach\s*\(/.test(code) || /afterEach\s*\(/.test(code);
      return (hasSharedSetup && !hasReset) ? ['beforeAll() sets up shared state with no beforeEach/afterEach reset'] : [];
    }
  },
  {
    signal: 'shared_resource',
    category: 'resource',
    severity: 'medium',
    test: (code) => {
      const re = /(fs\.writeFileSync|fs\.readFileSync|createServer\(.*\d{4}|:\d{4}\b)/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'database_dependency',
    category: 'environment',
    severity: 'medium',
    test: (code) => {
      const re = /\b(db\.\w+\(|SELECT\s+.+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET)/gi;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'external_network_call',
    category: 'environment',
    severity: 'medium',
    test: (code) => {
      const re = /\b(fetch\(|axios\.\w+\(|http\.get\(|request\()/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  },
  {
    signal: 'parallel_execution_risk',
    category: 'resource',
    severity: 'medium',
    test: (code) => {
      const re = /\b(test\.concurrent|describe\.concurrent|Promise\.all\s*\()/g;
      return [...code.matchAll(re)].map(m => m[0]);
    }
  }
];

/**
 * Runs all detectors against a test's source code.
 * @param {string} code
 * @returns {Array<{signal:string,category:string,source:string,evidence:string,severity:string}>}
 */
function extractEvidence(code) {
  const evidence = [];
  for (const d of DETECTORS) {
    const hits = d.test(code) || [];
    for (const hit of hits) {
      evidence.push({
        signal: d.signal,
        category: d.category,
        source: 'test_code',
        evidence: hit,
        severity: d.severity
      });
    }
  }
  return evidence;
}

/**
 * Parses "Run N: PASS" / "Run N: FAIL - reason" lines into structured runs.
 * @param {string} text
 * @returns {{runs: Array<{run:number,result:'PASS'|'FAIL',note:string}>, total:number, passed:number, failed:number, failureRate:number, isIntermittent:boolean}}
 */
function parseRuns(text) {
  const lineRe = /run\s*(\d+)\s*:\s*(pass|fail)\s*-?\s*(.*)/i;
  const runs = text.split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const m = line.match(lineRe);
      if (!m) return null;
      return { run: Number(m[1]), result: m[2].toUpperCase(), note: (m[3] || '').trim() };
    })
    .filter(Boolean);

  const total = runs.length;
  const passed = runs.filter(r => r.result === 'PASS').length;
  const failed = runs.filter(r => r.result === 'FAIL').length;
  const failureRate = total > 0 ? failed / total : 0;
  const isIntermittent = passed > 0 && failed > 0;

  return { runs, total, passed, failed, failureRate, isIntermittent };
}

/**
 * Computes a documented, non-probabilistic "Evidence Score".
 * Formula: sum of severity weights (high=3, medium=2, low=1) across all
 * evidence found, plus +2 if runs are intermittent (mixed pass/fail),
 * +1 if 5 or more runs were provided (more data = more trustworthy signal).
 * This is NOT a calibrated probability — it is a relative strength-of-evidence
 * indicator used only to help order/contextualize findings.
 */
function computeEvidenceScore(evidence, runStats) {
  const weights = { high: 3, medium: 2, low: 1 };
  let score = evidence.reduce((sum, e) => sum + (weights[e.severity] || 0), 0);
  if (runStats && runStats.isIntermittent) score += 2;
  if (runStats && runStats.total >= 5) score += 1;
  return score;
}

module.exports = { DETECTORS, extractEvidence, parseRuns, computeEvidenceScore };
