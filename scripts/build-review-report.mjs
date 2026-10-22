#!/usr/bin/env node
/**
 * findings.json (+ evidence) → report.json + report.html
 * Re-applies qa/functional/dismissed.json fingerprints when present.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CliError,
  SKILL_ROOT,
  displayPath,
  parseCli,
  readJsonFile,
  runMain,
  usageError,
  writeJson,
  writeText,
} from './lib/args.mjs';
import { computeScorecard, defaultTriage, fingerprintFinding } from './lib/decisions.mjs';
import { defaultLogPaths, loadDismissedLog, reapplyDismissals } from './lib/dismissals.mjs';

const HELP = `Build the interactive functional QA review report.

Usage:
  node scripts/build-review-report.mjs --dir <review-dir> [--findings <file>] [--locale en|zh]

Options:
  --dir <dir>           qa/functional/reports/review/<slug>
  --findings <file>     default: <dir>/findings.json
  --locale en|zh        overrides findings.locale
  --dismissed <file>    dismissed.json (default: qa/functional/dismissed.json)
  --no-reapply          do not re-apply prior dismissals
  -h, --help
`;

const UI = {
  en: {
    title: 'Functional QA review',
    score: 'open {open} · fix-now {fixNow} · debt {debt} · settled {settled}',
    expected: 'Expected',
    actual: 'Actual',
    fix: 'Fix',
    allure: 'Open Allure',
    triage: 'Triage',
    fixNow: 'Fix now',
    debt: 'Debt',
    dismiss: 'Dismiss',
    notIssue: 'Not an issue',
    remove: 'Out of scope',
    intentional: 'Intentional',
    dismissReason: 'Dismiss reason (required if dismissing)',
    annTitle: 'Add a missed issue',
    annHelp: 'Describe a product bug the run missed. It becomes a finding after Send.',
    annAdd: 'Add annotation',
    send: 'Review and send',
    sentBtn: 'Sent',
    barSummary: 'Fix now {fixNow} · Later {later}',
    notSent: 'Not sent yet',
    sentStatus: 'Sent to your agent',
    needNote: 'Annotation note required',
    needDismissReason: 'Dismiss reason required for ',
  },
  zh: {
    title: '功能测试复核',
    score: '未关闭 {open} · 现在修 {fixNow} · 债务 {debt} · 已结 {settled}',
    expected: '期望',
    actual: '实际',
    fix: '修复建议',
    allure: '打开 Allure',
    triage: '分流',
    fixNow: '现在修',
    debt: '记债务',
    dismiss: '忽略',
    notIssue: '不是问题',
    remove: '不在范围',
    intentional: '有意为之',
    dismissReason: '忽略原因（忽略时必填）',
    annTitle: '补充漏测问题',
    annHelp: '描述本次运行漏掉的产品问题。发送后会变成一条 finding。',
    annAdd: '添加标注',
    send: '复核并发送',
    sentBtn: '已发送',
    // Bottom bar: English count chrome + Chinese primary CTA (see references/review.md)
    barSummary: 'Fix now {fixNow} · Later {later}',
    notSent: 'Not sent yet',
    sentStatus: 'Sent to your agent',
    needNote: '请填写标注说明',
    needDismissReason: '忽略时必须填写原因：',
  },
};

function assignIds(findings) {
  let n = 0;
  for (const f of findings) {
    n += 1;
    if (!f.id || !/^FQ-\d{3,}$/.test(f.id)) {
      f.id = `FQ-${String(n).padStart(3, '0')}`;
    }
    if (!f.fingerprint) f.fingerprint = fingerprintFinding(f);
  }
}

function validateFindings(doc) {
  if (!doc || doc.kind !== 'functional-qa-findings') {
    throw new CliError('findings.json kind must be functional-qa-findings', 1);
  }
  if (!Array.isArray(doc.findings)) throw new CliError('findings.json missing findings[]', 1);
  for (const f of doc.findings) {
    if (!f.title || !f.severity || !f.classification || !f.resolution) {
      throw new CliError(`finding missing required fields: ${f.id || f.ref || f.title}`, 1);
    }
  }
}

await runMain(async () => {
  const o = parseCli(process.argv.slice(2), {
    flags: new Set(['help', 'h', 'no-reapply']),
  });
  if (o.help || o.h) {
    console.log(HELP);
    return 0;
  }
  if (!o.dir) throw usageError('--dir is required');
  const dir = path.resolve(o.dir);
  const findingsFile = path.resolve(o.findings || path.join(dir, 'findings.json'));
  if (!existsSync(findingsFile)) throw new CliError(`missing ${findingsFile}`, 1);

  const findingsDoc = readJsonFile(findingsFile);
  validateFindings(findingsDoc);
  assignIds(findingsDoc.findings);

  const locale = o.locale === 'zh' || findingsDoc.locale === 'zh' ? 'zh' : 'en';
  const logs = defaultLogPaths(dir);
  const dismissedFile = o.dismissed ? path.resolve(o.dismissed) : logs.dismissedJson;

  let reapplied = 0;
  if (!o['no-reapply']) {
    const log = loadDismissedLog(dismissedFile);
    reapplied = reapplyDismissals(findingsDoc.findings, log, findingsDoc.feature);
  }

  // Default triage for open FIX_CODE items
  for (const f of findingsDoc.findings) {
    if (f.severity === 'PASS') continue;
    if (f.resolution === 'DISMISSED' || f.resolution === 'INTENTIONAL') {
      f.triage = null;
      continue;
    }
    if (!f.triage) {
      f.triage = f.severity === 'BLOCKER' || f.resolution === 'FIX_CODE' ? 'fix-now' : 'debt';
    }
  }

  const generatedAt = new Date().toISOString();
  const scorecard = computeScorecard(findingsDoc.findings);
  const recommended = defaultTriage(findingsDoc.findings);

  const report = {
    kind: 'functional-qa-report',
    version: 1,
    meta: {
      slug: findingsDoc.slug,
      feature: findingsDoc.feature,
      generatedAt,
      locale,
      allureReport: findingsDoc.allureReport || null,
      allureUrl: findingsDoc.allureUrl || null,
      runId: findingsDoc.runId || null,
      findingsGeneratedAt: findingsDoc.generatedAt || null,
      dismissedReapplied: reapplied,
    },
    scorecard,
    recommendedTriage: recommended,
    findings: findingsDoc.findings,
    ui: UI[locale],
  };

  const reportJson = path.join(dir, 'report.json');
  writeJson(reportJson, report);

  const templatePath = path.join(SKILL_ROOT, 'templates', 'review-report.html');
  let html = readFileSync(templatePath, 'utf8');
  // Embed report JSON safely inside the script tag
  const payload = JSON.stringify(report).replace(/</g, '\\u003c');
  html = html.replace('__REPORT_JSON__', payload);
  html = html.replace('<html lang="en">', `<html lang="${locale}">`);
  const reportHtml = path.join(dir, 'report.html');
  writeText(reportHtml, html);

  // Persist renumbered findings
  findingsDoc.findings = report.findings;
  findingsDoc.locale = locale;
  writeJson(findingsFile, findingsDoc);

  console.log(`Report: ${scorecard.verdict} · ${displayPath(reportHtml)}`);
  console.log(
    `Scorecard: open ${scorecard.open}, fix-now ${scorecard.fixNow}, debt ${scorecard.debt}, settled ${scorecard.settled}` +
      (reapplied ? ` (re-applied ${reapplied} dismissal(s))` : ''),
  );
  if (scorecard.open === 0 && scorecard.fixNow === 0) {
    console.log('No open findings to review.');
    return 0;
  }
  console.log(`Next: node ${displayPath(path.join(SKILL_ROOT, 'scripts/review.mjs'))} --report ${displayPath(reportJson)}`);
  return 0;
});
