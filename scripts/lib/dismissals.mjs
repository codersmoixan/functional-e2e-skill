import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fingerprintFinding } from './decisions.mjs';
import { writeJson, writeText } from './args.mjs';

export function loadDismissedLog(file) {
  if (!existsSync(file)) return { kind: 'functional-qa-dismissed', version: 1, entries: [] };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(data.entries)) data.entries = [];
    return data;
  } catch {
    return { kind: 'functional-qa-dismissed', version: 1, entries: [] };
  }
}

export function upsertDismissals(log, findings, { feature, by, date } = {}) {
  const next = structuredClone(log);
  if (!next.entries) next.entries = [];
  for (const f of findings) {
    if (f.resolution !== 'DISMISSED' && f.resolution !== 'INTENTIONAL') continue;
    const fp = f.fingerprint || fingerprintFinding(f);
    const existing = next.entries.find((e) => e.fingerprint === fp && e.feature === feature);
    const entry = {
      fingerprint: fp,
      feature: feature || null,
      title: f.title,
      kind: f.dismiss?.kind || (f.resolution === 'INTENTIONAL' ? 'intentional' : 'not-an-issue'),
      reason: f.dismiss?.reason || '',
      by: f.dismiss?.by || by || null,
      date: f.dismiss?.date || date || new Date().toISOString(),
      expected: f.expected,
      actual: f.actual,
      spec: f.spec || null,
    };
    if (existing) Object.assign(existing, entry);
    else next.entries.push(entry);
  }
  return next;
}

export function reapplyDismissals(findings, log, feature) {
  const entries = (log.entries || []).filter((e) => !feature || e.feature === feature);
  let applied = 0;
  for (const f of findings) {
    if (f.severity === 'PASS') continue;
    const fp = f.fingerprint || fingerprintFinding(f);
    const hit = entries.find(
      (e) =>
        e.fingerprint === fp ||
        (e.spec === f.spec && e.expected === f.expected && e.actual === f.actual),
    );
    if (!hit) continue;
    if (hit.expected !== f.expected || hit.actual !== f.actual) continue;
    f.resolution = hit.kind === 'intentional' ? 'INTENTIONAL' : 'DISMISSED';
    f.triage = null;
    f.dismiss = {
      kind: hit.kind,
      reason: hit.reason,
      by: hit.by,
      date: hit.date,
    };
    f.fingerprint = fp;
    applied += 1;
  }
  return applied;
}

export function writeDismissedMarkdown(mdPath, log) {
  const lines = ['# Functional QA dismissals', ''];
  for (const e of log.entries || []) {
    lines.push(`## ${e.feature || 'unknown'} · ${e.fingerprint}`);
    lines.push(`- **kind:** ${e.kind}`);
    lines.push(`- **title:** ${e.title}`);
    lines.push(`- **reason:** ${e.reason}`);
    lines.push(`- **by:** ${e.by || '—'}`);
    lines.push(`- **date:** ${e.date || '—'}`);
    lines.push('');
  }
  writeText(mdPath, `${lines.join('\n')}\n`);
}

export function appendDebtMarkdown(mdPath, findings, { feature, decidedAt } = {}) {
  const debt = findings.filter((f) => f.triage === 'debt' || f.resolution === 'DEBT');
  if (!debt.length) return;
  let prev = '';
  if (existsSync(mdPath)) prev = readFileSync(mdPath, 'utf8');
  const lines = prev.trim() ? [prev.trim(), ''] : ['# Functional QA debt', ''];
  lines.push(`## ${feature || 'run'} · ${decidedAt || new Date().toISOString()}`);
  for (const f of debt) {
    lines.push(`- **${f.id}** ${f.title}`);
    lines.push(`  - expected: ${f.expected}`);
    lines.push(`  - actual: ${f.actual}`);
    if (f.spec) lines.push(`  - spec: ${f.spec}`);
  }
  lines.push('');
  writeText(mdPath, `${lines.join('\n')}\n`);
}

export function defaultLogPaths(reviewDir) {
  // reviewDir = qa/functional/reports/review/<slug>
  const functionalRoot = path.resolve(reviewDir, '../../..');
  return {
    dismissedJson: path.join(functionalRoot, 'dismissed.json'),
    dismissedMd: path.join(functionalRoot, 'dismissed.md'),
    debtMd: path.join(functionalRoot, 'functional-debt.md'),
  };
}

export { writeJson };
