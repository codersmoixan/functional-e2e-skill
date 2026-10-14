#!/usr/bin/env python3
"""Draft a functional checklist from a playwright-cli aria snapshot.

Called by the playwright-test-automation skill. Do not copy this script into
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

LINE_RE = re.compile(
    r"^(?P<indent>\s*)-\s+(?P<role>[A-Za-z][A-Za-z0-9]*)"
    r"(?:\s+\"(?P<name>(?:\\.|[^\"])*)\")?(?P<rest>.*)$"
)
REF_RE = re.compile(r"\[ref=(?P<ref>[A-Za-z0-9_-]+)\]")
FLAG_RE = re.compile(r"\[(?P<flag>disabled|checked|pressed|expanded|selected)(?:[= ][^\]]*)?\]")
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


def parse_controls(snapshot_text: str) -> list[dict]:
    controls: list[dict] = []
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
        if role not in INTERACTIVE_ROLES:
            pending_link = None
            continue
        name = unescape_name(match.group("name") or "")
        rest = match.group("rest") or ""
        ref_match = REF_RE.search(rest)
        flags = FLAG_RE.findall(rest)
        control = {
            "role": role,
            "name": name,
            "ref": ref_match.group("ref") if ref_match else "",
            "flags": flags,
            "url": "",
        }
        controls.append(control)
        pending_link = control if role == "link" else None
    return controls


def checklist_item(control: dict) -> dict:
    name = control["name"]
    role = control["role"]
    label = f'{role} "{name}"' if name else role
    ref = control["ref"]
    evidence_parts = []
    if ref:
        evidence_parts.append(f"ref={ref}")
    if name:
        evidence_parts.append(f"name={name}")
    if control["flags"]:
        evidence_parts.append("flags=" + ",".join(control["flags"]))
    if control["url"]:
        evidence_parts.append(f"url={control['url']}")
    action = f'use {label}'
    if role in {"button", "link", "tab", "menuitem", "menuitemcheckbox", "menuitemradio"}:
        action = f'click {label}'
    elif role in {"textbox", "searchbox", "spinbutton"}:
        action = f'fill {label}'
    elif role in {"checkbox", "radio", "switch"}:
        action = f'set {label}'
    return {
        "item": label,
        "role": role,
        "name": name,
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
                    f"Path: {item['path']}",
                    f"Coverage: {item['coverage']}",
                ]
            )
        )
    if not blocks:
        return ""
    return "\n\n".join(blocks) + "\n"


def build_document(snapshot_text: str, function: str, page: str) -> dict:
    return {
        "function": function,
        "page": page,
        "items": [checklist_item(control) for control in parse_controls(snapshot_text)],
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
    assert "option" not in roles
    text = render_text(document)
    assert "Function: 登录" in text
    assert "Coverage: not yet covered" in text


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
