# Playwright implementation guide

Read this guide when creating a new Playwright Test harness or substantially revising an existing one. Adapt it to the repository instead of copying it blindly.

## Scaffold initialization contract

Treat initialization as the first independently verifiable stage of automation work. The goal is a minimal harness that fits the repository and can accept real tests later, not a large generic template.

Initialization is complete when all applicable items below are true:

1. The repository's package manager, TypeScript or JavaScript style, module format, application start command, and existing test conventions have been detected rather than assumed.
2. A single compatible `@playwright/test` dependency and configuration entry point exist. Preserve compatible versions and configuration; add only what is missing.
3. The configured test directory exists. During initialization, do not add an empty `pages/` or `fixtures/` directory. When a later authoring step tests a page, create that page's page object in the same change.
4. Package scripts expose stable entry points for test discovery or execution and HTML report viewing without replacing unrelated scripts. Prefer names consistent with the repository; otherwise use clear names such as `test:e2e`, `test:e2e:headed`, and `test:e2e:report`.
5. Generated outputs such as `playwright-report/`, `test-results/`, traces, screenshots, and videos are ignored without ignoring specs or configuration.
6. URLs, credentials, and environment-specific values are not hard-coded. Add or extend `.env.example` only when the project already uses environment files or the requested harness needs a documented variable such as `PLAYWRIGHT_BASE_URL`. Never create a populated secret file.
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

Reuse the project's dependency cache, Playwright browser cache, and compatible existing harness. Do not run an interactive initializer over an established harness. For a remote target without a repository, first look for a compatible standalone harness in the current workspace. For a genuinely new harness, either use the official initializer when interaction is appropriate or add the minimum files deliberately with the project's package manager.

## Execution profiles

Choose the narrowest profile that satisfies the request:

- **Smoke (default):** Chromium only; one scenario per distinct behavior; local terminal, HTML, and JSON reports; no retries unless diagnosing an uncertain failure.
- **Regression:** configured browser or device matrix and broader feature coverage. Parallelize only when test data and target state are isolated.
- **CI:** repository-defined projects, retries, sharding, and machine-readable integrations. Preserve existing CI conventions.

For a warm local cache, avoid dependency installation and browser downloads. Installation time is setup cost, not test execution time, and should recur only when dependencies or browser versions change.

## Live and rate-limited targets

Use `workers: 1` for authentication or other shared-state flows unless the target is known to isolate them safely. Prefer behavioral equivalence classes to multiple examples with the same expected outcome.

A compact login smoke matrix is:

1. valid credentials reach the authenticated state;
2. empty or malformed input is rejected by client-side validation, if present;
3. one valid-format nonexistent account is rejected by the server.

Do not send several invented accounts merely to repeat the same server-side rejection branch. If the target starts suppressing feedback, returning throttling responses, or slowing repeated requests, stop equivalent repetitions and record the behavior. Add a cooldown only when the cooldown itself is part of the requirement or the target documents it as necessary; do not turn a discovered delay into a universal fixed wait.

## Recommended new-suite shape

Use repository conventions when present. Otherwise prefer:

```text
playwright.config.ts
tests/
  e2e/
    <feature>.spec.ts
  pages/
    <page-name>.page.ts   # one page object per page a spec opens
  fixtures/               # only when a fixture is used by a test
playwright-report/        # generated, ignored
test-results/             # generated, ignored
```

Create `pages/` together with the first page object. Do not add an empty `pages/` or `fixtures/` directory during initialization.

A minimal initialization may therefore contain only:

```text
playwright.config.ts
tests/
  e2e/
package.json                 # existing file with non-conflicting scripts
.gitignore                   # existing or created only when appropriate
.env.example                 # only when configuration needs documented variables
```

Do not add a custom runner program when package scripts and the Playwright CLI already provide the required entry points. Do not require Allure by default: Playwright's HTML and JSON reporters are sufficient for the local baseline. Add Allure or JUnit only when the repository, CI platform, or user requires them.

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
- `reporter`: provide concise terminal output, a persistent HTML report, and JSON locally. Add JUnit for CI integration or when explicitly requested.
- `use.trace`: prefer `on-first-retry` when CI retries are enabled or `retain-on-failure` when they are not.
- `use.screenshot`: prefer `only-on-failure`.
- `use.video`: prefer `retain-on-failure` when video materially helps and runtime cost is acceptable.

A representative configuration shape is:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

Change the URL, command, package manager, projects, and artifact choices to match the project. Do not add a `webServer` for a remote target.

## Functional checklist

Create this checklist the first time a page or function is tested, before its page object and specs. On a later run, reuse the existing checklist and specs. Append controls that a new snapshot shows and the checklist does not already contain. Regenerate the whole checklist only when the user explicitly asks. When the user supplies specs, run those specs and do not create a checklist for that run.

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
Path: success | validation | failure
Coverage: in suite | not yet covered
```

- Scope the list to the named function. Include a visible control when the function uses it.
- A success path is required for each action. A validation or failure path is required when the page shows that outcome or the user stated it.
- Repeated inputs with the same visible result become one item. A login function therefore gets one valid submission, client-side empty or malformed validation when that message is visible, and one valid-format rejected account when that response is visible.
- After the checklist exists, the page object and specs implement the items marked `in suite`. Items left `not yet covered` stay in the report.
- Initialization does not create a checklist.

## Page objects

When the first specs for a page are written, create that page's page object in the same change. When specs already exist, reuse the page object. Create a missing one from the controls those specs use, and change an existing one only to add a new control or repair a stale locator.

- One class per page. Name the file from the page, such as `tests/pages/profile.page.ts` for `/profile`. Match an existing page-object directory and naming style when the repository already has one.
- If a page object for that page already exists, extend it with the locators and actions this test needs. Do not create a second class for the same page.
- The page object owns `goto`, locators, and user actions such as filling a form or submitting. The spec owns test data and assertions.
- Locators must come from the live page, via playwright-cli, or from the page's source. Do not add controls that were not observed.
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
import { ProfilePage } from '../pages/profile.page';

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

Use commands matching the project's package manager. A useful sequence is:

1. When this page has no specs yet, the playwright-cli discovery pass produces the functional checklist before any spec is written. Read [playwright-cli.md](playwright-cli.md) first, drive the page with snapshot refs, and pass the snapshot through `scripts/checklist_from_snapshot.py`. When specs already exist, run them and reuse the checklist and page object.
2. List or compile-discover tests.
3. Run the new or changed spec on Chromium.
4. Classify failures before rerunning. Repair test-code or harness defects and rerun only the affected test or spec.
5. On live or shared targets, allow one diagnostic rerun for a materially similar failure; use up to three only for a disposable local target.
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

The HTML report is the primary human artifact. Use JSON or JUnit to calculate counts or integrate with CI, but verify the final summary against the actual runner exit status.
