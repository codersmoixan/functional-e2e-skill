#!/usr/bin/env node
/**
 * Set fix-now / debt triage from chat.
 *
 *   node scripts/triage.mjs --report <dir>/report.json --fix FQ-001,FQ-002 --by name
 *   node scripts/triage.mjs --report <dir>/report.json --fix none
 */
import path from 'node:path';
import {
  CliError,
  displayPath,
  parseCli,
  readJsonFile,
  runMain,
  scriptCommand,
  usageError,
  writeJson,
} from './lib/args.mjs';
import { FINDING_ID_RE, computeScorecard } from './lib/decisions.mjs';
import { appendDebtMarkdown, defaultLogPaths } from './lib/dismissals.mjs';

const HELP = `Triage open functional QA findings from chat.

Usage:
  node scripts/triage.mjs --report <dir>/report.json --fix <ids|none> [--by name] [--source chat]

--fix lists ids to fix now (comma-separated). Every other open FIX_CODE finding becomes debt.
BLOCKER findings cannot be debt: they stay fix-now.
`;

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['help', 'h']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.report || o.fix === undefined) throw usageError('--report and --fix are required');
  const reportFile = path.resolve(o.report);
  const report = readJsonFile(reportFile);
  const dir = path.dirname(reportFile);
  const now = new Date().toISOString();

  let fixIds = [];
  if (String(o.fix).trim().toLowerCase() !== 'none') {
    fixIds = String(o.fix)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const id of fixIds) {
      if (!FINDING_ID_RE.test(id)) throw new CliError(`invalid id ${id}`, 2);
      if (!report.findings.some((f) => f.id === id)) throw new CliError(`unknown id ${id}`, 2);
    }
  }
  const fixSet = new Set(fixIds);

  for (const f of report.findings) {
    if (f.severity === 'PASS') continue;
    if (f.resolution === 'DISMISSED' || f.resolution === 'INTENTIONAL') continue;
    if (f.classification === 'test_defect' || f.classification === 'environment') continue;

    if (fixSet.has(f.id) || f.severity === 'BLOCKER') {
      f.triage = 'fix-now';
      f.resolution = 'FIX_CODE';
    } else {
      f.triage = 'debt';
      f.resolution = 'DEBT';
    }
  }

  report.scorecard = computeScorecard(report.findings);
  report.meta.decidedBy = o.by || report.meta.decidedBy || null;
  report.meta.decisionsAppliedAt = now;
  writeJson(reportFile, report);

  const logs = defaultLogPaths(dir);
  appendDebtMarkdown(logs.debtMd, report.findings, {
    feature: report.meta.feature,
    decidedAt: now,
  });

  const fixNow = report.findings.filter((f) => f.triage === 'fix-now' && f.resolution === 'FIX_CODE');
  const debt = report.findings.filter((f) => f.triage === 'debt');
  console.log(`Triage source: ${o.source || 'chat'}`);
  console.log(`Fix-now: ${fixNow.map((f) => f.id).join(', ') || '(none)'}`);
  console.log(`Debt: ${debt.map((f) => f.id).join(', ') || '(none)'}`);
  if (debt.length) console.log(`Debt log: ${displayPath(logs.debtMd)}`);
  console.log(`Next: enter fix-loop for fix-now (references/fix-loop.md), then rebuild:`);
  console.log(`  ${scriptCommand('build-review-report.mjs', '--dir', dir)}`);
  return 0;
});
