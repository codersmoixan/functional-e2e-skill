# Fix loop (functional QA)

Drive the **fix-now** set to zero after the reviewer Sent (or after chat triage). Re-verify with Playwright, not design screenshots.

## Scope

- Only findings triaged **fix-now** with `resolution: FIX_CODE` (and application / annotation classification).
- Send approves this loop on that set. Do not widen into debt, dismissed, intentional, or test_defect items.
- Use `sourceHints` plus repository search (route, copy, API path) to locate application code.
- Ask before risky or wide edits (shared layout, auth, payments, destructive data).
- Note uncommitted changes before you start so this pass's diff stays reviewable.

## 1. Reproduce

Keep the failing spec and Allure / evidence screenshots. Do not weaken assertions to go green.

## 2. Fix application code

- Change the product so the **user-visible** expected outcome holds.
- Prefer the paths in `sourceHints`; if wrong, search and update hints in `findings.json` when rebuilding.
- Nothing beyond what the finding describes.
- Do **not** "fix" by editing the checklist expected result or deleting the assertion unless the person dismissed the finding as intentional / not-an-issue.

## 3. Re-run

From `qa/functional`, re-run only the affected spec(s):

```bash
pnpm exec playwright test tests/e2e/<function>/<function>.spec.ts --config playwright.config.ts
```

(or the project's package-manager equivalent). Generate a fresh Allure directory name when you also publish a report for this verification pass.

## 4. Update findings and rebuild

For each verified fix in `findings.json` / `report.json`:

- keep `id`, `ref`, `fingerprint`, `spec`, `expected`
- set `"severity": "PASS"` and `"resolution": "PASS"`
- clear or leave `fix` as historical notes

Then:

```bash
node <skill>/scripts/build-review-report.mjs --dir qa/functional/reports/review/<slug>
```

If the suite still fails for the same finding, leave it open, attach new evidence under `evidence/`, and report what remains.

## 5. Reply

Include: which ids were fixed, which remain, debt count, paths to `report.html` and Allure, and that only the executed scenarios were re-checked.
