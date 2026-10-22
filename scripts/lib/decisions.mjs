import { createHash } from 'node:crypto';
import { oneLine } from './args.mjs';

export const DECISIONS_KIND = 'functional-qa-decisions';
export const DECISIONS_VERSION = 1;
export const DECISIONS_FENCE = 'functional-qa-decisions';
export const FINDING_ID_RE = /^FQ-\d{3,}$/;
export const DISMISS_KINDS = new Set(['not-an-issue', 'remove', 'intentional']);

export class DecisionsError extends Error {
  constructor(message, code = 'invalid') {
    super(oneLine(message));
    this.name = 'DecisionsError';
    this.code = code;
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const show = (v) => JSON.stringify(v === undefined ? null : v);
const isDateTime = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));

function idList(value, where) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new DecisionsError(`${where} must be an array of finding ids`);
  const seen = new Set();
  for (const [i, id] of value.entries()) {
    if (typeof id !== 'string' || !FINDING_ID_RE.test(id)) {
      throw new DecisionsError(`${where}[${i}] is ${show(id)}, not a finding id (expected e.g. "FQ-001")`);
    }
    if (seen.has(id)) throw new DecisionsError(`${where} lists ${id} twice`);
    seen.add(id);
  }
  return [...value];
}

export function normalizeDecisions(data) {
  if (!isObj(data)) throw new DecisionsError('the decisions document must be a JSON object');
  if (data.kind !== DECISIONS_KIND) {
    throw new DecisionsError(`"kind" must be "${DECISIONS_KIND}" (got ${show(data.kind ?? null)})`);
  }
  if (data.version !== DECISIONS_VERSION) {
    throw new DecisionsError(`"version" must be ${DECISIONS_VERSION} (got ${show(data.version ?? null)})`);
  }
  if (typeof data.slug !== 'string' || !data.slug.trim()) {
    throw new DecisionsError('"slug" is required: the report folder name');
  }
  if (!isDateTime(data.reportGeneratedAt)) {
    throw new DecisionsError(`"reportGeneratedAt" must be an ISO date-time (got ${show(data.reportGeneratedAt ?? null)})`);
  }
  if (!isDateTime(data.decidedAt)) {
    throw new DecisionsError(`"decidedAt" must be an ISO date-time (got ${show(data.decidedAt ?? null)})`);
  }

  let triage = null;
  if (data.triage !== undefined && data.triage !== null) {
    if (!isObj(data.triage)) throw new DecisionsError('"triage" must be an object');
    const fixNow = idList(data.triage.fixNow, 'triage.fixNow');
    const debt = idList(data.triage.debt, 'triage.debt');
    const both = fixNow.filter((id) => debt.includes(id));
    if (both.length) throw new DecisionsError(`ids in both fixNow and debt: ${both.join(', ')}`);
    triage = { fixNow, debt };
  }

  const dismissals = [];
  if (data.dismissals !== undefined) {
    if (!Array.isArray(data.dismissals)) throw new DecisionsError('"dismissals" must be an array');
    for (const [i, d] of data.dismissals.entries()) {
      if (!isObj(d)) throw new DecisionsError(`dismissals[${i}] must be an object`);
      if (!FINDING_ID_RE.test(d.findingId)) throw new DecisionsError(`dismissals[${i}].findingId invalid`);
      if (!DISMISS_KINDS.has(d.kind)) throw new DecisionsError(`dismissals[${i}].kind invalid`);
      if (typeof d.reason !== 'string' || !d.reason.trim()) {
        throw new DecisionsError(`dismissals[${i}].reason is required`);
      }
      dismissals.push({
        findingId: d.findingId,
        kind: d.kind,
        reason: d.reason.trim(),
        by: d.by?.trim?.() || null,
        date: d.date || null,
      });
    }
  }

  const annotations = [];
  if (data.annotations !== undefined) {
    if (!Array.isArray(data.annotations)) throw new DecisionsError('"annotations" must be an array');
    for (const [i, a] of data.annotations.entries()) {
      if (!isObj(a)) throw new DecisionsError(`annotations[${i}] must be an object`);
      if (typeof a.note !== 'string' || !a.note.trim()) throw new DecisionsError(`annotations[${i}].note required`);
      if (!['BLOCKER', 'WARNING'].includes(a.severity)) throw new DecisionsError(`annotations[${i}].severity invalid`);
      if (!['fix-now', 'debt'].includes(a.decision)) throw new DecisionsError(`annotations[${i}].decision invalid`);
      annotations.push({
        note: a.note.trim(),
        severity: a.severity,
        decision: a.decision,
        spec: a.spec || null,
        by: a.by?.trim?.() || null,
        date: a.date || null,
      });
    }
  }

  const out = {
    kind: DECISIONS_KIND,
    version: DECISIONS_VERSION,
    slug: data.slug.trim(),
    feature: data.feature ?? null,
    reportGeneratedAt: data.reportGeneratedAt,
    decidedBy: data.decidedBy?.trim?.() || null,
    decidedAt: data.decidedAt,
    tickets: Boolean(data.tickets),
    dismissals,
  };
  if (triage) out.triage = triage;
  if (annotations.length) out.annotations = annotations;
  return out;
}

