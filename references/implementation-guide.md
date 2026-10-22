# Playwright implementation guide

Read this guide when creating a new Playwright Test harness or substantially revising an existing one. Adapt it to the repository instead of copying it blindly.

## Scaffold initialization contract

Treat initialization as the first independently verifiable stage of automation work. The goal is a minimal harness that fits the repository and can accept real tests later, not a large generic template.

Initialization is complete when all applicable items below are true:

1. The repository's package manager, TypeScript or JavaScript style, module format, application start command, and existing test conventions have been detected rather than assumed.
2. A single compatible `@playwright/test` dependency and configuration entry point exist. Install it from `qa/functional/package.json`, not from the application package and not from a repository-root manifest. Preserve compatible versions and configuration; add only what is missing. Do not change the application's lockfile. Do not set `"type": "module"` on that manifest; it breaks a CommonJS `playwright.config.js`.
3. The configured test directory exists. During initialization, do not add an empty `pages/` or `fixtures/` directory. When a later authoring step tests a page, create that page's page object in the same change.
4. `qa/functional/package.json` exposes stable entry points for test discovery or execution and HTML report viewing. Do not add those scripts to the application `package.json` or to a repository-root `package.json`. Prefer names consistent with the repository; otherwise use clear names such as `test:e2e`, `test:e2e:headed`, and `test:e2e:report`. Run them with the working directory `qa/functional`.
5. Generated outputs stay under `qa/functional` and are ignored from `qa/functional/.gitignore` only: `node_modules/`, `.playwright-cli/`, `.env`, `.auth/`, `reports/`, `test-results/`, `playwright-report/`, and `blob-report/`. Do not edit the application's `.gitignore` or a repository-root `.gitignore`. Do not ignore specs, `qa/functional/package.json`, the lockfile, or configuration.
6. URLs, credentials, and environment-specific values are not hard-coded. Read an existing repository-root `.env` or `.env.local` when it is already there. Do not create or modify those root files. Document a new variable in `qa/functional/.env.example` with placeholders only. A secret this skill creates goes in gitignored `qa/functional/.env`.
7. Configuration loading and test discovery have been checked with the project-native command. An empty suite may be acceptable for initialization, but distinguish "configuration and discovery validated" from "browser scenarios executed."

Do not copy application-specific sample pages or tests merely to make the tree look complete. If a runnable proof is requested and the application has a known safe readiness page, add one small observable smoke test; otherwise leave business tests for the authoring stage. Avoid placeholder tests that always pass.

Initialization must be idempotent. On a repeated invocation, reuse the existing harness, merge non-conflicting settings, and explain conflicts instead of overwriting files wholesale. Never run an interactive initializer where it can replace established configuration.

## Official baseline

Use current Playwright documentation when installed-version behavior is uncertain:

- Installation and running tests: <https://playwright.dev/docs/intro>
- Configuration: <https://playwright.dev/docs/test-configuration>
- Starting a local server: <https://playwright.dev/docs/test-webserver>
- Locators: <https://playwright.dev/docs/locators>
- Assertions: <https://playwright.dev/docs/test-assertions>
- Best practices: <https://playwright.dev/docs/best-practices>
- Test generator: <https://playwright.dev/docs/codegen>
- Reporters: <https://playwright.dev/docs/test-reporters>
- Trace Viewer: <https://playwright.dev/docs/trace-viewer-intro>

## Repository discovery

Before editing, determine:

1. Package manager from the lockfile and repository instructions.
2. TypeScript or JavaScript and the module format.
3. Existing test runner, Playwright dependency, configuration, and test scripts.
4. Application start command and readiness URL.
5. Expected base URL locally and in CI.
6. Required account roles, seed data, APIs, environment variables, and feature flags.
7. CI platform and any existing artifact conventions.

Reuse the `qa/functional` test install, Playwright browser cache, and compatible existing harness. Do not install functional-test packages into the application or into a repository-root `package.json`, and do not run an interactive initializer over an established harness. Run `playwright test`, `allure`, and `playwright-cli` with the working directory `qa/functional` so the CLI session directory is `qa/functional/.playwright-cli/`. For a remote target without a repository, first look for a compatible standalone harness in the current workspace. When `qa/functional` is missing but the workspace already has a sibling functional harness for the same app (for example `qa_one/functional` with Playwright config, page objects, and matching e2e specs), copy or align the compatible pieces into `qa/functional` instead of rediscovering the page from scratch. Keep `qa/functional` as the only canonical harness this skill maintains; do not keep editing the sibling in parallel. For a genuinely new harness, either use the official initializer when interaction is appropriate or add the minimum files deliberately with the project's package manager.

