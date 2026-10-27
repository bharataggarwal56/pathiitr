"""Check data/work/skill_matrix.json (drafted by hand) and print a per-track review table.

Checks:
  - shape: tracks -> core / nice_to_have -> skills with skill, evidence, resources (title, url, source)
  - tracks are the app's career tracks (inventory.TRACK_BY_FOLDER)
  - every resource URL is in data/work/links.csv (run harvest_links.py first) with the same source
    document, so each link traces back to one of our documents; ip-hosted links are rejected
  - every evidence entry is a document display_title or "JD: <file stem>" for a file in data/raw/jds/
  - every skill has evidence; no string changes under anonymise.py's regex pass (no PII)
Skills with no resource are allowed but listed as gaps.

Run from the repo root:  python scripts/check_skill_matrix.py
"""

import csv
import json
import sys
from collections import Counter

from anonymise import regex_pass
from inventory import ROOT, TRACK_BY_FOLDER

MATRIX = ROOT / "data" / "work" / "skill_matrix.json"
LINKS_CSV = ROOT / "data" / "work" / "links.csv"
INVENTORY_CSV = ROOT / "data" / "work" / "inventory.csv"
JD_DIR = ROOT / "data" / "raw" / "jds"
LEVELS = ["core", "nice_to_have"]
MAX_RESOURCES = 3


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for v in value.values():
            yield from strings(v)
    elif isinstance(value, list):
        for v in value:
            yield from strings(v)


def main():
    matrix = json.loads(MATRIX.read_text(encoding="utf-8"))
    with LINKS_CSV.open(encoding="utf-8") as f:
        links = list(csv.DictReader(f))
    known = {(r["url"], r["display_title"]): r["host_type"] for r in links}
    with INVENTORY_CSV.open(encoding="utf-8") as f:
        titles = {r["display_title"] for r in csv.DictReader(f)}
    jds = {"JD: " + p.stem for p in JD_DIR.glob("*.txt")}

    errors, gaps, hosts = [], [], Counter()
    unknown_tracks = set(matrix["tracks"]) - set(TRACK_BY_FOLDER.values())
    if unknown_tracks:
        errors.append(f"unknown tracks: {sorted(unknown_tracks)}")

    print(f"{'track':<15} {'core':>5} {'nice':>5} {'links':>6} {'no link':>8}")
    for track, levels in matrix["tracks"].items():
        counts = Counter()
        for level in LEVELS:
            for item in levels.get(level, []):
                where = f"{track} / {item.get('skill')}"
                counts[level] += 1
                if not item.get("skill") or not item.get("evidence"):
                    errors.append(f"{where}: needs skill and evidence")
                for ev in item.get("evidence", []):
                    if ev not in titles and ev not in jds:
                        errors.append(f"{where}: unknown evidence {ev!r}")
                resources = item.get("resources", [])
                if len(resources) > MAX_RESOURCES:
                    errors.append(f"{where}: more than {MAX_RESOURCES} resources")
                if not resources:
                    gaps.append(where)
                for res in resources:
                    host = known.get((res.get("url"), res.get("source")))
                    if host is None:
                        errors.append(f"{where}: {res.get('url')} not in links.csv for {res.get('source')!r}")
                    elif host == "ip":
                        errors.append(f"{where}: ip-hosted link {res['url']}")
                    else:
                        hosts[host] += 1
                        counts["links"] += 1
        print(f"{track:<15} {counts['core']:>5} {counts['nice_to_have']:>5} {counts['links']:>6} "
              f"{sum(1 for g in gaps if g.startswith(track + ' /')):>8}")

    for s in strings(matrix):
        if regex_pass(s, Counter()) != s:
            errors.append(f"possible PII: {s[:80]!r}")

    print(f"\nresources by host: {dict(hosts)}")
    print(f"\nskills with no resource in our documents ({len(gaps)}):")
    for g in gaps:
        print("  -", g)
    if errors:
        print(f"\n{len(errors)} error(s):")
        for e in errors:
            print("  !", e)
        sys.exit(1)
    print("\nOK: 0 errors")


if __name__ == "__main__":
    main()
