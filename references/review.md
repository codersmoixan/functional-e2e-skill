# Review, triage, dismissals and debt

When a Playwright run yields **application defects**, do not stop at Allure evidence alone. File findings, build the interactive review report, and wait for the person to Send. Sending is the approval to enter the fix-loop on the fix-now set.

Test defects (stale locators, config, rejected login) stay on the harness path and do **not** open this review.

## After a run with application defects

Working directory for Node scripts is the **skill folder** (the folder that contains this skill's `SKILL.md`). Artifact directories live under the repository under test.

```bash
# From the repository under test, after Allure is generated:
node <skill>/scripts/findings-from-run.mjs \
  --out qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS> \
  --slug <function>-<YYYYMMDD-HHMMSS> \
  --feature <function> \
  --allure-results qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS> \
  --allure-report qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS> \
  --allure-url '<http://127.0.0.1:... from allure open>' \
  --locale zh|en

# Agent: edit findings.json — classification, titles, reproduction, sourceHints
node <skill>/scripts/build-review-report.mjs \
  --dir qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS> \
  --locale zh|en

node <skill>/scripts/review.mjs \
  --report qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS>/report.json
```

`review.mjs` is long-running. Tell the person: choose Fix now or Debt, dismiss with a reason, optionally add a missed issue, then **Review and send** / **复核并发送**.

| Outcome | Then |
|---|---|
| Sent (exit 0) | `decisions.json` exists; run printed `Next:` (`apply-decisions`) **immediately in the same turn** |
| Closed / timeout (exit 3) | Ask whether to reopen (`--replace`) or finish |
| Will not review now | Use `report.json` `recommendedTriage`, or `triage.mjs --fix …` |

## Review report UI (design spec)

Source of truth for markup/CSS: `templates/review-report.html`. UI strings: `scripts/build-review-report.mjs` (`UI.en` / `UI.zh`). This is the **functional review** design — document and implement it here; do not defer to another skill’s template.

### Look and tokens

- Light/dark via `color-scheme` and CSS variables (oklch Neutral): `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--muted`, `--border`, `--destructive`, amber/emerald semantic badges.
- Fonts: Geist / Geist Mono stack (`--font-sans`, `--font-mono`), system fallbacks OK if fonts are not embedded.
- Radius ~`0.625rem` family; soft shadows (`--shadow-sm` / `--shadow-lg`); no cream/terracotta/purple “AI default” themes, no glow, no full-bleed colored chrome.

### Page structure

1. **Sticky header** — feature title, muted slug/time subtitle, verdict badge (`FAIL` destructive / `REVIEW` amber / `PASS` emerald) + short score line.
2. **Main** — one **card per finding**: severity / id / classification badges, title, expected vs actual, optional spec / fix summary / `sourceHints` / Allure link, evidence screenshots (click to lightbox). Open findings expose triage (Fix now | Debt) and dismiss (kind + required reason).
3. **Optional card** — “add a missed issue” (severity, triage, note) → annotations.
4. **Bottom handoff bar** (required) — see next section.

### Bottom review bar (required)

Fixed, **horizontally centred**, floating above the page (not a full-width edge-to-edge footer strip):

| Part | Spec |
|------|------|
| Container | `.bar-stack` → `.review-bar`: `position: fixed; left: 50%; bottom: ~1rem; transform: translateX(-50%)`; white/`--popover` fill; 1px `--border`; large radius (`--radius-lg`); `box-shadow: var(--shadow-lg)`; horizontal padding; flex row, vertically centred |
| Left | Bold/medium counts: `Fix now {n} · Later {m}` (English chrome even when `--locale zh`), then muted status `Not sent yet` |
| Right | One primary black/dark button (`.btn.btn-default`): en `Review and send` · zh **`复核并发送`** |
| Behaviour | Counts update live when triage / dismiss / annotations change; after successful Send, status → `Sent to your agent` (or locale equivalent); `body.has-bar` keeps page padding clear of the bar |

On narrow viewports the bar may stretch with side inset and wrap; keep the floating pill language.

### Editing rules

- Restyle only via `templates/review-report.html` (+ UI strings in `build-review-report.mjs`), then rebuild the review pack and restart `review.mjs --replace`.
- Do **not** hand-edit generated `qa/functional/reports/review/*/report.html` for styling.
- Do **not** replace the floating bar with a sticky full-bleed footer, a multi-button action strip, or a different colour system without updating this section first.

## Applying decisions

When `review.mjs` exits 0, when the person pastes a message starting **`Apply my functional QA review`** (or holding a `functional-qa-decisions` fence), or when they say they are done and `decisions.json` exists:

1. Pasted message: save verbatim to a file, then  
   `node <skill>/scripts/apply-decisions.mjs --report <dir>/report.json --from <file>`  
   Otherwise run the printed command (reads `<dir>/decisions.json`).
2. It updates `report.json`, `qa/functional/dismissed.json`, and `qa/functional/functional-debt.md`, and prints the **Fix-now** list.
3. If annotations were added, rebuild with `build-review-report.mjs`, investigate each annotation finding, then continue.
4. Enter the fix-loop on fix-now only ([fix-loop.md](fix-loop.md)).

Decisions document: `{ kind: "functional-qa-decisions", version: 1, slug, feature, reportGeneratedAt, decidedBy, decidedAt, tickets, triage: { fixNow, debt }, dismissals, annotations? }`. `reportGeneratedAt` must equal `report.meta.generatedAt` unless `--allow-stale`.

## Chat triage and dismiss

```bash
node <skill>/scripts/triage.mjs --report <dir>/report.json --fix FQ-001,FQ-002 --by '<name>'
node <skill>/scripts/triage.mjs --report <dir>/report.json --fix none

node <skill>/scripts/dismiss.mjs --report <dir>/report.json --id FQ-001 --kind not-an-issue --reason '<reason>' --by '<name>'
# or --from file with lines: FQ-001 not-an-issue — reason
node <skill>/scripts/dismiss.mjs --report <dir>/report.json --undo FQ-001
```

Dismiss kinds: `not-an-issue` · `remove` · `intentional`. Never dismiss on your own judgement.

## Artifacts

```text
qa/functional/reports/review/<slug>/
  findings.json
  report.json
  report.html
  decisions.json / decisions.applied.json
  evidence/
qa/functional/dismissed.json      # committed; re-applied on later builds
qa/functional/functional-debt.md  # committed debt log
```

Ignore `qa/functional/reports/review/` in `qa/functional/.gitignore`. Do not ignore `dismissed.json` or `functional-debt.md`.
