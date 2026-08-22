#!/usr/bin/env python3
"""Compare Journal catalog dumps after 20260821183316.

Allows only the confirmed authenticated elevated-grant removal on the five
legacy tables. Any other schema, ACL, policy, function, or data delta fails.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

LEGACY = {
    "public.journal_trades",
    "public.journal_notes",
    "public.journal_equity_snapshots",
    "public.journal_stats_cache",
    "public.journal_imports",
}
CRUD = set("arwd")
ELEVATED = set("Dxtm")
AUTH_GRANT = re.compile(r"authenticated=([^/,}]+)/([^,}]+)")


def load_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def split_catalog(lines: list[str]) -> tuple[list[str], dict[str, str]]:
    other: list[str] = []
    acls: dict[str, str] = {}
    for line in lines:
        if line.startswith("acl|"):
            parts = line.split("|", 2)
            acls[parts[1]] = line
        else:
            other.append(line)
    return other, acls


def auth_privs(line: str) -> str:
    match = AUTH_GRANT.search(line)
    return match.group(1) if match else ""


def without_auth(line: str) -> str:
    return AUTH_GRANT.sub(r"authenticated=<elided>/\2", line, count=1)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: journal-acl-delta.py before.txt after.txt", file=sys.stderr)
        return 2
    before = Path(sys.argv[1])
    after = Path(sys.argv[2])
    before_other, before_acl = split_catalog(load_lines(before))
    after_other, after_acl = split_catalog(load_lines(after))
    if before_other != after_other:
        print("non-ACL journal catalog changed after 20260821183316", file=sys.stderr)
        for left, right in zip(before_other, after_other):
            if left != right:
                print(f"- {left}", file=sys.stderr)
                print(f"+ {right}", file=sys.stderr)
                break
        if len(before_other) != len(after_other):
            print(
                f"non-ACL line count {len(before_other)} -> {len(after_other)}",
                file=sys.stderr,
            )
        return 1
    if set(before_acl) != set(after_acl):
        print("journal ACL table set changed after 20260821183316", file=sys.stderr)
        return 1
    changed: list[str] = []
    for table, old_line in sorted(before_acl.items()):
        new_line = after_acl[table]
        if old_line == new_line:
            continue
        changed.append(table)
        if table not in LEGACY:
            print(f"unexpected ACL change on {table}", file=sys.stderr)
            print(f"- {old_line}", file=sys.stderr)
            print(f"+ {new_line}", file=sys.stderr)
            return 1
        if without_auth(old_line) != without_auth(new_line):
            print(f"non-authenticated ACL changed on {table}", file=sys.stderr)
            print(f"- {old_line}", file=sys.stderr)
            print(f"+ {new_line}", file=sys.stderr)
            return 1
        old_privs = set(auth_privs(old_line))
        new_privs = set(auth_privs(new_line))
        if not CRUD <= new_privs:
            print(f"authenticated lost CRUD on {table}: {sorted(new_privs)}", file=sys.stderr)
            return 1
        if new_privs & ELEVATED:
            print(
                f"authenticated still has elevated grants on {table}: {sorted(new_privs & ELEVATED)}",
                file=sys.stderr,
            )
            return 1
        if old_privs - new_privs - ELEVATED:
            print(
                f"authenticated lost unexpected grants on {table}: {sorted(old_privs - new_privs)}",
                file=sys.stderr,
            )
            return 1
        if new_privs - old_privs:
            print(
                f"authenticated gained unexpected grants on {table}: {sorted(new_privs - old_privs)}",
                file=sys.stderr,
            )
            return 1
    extra = set(changed) - LEGACY
    if extra:
        print(f"ACL changed on non-legacy tables: {sorted(extra)}", file=sys.stderr)
        return 1
    print(
        "post-remediation catalog delta is limited to authenticated elevated "
        f"grants on {len(changed)} of 5 legacy tables"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
