#!/usr/bin/env python3
"""
Build-time helper for the Schelp landing page mockup.

Scans the local backend storage at
    c:\\src\\aipodcastforme\\app\\storage\\users\\user_*\\<job_id>\\
for podcast jobs and prints a curated shortlist (title + cover size + type).
On `--copy slot=jobid[,slot=jobid...]` it copies the chosen `podcast_cover.png`
files to `c:\\src\\schelp_one_page_vercel\\assets\\podcasts\\{slot}.png`.

Usage:
    python extract_podcasts.py                # list all 24 jobs as a table
    python extract_podcasts.py --json         # dump everything as JSON (for piping)
    python extract_podcasts.py --copy hero=32_409f58e2,sug1=32_aabe8...,sug2=...

This script is **not** part of the live landing page — it runs once locally to
materialise the 7 cover files that the static site then references.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

BACKEND_STORAGE = Path(r"c:\src\aipodcastforme\app\storage\users")
LANDING_ASSETS = Path(r"c:\src\schelp_one_page_vercel\assets\podcasts")


def scan_jobs() -> list[dict]:
    """Walk the backend storage and yield one dict per podcast job with metadata."""
    jobs: list[dict] = []
    if not BACKEND_STORAGE.exists():
        sys.exit(f"Backend storage not found: {BACKEND_STORAGE}")

    for user_dir in sorted(BACKEND_STORAGE.iterdir()):
        if not user_dir.is_dir():
            continue
        for job_dir in sorted(user_dir.iterdir()):
            if not job_dir.is_dir():
                continue
            meta_path = job_dir / "metadata.json"
            cover_path = job_dir / "podcast_cover.png"
            if not meta_path.exists():
                continue
            try:
                with open(meta_path, "r", encoding="utf-8") as fh:
                    meta = json.load(fh)
            except Exception as exc:
                print(f"  ! could not parse {meta_path}: {exc}", file=sys.stderr)
                continue

            title = (
                meta.get("title")
                or _nested(meta, "editorial_review", "title")
                or _nested(meta, "title_data", "title")
                or ""
            )
            ptype = meta.get("podcast_type", "")
            cover_size = cover_path.stat().st_size if cover_path.exists() else 0

            jobs.append(
                {
                    "user": user_dir.name,
                    "job_id": job_dir.name,
                    "short_id": job_dir.name.split("_", 1)[1][:10] if "_" in job_dir.name else job_dir.name[:10],
                    "title": title,
                    "type": ptype,
                    "cover_path": str(cover_path),
                    "cover_size": cover_size,
                    "has_cover": cover_path.exists(),
                }
            )
    return jobs


def _nested(d: dict, *keys: str):
    cur = d
    for k in keys:
        if isinstance(cur, dict) and k in cur:
            cur = cur[k]
        else:
            return None
    return cur if isinstance(cur, str) else None


def print_table(jobs: list[dict]) -> None:
    print(f"\nFound {len(jobs)} jobs.\n")
    print(f"{'#':>3} {'job_id':<40} {'cover (KB)':>10}  {'type':<14}  title")
    print("-" * 130)
    for i, j in enumerate(jobs):
        kb = j["cover_size"] / 1024
        title = (j["title"] or "").strip().replace("\n", " ")
        print(f"{i:>3} {j['job_id']:<40} {kb:>7.1f}      {j['type'][:13]:<14}  {title[:70]}")


def copy_selection(selection: dict[str, str], jobs: list[dict]) -> None:
    LANDING_ASSETS.mkdir(parents=True, exist_ok=True)
    by_jobid = {j["job_id"]: j for j in jobs}
    by_short = {j["short_id"]: j for j in jobs}

    manifest: list[dict] = []
    for slot, job_ref in selection.items():
        job = by_jobid.get(job_ref) or by_short.get(job_ref)
        if job is None:
            # also accept "user_xx_yyy/job_id" form
            for j in jobs:
                if f"{j['user']}/{j['job_id']}" == job_ref or j["job_id"].startswith(job_ref):
                    job = j
                    break
        if job is None:
            print(f"  ! slot {slot}: no match for {job_ref!r}", file=sys.stderr)
            continue

        dst = LANDING_ASSETS / f"{slot}.png"
        shutil.copyfile(job["cover_path"], dst)
        print(f"  + {slot}.png  ({job['cover_size'] / 1024:.1f} KB)  <- {job['title'][:60]}")
        manifest.append(
            {
                "slot": slot,
                "title": job["title"],
                "type": job["type"],
                "file": f"assets/podcasts/{slot}.png",
            }
        )

    manifest_path = LANDING_ASSETS / "podcasts.json"
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2, ensure_ascii=False)
    print(f"\nWrote manifest: {manifest_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Dump all jobs as JSON to stdout")
    parser.add_argument(
        "--copy",
        type=str,
        default=None,
        help="Comma-separated slot=jobid pairs (e.g. hero=32_409f58e,sug1=...)",
    )
    args = parser.parse_args()

    jobs = scan_jobs()

    if args.json:
        print(json.dumps(jobs, indent=2, ensure_ascii=False))
        return

    if args.copy:
        selection: dict[str, str] = {}
        for pair in args.copy.split(","):
            if "=" not in pair:
                continue
            slot, jobid = pair.split("=", 1)
            selection[slot.strip()] = jobid.strip()
        copy_selection(selection, jobs)
        return

    print_table(jobs)


if __name__ == "__main__":
    main()
