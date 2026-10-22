---
name: functional-e2e
description: >
  Functional end-to-end testing under qa/functional (Playwright Test + Allure).
  Initialize or extend a repository-native Playwright scaffold, then author, run,
  and diagnose maintainable E2E tests. The first time a page is tested, open it
  with playwright-cli, generate a functional checklist, then write its page object
  and specs. When the user supplies specs, or that page already has a checklist,
  page object, and specs, run those specs immediately. Skip guide reading,
  checklist comparison, and playwright-cli until that attempt fails. After one
  failure, run the diagnosis flow once: repair a stale locator for test defects;
  for application defects, file findings, build an interactive review report, open
  review, and after Send (or a pasted "Apply my functional QA review") apply
  decisions and fix application code in the fix-loop, then re-run affected specs.
  Recompare the whole checklist before a run only when the user explicitly asks,
  or explicitly says controls were added, removed, or changed. Use the bundled
  scripts in scripts/ for checklists, page objects, Allure counts, findings,
  review, and apply-decisions. When opening a browser outside playwright test,
  read the bundled playwright-cli guide and use playwright-cli (or npx playwright
  cli). When the user asks to test a page, flow, or function, always write or
  reuse the page object and spec, run that spec, generate the Allure report, and
  open it; when product defects remain, also open the functional review report.
  A browser-only pass does not finish the request. Trigger on /functional-e2e,
  functional E2E, 功能测试, Playwright E2E, or a message that starts with
  "Apply my functional QA review". Do not switch to browser-functional-testing
  because the user said “测一下” or did not name Playwright. Do not use this
  skill for design-parity / Figma visual QA.
argument-hint: <page|flow|function|init> | apply
---

# Functional E2E

Build a repository-native Playwright Test setup and prove that the scaffold is usable. Initialization is a complete mode of its own: when the user asks only to initialize the test scaffold, stop after the harness is configured and validated instead of inventing application-specific scenarios. When the request includes test authoring or execution, continue through durable test cases, execution artifacts, diagnosis, and an evidence-backed summary.

## Functional project directory

The repository under test is the working directory. On every pass, create `qa/functional` at that repository root when it is missing.

Every file this skill creates or edits goes under `qa/functional`. Do not create or edit a repository-root `package.json`, `.gitignore`, `.env`, `.env.example`, `tests/`, `reports/`, or `.playwright-cli/`. Do not edit the application's `package.json`, lockfile, `.gitignore`, Playwright config, or example specs.

- `qa/functional/playwright.config.*` — always the functional harness. Create it here even when the application already has its own Playwright config. Leave that application config and its example tests untouched.
- `qa/functional/tests/e2e/<function>/` — checklist and spec.
- `qa/functional/tests/pages/<page-name>.page.ts` — shared page objects.
- `qa/functional/package.json` — the only manifest for `@playwright/test`, `allure-playwright`, `allure-commandline`, and the functional-test scripts. Do not create a second test manifest at the repository root.
- `qa/functional/.auth/` — saved login. Keep it out of version control.
- `qa/functional/.playwright-cli/` — playwright-cli snapshots, console logs, and session scratch. Keep it out of version control.
- `qa/functional/reports/` — Allure results, the HTML report, and this invocation's prompt.

Run `playwright test`, `allure`, and `playwright-cli` with the working directory `qa/functional`, so Node resolves `qa/functional/node_modules` and playwright-cli writes `.playwright-cli` there instead of at the repository root. Pass `--config playwright.config.ts` (or `.js`); that path is relative to `qa/functional/`. Paths inside the config file stay relative to `qa/functional/`. Set `webServer.cwd` to the directory that contains the app start script. Bundled Python helpers still accept repository-root paths such as `qa/functional/tests/...` and can be run from the repository root.

Do not add `"type": "module"` to `qa/functional/package.json`. A CommonJS `playwright.config.js` that uses `require` and `module.exports` fails to load when that field is set. Keep the config as `.js` CommonJS, or use `.mjs` / `.ts` when the file itself is ESM.

Do not add functional-test dependencies, scripts, or lockfile changes to the application `package.json`. Installing them there rewrites the application's dependency tree and can break a running app. An application that already lists `@playwright/test` for its own example suite stays untouched; the functional suite uses `qa/functional/package.json`.

