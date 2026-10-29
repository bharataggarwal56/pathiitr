"""Count what is in data/work/ and write lib/site-stats.json for the landing page.

The JSON holds counts only (no names, titles or text), so it is safe to commit. Vercel can't see
data/, so re-run this after the pipeline changes and commit the new JSON; Next reads it at build time.

  tracks       career tracks in skill_matrix.json
  experiences  experience entries across structured/*.json (guidance docs)
  experiences_unique  the same, counting each (company, role, year) once
  courses      courses in courses.json
  documents    source documents in inventory.csv (duplicates already merged, kind=skip left out)

Run from the repo root:  python scripts/site_stats.py
"""

import csv
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "data" / "work"
OUT = ROOT / "lib" / "site-stats.json"


def main():
    tracks = len(json.loads((WORK / "skill_matrix.json").read_text())["tracks"])
    courses = len(json.loads((WORK / "courses.json").read_text())["courses"])

    with open(WORK / "inventory.csv", newline="") as f:
        documents = sum(1 for row in csv.DictReader(f) if row["kind"] != "skip")

    experiences = 0
    unique = set()
    for path in sorted((WORK / "structured").glob("*.json")):  # top level only, not .chunks/
        for exp in json.loads(path.read_text()).get("experiences") or []:
            experiences += 1
            unique.add(((exp.get("company") or "").strip().lower(),
                        (exp.get("role") or "").strip().lower(), exp.get("year")))

    stats = {
        "tracks": tracks,
        "experiences": experiences,
        "experiences_unique": len(unique),
        "courses": courses,
        "documents": documents,
        "generated": date.today().isoformat(),
    }
    OUT.write_text(json.dumps(stats, indent=2) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {stats}")


if __name__ == "__main__":
    main()