## Execution profiles

Choose the narrowest profile that satisfies the request:

- **Smoke (default):** Chromium only; one scenario per distinct behavior; local terminal, HTML, and JSON reports; no retries unless diagnosing an uncertain failure.
- **Regression:** configured browser or device matrix and broader feature coverage. Parallelize only when test data and target state are isolated.
- **CI:** repository-defined projects, retries, sharding, and machine-readable integrations. Preserve existing CI conventions.

For a warm local cache, avoid dependency installation and browser downloads. Installation time is setup cost, not test execution time, and should recur only when dependencies or browser versions change.

## Live and rate-limited targets

Use `workers: 1` for authentication or other shared-state flows unless the target is known to isolate them safely. Prefer behavioral equivalence classes to multiple examples with the same expected outcome.

**Scenario matrix precedence:** when the user names the cases to run (for example “correct account plus two wrong accounts”), implement that matrix. The compact default below applies only when the user did not specify the scenarios.

A compact login smoke matrix (default when unspecified) is:

1. valid credentials reach the authenticated state;
2. empty or malformed input is rejected by client-side validation, if present;
3. one valid-format nonexistent account is rejected by the server.

When inventing cases under the default matrix, do not send several accounts merely to repeat the same server-side rejection branch. When the user asks for multiple wrong-account cases, still use one checklist control for the shared error message and multiple specs (or parameterized data) against that same page-object locator. If the target starts suppressing feedback, returning throttling responses, or slowing repeated requests, stop equivalent repetitions and record the behavior. Add a cooldown only when the cooldown itself is part of the requirement or the target documents it as necessary; do not turn a discovered delay into a universal fixed wait.

## Saved login

Log in once for an account, then reuse that session for later authenticated features. A second feature, such as editing a profile after an earlier feature already signed in, opens its page with the saved session and does not repeat the login form.

**Hard rule when writing `spec.ts` for a page or flow that needs login:** 在编写spec.ts的时候，如果是需要登录的页面需要优先读取.auth/customer.json 文件里读取token. Do this before any email/password UI steps.

Default customer role file: `qa/functional/.auth/customer.json`. Other roles: `qa/functional/.auth/<role>.json`.

Authoring order for authenticated features (checkout, wishlist, profile, place order, and similar — anything that is not a login-subject test):

1. Check whether `qa/functional/.auth/customer.json` (or the matching role file) exists.
2. If it exists, load it first so the browser already has the session token:
   ```ts
   test.use({ storageState: '.auth/customer.json' });
   ```
   Paths are relative to `qa/functional/` when Playwright runs from that directory. Do not invent a separate token env var when this file already carries cookies and local storage.
3. Open the flow. If the app stays authenticated, skip the login form and continue assertions.
4. If the file is missing, or after load the app still shows login / rejects the session, sign in once through the UI, then overwrite the same file:
   ```ts
   await page.context().storageState({ path: '.auth/customer.json' });
   ```
5. Never write an authenticated-feature spec that always fills the login form and only writes `customer.json` afterward without reading it first.
6. A test whose subject is login still performs the login steps. When its valid-login case succeeds, refresh `customer.json` (or the role file) from that session.

Additional contract:

- After the first successful login, save Playwright storage state to `qa/functional/.auth/<role>.json`. That file holds the cookies and local storage, including the session token. Use one file per account role. With playwright-cli, save and load it through `state-save` and `state-load`, as described in [playwright-cli/storage-state.md](playwright-cli/storage-state.md).
- If the application keeps the token only in the login response, store that token in the same ignored `qa/functional/.auth/` file and apply it the way the application reads it before opening the next page.
- Keep `qa/functional/.auth/` out of version control, Allure attachments, screenshots, and failure output. Business records created by one feature stay out of the next feature's preconditions.

## Recommended new-suite shape

Use this layout for a new harness. Paths inside `playwright.config.*` are relative to `qa/functional/`. Run Playwright, Allure, and playwright-cli from `qa/functional`. Allure paths below are relative to that directory.

