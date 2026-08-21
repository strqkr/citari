#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen-full-script.py - regenerates database/scripts/08-full-script.sql by
literal concatenation of 01-07, with section headers. Usage:

    python3 scripts/gen-full-script.py
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = REPO_ROOT / "database" / "scripts"
OUTPUT_PATH = SCRIPTS_DIR / "08-full-script.sql"

SOURCES = [
    ("01", "DATABASE CREATION", "01-create-database.sql"),
    ("02", "TABLES AND RELATIONSHIPS", "02-create-tables.sql"),
    ("03", "SEED DATA", "03-seed-data.sql"),
    ("04", "STORED PROCEDURES", "04-procedures.sql"),
    ("05", "FUNCTIONS", "05-functions.sql"),
    ("06", "VIEWS", "06-views.sql"),
    ("07", "TRIGGERS", "07-triggers.sql"),
]

HEADER = """-- 08-full-script.sql
-- Project: Citari
-- Single script that rebuilds the entire database from scratch, in order:
-- database creation, the 24 tables and their relationships, seed data,
-- stored procedures, functions, views, and triggers.
"""


def main():
    parts = [HEADER]
    for num, title, filename in SOURCES:
        src = (SCRIPTS_DIR / filename).read_text(encoding="utf-8-sig")
        parts.append(
            f"\n-- SECTION {num}. {title}\n\n"
            f"{src.rstrip()}\n"
        )
    OUTPUT_PATH.write_text("".join(parts), encoding="utf-8-sig")
    print(f"[gen-full-script] generated {OUTPUT_PATH.relative_to(REPO_ROOT)} ... OK")


if __name__ == "__main__":
    main()
