---
name: playwright-test-automation
description: Initialize or extend a repository-native Playwright Test scaffold, then optionally author, run, and diagnose maintainable end-to-end tests with durable reports. The first time a page is tested, open it with playwright-cli, generate a functional checklist, then write its page object and specs. When the user supplies specs, or that page already has a checklist, page object, and specs, run them and reuse those artifacts. Extend them only for a missing page object, a stale locator, newly visible controls, or an explicit regenerate request. Use the bundled scripts in scripts/ for a new checklist, page-object draft, and report counts. When opening a browser outside playwright test, read the bundled playwright-cli guide and use playwright-cli (or npx playwright cli). Use for persistent browser automation setup or later regression work; use browser-functional-testing for one-off exploratory testing without committed test code.
---

# Playwright Test Automation

Build a repository-native Playwright Test setup and prove that the scaffold is usable. Initialization is a complete mode of its own: when the user asks only to initialize the test scaffold, stop after the harness is configured and validated instead of inventing application-specific scenarios. When the request includes test authoring or execution, continue through durable test cases, execution artifacts, diagnosis, and an evidence-backed summary.

## Choose the operation mode

Infer the narrowest mode that completes the request:

- **Initialize:** inspect the repository; create or minimally extend the Playwright Test harness; add the required dependency, configuration, scripts, artifact directories or ignores, and an environment-variable example when needed; then validate configuration and test discovery. Do not generate business-specific page objects, credentials, data, selectors, or expectations without evidence. Do not run the application or a browser test unless the user asked for execution or a safe, meaningful target is already available.
- **Author:** initialize first when necessary. Generate a functional checklist, page object, and specs only the first time a page or function is tested. Specs call the page object and implement the checklist. Add a fixture only when a test uses it.
- **Run:** execute specs the user supplied or the existing suite. Reuse the current checklist and page object. Classify failures, make permitted test-harness repairs, and produce reports. Do not rewrite the user's scenarios as part of the run.
- **Full workflow:** initialize or extend, author, run, refine, and report when the user explicitly asks for the complete workflow.

For initialize mode, read [implementation-guide.md](references/implementation-guide.md) and follow its scaffold contract. A successful initialization must be idempotent: rerunning it preserves compatible project choices and does not create a second harness or overwrite unrelated configuration.

## Open the browser with playwright-cli

Whenever this skill opens, attaches to, or drives a browser outside the Playwright test runner, read [playwright-cli.md](references/playwright-cli.md) before the first browser command and follow it. That guide is the bundled [playwright-cli skill](https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli).

Use `playwright-cli`, or `npx playwright cli` when the global command is missing, exactly as that guide specifies. This covers page discovery, locator exploration, headed inspection, screenshots, live traces, storage and request inspection, and UI review. Do not use the Cursor browser, MCP browser tools, or a one-off Playwright script for those interactions.

Committed suite execution still uses the project-native `playwright test` command. Use playwright-cli again only when a result needs a live browser, and keep that pass focused.

Read the matching guide only when the task needs it:

- Live test generation, planning, or healing: [test-generation.md](references/playwright-cli/test-generation.md)
- Attaching to a paused `playwright test`: [playwright-tests.md](references/playwright-cli/playwright-tests.md)
- Sessions, storage, mocking, tracing, video, locators, or pull-request attachments: the task list at the end of [playwright-cli.md](references/playwright-cli.md)

## Choose an execution profile

For author, run, or full-workflow modes, use **smoke** by default unless the user asks for broader regression or CI coverage. Initialization alone has no execution profile unless runner settings depend on a requested target.

- **Smoke:** Chromium, no redundant data variants, and an Allure report. Run the final relevant suite once. When specs already implement the checklist, run those specs. Create specs from the checklist only when this page has none yet. Otherwise use the smallest set of behaviorally distinct scenarios.
- **Regression:** the project's configured browsers or devices and a broader set of meaningful scenarios.
- **CI:** the repository's CI settings, retries, reporters, sharding, and artifact conventions.

For live or shared targets, request economy and safe sequencing take priority over parallel speed. Read [implementation-guide.md](references/implementation-guide.md) when selecting a non-default profile or testing authentication, rate-limited APIs, or other shared state.

## Inspect before changing the project

- Read repository instructions and inspect the package manager, scripts, framework, existing test directories, Playwright configuration, application start command, target URL, authentication, and data requirements.
- Preserve an existing Playwright layout and conventions. Extend it rather than initializing a second suite or overwriting configuration.
- Reuse compatible installed dependencies, browser binaries, and an existing harness. For a remote URL without a repository, reuse a compatible standalone harness in the current workspace instead of scaffolding another one.
- Use the project's lockfile and package manager. Add only missing Playwright dependencies and required browser binaries; do not upgrade unrelated packages.
- Do not invent credentials, secrets, seed data, routes, or expected outcomes. Ask for missing information only when it prevents a meaningful assertion or safe execution.
- Treat staging and production carefully. Never automate purchases, destructive record changes, outbound messages, or other consequential actions on a shared system without explicit authorization.