```text
qa/functional/
  package.json                 # test dependencies and scripts only
  playwright.config.ts
  tests/
    e2e/
      <function>/
        checklist.json
        <function>.spec.ts
    pages/
      <page-name>.page.ts   # one page object per page a spec opens
    fixtures/               # only when a fixture is used by a test
  .auth/                    # saved login, ignored
  .playwright-cli/          # playwright-cli session scratch, ignored
  reports/                  # Allure results, HTML report, prompts; ignored
  playwright-report/        # generated, ignored
  test-results/             # generated, ignored
```

`<function>` is the feature being tested, with spaces and path separators removed, such as `新增地址`. Each feature gets its own folder. The checklist and the spec for that feature stay in that folder. A pytest project stores `test_<function>.py` there instead of `<function>.spec.ts`. Page objects stay shared under `qa/functional/tests/pages/` because more than one feature can open the same page. From `qa/functional/tests/e2e/<function>/`, import a page object with `../../pages/<page-name>.page`.

Create `pages/` together with the first page object. Do not add an empty `pages/` or `fixtures/` directory during initialization.

A minimal initialization may therefore contain only:

```text
qa/functional/package.json
qa/functional/playwright.config.ts
qa/functional/tests/e2e/
qa/functional/.gitignore     # node_modules, .playwright-cli, .env, reports, .auth, test-results, playwright-report, blob-report
qa/functional/.env.example   # placeholders only, when a variable must be documented
```

Do not add a custom runner program when package scripts and the Playwright CLI already provide the required entry points. The human report for an executed run is Allure, generated into `qa/functional/reports/allure-report/`. Add JUnit only for CI integration or when the user asks for it.

## Configuration decisions

Set configuration from observed project facts:

- `testDir`: point to the chosen E2E directory.
- `baseURL`: use the application URL so specs can navigate with relative paths.
- `webServer`: use the real start command and readiness URL. Set `reuseExistingServer` for local development when safe, and do not assume the same behavior in CI.
- `projects`: start with Chromium for a quick smoke pass. Add Firefox, WebKit, branded browsers, or device emulation only when required.
- `forbidOnly`: enable in CI.
- `retries`: normally zero locally and a small number in CI. Retries must not conceal a known deterministic failure.
- `workers`: respect the application's test-data isolation. Reduce parallelism when tests share unsafe state.
- `outputDir`: keep screenshots, videos, and traces in a generated artifact directory.
- `reporter`: concise terminal output plus Allure results in this run's `qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS>/`. For Playwright Test, point `allure-playwright` `resultsDir` at `reports/allure-results/<function>-<YYYYMMDD-HHMMSS>` (relative to `qa/functional/`). For pytest, pass `--alluredir=qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS>` and do not pass `--clean-alluredir`. Add JUnit for CI integration or when explicitly requested.
- `use.trace`: prefer `on-first-retry` when CI retries are enabled or `retain-on-failure` when they are not.
- `use.screenshot`: prefer `only-on-failure`.
- `use.video`: prefer `retain-on-failure` when video materially helps and runtime cost is acceptable.

A representative configuration shape is:

