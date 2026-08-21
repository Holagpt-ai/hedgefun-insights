#!/usr/bin/env python3
"""Compare Journal catalog dumps after 20260816191400.

Allows only removal of PUBLIC/anon effective EXECUTE from the three operator
functions. Function definitions and every other catalog line must match.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

TARGETS = {
    "journal_backfill_accounts_and_executions|uuid",
    "journal_migrate_legacy_trades|",
    "journal_import_rollback|uuid",
}
PUBLIC_GRANT = re.compile(r"(?:\{|,)=X/[^,}]+")


def load_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def split_catalog(lines: list[str]) -> tuple[list[str], dict[str, str]]:
    other: list[str] = []
    fns: dict[str, str] = {}
    for line in lines:
        if line.startswith("fn|"):
            rest = line[3:]
            def_idx = rest.find("|def=")
            head = rest if def_idx < 0 else rest[:def_idx]
            parts = head.split("|", 2)
            key = f"{parts[0]}|{parts[1]}"
            fns[key] = line
        else:
            other.append(line)
    return other, fns


def parse_fn(line: str) -> tuple[str, str, str]:
    rest = line[3:]
    def_idx = rest.find("|def=")
    if def_idx < 0:
        raise ValueError(f"missing def= in {line[:80]}")
    head, definition = rest[:def_idx], rest[def_idx + 5 :]
    acl_idx = head.find("|acl=")
    if acl_idx < 0:
        raise ValueError(f"missing acl= in {line[:80]}")
    return head[:acl_idx], head[acl_idx + 5 :], definition


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: journal-fn-acl-delta.py before.txt after.txt", file=sys.stderr)
        return 2
    before_other, before_fn = split_catalog(load_lines(Path(sys.argv[1])))
    after_other, after_fn = split_catalog(load_lines(Path(sys.argv[2])))
    if before_other != after_other:
        print("non-function journal catalog changed after 20260816191400", file=sys.stderr)
        for left, right in zip(before_other, after_other):
            if left != right:
                print(f"- {left}", file=sys.stderr)
                print(f"+ {right}", file=sys.stderr)
                break
        return 1
    if set(before_fn) != set(after_fn):
        print("journal function set changed after 20260816191400", file=sys.stderr)
        return 1
    changed: list[str] = []
    for key, old_line in sorted(before_fn.items()):
        new_line = after_fn[key]
        if old_line == new_line:
            if key in TARGETS:
                print(f"expected PUBLIC EXECUTE removal on {key}", file=sys.stderr)
                return 1
            continue
        changed.append(key)
        if key not in TARGETS:
            print(f"unexpected function catalog change on {key}", file=sys.stderr)
            print(f"- {old_line[:200]}", file=sys.stderr)
            print(f"+ {new_line[:200]}", file=sys.stderr)
            return 1
        old_meta, old_acl, old_def = parse_fn(old_line)
        new_meta, new_acl, new_def = parse_fn(new_line)
        if old_meta != new_meta:
            print(f"function identity/volatility/security/path changed on {key}", file=sys.stderr)
            return 1
        if old_def != new_def:
            print(f"function definition changed on {key}", file=sys.stderr)
            return 1
        if not PUBLIC_GRANT.search(old_acl):
            print(f"before-state missing PUBLIC EXECUTE on {key}: {old_acl}", file=sys.stderr)
            return 1
        if PUBLIC_GRANT.search(new_acl):
            print(f"PUBLIC EXECUTE remains on {key}: {new_acl}", file=sys.stderr)
            return 1
        if "authenticated=X/" not in new_acl:
            print(f"authenticated EXECUTE missing on {key}: {new_acl}", file=sys.stderr)
            return 1
        if "service_role=X/" not in new_acl:
            print(f"service_role EXECUTE missing on {key}: {new_acl}", file=sys.stderr)
            return 1
        if "authenticated=X/" not in old_acl or "service_role=X/" not in old_acl:
            print(f"before-state missing approved EXECUTE on {key}: {old_acl}", file=sys.stderr)
            return 1
    if set(changed) != TARGETS:
        print(
            f"function ACL delta set mismatch: changed={sorted(changed)} expected={sorted(TARGETS)}",
            file=sys.stderr,
        )
        return 1
    print(
        "post-remediation catalog delta is limited to PUBLIC EXECUTE "
        "removal on the three operator functions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