export function parseDecisions(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new DecisionsError('empty decisions input');

  const fence = new RegExp('```(?:' + DECISIONS_FENCE + ')?\\s*([\\s\\S]*?)```', 'i');
  const m = raw.match(fence);
  let jsonText = m ? m[1].trim() : raw;
  if (jsonText.startsWith('Apply my functional QA review')) {
    const idx = jsonText.indexOf('{');
    if (idx === -1) throw new DecisionsError('no JSON object in Apply message');
    jsonText = jsonText.slice(idx);
  }
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    throw new DecisionsError(`invalid JSON: ${err.message}`);
  }
  return normalizeDecisions(data);
}

export function fingerprintFinding(f) {
  const basis = [f.spec || '', f.step || '', f.expected || '', f.actual || '', f.title || ''].join('\n');
  return createHash('sha256').update(basis).digest('hex').slice(0, 16);
}

export function decisionsMessage(doc, report) {
  const lines = [
    'Apply my functional QA review',
    '',
    `Slug: ${doc.slug}`,
    `Feature: ${doc.feature || report?.meta?.feature || ''}`,
    `Decided at: ${doc.decidedAt}`,
    '',
    '```' + DECISIONS_FENCE,
    JSON.stringify(doc, null, 2),
    '```',
  ];
  return lines.join('\n');
}

export function summaryLine(doc, report) {
  const fix = doc.triage?.fixNow?.length ?? 0;
  const debt = doc.triage?.debt?.length ?? 0;
  const dismissed = doc.dismissals?.length ?? 0;
  const anns = doc.annotations?.length ?? 0;
  return `Decisions: fix-now ${fix}, debt ${debt}, dismissed ${dismissed}, annotations ${anns} (slug ${doc.slug})`;
}