## Reuse existing tests before generating

Skip this section in initialize mode. When the user asks to test a page or a function on a page, choose the first matching path. Read [implementation-guide.md](references/implementation-guide.md) for the checklist contract.

- **The user supplied specs,** in the request or as files they named. Run those specs and report. Keep their scenarios and assertions. Reuse the page object when it exists. Create one only when the spec has none, using the controls that spec already uses. After a failure caused by a stale locator, update that locator on the existing page object and rerun the affected spec. Do not generate a new checklist for this run.
- **This page already has a checklist, a page object, and specs.** Run those specs. Reuse both artifacts. Take a snapshot only to notice controls that the checklist does not already contain. Append those controls when they belong to the requested function, and extend the page object with them. Leave the existing items, specs, and page-object methods in place. Regenerate the checklist only when the user explicitly asks to regenerate it.
- **This page has no specs yet.** Generate the checklist, page object, and specs, then run them:

1. Open that page with playwright-cli and take a snapshot. Follow [playwright-cli.md](references/playwright-cli.md) before the first browser command.
2. Draft the checklist with the bundled snapshot script in [Bundled helpers](#bundled-helpers). Keep the visible buttons, inputs, links, and states that belong to the named function. Use source only to confirm a control already tied to that function.
3. Give each item a precondition, an action, and the expected visible result. Each action gets a success path. Add a validation or failure path when that result is visible on the page or the user stated it. One representative case covers inputs that share the same result.
4. Open menus, dialogs, and post-submit states that belong to the named function, then add the controls they reveal. List any state that was not opened as not yet covered.
5. Keep controls and expected results to what was observed or what the user stated. Ask only when a named function has no observable result to assert.
6. Continue with the page object, specs that implement the checklist, the run, and the report. Include the checklist and the not-yet-covered states in the report.

## Create or extend the harness

Read [implementation-guide.md](references/implementation-guide.md) before creating a new Playwright harness or substantially changing an existing one.

- Default to TypeScript when the project supports it; otherwise match the project's JavaScript module style.
- Prefer an existing test directory. For a new suite, use `tests/e2e/` unless repository conventions suggest another location.
- Create or update `playwright.config.*` with the correct `testDir`, `baseURL`, browser projects, timeouts, retries, artifact policy, reporters, and `webServer` when Playwright should start the application.
- Add non-conflicting package scripts for running the suite and opening its report when useful.
- Ignore generated report and artifact directories in version control, including `reports/allure-results/` and `reports/allure-report/`. Never ignore the specs or configuration.
- Put secrets in environment variables and keep authentication state or credential files out of version control.
- In smoke mode, install only a missing Chromium binary. Do not install additional browsers unless the selected profile needs them.
- In initialize-only mode, do not download browser binaries unless they are required for a user-requested smoke execution. Dependency installation and browser installation are separate steps; report either one as blocked rather than pretending the scaffold is verified.

## Generate maintainable tests

Skip this section in initialize mode. An empty configured test directory is preferable to invented examples or placeholder tests.

- Derive new tests from requirements, the running application, and relevant source routes or components. Discover flows and locators with playwright-cli, including its test-generation flow when a live page is needed. Review and rewrite generated output before treating it as a maintained test. Leave specs the user supplied unchanged except for a locator repair inside the page object.
- Draft a page object when this page has none, or extend the existing one for new controls or a stale locator. Use the bundled page-object script for a new draft, then review it against [implementation-guide.md](references/implementation-guide.md). Reuse the repository's existing page-object directory; otherwise use `tests/pages/<page-name>.page.ts`. Merge the draft into an existing page object.
- Put navigation, locators, and user actions on the page object. Keep assertions in the spec. Do not copy those selectors back into the spec, and do not invent controls that were not observed on the page or in source.
- Assert user-visible outcomes, not implementation details. A completed click or navigation is not sufficient without an observable expectation.
- Record each new case so the Allure report can show it: a title for the visible outcome, epic, feature, story, and severity. Wrap the page open, the action, and the assertion in named steps. On the assertion step, attach a named full-page screenshot. Attach an API body or resulting URL when that evidence exists, after redacting passwords and tokens. Read [implementation-guide.md](references/implementation-guide.md) for the report contract.
- Prefer `getByRole`, `getByLabel`, `getByText`, and explicit test IDs. Avoid brittle CSS/XPath chains unless no stable user-facing contract exists.
- Use awaited web-first assertions such as `await expect(locator).toBeVisible()` so Playwright can retry until the expected state is reached.
- Keep tests isolated. Do not make one test depend on another test's execution order or persisted browser state. Control or uniquely namespace test data and clean it up when safe.
- Avoid fixed sleeps. Wait through locators, assertions, URLs, requests, or responses that represent the actual application state.
- On live authentication or rate-limited endpoints, keep server-side negative attempts to the minimum needed for distinct behavior. If throttling or feedback suppression appears, stop redundant repetitions and report the observation instead of inserting long sleeps merely to force equivalent cases through.
- Keep credentials out of source, screenshots, traces, videos, and failure messages. Disable or narrowly scope sensitive artifacts when they could capture passwords or tokens.
- Add a fixture only when it removes setup that more than one test repeats. A single-page smoke test still gets its own page object.

## Run, classify, and refine

Skip this section in initialize mode after configuration loading and test discovery succeed. Use it for run or full-workflow requests, and after authoring when execution was requested.

1. Limit browser discovery to one focused playwright-cli pass when practical, collecting the snapshot and one representative response together.
2. Run Playwright test discovery or a narrow target first to catch configuration and compilation errors.
3. Run the requested suite. Use the project-native package command and allow the configured `webServer` to manage the app when appropriate.
4. Classify every failure before rerunning it as a test defect, application defect, environment problem, or missing prerequisite.
5. Fix generated test defects and rerun only the affected tests. Do not weaken a valid assertion merely to make the suite green.
6. On a live or shared target, allow at most one diagnostic rerun for a materially similar failure. On a disposable local target, stop after three materially similar unsuccessful repair attempts.
7. Modify application code only when the user requested fixes. Preserve the failing reproduction before any application change, then rerun the affected test and a proportionate regression set.
8. Run the final relevant suite once. For broad suites, use fail-fast or `maxFailures` when early failure makes further execution wasteful.

An unexecuted or blocked test is never a pass. If a retry passes after an earlier failure, report it as flaky when Playwright or repeated execution demonstrates inconsistent behavior.

## Produce the report

After every executed run, publish an Allure report and keep authentication secrets out of it. Read [implementation-guide.md](references/implementation-guide.md) for the directory layout and the fields each case must contain. Reuse the repository's existing Allure command and directories when they already match that layout.

Write `reports/allure-results/environment.properties` before generation. Generate the HTML report with `allure generate reports/allure-results -o reports/allure-report --clean`. After generation succeeds, open that report with a local server in the background: `allure open reports/allure-report`. Use `npx allure` when the global `allure` command is missing, and add `allure-commandline` only when neither is available. Record the `http://127.0.0.1` URL the server prints. A Playwright Test project writes results with `allure-playwright`. A pytest project writes them with `pytest --alluredir=reports/allure-results`.

After the run, provide:

- the functional checklist and any state left not yet covered, when this request tested a page or a function;
- the exact environment and command used;
- created or changed test files;
- passed, failed, broken, skipped, blocked, and not-run counts, using the bundled report script on `reports/allure-report/widgets/summary.json`;
- application defects with reproduction steps and evidence;
- test-infrastructure failures separately from product failures;
- the local server URL from `allure open`, plus relevant screenshots and text attachments inside that report;
- explicitly untested scope.

Say “the executed scenarios passed,” never “the application is bug-free.”

For initialize-only work, report instead:

- the detected package manager, language/module style, application start command, and chosen base URL strategy;
- created or changed scaffold files and package scripts;
- whether dependency resolution, Playwright configuration loading, and test discovery were verified;
- anything intentionally deferred, especially browser installation, credentials, business specs, application startup, and CI integration;
- the exact next command for authoring or running the first test.

## Bundled helpers

Run these scripts from the directory that contains this `SKILL.md`. Do not reimplement them in the target repository, and do not copy them into that repository.

```bash
python3 scripts/checklist_from_snapshot.py \
  --function "<function>" \
  --page "<url-or-route>" \
  --snapshot <snapshot.yml> \
  --json <checklist.json>

python3 scripts/page_object_from_checklist.py \
  --json <checklist.json> \
  --class-name <PageClass> \
  --route <route>

python3 scripts/summarize_playwright_report.py \
  --json <playwright-results.json>
```

Run the checklist and page-object scripts only when creating the first checklist or appending controls that were not already listed. On a later run, or when the user supplied specs, skip both scripts unless a page object is missing, a locator is stale, or the user asked to regenerate the checklist. After a new checklist script run, edit its JSON before drafting the page object. Set `coverage` to `in suite` for controls the named function uses, and fill `expectedResult` from an observed outcome or the user's statement. Add a validation or failure item only when that outcome was observed or stated. Leave every other control `not yet covered`. The page-object script emits only `in suite` items and refuses to overwrite an existing file. Review its locators and method names before saving. The report script reads either Playwright JSON or `reports/allure-report/widgets/summary.json`. Use the Allure summary after generation. Classify blocked and not-run cases outside that file.
