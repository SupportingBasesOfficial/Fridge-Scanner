#!/usr/bin/env python3
"""FridgeScanner DB-02 canonical PostgreSQL migration/test runner.

Ordering contract:
  NNNNNN__name.sql      -> (NNNNNN, 00)
  NNNNNN_01__name.sql   -> (NNNNNN, 01)
  NNNNNN_02__name.sql   -> (NNNNNN, 02)

Raw filesystem/lexicographic order is never authoritative. Duplicate logical slots,
unknown SQL filenames, and psql failures are fatal.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Iterable

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "database" / "migrations"
INTEGRITY = ROOT / "database" / "tests" / "integrity"
RLS = ROOT / "database" / "tests" / "rls"
NAME_RE = re.compile(r"^(?P<major>\d{6})(?:_(?P<sub>\d{2}))?__(?P<name>[a-z0-9][a-z0-9_-]*)\.sql$")


def ordered_sql(directory: Path) -> list[Path]:
    files = sorted(directory.glob("*.sql"))
    parsed: list[tuple[tuple[int, int], Path]] = []
    slots: dict[tuple[int, int], Path] = {}

    for path in files:
        match = NAME_RE.fullmatch(path.name)
        if not match:
            raise SystemExit(f"invalid canonical SQL filename: {path.relative_to(ROOT)}")
        slot = (int(match.group("major")), int(match.group("sub") or "0"))
        if slot in slots:
            raise SystemExit(
                "duplicate canonical SQL slot "
                f"{slot[0]:06d}_{slot[1]:02d}: "
                f"{slots[slot].relative_to(ROOT)} and {path.relative_to(ROOT)}"
            )
        slots[slot] = path
        parsed.append((slot, path))

    parsed.sort(key=lambda item: (item[0][0], item[0][1], item[1].name))
    return [path for _, path in parsed]


def run_psql(path: Path, database_url: str) -> None:
    print(f"\n==> {path.relative_to(ROOT)}", flush=True)
    subprocess.run(
        ["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-f", str(path)],
        cwd=ROOT,
        check=True,
    )


def run_many(paths: Iterable[Path], database_url: str) -> None:
    for path in paths:
        run_psql(path, database_url)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="PostgreSQL URL; defaults to DATABASE_URL",
    )
    parser.add_argument("--migrations-only", action="store_true")
    parser.add_argument("--print-order", action="store_true")
    args = parser.parse_args()

    migration_files = ordered_sql(MIGRATIONS)
    integrity_files = ordered_sql(INTEGRITY)
    rls_files = ordered_sql(RLS)

    if args.print_order:
        for group, paths in (
            ("migrations", migration_files),
            ("integrity", integrity_files),
            ("rls", rls_files),
        ):
            print(f"[{group}]")
            for path in paths:
                print(path.relative_to(ROOT))
        if not args.database_url:
            return 0

    if not args.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    subprocess.run(
        ["psql", args.database_url, "-X", "-v", "ON_ERROR_STOP=1", "-Atqc", "show server_version"],
        cwd=ROOT,
        check=True,
    )

    run_many(migration_files, args.database_url)
    if not args.migrations_only:
        run_many(integrity_files, args.database_url)
        run_many(rls_files, args.database_url)

    print("\nDB-02 PostgreSQL gate completed successfully.", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"DB-02 gate failed with exit code {exc.returncode}", file=sys.stderr)
        raise SystemExit(exc.returncode)
