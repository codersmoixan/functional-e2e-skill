#!/usr/bin/env python3
"""Draft a functional checklist from a playwright-cli aria snapshot.

Called by the functional-e2e skill. Do not copy this script into
the target repository. It records visible controls only. Expected results stay
empty until the caller fills them from an observed outcome or the user.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

INTERACTIVE_ROLES = {
    "button",
    "checkbox",
    "combobox",
    "link",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "radio",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "textbox",
}
SCOPE_ROLES = {"heading", "region"}

LINE_RE = re.compile(
    r"^(?P<indent>\s*)-\s+(?P<role>[A-Za-z][A-Za-z0-9]*)"
    r"(?:\s+\"(?P<name>(?:\\.|[^\"])*)\")?(?P<rest>.*)$"
)
REF_RE = re.compile(r"\[ref=(?P<ref>[A-Za-z0-9_-]+)\]")
FLAG_RE = re.compile(r"\[(?P<flag>disabled|checked|pressed|expanded|selected)(?:[= ][^\]]*)?\]")
BRACKET_RE = re.compile(r"\[[^\]]*\]")
VISIBLE_RE = re.compile(r":\s*(?P<text>.+?)\s*$")
SNAPSHOT_LINK_RE = re.compile(r"\[Snapshot\]\((?P<path>[^)]+)\)")
URL_LINE_RE = re.compile(r"^\s*-\s+/url:\s*(?P<url>\S+)\s*$")


def unescape_name(value: str) -> str:
    return value.replace(r"\"", '"').replace(r"\\", "\\")


def load_snapshot_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = SNAPSHOT_LINK_RE.search(text)
    if not match:
        return text
    linked = Path(match.group("path"))
    candidates = [linked] if linked.is_absolute() else [path.parent / linked, Path.cwd() / linked]
    for candidate in candidates:
        resolved = candidate.resolve()
        if resolved.is_file():
            return resolved.read_text(encoding="utf-8")
    return text


def visible_label(rest: str) -> str:
    cleaned = BRACKET_RE.sub("", rest).strip()
    match = VISIBLE_RE.match(cleaned)
    if not match:
        return ""
    return unescape_name(match.group("text")).strip()


def display_name(accessible_name: str, visible_text: str) -> str:
    if accessible_name and visible_text and accessible_name != visible_text:
        return visible_text
    return visible_text or accessible_name


def parse_nodes(snapshot_text: str) -> list[dict]:
    nodes: list[dict] = []
    pending_link: dict | None = None
    for raw_line in snapshot_text.splitlines():
        url_match = URL_LINE_RE.match(raw_line)
        if url_match and pending_link is not None:
            pending_link["url"] = url_match.group("url")
            pending_link = None
            continue
        match = LINE_RE.match(raw_line)
        if not match:
            continue
        role = match.group("role")
        if role not in INTERACTIVE_ROLES and role not in SCOPE_ROLES:
            pending_link = None
            continue
        rest = match.group("rest") or ""
        accessible_name = unescape_name(match.group("name") or "")
        visible_text = visible_label(rest)
        ref_match = REF_RE.search(rest)
        node = {
            "indent": len(match.group("indent").replace("\t", "  ")),
            "role": role,
            "accessibleName": accessible_name,
            "visibleText": visible_text,
            "name": display_name(accessible_name, visible_text),
            "ref": ref_match.group("ref") if ref_match else "",
            "flags": FLAG_RE.findall(rest),
            "url": "",
        }
        nodes.append(node)
        pending_link = node if role == "link" else None
    return nodes


def assign_scope(nodes: list[dict]) -> None:
    scope_counts: dict[tuple[str, str], int] = {}
    for node in nodes:
        if node["role"] in SCOPE_ROLES and node["name"]:
            key = (node["role"], node["name"])
            scope_counts[key] = scope_counts.get(key, 0) + 1
    for index, node in enumerate(nodes):
        node["scope"] = ""
        node["scopeRole"] = ""
        if node["role"] not in INTERACTIVE_ROLES:
            continue
        for earlier in range(index - 1, -1, -1):
            candidate = nodes[earlier]
            if candidate["role"] not in SCOPE_ROLES or not candidate["name"]:
                continue
            if candidate["indent"] > node["indent"]:
                continue
            if scope_counts.get((candidate["role"], candidate["name"]), 0) != 1:
                continue
            node["scope"] = candidate["name"]
            node["scopeRole"] = candidate["role"]
            break


def checklist_item(control: dict, page: str) -> dict:
    name = control["name"]
    role = control["role"]
    label = f'{role} "{name}"' if name else role
    ref = control["ref"]
    evidence_parts = []
    if ref:
        evidence_parts.append(f"ref={ref}")
    if control["accessibleName"]:
        evidence_parts.append(f"accessibleName={control['accessibleName']}")
    if control["visibleText"]:
        evidence_parts.append(f"visibleText={control['visibleText']}")
    if control["scope"]:
        evidence_parts.append(f"scope={control['scopeRole']}:{control['scope']}")
    if control["flags"]:
        evidence_parts.append("flags=" + ",".join(control["flags"]))
    if control["url"]:
        evidence_parts.append(f"url={control['url']}")
    action = f"use {label}"
    if role in {"button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio"}:
        action = f"click {label}"
    elif role in {"textbox", "searchbox", "spinbutton"}:
        action = f"fill {label}"
    elif role in {"checkbox", "radio", "switch"}:
        action = f"set {label}"
    return {
        "item": label,
        "role": role,
        "name": name,
        "accessibleName": control["accessibleName"],
        "visibleText": control["visibleText"],
        "scope": control["scope"],
        "scopeRole": control["scopeRole"],
        "page": page,
        "ref": ref,
        "preconditions": "the named function's page state is visible",
        "action": action,
        "expectedResult": "",
        "evidence": "; ".join(evidence_parts),
        "path": "success",
        "coverage": "not yet covered",
        "url": control["url"],
        "flags": control["flags"],
    }


def render_text(document: dict) -> str:
    blocks = []
    for item in document["items"]:
        blocks.append(
            "\n".join(
                [
                    f"Function: {document['function']}",
                    f"Page: {document['page']}",
                    f"Item: {item['item']}",
                    f"Preconditions: {item['preconditions']}",
                    f"Action: {item['action']}",
                    f"Expected result: {item['expectedResult'] or '<observed or stated outcome>'}",
                    f"Evidence: {item['evidence']}",
                    f"Accessible name: {item.get('accessibleName') or ''}",
                    f"Visible text: {item.get('visibleText') or ''}",
                    f"Scope: {item.get('scopeRole') or ''} {item.get('scope') or ''}".rstrip(),
                    f"Path: {item['path']}",
                    f"Coverage: {item['coverage']}",
                ]
            )
        )
    if not blocks:
        return ""
    return "\n\n".join(blocks) + "\n"


def build_document(snapshot_text: str, function: str, page: str) -> dict:
    nodes = parse_nodes(snapshot_text)
    assign_scope(nodes)
    items = [checklist_item(node, page) for node in nodes if node["role"] in INTERACTIVE_ROLES]
    return {
        "function": function,
        "page": page,
        "items": items,
    }


def self_test() -> None:
    sample = """
