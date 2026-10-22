#!/usr/bin/env node
/**
 * Build a findings.json skeleton from Allure results and/or Playwright JSON report.
 * The agent then classifies, adds sourceHints, and runs build-review-report.mjs.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CliError, ensureDir, parseCli, runMain, usageError, writeJson, displayPath } from './lib/args.mjs';
import { fingerprintFinding } from './lib/decisions.mjs';

const HELP = `Build findings.json skeleton from a functional test run.

Usage:
  node scripts/findings-from-run.mjs --out <dir> --slug <slug> --feature <name> [options]

Options:
  --allure-results <dir>   qa/functional/reports/allure-results/<slug>
  --playwright-json <file> Playwright JSON reporter output
  --allure-report <dir>    path to generated allure-report (stored on findings)
  --allure-url <url>       local allure open URL
  --locale en|zh           default en
  --classification <c>     default application_defect for failed tests
  --dry-run                print without writing
  -h, --help
`;

function readJsonSafe(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectAllureFailures(resultsDir) {
  if (!resultsDir || !existsSync(resultsDir)) return [];
  const files = readdirSync(resultsDir).filter((f) => f.endsWith('-result.json'));
  const failed = [];
  for (const file of files) {
    const doc = readJsonSafe(path.join(resultsDir, file));
    if (!doc) continue;
    const status = doc.status;
    if (status !== 'failed' && status !== 'broken') continue;
    const name = doc.name || doc.fullName || file;
    const msg =
      doc.statusDetails?.message ||
      doc.statusDetails?.trace?.split('\n')[0] ||
      `${status}`;
    const attachments = [];
    for (const a of doc.attachments || []) {
      if (a.source && /\.(png|jpe?g|webp)$/i.test(a.source)) {
        attachments.push(path.join(resultsDir, a.source));
      }
    }
    // Also scan steps
    const walk = (steps = []) => {
      for (const s of steps) {
        for (const a of s.attachments || []) {
          if (a.source && /\.(png|jpe?g|webp)$/i.test(a.source)) {
            attachments.push(path.join(resultsDir, a.source));
          }
        }
        walk(s.steps || []);
      }
    };
    walk(doc.steps || []);

    const labels = Object.fromEntries((doc.labels || []).map((l) => [l.name, l.value]));
    failed.push({
      name,
      fullName: doc.fullName || name,
      status,
      message: msg,
      trace: doc.statusDetails?.trace || null,
      screenshots: [...new Set(attachments)],
      spec: labels.suite || labels.package || null,
      step: labels.story || null,
    });
  }
  return failed;
}

function collectPlaywrightFailures(jsonFile) {
  if (!jsonFile || !existsSync(jsonFile)) return [];
  const doc = readJsonSafe(jsonFile);
  if (!doc) return [];
  const failed = [];
  const walkSuites = (suites = [], chain = []) => {
    for (const s of suites) {
      const next = [...chain, s.title].filter(Boolean);
      for (const spec of s.specs || []) {
        for (const t of spec.tests || []) {
          const result = (t.results || []).at(-1);
          if (!result) continue;
          if (result.status !== 'failed' && result.status !== 'timedOut') continue;
          const shots = [];
          for (const a of result.attachments || []) {
            if (a.path && /\.(png|jpe?g|webp)$/i.test(a.path)) shots.push(a.path);
          }
          failed.push({
            name: spec.title || t.title || 'failed test',
            fullName: [...next, spec.title].filter(Boolean).join(' › '),
            status: result.status,
            message: result.error?.message || result.status,
            trace: result.error?.stack || null,
            screenshots: shots,
            spec: null,
            step: null,
          });
        }
      }
      walkSuites(s.suites || [], next);
    }
  };
  walkSuites(doc.suites || []);
  return failed;
}

function padId(n) {
  return `FQ-${String(n).padStart(3, '0')}`;
}

function copyEvidence(shots, evidenceDir, prefix) {
  ensureDir(evidenceDir);
  const out = [];
  shots.forEach((src, i) => {
    if (!existsSync(src)) return;
    const ext = path.extname(src) || '.png';
    const destName = `${prefix}-${i + 1}${ext}`;
    const dest = path.join(evidenceDir, destName);
    try {
      copyFileSync(src, dest);
      out.push(`evidence/${destName}`);
    } catch {
      // ignore copy failures
    }
  });
  return out;
}

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['dry-run', 'help', 'h']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.out || !o.slug || !o.feature) {
    throw usageError('--out, --slug, and --feature are required');
  }

  const outDir = path.resolve(o.out);
  const locale = o.locale === 'zh' ? 'zh' : 'en';
  const classification = o.classification || 'application_defect';
  const allureFails = collectAllureFailures(o['allure-results'] && path.resolve(o['allure-results']));
  const pwFails = collectPlaywrightFailures(o['playwright-json'] && path.resolve(o['playwright-json']));

  // Prefer allure; fall back to playwright json; merge by name if both
  let raw = allureFails.length ? allureFails : pwFails;
  if (allureFails.length && pwFails.length) {
    const names = new Set(allureFails.map((f) => f.name));
    for (const p of pwFails) {
      if (!names.has(p.name)) raw.push(p);
    }
  }

  const evidenceDir = path.join(outDir, 'evidence');
  const findings = [];
  let n = 0;
  for (const item of raw) {
    n += 1;
    const id = padId(n);
    const shots = copyEvidence(item.screenshots || [], evidenceDir, `fail-${n}`);
    const finding = {
      ref: `fail-${n}`,
      title:
        locale === 'zh'
          ? `用例失败：${item.name}`
          : `Test failed: ${item.name}`,
      severity: 'BLOCKER',
      classification,
      resolution: classification === 'application_defect' ? 'FIX_CODE' : 'FIX_TEST',
      spec: item.spec,
      step: item.step || item.name,
      route: null,
      expected: locale === 'zh' ? '用例断言的可见结果成立' : 'The asserted visible outcome holds',
      actual: String(item.message || item.status).slice(0, 2000),
      reproduction: [
        locale === 'zh' ? `运行用例：${item.fullName || item.name}` : `Run: ${item.fullName || item.name}`,
        locale === 'zh' ? '观察失败断言与截图' : 'Observe the failed assertion and screenshots',
      ],
      evidence: {
        screenshots: shots,
        trace: null,
        allureUrl: o['allure-url'] || null,
        errorMessage: item.message || null,
      },
      sourceHints: [],
      fix: {
        summary:
          locale === 'zh'
            ? '修复应用使可见结果符合预期（或在复核中改为测试问题）'
            : 'Fix the application so the visible outcome matches (or reclassify as a test defect in review)',
      },
      fingerprint: null,
      triage: classification === 'application_defect' ? 'fix-now' : null,
      dismiss: null,
    };
    finding.fingerprint = fingerprintFinding(finding);
    finding.id = id;
    findings.push(finding);
  }

  const doc = {
    kind: 'functional-qa-findings',
    version: 1,
    slug: o.slug,
    feature: o.feature,
    locale,
    generatedAt: new Date().toISOString(),
    allureReport: o['allure-report'] || null,
    allureUrl: o['allure-url'] || null,
    runId: o['run-id'] || null,
    findings,
  };

  if (o['dry-run']) {
    console.log(JSON.stringify(doc, null, 2));
    return 0;
  }

  ensureDir(outDir);
  const outFile = path.join(outDir, 'findings.json');
  writeJson(outFile, doc);
  console.log(`Wrote ${findings.length} finding(s) → ${displayPath(outFile)}`);
  if (!findings.length) {
    console.log('No failed/broken tests found. Review report is not required.');
  } else {
    console.log(`Next: review/edit findings (classification, sourceHints), then:`);
    console.log(
      `  node scripts/build-review-report.mjs --dir ${displayPath(outDir)} --locale ${locale}`,
    );
  }
  return 0;
});