```ts
// qa/functional/playwright.config.ts
// Paths in this file are relative to qa/functional/.
// Repository root is ../.. when this file lives at <repo>/qa/functional/playwright.config.ts.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const functionalDir = __dirname;
const repoRoot = path.join(functionalDir, '../..');

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, '.env.local'));
loadEnvFile(path.join(functionalDir, '.env'));

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['allure-playwright', { resultsDir: process.env.ALLURE_RESULTS_DIR ?? 'reports/allure-results' }],
  ],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    // Point at the directory that owns the app start script (often <repo>/ or <repo>/nextjs).
    cwd: path.join(repoRoot, 'nextjs'),
    url: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

`webServer.cwd` points at the directory that contains the application start script. That may be outside `qa/functional`; it is the process cwd for starting the app, not a place to write test files. `outputDir`, the HTML report, and the blob report stay inside `qa/functional` (`test-results/`, `playwright-report/`, `blob-report/`). Load secrets from the **repository root** `.env` / `.env.local` first (`path.join(functionalDir, '../..', '.env')` when the harness is `qa/functional`), then from `qa/functional/.env`. Do not use `path.join(functionalDir, '..', '.env')` for the repository root — that resolves to `qa/.env`, not the repo root. Do not create or modify the repository-root `.env`.

When scaffolding `qa/functional/package.json`, pin a compatible Allure set so peers resolve cleanly, for example the same major.minor for `allure-playwright` and `allure-js-commons` (such as both `3.14.x`). Do not leave `allure-js-commons` on an older minor that declares an unmet peer on `allure-playwright`.

Change the URL, command, package manager, projects, and artifact choices to match the project. Do not add a `webServer` for a remote target.

## Functional checklist

Create this checklist the first time a page or function is tested, before its page object and specs. On a later run, when the checklist, spec, and page object already exist, run those specs immediately. Do not open the reference guides or the page, and do not read the checklist, until that attempt fails. After one failure, an application defect opens the review pack after Allure ([review.md](review.md)): findings → `report.html` → Send → fix-loop ([fix-loop.md](fix-loop.md)). A stale locator or a missing control opens one diagnosis pass for the failing control, then reruns only the affected spec. Recompare the checklist before a run only when the user explicitly asks to recheck it, or explicitly says controls were added, removed, or changed. Then append controls that a new snapshot shows and the checklist does not already contain, and note removals the user described. Regenerate the whole checklist only when the user explicitly asks. When the user supplies specs, run those specs and do not create a checklist for that run.

Run `scripts/checklist_from_snapshot.py` only for a new checklist or for controls being appended. Open menus, dialogs, and post-submit states that belong to the named function and include the new controls in the same JSON. Use source only to confirm a control or route already tied to that function. Draft a missing page object with `scripts/page_object_from_checklist.py` after marking the in-suite items. Extend an existing page object for appended controls or a stale locator. Summarize the Playwright JSON report with `scripts/summarize_playwright_report.py`.

Each item uses this shape:

```text
Function: <the function the user named>
Page: <url or route>
Item: <visible control or action>
Preconditions: <state required before the action>
Action: <what the user does>
Expected result: <what becomes visible>
Evidence: <snapshot ref, label, or source location>
Accessible name: <quoted snapshot name>
Visible text: <text after the colon, when present>
Scope: <heading or region role and its unique name>
Path: success | validation | failure
Coverage: in suite | not yet covered
```

The JSON for each item also stores `accessibleName`, `visibleText`, `page`, `scope`, and `scopeRole`. `name` is the visible text when that text differs from the accessible name; otherwise it is whichever of the two is present. `scope` is the nearest preceding unique heading or region at the same indent or higher. Controls from another URL keep that URL in `page` and are generated into that page's class.

- Scope the list to the named function. Include a visible control when the function uses it.
- A success path is required for each action. A validation or failure path is required when the page shows that outcome or the user stated it.
- Repeated inputs with the same visible result become **one checklist item** (one locator). Multiple wrong-account or data variants that share that result become multiple specs (or parameterized rows) that reuse the same page-object field — do not mark two `in suite` rows for the same role, visible text, and scope. Under the default smoke matrix, a login function therefore gets one valid submission, client-side empty or malformed validation when that message is visible, and one valid-format rejected account when that response is visible. When the user asks for more wrong-account cases, keep the single shared error control in the checklist and add the extra cases only in the spec.
- After the checklist exists, the page object and specs implement the items marked `in suite`. Items left `not yet covered` stay in the report.
- Initialization does not create a checklist.

## Page objects

When the first specs for a page are written, create that page's page object in the same change. When specs already exist, reuse the page object. Create a missing one from the controls those specs use, and change an existing one only to add a new control or repair a stale locator.

- One class per page. Name the file from the page, such as `qa/functional/tests/pages/profile.page.ts` for `/profile`. Match an existing page-object directory and naming style when the repository already has one.
- If a page object for that page already exists, extend it with the locators and actions this test needs. Do not create a second class for the same page.
- The page object owns `goto`, locators, and user actions such as filling a form or submitting. The spec owns test data and assertions.
- Locators must come from the live page, via playwright-cli, or from the page's source. Do not add controls that were not observed.
- When the accessible name and the visible text are the same, use `getByRole(role, { name })`. When they differ, use `getByRole(role).filter({ hasText: visibleText })`. When `scope` is set, start from that heading or region and search inside its parent. Run `scripts/page_object_from_checklist.py` once per page. It skips in-suite items whose `page` is a different URL. Duplicate in-suite items that share the same role, accessible name, visible text, and scope collapse to one locator field (with a stderr note); prefer editing the checklist so only one of those rows is `in suite` before generating.
- Before the first suite run, resolve every in-suite locator and require `count()` to be 1. A heading that is only present in the accessibility tree does not prove the overlay is open; the control the next action uses must be inside the viewport.
- The viewport is 1920×1080 unless this invocation states another resolution. Set that size in `test.use({ viewport })` and keep `deviceScaleFactor` at 1. While a `dialog`, `alertdialog`, `menu`, or `listbox` is open, compare each action control's bottom with `window.innerHeight`. If the control sits below the viewport, scroll the overlay element that contains the control. Do not scroll the document behind the overlay, do not call `scrollIntoViewIfNeeded()` on a control inside a fixed overlay, and do not change the chosen resolution to make the control fit.
- Initialization alone does not create page objects.

```ts
import type { Locator, Page } from '@playwright/test';

