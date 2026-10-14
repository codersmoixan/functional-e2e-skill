#!/usr/bin/env python3
"""Count Playwright JSON reporter results and list failure artifacts.

Called by the playwright-test-automation skill. Do not copy this script into
the target repository. Blocked and not-run cases that never entered Playwright
stay in the caller's report; this script only reads the JSON file.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def walk_suites(suites: list, found: list[dict]) -> None:
    for suite in suites or []:
        for spec in suite.get("specs") or []:
            for test in spec.get("tests") or []:
                results = test.get("results") or []
                last = results[-1] if results else {}
                attachments = []
                for result in results:
                    for attachment in result.get("attachments") or []:
                        path = attachment.get("path")
                        if path:
                            attachments.append(f"{attachment.get('name') or 'attachment'}: {path}")
                found.append(
                    {
                        "title": spec.get("title") or suite.get("title") or "",
                        "file": spec.get("file") or suite.get("file") or "",
                        "status": test.get("status") or "",
                        "outcome": last.get("status") or "",
                        "error": ((last.get("error") or {}).get("message") or "").splitlines()[:1],
                        "attachments": attachments,
                    }
                )
        walk_suites(suite.get("suites") or [], found)


def summarize(document: dict) -> dict:
    found: list[dict] = []
    walk_suites(document.get("suites") or [], found)
    counts = {"passed": 0, "failed": 0, "flaky": 0, "skipped": 0, "other": 0}
    failures = []
    artifacts = []
    for test in found:
        status = test["status"]
        if status == "expected":
            counts["passed"] += 1
        elif status == "unexpected":
            counts["failed"] += 1
            failures.append(test)
        elif status == "flaky":
            counts["flaky"] += 1
            failures.append(test)
        elif status == "skipped":
            counts["skipped"] += 1
        else:
            counts["other"] += 1
            failures.append(test)
        artifacts.extend(test["attachments"])
    return {"counts": counts, "failures": failures, "artifacts": artifacts}


def render(summary: dict) -> str:
    counts = summary["counts"]
    lines = [
        f"passed: {counts['passed']}",
        f"failed: {counts['failed']}",
        f"flaky: {counts['flaky']}",
        f"skipped: {counts['skipped']}",
        f"other: {counts['other']}",
    ]
    if summary["failures"]:
        lines.append("failures:")
        for failure in summary["failures"]:
            message = failure["error"][0] if failure["error"] else failure["outcome"]
            lines.append(f"- {failure['file']} {failure['title']} [{failure['status']}] {message}".rstrip())
    if summary["artifacts"]:
        lines.append("artifacts:")
        for artifact in summary["artifacts"]:
            lines.append(f"- {artifact}")
    return "\n".join(lines) + "\n"


def self_test() -> None:
    document = {
        "suites": [
            {
                "title": "login.spec.ts",
                "file": "tests/e2e/login.spec.ts",
                "specs": [
                    {
                        "title": "signs in",
                        "ok": False,
                        "tests": [
                            {
                                "status": "unexpected",
                                "results": [
                                    {
                                        "status": "failed",
                                        "error": {"message": "heading missing"},
                                        "attachments": [{"name": "screenshot", "path": "test-results/shot.png"}],
                                    }
                                ],
                            }
                        ],
                    }
                ],
                "suites": [
                    {
                        "specs": [
                            {
                                "title": "rejects an empty password",
                                "tests": [{"status": "expected", "results": [{"status": "passed"}]}],
                            }
                        ]
                    }
                ],
            }
        ]
    }
    summary = summarize(document)
    assert summary["counts"] == {"passed": 1, "failed": 1, "flaky": 0, "skipped": 0, "other": 0}
    text = render(summary)
    assert "screenshot: test-results/shot.png" in text
    assert "heading missing" in text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", dest="json_in", type=Path, help="Playwright JSON reporter output")
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        print("summarize_playwright_report.py self-test passed")
        return 0
    if args.json_in is None:
        print("missing --json", file=sys.stderr)
        return 1
    if not args.json_in.is_file():
        print(f"report JSON not found: {args.json_in}", file=sys.stderr)
        return 1
    document = json.loads(args.json_in.read_text(encoding="utf-8"))
    sys.stdout.write(render(summarize(document)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
