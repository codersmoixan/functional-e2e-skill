#!/usr/bin/env node
/**
 * Dismiss findings from chat without the HTML review UI.
 *
 * Example lines:
 *   FQ-001 not-an-issue — duplicate of known issue
 *   FQ-002 intentional — accepted empty state copy
 *   by: alice
 */
import { existsSync, readFileSync } from 'node:fs';
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
import { DISMISS_KINDS, computeScorecard, fingerprintFinding } from './lib/decisions.mjs';
import {
  defaultLogPaths,
  loadDismissedLog,
  upsertDismissals,
  writeDismissedMarkdown,
} from './lib/dismissals.mjs';

const HELP = `Dismiss functional QA findings from chat.

Usage:
  node scripts/dismiss.mjs --report <dir>/report.json --from <file>
  node scripts/dismiss.mjs --report <dir>/report.json --id FQ-001 --kind not-an-issue --reason '...' [--by name]
  node scripts/dismiss.mjs --report <dir>/report.json --undo FQ-001

--from file format (one finding per line):
  FQ-001 not-an-issue — reason text
  by: name
`;

function parseFromText(text) {
  const dismissals = [];
  let by = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const byM = t.match(/^by:\s*(.+)$/i);
    if (byM) {
      by = byM[1].trim();
      continue;
    }
    const m = t.match(/^(FQ-\d{3,})\s+(not-an-issue|remove|intentional)\s+[—\-–]\s+(.+)$/i);
    if (!m) throw new CliError(`cannot parse dismiss line: ${t}`, 2);
    dismissals.push({ findingId: m[1], kind: m[2].toLowerCase(), reason: m[3].trim() });
  }
  return { dismissals, by };
}

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['help', 'h']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.report) throw usageError('--report is required');
  const reportFile = path.resolve(o.report);
  const report = readJsonFile(reportFile);
  const dir = path.dirname(reportFile);
  const logs = defaultLogPaths(dir);
  const now = new Date().toISOString();

  if (o.undo) {
    const f = report.findings.find((x) => x.id === o.undo);
    if (!f) throw new CliError(`unknown id ${o.undo}`, 2);
    f.resolution = 'FIX_CODE';
    f.triage = f.severity === 'BLOCKER' ? 'fix-now' : 'debt';
    f.dismiss = null;
    report.scorecard = computeScorecard(report.findings);
    writeJson(reportFile, report);
    console.log(`Undid dismissal of ${o.undo}`);
    console.log(`Next: ${scriptCommand('build-review-report.mjs', '--dir', dir)}`);
    return 0;
  }

  let dismissals = [];
  let by = o.by || null;
  if (o.from) {
    const parsed = parseFromText(readFileSync(path.resolve(o.from), 'utf8'));
    dismissals = parsed.dismissals;
    by = by || parsed.by;
  } else if (o.id && o.kind && o.reason) {
    if (!DISMISS_KINDS.has(o.kind)) throw new CliError(`invalid kind ${o.kind}`, 2);
    dismissals = [{ findingId: o.id, kind: o.kind, reason: o.reason }];
  } else {
    throw usageError('provide --from, or --id --kind --reason');
  }

  for (const d of dismissals) {
    const f = report.findings.find((x) => x.id === d.findingId);
    if (!f) throw new CliError(`unknown id ${d.findingId}`, 2);
    if (f.severity === 'PASS') throw new CliError(`cannot dismiss ${d.findingId}: PASS`, 2);
    f.resolution = d.kind === 'intentional' ? 'INTENTIONAL' : 'DISMISSED';
    f.triage = null;
    f.dismiss = { kind: d.kind, reason: d.reason, by, date: now };
    f.fingerprint = f.fingerprint || fingerprintFinding(f);
  }

  report.scorecard = computeScorecard(report.findings);
  writeJson(reportFile, report);

  let log = loadDismissedLog(logs.dismissedJson);
  log = upsertDismissals(log, report.findings, { feature: report.meta.feature, by, date: now });
  writeJson(logs.dismissedJson, log);
  writeDismissedMarkdown(logs.dismissedMd, log);

  console.log(`Dismissed ${dismissals.map((d) => d.findingId).join(', ')}`);
  console.log(`Log: ${displayPath(logs.dismissedJson)}`);
  console.log(`Next: ${scriptCommand('build-review-report.mjs', '--dir', dir)}`);
  return 0;
});