export class ProfilePage {
  readonly displayName: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.displayName = page.getByLabel('Display name');
    this.saveButton = page.getByRole('button', { name: 'Save' });
  }

  async goto() {
    await this.page.goto('/profile');
  }

  async saveDisplayName(name: string) {
    await this.displayName.fill(name);
    await this.saveButton.click();
  }
}
```

## Authoring rules

Each test should make its intent and oracle obvious, and should call the page object instead of repeating that page's selectors:

```ts
import { test, expect } from '@playwright/test';
import { ProfilePage } from '../../pages/profile.page';

test('user can submit a valid profile', async ({ page }) => {
  const profile = new ProfilePage(page);
  await profile.goto();
  await profile.saveDisplayName('Automation User');
  await expect(page.getByText('Profile saved')).toBeVisible();
});
```

Prefer user-facing locators in this order when practical: role with accessible name, label, text, placeholder or alt text, explicit test ID, then a narrowly scoped CSS locator. Use CSS or XPath tied to DOM structure only as a last resort.

Generated tests must include assertions for the intended business result. Review playwright-cli generated output for redundant actions, absolute URLs, fragile selectors, hard-coded personal data, and missing cleanup.

## Execution loop

Use commands from `qa/functional`, where the functional-test dependencies are installed. A useful sequence is:

1. When this page has no specs yet, the playwright-cli discovery pass produces the functional checklist before any spec is written. Read [playwright-cli.md](playwright-cli.md) first, drive the page with snapshot refs, and pass the snapshot through `scripts/checklist_from_snapshot.py`. Open each overlay the function uses, measure its action controls against the viewport, and confirm a viewport screenshot leaves the overlay open. When the checklist, spec, and page object already exist, run those specs immediately and skip guide reading, checklist comparison, and playwright-cli. Open that diagnosis flow only after the first attempt fails, and only for a failure that is not an application defect.
2. List or compile-discover tests only when authoring new specs or diagnosing a compile or configuration failure. An existing-spec rerun goes straight to the suite.
3. Run the new or changed spec on Chromium.
4. Classify failures before rerunning. Repair test-code or harness defects and rerun only the affected test or spec.
5. On live or shared targets, allow one diagnostic rerun for a materially similar failure; use up to three only for a disposable local target. A timeout waiting for a control inside an overlay, a strict-mode match on a repeated visible label, and an overlay that closes after a screenshot or scroll are the same overlay failure. Keep the chosen screenshot size, scroll the overlay container once, then rerun.
6. Run the final relevant regression group or configured suite once.
7. Preserve the final HTML and machine-readable reports plus useful failure artifacts.

Never classify a product defect as a passing test by changing the expected value to match broken behavior. If the target service, login, seed data, or browser binary is unavailable, report the run as blocked and identify the missing prerequisite.

For initialize-only mode, use the shorter validation loop:

1. Install only the missing test-runner dependency when authorized and necessary.
2. Load the Playwright configuration and list discovered tests using the repository's package manager.
3. Fix configuration, module, or discovery errors caused by the scaffold.
4. Run a browser scenario only when the request includes execution and a safe target plus any prerequisites are available.
5. Report separately whether the scaffold was created, dependencies were installed, discovery succeeded, browsers were installed, and any scenario was executed.

## Report interpretation

Separate these categories:

- Product failure: the application does not satisfy the agreed observable expectation.
- Test failure: the spec, locator, fixture, or assertion is incorrect or brittle.
- Infrastructure failure: the server, browser, dependency, network, or environment could not support execution.
- Flaky result: repeated executions under the same known conditions disagree.

The Allure report served by `allure open` on this run's directory is the primary human artifact. Read counts from `qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS>/widgets/summary.json` with `scripts/summarize_playwright_report.py`, and verify that summary against the runner exit status. In the user-facing summary, also state the wall-clock time from the start of the skill invocation through report generation, opening, and writing this invocation's prompt file. That total is separate from the test duration inside the Allure report.

## Allure report contract

Produce this layout after every executed run. Choose one `<function>-<YYYYMMDD-HHMMSS>` name and use it for both report directories and the prompt file. Earlier runs stay in their own directories.

```text
qa/functional/reports/
  allure-results/
    <function>-<YYYYMMDD-HHMMSS>/
      environment.properties
      *-result.json
      *-attachment.png
      *-attachment.txt
  allure-report/
    <function>-<YYYYMMDD-HHMMSS>/
      index.html
      widgets/summary.json
  prompts/
    <function>-<YYYYMMDD-HHMMSS>.md