export function applyDecisionsToReport(report, doc, { allowStale = false } = {}) {
  if (doc.slug !== report.meta.slug) {
    throw new DecisionsError(`slug mismatch: decisions "${doc.slug}" vs report "${report.meta.slug}"`, 'slug');
  }
  if (!allowStale && doc.reportGeneratedAt !== report.meta.generatedAt) {
    throw new DecisionsError(
      `decisions were made on the report generated ${doc.reportGeneratedAt}, current is ${report.meta.generatedAt}`,
      'stale',
    );
  }

  const byId = new Map(report.findings.map((f) => [f.id, f]));
  const unknown = [];
  for (const id of [...(doc.triage?.fixNow || []), ...(doc.triage?.debt || [])]) {
    if (!byId.has(id)) unknown.push(id);
  }
  for (const d of doc.dismissals) {
    if (!byId.has(d.findingId)) unknown.push(d.findingId);
  }
  if (unknown.length) {
    throw new DecisionsError(`unknown finding id(s): ${[...new Set(unknown)].join(', ')}`, 'unknown-id');
  }

  const next = structuredClone(report);
  const dismissedIds = new Set();

  for (const d of doc.dismissals) {
    const f = next.findings.find((x) => x.id === d.findingId);
    if (f.severity === 'PASS') {
      throw new DecisionsError(`cannot dismiss ${d.findingId}: already PASS`, 'apply');
    }
    f.resolution = d.kind === 'intentional' ? 'INTENTIONAL' : 'DISMISSED';
    f.triage = null;
    f.dismiss = {
      kind: d.kind,
      reason: d.reason,
      by: d.by || doc.decidedBy,
      date: d.date || doc.decidedAt,
    };
    dismissedIds.add(d.findingId);
  }

  if (doc.triage) {
    for (const id of doc.triage.fixNow) {
      if (dismissedIds.has(id)) continue;
      const f = next.findings.find((x) => x.id === id);
      if (f.severity === 'PASS') continue;
      f.triage = 'fix-now';
      if (f.resolution !== 'FIX_CODE' && f.resolution !== 'FIX_TEST') f.resolution = 'FIX_CODE';
    }
    for (const id of doc.triage.debt) {
      if (dismissedIds.has(id)) continue;
      const f = next.findings.find((x) => x.id === id);
      if (f.severity === 'BLOCKER') {
        f.triage = 'fix-now';
        f.resolution = 'FIX_CODE';
        console.warn(`Warning: ${id} is BLOCKER; kept as fix-now instead of debt`);
        continue;
      }
      f.triage = 'debt';
      f.resolution = 'DEBT';
    }
  }

  if (doc.annotations?.length) {
    let n = next.findings.filter((f) => f.annotation).length;
    for (const a of doc.annotations) {
      n += 1;
      const id = `FQ-${String(next.findings.length + 1).padStart(3, '0')}`;
      const annId = `AN-${String(n).padStart(3, '0')}`;
      next.findings.push({
        id,
        ref: annId,
        title: a.note.split('\n')[0].slice(0, 120),
        severity: a.severity,
        classification: 'annotation',
        resolution: 'FIX_CODE',
        spec: a.spec || null,
        step: null,
        route: null,
        expected: '(from reviewer annotation)',
        actual: a.note,
        reproduction: [],
        evidence: { screenshots: [], trace: null, allureUrl: null, errorMessage: null },
        sourceHints: [],
        fix: { summary: a.note },
        fingerprint: null,
        annotation: annId,
        triage: a.decision === 'debt' && a.severity !== 'BLOCKER' ? 'debt' : 'fix-now',
        dismiss: null,
      });
    }
  }

  next.meta.decisionsAppliedAt = doc.decidedAt;
  next.meta.decidedBy = doc.decidedBy;
  next.scorecard = computeScorecard(next.findings);
  return next;
}

export function computeScorecard(findings) {
  const open = findings.filter((f) => f.severity !== 'PASS' && f.resolution !== 'DISMISSED' && f.resolution !== 'INTENTIONAL');
  const fixNow = open.filter((f) => f.triage === 'fix-now' || (f.triage == null && f.resolution === 'FIX_CODE'));
  const debt = open.filter((f) => f.triage === 'debt' || f.resolution === 'DEBT');
  const settled = findings.filter((f) =>
    f.severity === 'PASS' || f.resolution === 'DISMISSED' || f.resolution === 'INTENTIONAL',
  );
  const blockers = open.filter((f) => f.severity === 'BLOCKER');
  let verdict = 'PASS';
  if (blockers.length || fixNow.length) verdict = 'FAIL';
  else if (debt.length || open.length) verdict = 'REVIEW';
  return {
    verdict,
    total: findings.length,
    open: open.length,
    fixNow: fixNow.length,
    debt: debt.length,
    settled: settled.length,
    blockers: blockers.length,
  };
}

export function defaultTriage(findings) {
  const fixNow = [];
  const debt = [];
  for (const f of findings) {
    if (f.severity === 'PASS') continue;
    if (f.resolution === 'DISMISSED' || f.resolution === 'INTENTIONAL') continue;
    if (f.classification === 'test_defect' || f.classification === 'environment') continue;
    if (f.severity === 'BLOCKER' || f.triage === 'fix-now' || f.resolution === 'FIX_CODE') {
      fixNow.push(f.id);
    } else {
      debt.push(f.id);
    }
  }
  return { fixNow, debt };
}