Read an existing repository-root `.env` or `.env.local` when it is already there, and read secrets from the shell. Do not create or modify those root files. From `qa/functional/playwright.config.*`, the repository root is `path.join(__dirname, '../..')` — load `../../.env`, not `../.env` (that is `qa/.env`). When this skill needs a documented variable, write `qa/functional/.env.example` with placeholders only. When it needs to store a secret it creates, write gitignored `qa/functional/.env`. The package-manager lockfile belongs next to `qa/functional/package.json`. Playwright's `outputDir`, HTML report, blob report, and traces stay `qa/functional/test-results/`, `qa/functional/playwright-report/`, and `qa/functional/blob-report/`. Ignore entries for those generated directories go only in `qa/functional/.gitignore`.

## Required artifacts

A request to test a page, flow, or function is not finished until all three exist for that run:

1. `qa/functional/tests/pages/<page-name>.page.ts` — create it the first time that page is tested, or extend the existing page object.
2. `qa/functional/tests/e2e/<function>/<function>.spec.ts` — create it the first time that function is tested, or run the existing spec.
3. `qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS>/` — this run's Allure report. Generate it with `allure generate` from this run's `qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS>/`, then open it with `allure open`. The user-facing summary must include the printed `http://127.0.0.1` URL.

必须生成 Allure 报告。Stopping after playwright-cli, a manual browser walkthrough, or a Playwright run that was not turned into `qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS>/` is a failed skill run. “测一下” and “看一下功能” still require the page object, the spec, and the opened Allure report. The only exception is an initialize-only request that asks solely to scaffold the harness and does not ask to test a page or function: do not invent business specs, and do not generate an Allure report for scenarios that were not executed.

Record the wall-clock start when this skill begins, before the first inspection or command. When the flow ends, including a blocked or initialize-only finish and after the Allure report is generated and opened, write this invocation's user prompt, then tell the user the total elapsed time. Include inspection, browser setup, authoring, execution, diagnosis, report generation, opening the report, and writing the prompt. State it as hours, minutes, and seconds, omitting a unit that is zero, such as `4m 12s` or `1h 3m 20s`. This total is separate from the duration Allure records for the tests alone.

## Choose the operation mode

Infer the narrowest mode that completes the request:

- **Initialize:** inspect the repository; create or minimally extend the Playwright Test harness; add the required dependency, configuration, scripts, artifact directories or ignores, and an environment-variable example when needed; then validate configuration and test discovery. Do not generate business-specific page objects, credentials, data, selectors, or expectations without evidence. Do not run the application or a browser test unless the user asked for execution or a safe, meaningful target is already available.
- **Author:** initialize first when necessary. Generate a functional checklist, page object, and specs only the first time a page or function is tested. Specs call the page object and implement the checklist. Add a fixture only when a test uses it.
- **Run:** execute specs the user supplied or the existing suite. Reuse the current checklist and page object. Classify failures, make permitted test-harness repairs, and produce reports. Do not rewrite the user's scenarios as part of the run.
- **Full workflow:** initialize or extend, author, run, refine, and report when the user explicitly asks for the complete workflow.

For initialize mode, read [implementation-guide.md](references/implementation-guide.md) and follow its scaffold contract. A successful initialization must be idempotent: rerunning it preserves compatible project choices and does not create a second harness or overwrite unrelated configuration.

## Existing artifacts run first

When the requested function already has `qa/functional/tests/e2e/<function>/checklist.json`, its spec, and the page object that spec imports, run that spec before any other workflow.

Skip all of the following until that attempt has failed:

- [Inspect before changing the project](#inspect-before-changing-the-project)
- this skill's reference guides, including `implementation-guide.md` and `playwright-cli.md`
- the checklist JSON, unrelated page objects, login specs, and earlier transcripts
- playwright-cli, including a snapshot used to compare controls
- a separate `playwright test --list` or discovery command before the suite

Read only what the command needs: the spec's `storageState` and environment variable names, and in `qa/functional/playwright.config.*` the `baseURL` and Allure `resultsDir`. Before that run, set the spec viewport to the size in [Screenshot size](#screenshot-size) when it differs. Leave the scenarios and assertions in place. Then run the spec once and publish the report using the steps already written in [Produce the report](#produce-the-report).

If that attempt fails, run this diagnosis flow once:

1. Read the failure message and its artifacts.
2. An **application defect** does not rebuild the checklist and does not rerun that case for harness healing. After Allure is published, enter the **review path** in [Application defects: review and fix](#application-defects-review-and-fix): file findings (with reproduction, evidence, and best-effort `sourceHints`), build `report.html`, open `review.mjs`, and wait for Send (or a pasted `Apply my functional QA review`). Do not modify application code until decisions are applied.
3. A stale locator, a control the spec can no longer find, a compile or configuration error, or a rejected saved login opens the fuller harness flow. Read the guide that failure needs, and open playwright-cli only when a live control has to be checked. Compare the failing control with the checklist. Repair the page-object locator when it is stale. Rerun only the affected spec once. These **test defects** do not open the product review UI.
4. On a live or shared target, that harness rerun is the only diagnostic rerun. On a disposable local target, the later repair limit in [Run, classify, and refine](#run-classify-and-refine) still applies.

A missing page object, a request to regenerate the checklist, or an explicit statement that controls were added, removed, or changed still uses the authoring or recompare path before the run.

## Open the browser with playwright-cli

Whenever this skill opens, attaches to, or drives a browser outside the Playwright test runner, read [playwright-cli.md](references/playwright-cli.md) before the first browser command and follow it. That guide is the bundled [playwright-cli skill](https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli).

Use `playwright-cli`, or `pnpm exec playwright cli` from `qa/functional` when the global command is missing, exactly as that guide specifies. The working directory is `qa/functional` for every playwright-cli command, including `open`, `resize`, `snapshot`, and `close`. That is what places session files in `qa/functional/.playwright-cli/`. This covers page discovery, locator exploration, headed inspection, screenshots, live traces, storage and request inspection, and UI review. Do not use the Cursor browser, MCP browser tools, or a one-off Playwright script for those interactions.

Committed suite execution still uses the project-native `playwright test` command. Use playwright-cli again only when a result needs a live browser, and keep that pass focused.

## Screenshot size

The browser viewport, playwright-cli snapshots and screenshots, and every image in the Allure report use one size. The default is **1920×1080**. When this invocation states another resolution, use that width and height instead. Accept `1920×1080`, `1920x1080`, and `1920*1080`.

Keep `deviceScaleFactor` at 1 so each saved PNG is that many pixels wide and tall. Set the size in every spec with `test.use({ viewport: { width, height } })`. Before the first playwright-cli snapshot or screenshot, run `playwright-cli resize <width> <height>` with the same size. A device preset such as Desktop Chrome must not leave a different viewport in effect.

Attach viewport screenshots only: `page.screenshot({ fullPage: false })`. A full-page capture is taller than the viewport, so the report image would no longer match the chosen size. Do not raise the viewport to fit a control. When a control sits below the viewport, scroll only the overlay container that owns it. If an existing spec sets a different viewport, change only that `viewport` to the invocation size before the run, and leave the scenarios and assertions as they are.

Read the matching guide only when the task needs it:

- Live test generation, planning, or healing: [test-generation.md](references/playwright-cli/test-generation.md)
- Attaching to a paused `playwright test`: [playwright-tests.md](references/playwright-cli/playwright-tests.md)
- Sessions, storage, mocking, tracing, video, locators, or pull-request attachments: the task list at the end of [playwright-cli.md](references/playwright-cli.md)

## Choose an execution profile

For author, run, or full-workflow modes, use **smoke** by default unless the user asks for broader regression or CI coverage. Initialization alone has no execution profile unless runner settings depend on a requested target.

- **Smoke:** Chromium, no redundant data variants, and an Allure report. Run the final relevant suite once. When specs already implement the checklist, run those specs. Create specs from the checklist only when this page has none yet. Otherwise use the smallest set of behaviorally distinct scenarios.
- **Regression:** the project's configured browsers or devices and a broader set of meaningful scenarios.
- **CI:** the repository's CI settings, retries, reporters, sharding, and artifact conventions.

When the user names the scenario matrix (for example “correct login plus two wrong accounts”), implement that matrix. The compact default login matrix in [implementation-guide.md](references/implementation-guide.md) applies only when the user did not specify cases. Multiple data variants that share one visible error message still use one checklist control and one page-object locator; the variants live in separate specs.

For live or shared targets, request economy and safe sequencing take priority over parallel speed. On the existing-artifacts path, follow the spec's `storageState` and environment variables. Read [implementation-guide.md](references/implementation-guide.md) when authoring authentication, selecting a non-default profile, or diagnosing a failed run that depends on rate-limited APIs or other shared state.

## Inspect before changing the project

Skip this section when [Existing artifacts run first](#existing-artifacts-run-first) applies and that run has not failed.

- Read repository instructions and inspect the package manager, scripts, framework, existing test directories, Playwright configuration, application start command, target URL, authentication, and data requirements.
- Preserve the repository's language, package manager, and the functional harness under `qa/functional`. Do not extend a Playwright config that lives outside `qa/functional`.
- Reuse compatible installed dependencies, browser binaries, and an existing harness. For a remote URL without a repository, reuse a compatible standalone harness in the current workspace instead of scaffolding another one. When `qa/functional` is missing but a sibling harness for the same app already exists (for example `qa_one/functional`), migrate or align compatible config, page objects, and matching specs into `qa/functional` instead of rediscovering from zero; keep `qa/functional` as the only maintained harness.
- Install functional-test dependencies only into `qa/functional/package.json`, using that directory as the package root. Do not install them into the application package or a repository-root `package.json`, and do not change the application's lockfile. Add only missing test dependencies and required browser binaries; do not upgrade unrelated packages. Pin a compatible Allure set (`allure-playwright` and `allure-js-commons` on the same major.minor). Run Playwright and Allure from `qa/functional`.
- Do not invent credentials, secrets, seed data, routes, or expected outcomes. Ask for missing information only when it prevents a meaningful assertion or safe execution.
- Treat staging and production carefully. Never automate purchases, destructive record changes, outbound messages, or other consequential actions on a shared system without explicit authorization.

## Reuse existing tests before generating

Skip this section in initialize mode. When the user asks to test a page or a function on a page, choose the first matching path. Read [implementation-guide.md](references/implementation-guide.md) for the checklist contract only when authoring a checklist, or after a failed run enters the diagnosis flow. Do not read it before a rerun of existing specs.

- **The user supplied specs,** in the request or as files they named. Run those specs and report. Keep their scenarios and assertions. Reuse the page object when it exists. Create one only when the spec has none, using the controls that spec already uses. After a failure caused by a stale locator, update that locator on the existing page object and rerun the affected spec. Do not generate a new checklist for this run.
- **This function already has a checklist, a spec, and the page object that spec imports.** Follow [Existing artifacts run first](#existing-artifacts-run-first). Leave the existing items, specs, and page-object methods in place. Regenerate the checklist only when the user explicitly asks to regenerate it. Before the run, do not open playwright-cli and do not compare the page with the checklist. Recompare before the run only when the user explicitly says to recheck the checklist, or explicitly says controls were added, removed, or changed. After the first attempt fails for a reason other than an application defect, compare the failing control once, append controls that belong to the requested function and are not already listed, and repair the page object. Do not rebuild the checklist.
- **This page has no specs yet.** Generate the checklist, page object, and specs, then run them:

1. Open that page with playwright-cli and take a snapshot. Follow [playwright-cli.md](references/playwright-cli.md) before the first browser command.
2. Draft the checklist with the bundled snapshot script in [Bundled helpers](#bundled-helpers). Write it to `qa/functional/tests/e2e/<function>/checklist.json`, and write that function's spec in the same folder. `<function>` is the feature name with spaces and path separators removed. Keep the visible buttons, inputs, links, and states that belong to the named function. Use source only to confirm a control already tied to that function. Each item keeps `accessibleName`, `visibleText`, `page`, and, when the visible text is repeated, a unique `scope`.
3. Give each item a precondition, an action, and the expected visible result. Each action gets a success path. Add a validation or failure path when that result is visible on the page or the user stated it. Inputs that share the same visible result become **one** checklist item and **one** page-object locator; put extra data variants (for example two wrong accounts with the same error text) in separate specs, not as duplicate `in suite` rows.
4. Open menus, dialogs, and post-submit states that belong to the named function, then add the controls they reveal. Keep the viewport from [Screenshot size](#screenshot-size). While an overlay is open, read each in-suite control's bounding box. When its bottom is below the viewport, scroll only the overlay container that owns the control. Do not scroll the document behind a fixed overlay, do not call `scrollIntoViewIfNeeded()` on a control inside one, and do not change the chosen resolution. List any state that was not opened as not yet covered.
5. Keep controls and expected results to what was observed or what the user stated. Ask only when a named function has no observable result to assert. Before drafting the page object, the next action's target must be inside the viewport. A heading that remains in the accessibility tree is not enough to treat an overlay as open.
6. Continue with the page object, specs that implement the checklist, the run, and the report. Include the checklist and the not-yet-covered states in the report.

## Create or extend the harness

Read [implementation-guide.md](references/implementation-guide.md) before creating a new Playwright harness or substantially changing an existing one.

- Default to TypeScript when the project supports it; otherwise match the project's JavaScript module style.
- For a new suite, use `qa/functional/tests/e2e/`. Extend that directory when it already exists.
- Create or update `qa/functional/playwright.config.*` with the correct `testDir`, `baseURL`, browser projects, timeouts, retries, artifact policy, reporters, and `webServer` when Playwright should start the application.
- Add test scripts only to `qa/functional/package.json`. Do not add them to the application `package.json` or a repository-root `package.json`.
- Ignore generated directories only in `qa/functional/.gitignore`: `node_modules/`, `.playwright-cli/`, `.env`, `.auth/`, `reports/allure-results/`, `reports/allure-report/`, `reports/review/`, `reports/prompts/`, `test-results/`, `playwright-report/`, and `blob-report/`. Never ignore the specs, `qa/functional/package.json`, the lockfile, configuration, `qa/functional/dismissed.json`, or `qa/functional/functional-debt.md`. Do not edit any other `.gitignore`.
- Put secrets in environment variables and keep authentication state or credential files out of version control. Ignore the saved-login file, such as `qa/functional/.auth/`.
- In smoke mode, install only a missing Chromium binary. Do not install additional browsers unless the selected profile needs them.
- In initialize-only mode, do not download browser binaries unless they are required for a user-requested smoke execution. Dependency installation and browser installation are separate steps; report either one as blocked rather than pretending the scaffold is verified.

## Generate maintainable tests

Skip this section in initialize mode. An empty configured test directory is preferable to invented examples or placeholder tests.

- Derive new tests from requirements, the running application, and relevant source routes or components. Discover flows and locators with playwright-cli, including its test-generation flow when a live page is needed. Review and rewrite generated output before treating it as a maintained test. Leave specs the user supplied unchanged except for a locator repair inside the page object.
- Save each function's checklist and spec together in `qa/functional/tests/e2e/<function>/`. Use `checklist.json` and `<function>.spec.ts` there. A pytest project uses `test_<function>.py` in that same folder instead of a `.spec.ts` file. Do not place a second function's checklist or spec in that folder.
- Draft a page object when this page has none, or extend the existing one for new controls or a stale locator. Use the bundled page-object script for a new draft, then review it against [implementation-guide.md](references/implementation-guide.md). Reuse the repository's existing page-object directory; otherwise use `qa/functional/tests/pages/<page-name>.page.ts`. Merge the draft into an existing page object.
- Put navigation, locators, and user actions on the page object. Keep assertions in the spec. Do not copy those selectors back into the spec, and do not invent controls that were not observed on the page or in source.
- Assert user-visible outcomes, not implementation details. A completed click or navigation is not sufficient without an observable expectation.
- Record each new case so the Allure report can show it: a title for the visible outcome, epic, feature, story, and severity. Wrap each user-visible operation in its own named step, including opening the page, each click or fill, and the assertion. By default, after each operation completes, attach one viewport screenshot to that step, named with the step name. Attach it in the page-object action **or** the matching spec assertion, not both, so the report does not double images. The image uses the size in [Screenshot size](#screenshot-size), so the default report image is 1920×1080. When the user asks for one screenshot per completed flow, attach a single viewport screenshot only after that flow's final assertion, named with the flow title, and do not attach a screenshot to the earlier steps. Attach an API body or resulting URL when that evidence exists, after redacting passwords and tokens. Read [implementation-guide.md](references/implementation-guide.md) for the report contract.
- Prefer `getByRole`, `getByLabel`, `getByText`, and explicit test IDs. When the accessible name and the visible text differ, locate by role plus the visible text. When that visible text is repeated, scope the locator to the checklist `scope`. Avoid brittle CSS/XPath chains unless no stable user-facing contract exists. The page-object script emits one field per unique locator key and dedupes duplicate in-suite rows that share role, accessible name, visible text, and scope.
- Use awaited web-first assertions such as `await expect(locator).toBeVisible()` so Playwright can retry until the expected state is reached.
- Keep business data isolated. Do not make one feature depend on records created by another feature's run. Authenticated features for the same account share one saved login instead of signing in again. Read [implementation-guide.md](references/implementation-guide.md) for that saved-login contract.
- **Auth-first when authoring `spec.ts`:** 在编写spec.ts的时候，如果是需要登录的页面需要优先读取.auth/customer.json 文件里读取token. For the default customer role that means: if `qa/functional/.auth/customer.json` exists, load it with `test.use({ storageState: '.auth/customer.json' })` (or the equivalent pytest/storage fixture) before opening the page, and do not hardcode a full email/password login as the only path. That JSON is Playwright storage state — cookies and origin storage that hold the session token. Only sign in through the UI when the file is missing, the session is rejected, or the login dialog still appears after load; then overwrite the same file. Specs whose subject is login still perform the login steps and refresh the file on success. Other roles use `qa/functional/.auth/<role>.json` the same way.
- Avoid fixed sleeps. Wait through locators, assertions, URLs, requests, or responses that represent the actual application state.
- On live authentication or rate-limited endpoints, keep server-side negative attempts to the minimum needed for distinct behavior unless the user explicitly asked for more wrong-account cases. If throttling or feedback suppression appears, stop equivalent repetitions and report the observation instead of inserting long sleeps merely to force equivalent cases through.
- Keep credentials out of source, screenshots, traces, videos, and failure messages. Disable or narrowly scope sensitive artifacts when they could capture passwords or tokens.
- Add a fixture only when it removes setup that more than one test repeats. A single-page smoke test still gets its own page object.

## Run, classify, and refine

Skip this section in initialize mode after configuration loading and test discovery succeed. Use it for run or full-workflow requests, and after authoring when execution was requested.

1. When this function already has a checklist, spec, and page object, follow [Existing artifacts run first](#existing-artifacts-run-first): skip playwright-cli and skip a separate discovery command, then run the suite directly. When this page has no specs yet, limit browser discovery to one focused playwright-cli pass, collecting the snapshot and one representative response together.
2. Run Playwright test discovery before the suite only when authoring new specs or diagnosing a compile or configuration failure. An existing-spec rerun goes straight to the suite.
3. Run the requested suite. Use the project-native package command and allow the configured `webServer` to manage the app when appropriate. After an existing-spec attempt fails, use the diagnosis flow in [Existing artifacts run first](#existing-artifacts-run-first) before any repair rerun.
4. Classify every failure before rerunning it as a test defect, application defect, environment problem, or missing prerequisite.
5. Fix generated test defects and rerun only the affected tests. Do not weaken a valid assertion merely to make the suite green.
6. On a live or shared target, allow at most one diagnostic rerun for a materially similar failure. On a disposable local target, stop after three materially similar unsuccessful repair attempts. Treat these as one overlay failure, keep the chosen screenshot size, scroll the overlay container once, then rerun: a timeout waiting for a control inside an overlay, a strict-mode match on a repeated visible label, or an overlay that disappears after a screenshot or scroll so a later control cannot be found.
7. **Application defects:** after Allure, follow [Application defects: review and fix](#application-defects-review-and-fix). Reviewer Send (or `Apply my functional QA review`) authorizes the fix-loop on the fix-now set; do not change application code for product bugs before that. Preserve the failing reproduction before any application change, then rerun the affected tests per [fix-loop.md](references/fix-loop.md).
8. Run the final relevant suite once when finishing without an open review, or after the fix-loop verification pass. For broad suites, use fail-fast or `maxFailures` when early failure makes further execution wasteful.

An unexecuted or blocked test is never a pass. If a retry passes after an earlier failure, report it as flaky when Playwright or repeated execution demonstrates inconsistent behavior.

## Application defects: review and fix

Read [review.md](references/review.md) and [fix-loop.md](references/fix-loop.md) when this path runs. Allure remains mandatory; the review report is an additional gate for product bugs.

1. After Allure generate + open, if any failure is classified `application_defect`, create `qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS>/` using the **same** slug as the Allure directories.
2. Run `node <skill>/scripts/findings-from-run.mjs` with `--allure-results`, `--allure-report`, `--allure-url`, `--slug`, `--feature`, and `--locale zh` when the person's message is Chinese (else `en`). Edit `findings.json`: keep only product defects (drop or reclassify pure test defects), write Chinese `title` / free-text when locale is `zh`, fill `reproduction`, and add best-effort `sourceHints` by searching the repo for the route, visible copy, or failing API path.
3. Run `build-review-report.mjs --dir <review-dir> --locale …` (re-applies `qa/functional/dismissed.json`).
4. Run `review.mjs --report <review-dir>/report.json` (long-running). Tell the person the Review URL: Fix now / Debt / Dismiss / optional missed issue → **Review and send** (zh CTA: **复核并发送**).
5. When Send exits 0, or the person pastes **`Apply my functional QA review`**, run `apply-decisions.mjs` immediately in the same turn (save a pasted message to a file and pass `--from`). Then fix only the printed fix-now set per [fix-loop.md](references/fix-loop.md): change application code, re-run affected specs, mark verified findings `severity`/`resolution` `PASS`, rebuild the review report.
6. Debt goes to `qa/functional/functional-debt.md`. Dismissals go to `qa/functional/dismissed.json` (committed). Ignore `reports/review/` in `qa/functional/.gitignore`.

**Review UI contract:** implement the functional review design in `templates/review-report.html` as specified in [review.md](references/review.md) § “Review report UI” (Neutral tokens, finding cards, bottom-centre floating **复核并发送** / Review and send bar). Change the template + rebuild; do not invent a different footer or palette without updating that spec.

If the person will not review now, say so, leave Allure + `report.html` paths in the summary, and do not start the fix-loop until they Send, paste Apply, or run chat `triage.mjs` / explicitly ask to fix.

## Produce the report

After every executed run, publish an Allure report and keep authentication secrets out of it. The directory layout and required fields are in this section. Open [implementation-guide.md](references/implementation-guide.md) only when the diagnosis flow needs a contract that is not stated here. Give this run one directory name, `<function>-<YYYYMMDD-HHMMSS>`, and use it for both the raw results and the HTML report so a later run does not overwrite either.

`<function>` is the feature just tested, such as `登录`, with spaces and path separators removed. When this run covers more than one feature, join those names with `-`. The directory name must contain that feature text and must not be only digits. Write this run's result JSON, screenshots, text attachments, and `environment.properties` under `qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS>/`. From `qa/functional`, generate the HTML report with `allure generate reports/allure-results/<function>-<YYYYMMDD-HHMMSS> -o reports/allure-report/<function>-<YYYYMMDD-HHMMSS>`. Do not pass `--clean` or `--clean-alluredir`, and do not write into `reports/allure-results/` or `reports/allure-report/` themselves. After generation succeeds, open that run's report directory with a local server in the background: `allure open reports/allure-report/<function>-<YYYYMMDD-HHMMSS>`. Use `pnpm exec allure` from `qa/functional` when the global `allure` command is missing, and add `allure-commandline` only to `qa/functional/package.json` when neither is available. Do not add it to the application package. Record the `http://127.0.0.1` URL the server prints. A Playwright Test project writes results with `allure-playwright` into that results directory. A pytest project passes `--alluredir=qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS>`.

After the run, provide:

- the functional checklist and any state left not yet covered, when this request tested a page or a function;
- the exact environment and command used;
- created or changed test files;
- passed, failed, broken, skipped, blocked, and not-run counts, using the bundled report script on this run's `qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS>/widgets/summary.json`;
- application defects with reproduction steps and evidence;
- when a review pack exists: the Review URL (or `report.html` path), scorecard verdict, and that Send authorizes fixes;
- after apply + fix-loop: which finding ids were fixed or remain, plus debt;
- test-infrastructure failures separately from product failures;
- the local server URL from `allure open`, plus relevant screenshots and text attachments inside that report;
- the path of this invocation's prompt file;
- explicitly untested scope;
- the total elapsed time from the start of this skill invocation to this summary.

Say “the executed scenarios passed,” never “the application is bug-free.”

Before that summary, save the user prompt that invoked this skill. Use the same `<function>-<YYYYMMDD-HHMMSS>` name already chosen for this run's Allure directories, including when report generation was blocked after that name was chosen. Write it to `qa/functional/reports/prompts/<function>-<YYYYMMDD-HHMMSS>.md`. The file body is that prompt verbatim: the user message that started this invocation, not a paraphrase, and not later turns. An initialize-only finish, or a finish blocked before a feature name exists, uses `初始化` as `<function>` and the local time at the end of the run. Ignore `qa/functional/reports/prompts/` in version control.

For initialize-only work, report instead:

- the detected package manager, language/module style, application start command, and chosen base URL strategy;
- created or changed scaffold files and package scripts;
- whether dependency resolution, Playwright configuration loading, and test discovery were verified;
- anything intentionally deferred, especially browser installation, credentials, business specs, application startup, and CI integration;
- the exact next command for authoring or running the first test;
- the path of this invocation's prompt file;
- the total elapsed time from the start of this skill invocation to this summary.

## Bundled helpers

Run these scripts from the directory that contains this `SKILL.md`. Do not reimplement them in the target repository, and do not copy them into that repository. Python helpers author checklists; Node helpers (Node ≥ 18, no extra npm deps) drive the review pack. Artifact paths such as `qa/functional/...` are relative to the **repository under test**.

```bash
python3 scripts/checklist_from_snapshot.py \
  --function "<function>" \
  --page "<url-or-route>" \
  --snapshot <snapshot.yml> \
  --json qa/functional/tests/e2e/<function>/checklist.json

python3 scripts/page_object_from_checklist.py \
  --json qa/functional/tests/e2e/<function>/checklist.json \
  --class-name <PageClass> \
  --route <route>

python3 scripts/summarize_playwright_report.py \
  --json <playwright-results.json>

node scripts/findings-from-run.mjs \
  --out qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS> \
  --slug <function>-<YYYYMMDD-HHMMSS> \
  --feature <function> \
  --allure-results qa/functional/reports/allure-results/<function>-<YYYYMMDD-HHMMSS> \
  --locale zh|en

node scripts/build-review-report.mjs \
  --dir qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS>

node scripts/review.mjs \
  --report qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS>/report.json

node scripts/apply-decisions.mjs \
  --report qa/functional/reports/review/<function>-<YYYYMMDD-HHMMSS>/report.json
```

Run the checklist and page-object scripts only when creating the first checklist, or when the user explicitly asked to recompare the checklist and new controls are being appended. On a later run the default is that the page is unchanged, so skip both scripts and skip the live checklist comparison. A missing page object, a stale locator found by a failed run, or an explicit request to regenerate the checklist are the other reasons to edit those artifacts. After a new checklist script run, edit its JSON before drafting the page object. Set `coverage` to `in suite` for controls the named function uses, and fill `expectedResult` from an observed outcome or the user's statement. Add a validation or failure item only when that outcome was observed or stated. Leave every other control `not yet covered`. The page-object script emits only `in suite` items for the requested page, uses the visible text when it differs from the accessible name, scopes repeated labels, dedupes duplicate locator keys to one field, and refuses to overwrite an existing file. Prefer a single `in suite` row per shared visible result before generating. Run it once per page. Review its locators and method names before saving. The report script reads either Playwright JSON or this run's `qa/functional/reports/allure-report/<function>-<YYYYMMDD-HHMMSS>/widgets/summary.json`. Use the Allure summary after generation. Classify blocked and not-run cases outside that file.