```

`<function>` is the feature just tested, such as `登录`. Remove spaces and path separators. When this run covers more than one feature, join those names with `-`. The directory name contains that feature text and is not only digits. An example pair is `qa/functional/reports/allure-results/登录-20261014-175800/` and `qa/functional/reports/allure-report/登录-20261014-175800/`. The prompt file for that same run is `qa/functional/reports/prompts/登录-20261014-175800.md`.

When the flow ends, write `qa/functional/reports/prompts/<function>-<YYYYMMDD-HHMMSS>.md` with the same name as this run's report directories. The body is the user message that invoked this skill, copied verbatim. Do not paraphrase it and do not append later conversation. If the run ends before a feature name exists, use `初始化` and the local time at the end. Keep `qa/functional/reports/prompts/` out of version control.

Write `environment.properties` into the results directory before generation. From `qa/functional`, generate with `allure generate reports/allure-results/<function>-<YYYYMMDD-HHMMSS> -o reports/allure-report/<function>-<YYYYMMDD-HHMMSS>`. Do not pass `--clean` or `--clean-alluredir`, and do not write this run into an earlier directory or into `reports/allure-results/` or `reports/allure-report/` themselves. Then start `allure open reports/allure-report/<function>-<YYYYMMDD-HHMMSS>` in the background so that report is served locally and the browser opens that server. Use `pnpm exec allure open` from `qa/functional` when the global command is missing. Leave the server running and include its `http://127.0.0.1` URL in the summary. `environment.properties` uses the real run values:

```text
Environment=<env>
BaseURL=<base url>
Browser=<browser>
Headless=<true or false>
Runtime.Version=<python or node version>
```

Each case in the report needs:

- a title that states the visible outcome;
- labels for epic, feature, story, and severity, plus a smoke tag when the case is part of the smoke set;
- one step per user-visible operation, including opening the page, each click, fill, or selection, and the assertion, each with its own status;
- screenshots using the default below, unless the user chose one screenshot per completed flow for this run;
- a text attachment for an API body or resulting URL when the case observed one, with passwords and tokens redacted.

Screenshot size is 1920×1080 unless this invocation states another resolution, such as `1440×900`. The same width and height apply to the spec viewport, playwright-cli `resize`, and every image attached to the report. Keep `deviceScaleFactor` at 1. Every attached image is a viewport screenshot, `page.screenshot({ fullPage: false })`, so the PNG matches that size. Do not use a full-page screenshot.

Screenshot timing has two modes. Use the default unless this invocation says otherwise.

- **Each operation (default).** After every user-visible operation completes, attach one viewport screenshot to that step. Name the image with the step name. Attach it in **either** the page-object action step **or** the matching spec assertion step — not both for the same operation, or the Allure report doubles every image.
- **Each completed flow.** Attach one viewport screenshot only after the flow's final assertion. Name the image with the flow title. Earlier steps in that flow stay in the report without their own screenshots. Use this mode when the user says to capture once after each flow finishes, for example “每个流程完成后再截一张”.

Preferred default split: put the per-operation screenshot in the page-object method for fills and clicks; in the spec, attach a screenshot only on assertion steps that are not already covered by that action. For the flow mode, attach the one screenshot from the spec after the final assertion and do not attach from page-object methods. Adding or omitting these screenshots does not change the scenario or the assertion. The runner's failure-only screenshot setting does not replace them. Keep passwords and tokens out of screenshot file names.

Playwright Test records these through `allure-playwright`. pytest records them through `allure-pytest` steps, titles, and attachments. Do not invent a second report format when this layout already exists.