### Page
- Page URL: https://example.com/login
### Snapshot
[Snapshot](./missing.yml)
- heading "Sign in" [level=1] [ref=e2]
- textbox "Email" [ref=e3]
- button "Sign in" [disabled] [ref=e5]
- link "Forgot password" [ref=e6]:
  - /url: /forgot
- listitem:
  - option "English" [ref=e9]
""".strip(
        "\n"
    )
    document = build_document(sample, "登录", "https://example.com/login")
    roles = [item["role"] for item in document["items"]]
    assert roles == ["textbox", "button", "link"], roles
    assert document["items"][1]["flags"] == ["disabled"]
    assert document["items"][2]["url"] == "/forgot"
    assert document["items"][0]["expectedResult"] == ""
    assert document["items"][0]["name"] == "Email"
    assert document["items"][0]["accessibleName"] == "Email"
    assert document["items"][0]["visibleText"] == ""
    assert document["items"][0]["scope"] == "Sign in"
    assert document["items"][0]["scopeRole"] == "heading"
    assert document["items"][0]["page"] == "https://example.com/login"
    assert "option" not in roles
    text = render_text(document)
    assert "Function: 登录" in text
    assert "Coverage: not yet covered" in text
    overlay = """
- heading "Billing" [level=6] [ref=e1]
- button "widget-button" [ref=e2]: Add
- heading "Shipping" [level=6] [ref=e3]
- button "widget-button" [ref=e4]: Add
- button "Save order" [ref=e5]
""".strip(
        "\n"
    )
    overlay_items = build_document(overlay, "地址", "https://example.com/account")["items"]
    assert [(item["name"], item["scope"]) for item in overlay_items] == [
        ("Add", "Billing"),
        ("Add", "Shipping"),
        ("Save order", "Shipping"),
    ]
    assert overlay_items[0]["accessibleName"] == "widget-button"
    assert overlay_items[0]["visibleText"] == "Add"
    assert overlay_items[2]["accessibleName"] == "Save order"
    assert overlay_items[2]["visibleText"] == ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, help="playwright-cli snapshot YAML or command log")
    parser.add_argument("--function", default="", help="function the user asked to test")
    parser.add_argument("--page", default="", help="page URL or route")
    parser.add_argument("--json", dest="json_out", type=Path, help="write the machine-readable checklist")
    parser.add_argument("--self-test", action="store_true", help="run the built-in parser check")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        print("checklist_from_snapshot.py self-test passed")
        return 0
    if args.snapshot is None:
        print("missing --snapshot", file=sys.stderr)
        return 1
    if not args.snapshot.is_file():
        print(f"snapshot not found: {args.snapshot}", file=sys.stderr)
        return 1
    document = build_document(load_snapshot_text(args.snapshot), args.function, args.page)
    if not document["items"]:
        print("no interactive controls found in snapshot", file=sys.stderr)
        return 1
    text = render_text(document)
    sys.stdout.write(text)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
