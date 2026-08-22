#!/usr/bin/env python3
"""Compare Journal catalog dumps after 20260821232909.

Permitted ACL delta only:
  * PUBLIC EXECUTE removal from the three operator functions
  * anon EXECUTE removal from any of the nine canonical functions

Function definitions and every other catalog line must match. Owner,
authenticated, service_role, and sandbox grants must be unchanged.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

TARGET_NAMES = {
    "journal_backfill_accounts_and_executions",
    "journal_migrate_legacy_trades",
    "journal_import_rollback",
}
CANON_NAMES = {
    "journal_calculate_trade_v1",
    "journal_refresh_derived",
    "journal_backfill_accounts_and_executions",
    "journal_migrate_legacy_trades",
    "journal_import_rollback",
    "journal_save_trade_v1",
    "journal_import_start_v1",
    "journal_import_row_v1",
    "journal_import_finalize_v1",
}
SANDBOX = "sandbox_exec_zcjptaolpumhtlwhlemq"
ENTRY = re.compile(r"([^=,]*)=([^/]+)/([^,}]+)")


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


def parse_acl(acl: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for match in ENTRY.finditer(acl.strip("{}")):
        grantee = match.group(1) or "PUBLIC"
        out[grantee] = match.group(2)
    return out


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: journal-fn-acl-delta.py before.txt after.txt", file=sys.stderr)
        return 2
    before_other, before_fn = split_catalog(load_lines(Path(sys.argv[1])))
    after_other, after_fn = split_catalog(load_lines(Path(sys.argv[2])))
    if before_other != after_other:
        print("non-function journal catalog changed after 20260821232909", file=sys.stderr)
        for left, right in zip(before_other, after_other):
            if left != right:
                print(f"- {left}", file=sys.stderr)
                print(f"+ {right}", file=sys.stderr)
                break
        return 1
    if set(before_fn) != set(after_fn):
        print("journal function set changed after 20260821232909", file=sys.stderr)
        return 1
    for key, old_line in sorted(before_fn.items()):
        name = key.split("|", 1)[0]
        new_line = after_fn[key]
        old_meta, old_acl, old_def = parse_fn(old_line)
        new_meta, new_acl, new_def = parse_fn(new_line)
        if old_meta != new_meta or old_def != new_def:
            print(f"function definition or identity changed on {key}", file=sys.stderr)
            return 1
        old_map = parse_acl(old_acl)
        new_map = parse_acl(new_acl)
        if name not in CANON_NAMES:
            if old_line != new_line:
                print(f"non-canonical function catalog changed on {key}", file=sys.stderr)
                return 1
            continue
        if "PUBLIC" in new_map:
            print(f"PUBLIC EXECUTE remains on {key}: {new_acl}", file=sys.stderr)
            return 1
        if "anon" in new_map:
            print(f"anon EXECUTE remains on {key}: {new_acl}", file=sys.stderr)
            return 1
        if "PUBLIC" in old_map and name not in TARGET_NAMES:
            print(f"unexpected PUBLIC EXECUTE on non-target {key}", file=sys.stderr)
            return 1
        old_rest = {k: v for k, v in old_map.items() if k not in {"PUBLIC", "anon"}}
        new_rest = {k: v for k, v in new_map.items() if k not in {"PUBLIC", "anon"}}
        if old_rest != new_rest:
            print(f"protected function grants changed on {key}", file=sys.stderr)
            print(f"- {old_acl}", file=sys.stderr)
            print(f"+ {new_acl}", file=sys.stderr)
            return 1
        if "authenticated" not in new_map or "service_role" not in new_map:
            print(f"authenticated/service_role EXECUTE missing on {key}: {new_acl}", file=sys.stderr)
            return 1
        if SANDBOX in old_map and SANDBOX not in new_map:
            print(f"sandbox EXECUTE removed on {key}", file=sys.stderr)
            return 1
        extra = set(new_map) - set(old_map)
        if extra:
            print(f"unexpected ACL principal added on {key}: {sorted(extra)}", file=sys.stderr)
            return 1
        removed = set(old_map) - set(new_map)
        if removed - {"PUBLIC", "anon"}:
            print(f"unauthorized principal removed on {key}: {sorted(removed)}", file=sys.stderr)
            return 1
    print(
        "post-remediation catalog delta is limited to PUBLIC EXECUTE "
        "removal on the three operator functions and anon EXECUTE "
        "removal on the nine canonical functions"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
