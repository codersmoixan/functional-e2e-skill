#!/usr/bin/env node
/**
 * Apply reviewer decisions to report.json; update dismissed.json and functional-debt.md.
 * Prints the fix-now list and Next: fix-loop instructions for the agent.
 */
import { existsSync, readFileSync, renameSync } from 'node:fs';
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
import {
  DecisionsError,
  applyDecisionsToReport,
  parseDecisions,
  summaryLine,
} from './lib/decisions.mjs';
import {
  appendDebtMarkdown,
  defaultLogPaths,
  loadDismissedLog,
  upsertDismissals,
  writeDismissedMarkdown,
} from './lib/dismissals.mjs';

const HELP = `Apply functional QA review decisions to report.json.

Usage:
  node scripts/apply-decisions.mjs --report <dir>/report.json [--from <file> | --from -]

Options:
  --from <file>     decisions.json or a pasted "Apply my functional QA review" message
  --from -          read stdin
  (omitted)         <dir>/decisions.json
  --allow-stale     apply even if reportGeneratedAt differs
  --by <name>       decidedBy override
  --dry-run         print without writing
  --quiet
  -h, --help
`;

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['help', 'h', 'allow-stale', 'dry-run', 'quiet']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.report) throw usageError('--report is required');
  const reportFile = path.resolve(o.report);
  if (!existsSync(reportFile)) throw new CliError(`missing ${reportFile}`, 1);
  const dir = path.dirname(reportFile);
  const report = readJsonFile(reportFile);

  let raw;
  if (o.from === '-') {
    raw = readFileSync(0, 'utf8');
  } else if (o.from) {
    raw = readFileSync(path.resolve(o.from), 'utf8');
  } else {
    const pending = path.join(dir, 'decisions.json');
    if (!existsSync(pending)) {
      console.log('No pending decisions');
      return 0;
    }
    raw = readFileSync(pending, 'utf8');
  }

  let doc;
  try {
    doc = parseDecisions(raw);
  } catch (err) {
    if (err instanceof DecisionsError) throw new CliError(err.message, 2);
    throw err;
  }

  if (o.by) doc.decidedBy = o.by;

  let next;
  try {
    next = applyDecisionsToReport(report, doc, { allowStale: Boolean(o['allow-stale']) });
  } catch (err) {
    if (err instanceof DecisionsError) {
      const code = err.code === 'stale' || err.code === 'slug' || err.code === 'unknown-id' ? 2 : 1;
      throw new CliError(err.message, code);
    }
    throw err;
  }

  const logs = defaultLogPaths(dir);
  let dismissedLog = loadDismissedLog(logs.dismissedJson);
  dismissedLog = upsertDismissals(dismissedLog, next.findings, {
    feature: next.meta.feature,
    by: doc.decidedBy,
    date: doc.decidedAt,
  });

  if (!o['dry-run']) {
    writeJson(reportFile, next);
    writeJson(logs.dismissedJson, dismissedLog);
    writeDismissedMarkdown(logs.dismissedMd, dismissedLog);
    appendDebtMarkdown(logs.debtMd, next.findings, {
      feature: next.meta.feature,
      decidedAt: doc.decidedAt,
    });

    const pending = path.join(dir, 'decisions.json');
    const applied = path.join(dir, 'decisions.applied.json');
    writeJson(applied, doc);
    if (existsSync(pending) && path.resolve(o.from || pending) === pending) {
      try {
        renameSync(pending, path.join(dir, `decisions.${Date.now()}.processed.json`));
      } catch {
        /* ignore */
      }
    }
  }

  if (!o.quiet) console.log(summaryLine(doc, next));

  const fixNow = (doc.triage?.fixNow || []).filter((id) => {
    const f = next.findings.find((x) => x.id === id);
    return f && f.triage === 'fix-now' && f.severity !== 'PASS' && f.resolution === 'FIX_CODE';
  });
  // Also include blockers forced to fix-now
  for (const f of next.findings) {
    if (f.triage === 'fix-now' && f.resolution === 'FIX_CODE' && f.severity !== 'PASS' && !fixNow.includes(f.id)) {
      fixNow.push(f.id);
    }
  }

  console.log('Fix-now (in order):');
  if (!fixNow.length) console.log('  (none)');
  for (const id of fixNow) {
    const f = next.findings.find((x) => x.id === id);
    const hints = (f.sourceHints || []).map((h) => h.path).join(', ') || '—';
    console.log(`  ${id}  ${f.title}`);
    console.log(`         spec: ${f.spec || '—'} · hints: ${hints}`);
    if (f.fix?.summary) console.log(`         fix: ${f.fix.summary}`);
  }

  const debt = next.findings.filter((f) => f.triage === 'debt' || f.resolution === 'DEBT');
  if (debt.length) {
    console.log(`Debt: ${debt.map((f) => f.id).join(', ')} → ${displayPath(logs.debtMd)}`);
  }

  if (doc.annotations?.length) {
    console.log(
      `Annotations filed as findings. Rebuild report: ${scriptCommand('build-review-report.mjs', '--dir', dir)}`,
    );
  }

  console.log('Next: enter the fix-loop for the fix-now set (references/fix-loop.md).');
  console.log('After code changes, re-run the affected Playwright specs, mark verified findings PASS in findings.json, then rebuild the review report.');
  return 0;
});
