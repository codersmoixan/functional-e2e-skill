# functional-e2e

[中文文档](README.zh-CN.md)

Repository-native Playwright end-to-end tests: scaffold the harness, author maintainable specs, run them, and publish an Allure report. Invoke it from the web project you want to test.

## What it does

- Initializes or extends one Playwright Test harness. A later run reuses that harness.
- The first time a feature is tested, opens the page with [playwright-cli](https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli), drafts a functional checklist from the visible controls, then writes a page object and specs.
- Runs specs you already wrote, or specs from an earlier run, without regenerating them.
- Signs in once per account and reuses that session for later authenticated features.
- After each run, writes Allure results and an HTML report in their own folders, then serves the report locally.
- When failures are **product defects**, builds an interactive review report (`qa/functional/reports/review/…`). After you **Send to agent** (or paste `Apply my functional QA review`), the agent applies decisions and fixes application code in a fix-loop, then re-runs the affected specs.

Page discovery uses `playwright-cli` (or `npx playwright cli` when the global command is missing). Committed tests run with the project's `playwright test` or pytest command.

## How to use it

In the target project, name the skill and the outcome:

```text
Use functional-e2e to initialize the Playwright Test scaffold for this project.
```

```text
Use functional-e2e to test the add-address feature at http://127.0.0.1:3000/address.
```

```text
Use functional-e2e to run qa/functional/tests/e2e/新增地址/新增地址.spec.ts.
```

```text
Use functional-e2e to test 新增地址 again.
```

Say "regression" for the project's browser matrix, or "CI" to follow the repository's CI settings. Otherwise the run is smoke: Chromium, one representative case per distinct result, and an Allure report.

Provide the page URL or start command, and the visible result you expect. Put accounts in environment variables. The skill asks when an assertion would otherwise require an invented outcome.

## What happens on a test request

1. **You supplied specs.** Those specs run. Their scenarios stay as written. A page object is added only when one is missing, and a locator is updated only when a failure shows it is stale.
2. **This feature already has a checklist, spec, and page object in `qa/functional/tests/e2e/<function>/`.** Those specs run immediately. Guide reading, the checklist JSON, and a live control comparison are skipped until that attempt fails. A **product failure** opens the review report after Allure: choose Fix now / Debt / Dismiss, then Send to agent so fixes can start. A stale locator or a missing control opens one diagnosis pass, repairs the page object, and reruns only the affected spec (no product review UI). A live checklist comparison happens before the run only when you explicitly ask to recheck the checklist, or explicitly say controls were added, removed, or changed. The checklist is rebuilt only when you ask to regenerate it. Use the same feature name so the same folder is found.
3. **This feature has no specs yet.** The page is opened, a checklist is written, then a page object and spec are written and executed.

Initialization alone stops after the harness is configured and test discovery succeeds. It does not open the page or invent business specs.

## Files it writes

```text
qa/functional/
  package.json                 # functional-test dependencies only
  playwright.config.ts
  dismissed.json               # committed; prior review dismissals
  functional-debt.md           # committed debt log
  .playwright-cli/             # playwright-cli scratch, not committed
  tests/
    e2e/<function>/
      checklist.json
      <function>.spec.ts      # pytest projects use test_<function>.py
    pages/<page-name>.page.ts
  .auth/<role>.json           # saved login, not committed
  reports/
    allure-results/<function>-<YYYYMMDD-HHMMSS>/
    allure-report/<function>-<YYYYMMDD-HHMMSS>/
    review/<function>-<YYYYMMDD-HHMMSS>/   # findings + interactive report.html
    prompts/<function>-<YYYYMMDD-HHMMSS>.md
```

Page objects stay under `qa/functional/tests/pages/` so several features can share a page. Login state stays in `qa/functional/.auth/` and is reused by the next authenticated feature. When authoring a `spec.ts` for a page that needs login, prefer loading the session token from `.auth/customer.json` first via `test.use({ storageState: '.auth/customer.json' })` — do not hardcode email/password login as the only path. If that state is missing or the site returns to the login page, the skill signs in once and refreshes the file. A test whose subject is login still performs the login steps. Test dependencies stay in `qa/functional/package.json` and are not added to the application package. Playwright, Allure, and playwright-cli run from `qa/functional`, so CLI scratch files stay in `qa/functional/.playwright-cli/`. Every file this skill creates stays under `qa/functional`, including its `.gitignore`, lockfile, `.env.example`, and test-result directories. An existing repository-root `.env` may be read; it is not created or edited.

## Reports and screenshots

Each run gets a new results directory and a matching report directory, named with the feature and the local time, for example `qa/functional/reports/allure-report/登录-20261014-175800/`. Earlier runs are left in place. After generation, `allure open` serves that report and the summary includes the printed `http://127.0.0.1` URL.

Product defects also get `qa/functional/reports/review/<same-slug>/report.html`. Review UI design (Neutral tokens, finding cards, floating “Review and send” bar): [references/review.md](references/review.md). Fix-loop after Send: [references/fix-loop.md](references/fix-loop.md).

When the run ends, the prompt that invoked the skill is saved under the same name, for example `qa/functional/reports/prompts/登录-20261014-175800.md`. That file is the user message verbatim. An initialize-only finish uses `初始化` instead of a feature name. `qa/functional/reports/prompts/` is not committed.

Screenshots and the browser viewport default to 1920×1080, including every image in the Allure report. State another size in the request when you want one, for example `1440×900`. Ask for one screenshot per completed flow when you only want an image after the flow's final assertion:

```text
Use functional-e2e to test 新增地址, and take one screenshot after each flow completes.
```

Passwords and tokens are kept out of source, screenshot names, and text attachments.

## Requirements

- Python 3, for the checklist / page-object / summarize helpers in `scripts/`.
- Node.js ≥ 18, for the review pack (`findings-from-run`, `build-review-report`, `review`, `apply-decisions`); no extra npm install.
- `playwright-cli` for opening a page outside the test runner.
- `allure` or `npx allure` to generate and serve the report.

The agent instructions live in [SKILL.md](SKILL.md). Scaffold, checklist, login, and report details live in [references/implementation-guide.md](references/implementation-guide.md).
