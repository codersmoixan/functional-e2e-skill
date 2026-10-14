#!/usr/bin/env python3
"""Draft a Playwright page object from a checklist JSON file.

Called by the playwright-test-automation skill. Do not copy this script into
the target repository. Only items marked coverage "in suite" are emitted.
Review the draft, then merge it into an existing page object instead of
replacing methods that are already maintained.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

CLICK_ROLES = {"button", "link", "menuitem", "menuitemcheckbox", "menuitemradio", "tab"}
FILL_ROLES = {"searchbox", "spinbutton", "textbox"}
CHECK_ROLES = {"checkbox", "radio", "switch"}


def ts_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def camel(value: str) -> str:
    parts = re.findall(r"[A-Za-z0-9]+", value)
    if not parts:
        return "control"
    head = parts[0].lower()
    tail = "".join(part[:1].upper() + part[1:] for part in parts[1:])
    return head + tail


def property_name(item: dict, used: set[str]) -> str:
    base = camel(f"{item.get('name') or item.get('ref') or 'control'} {item.get('role') or ''}")
    if not base[0].isalpha():
        base = f"control{base[:1].upper()}{base[1:]}"
    name = base
    suffix = 2
    while name in used:
        name = f"{base}{suffix}"
        suffix += 1
    used.add(name)
    return name


def method_name(prefix: str, prop: str) -> str:
    return prefix + prop[:1].upper() + prop[1:]


def locator_key(item: dict) -> tuple[str, str, str, str, str]:
    visible = item.get("visibleText") or item.get("name") or ""
    return (
        item.get("role") or "",
        item.get("accessibleName") or "",
        visible,
        item.get("scope") or "",
        item.get("scopeRole") or "",
    )


def page_matches(page: str, route: str) -> bool:
    if not route or not page:
        return True
    page_path = page.split("?", 1)[0].rstrip("/")
    route_path = route.split("?", 1)[0].rstrip("/")
    return page_path == route_path or page_path.endswith(route_path)


def item_page(item: dict, document: dict) -> str:
    return item.get("page") or document.get("page") or ""


def select_items(document: dict, route: str) -> list[dict]:
    selected = [item for item in document.get("items", []) if item.get("coverage") == "in suite"]
    if not selected:
        raise ValueError("no checklist items are marked in suite")
    matched = [item for item in selected if page_matches(item_page(item, document), route)]
    if not matched:
        raise ValueError("no in-suite items match this page; run the script once per page")
    pages = sorted({item_page(item, document) for item in matched if item_page(item, document)})
    if len(pages) > 1:
        joined = ", ".join(pages)
        raise ValueError(f"in-suite items span multiple pages: {joined}. Run the script once per page.")
    counts: dict[tuple[str, str, str, str, str], int] = {}
    for item in matched:
        key = locator_key(item)
        counts[key] = counts.get(key, 0) + 1
    ambiguous = [key for key, count in counts.items() if count > 1]
    if ambiguous:
        rendered = ", ".join(f"{role or 'control'} {visible or accessible or '(unnamed)'}" for role, accessible, visible, _scope, _scope_role in ambiguous)
        raise ValueError(f"ambiguous in-suite controls need a unique scope before generating locators: {rendered}")
    return matched


def inner_locator(item: dict) -> str:
    role = item.get("role") or ""
    accessible = item.get("accessibleName") or ""
    visible = item.get("visibleText") or ""
    name = item.get("name") or visible or accessible
    if role and accessible and visible and accessible != visible:
        return f"page.getByRole({ts_string(role)}).filter({{ hasText: {ts_string(visible)} }})"
    if role and name:
        return f"page.getByRole({ts_string(role)}, {{ name: {ts_string(name)} }})"
    if role:
        return f"page.getByRole({ts_string(role)})"
    return "page.locator('body')"


def locator_expression(item: dict) -> str:
    inner = inner_locator(item)
    scope = item.get("scope") or ""
    if not scope:
        return inner
    scope_role = item.get("scopeRole") or "heading"
    relative = inner[5:] if inner.startswith("page.") else inner
    return (
        f"page.getByRole({ts_string(scope_role)}, {{ name: {ts_string(scope)} }})"
        f".locator('..').{relative}"
    )


def render_class(document: dict, class_name: str, route: str) -> str:
    selected = select_items(document, route)
    used: set[str] = set()
    fields: list[tuple[str, dict]] = []
    for item in selected:
        fields.append((property_name(item, used), item))

    lines = [
        "import type { Locator, Page } from '@playwright/test';",
        "",
        f"export class {class_name} {{",
    ]
    for prop, _item in fields:
        lines.append(f"  readonly {prop}: Locator;")
    if fields:
        lines.append("")
    lines.append("  constructor(private readonly page: Page) {")
    for prop, item in fields:
        lines.append(f"    this.{prop} = {locator_expression(item)};")
    lines.append("  }")
    lines.append("")
    lines.append("  async goto() {")
    lines.append(f"    await this.page.goto({ts_string(route)});")
    lines.append("  }")
    for prop, item in fields:
        role = item.get("role") or ""
        if role in CLICK_ROLES:
            lines.extend(
                [
                    "",
                    f"  async {method_name('click', prop)}() {{",
                    f"    await this.{prop}.click();",
                    "  }",
                ]
            )
        elif role in FILL_ROLES:
            lines.extend(
                [
                    "",
                    f"  async {method_name('fill', prop)}(value: string) {{",
                    f"    await this.{prop}.fill(value);",
                    "  }",
                ]
            )
        elif role in CHECK_ROLES:
            lines.extend(
                [
                    "",
                    f"  async {method_name('set', prop)}(checked: boolean) {{",
                    f"    await this.{prop}.setChecked(checked);",
                    "  }",
                ]
            )
    lines.append("}")
    lines.append("")
    return "\n".join(lines)


def self_test() -> None:
    document = {
        "items": [
            {
                "role": "button",
                "name": "Sign in",
                "coverage": "in suite",
            },
            {
                "role": "textbox",
                "name": "Email",
                "coverage": "not yet covered",
            },
            {
                "role": "textbox",
                "name": "Email",
                "coverage": "in suite",
            },
        ]
    }
    source = render_class(document, "LoginPage", "/login")
    assert "readonly signInButton: Locator;" in source
    assert "readonly emailTextbox: Locator;" in source
    assert source.count(": Locator;") == 2
    assert "async clickSignInButton()" in source
    assert "async fillEmailTextbox(value: string)" in source
    assert "goto('/login')" in source
    mismatched = render_class(
        {
            "page": "https://example.com/form",
            "items": [
                {
                    "role": "button",
                    "name": "Save",
                    "accessibleName": "widget-button",
                    "visibleText": "Save",
                    "scope": "Details",
                    "scopeRole": "heading",
                    "page": "https://example.com/form",
                    "coverage": "in suite",
                },
                {
                    "role": "button",
                    "name": "Login",
                    "page": "https://example.com/login",
                    "coverage": "in suite",
                },
            ],
        },
        "FormPage",
        "/form",
    )
    assert "getByRole('heading', { name: 'Details' }).locator('..').getByRole('button').filter({ hasText: 'Save' })" in mismatched
    assert "Login" not in mismatched
    try:
        render_class(
            {
                "items": [
                    {"role": "button", "name": "Add", "visibleText": "Add", "coverage": "in suite"},
                    {"role": "button", "name": "Add", "visibleText": "Add", "coverage": "in suite"},
                ]
            },
            "FormPage",
            "/form",
        )
    except ValueError as error:
        assert "ambiguous in-suite controls" in str(error)
    else:
        raise AssertionError("duplicate controls should be rejected")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", dest="json_in", type=Path, help="checklist JSON from checklist_from_snapshot.py")
    parser.add_argument("--class-name", help="page object class name, such as LoginPage")
    parser.add_argument("--route", help="route passed to goto(), such as /login")
    parser.add_argument("--out", type=Path, help="write the draft only when this new file does not already exist")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        print("page_object_from_checklist.py self-test passed")
        return 0
    if args.json_in is None or not args.class_name or args.route is None:
        print("require --json, --class-name, and --route", file=sys.stderr)
        return 1
    if not args.json_in.is_file():
        print(f"checklist JSON not found: {args.json_in}", file=sys.stderr)
        return 1
    document = json.loads(args.json_in.read_text(encoding="utf-8"))
    try:
        source = render_class(document, args.class_name, args.route)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 2
    sys.stdout.write(source)
    if args.out:
        if args.out.exists():
            print(f"refusing to overwrite existing page object: {args.out}", file=sys.stderr)
            return 3
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(source, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
