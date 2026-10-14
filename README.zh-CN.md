# playwright-test-automation

[English](README.md)

为仓库建立可提交的 Playwright 端到端测试：初始化脚手架、编写可维护用例、执行，并产出 Allure 报告。在要测试的 Web 项目里调用本 skill。

## 功能

- 初始化或扩展一套 Playwright Test 脚手架。之后的运行沿用这套脚手架。
- 某个功能第一次被测试时，用 [playwright-cli](https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli) 打开页面，根据可见控件生成功能清单，再写 Page Object 和用例。
- 你已经写好的用例，或上一次生成的用例，直接运行，不重新生成。
- 同一个账号只登录一次，后续需要登录的功能沿用已保存的登录态。
- 每次运行都把 Allure 原始结果和 HTML 报告各自存进新目录，再用本地服务打开报告。

打开页面探查时用 `playwright-cli`（没有全局命令时用 `npx playwright cli`）。已提交的用例用项目里的 `playwright test` 或 pytest 执行。

## 如何使用

在目标项目中写明 skill 名和你要的结果：

```text
使用 playwright-test-automation 为当前项目初始化 Playwright Test 脚手架。
```

```text
使用 playwright-test-automation 测试 http://127.0.0.1:3000/address 的新增地址。
```

```text
使用 playwright-test-automation 运行 tests/e2e/新增地址/新增地址.spec.ts。
```

```text
使用 playwright-test-automation 再次测试新增地址。
```

说「回归」时使用项目配置的浏览器；说「按 CI 配置跑」时对齐仓库的 CI 设置。除此之外默认是 smoke：只用 Chromium，同一结果只保留一条代表性用例，并生成 Allure 报告。

请提供页面地址或启动命令，以及你要验证的可见结果。账号放在环境变量里。缺少这些就无法断言时，skill 会先问，不会编造预期结果。

## 一次测试请求会怎么走

1. **你提供了用例。** 直接跑这些用例，场景和断言保持不变。只有缺少 Page Object 时才补一个；只有失败是定位器过期时才改定位器。
2. **`tests/e2e/<功能>/` 里已经有清单、用例和页面对象。** 直接跑这一份。开跑前不读技能参考、不读清单全文、也不打开页面对照控件。这一次失败之后，才进入一次诊断：产品缺陷就停在失败证据上；定位器过期或找不到控件时，才打开页面核对失败的那个控件，修好页面对象，并只重跑受影响的用例。只有你明确说「重新对照清单」，或明确说控件有新增、删除或改动，才在开跑前打开页面。只有你明确说「重新生成清单」时才整份重做。功能名要和文件夹名一致，才会命中同一份用例。
3. **这个功能还没有用例。** 打开页面，写入功能清单，再写 Page Object 和用例并执行。

只说「初始化」时，配好脚手架并确认测试能被发现后就停。不会打开页面，也不会编造业务用例。

## 会写出的文件

```text
tests/
  e2e/<功能>/
    checklist.json
    <功能>.spec.ts           # pytest 项目使用 test_<功能>.py
  pages/<page-name>.page.ts
.auth/<角色>.json             # 已保存的登录态，不提交
reports/
  allure-results/<功能>-<YYYYMMDD-HHMMSS>/
  allure-report/<功能>-<YYYYMMDD-HHMMSS>/
```

Page Object 放在 `tests/pages/`，多个功能可以共用同一个页面。登录态放在 `.auth/`，下一个需要登录的功能会继续用它。登录态缺失，或站点又回到登录页时，才重新登录一次并更新这个文件。专门测试登录的用例仍会走登录步骤。

## 报告和截图

每次运行使用「功能名 + 本地时间」新建一对目录，例如 `reports/allure-report/登录-20261014-175800/`。以前的结果和报告都保留。生成后用 `allure open` 在本地服务中打开这次报告，结果说明里带上终端打印的 `http://127.0.0.1` 地址。

截图和浏览器视口默认是 1920×1080，测试报告里的图也是这个尺寸。调用时可以指定别的分辨率，例如 `1440×900`。如果只想在一条流程结束时截一张，调用时说明：

```text
使用 playwright-test-automation 测试新增地址，每个流程完成后再截一张。
```

密码和 token 不写入源码、截图文件名和文本附件。

## 依赖

- Python 3，用来运行 `scripts/` 里的脚本。
- `playwright-cli`，用来在测试运行器之外打开页面。
- `allure` 或 `npx allure`，用来生成并用本地服务打开报告。

给代理的执行说明在 [SKILL.md](SKILL.md)。脚手架、功能清单、登录态和报告的细节在 [references/implementation-guide.md](references/implementation-guide.md)。
