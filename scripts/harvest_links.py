"""Collect every link in our documents: data/work/clean/*.md + data/work/structured/*.json -> data/work/links.csv.

Used to pick learning resources for the skill matrix: a resource URL is only allowed if it is in
links.csv, so every link the app shows can be traced back to one of our documents.

Per link: url, title (link text, or the structured title), heading (nearest Markdown heading above
it, for context when the link text is just "[1]" or "Link"), the line it is on, the document's
display_title, tracks and kind, where it was found (clean / structured) and host_type:
  public  - an ordinary website, course or playlist
  drive   - a Google Drive/Docs file shared by seniors (shown to logged-in users only, prefer public)
  ip      - a bare IP address host (often unofficial copies of books; not used as a resource)
Dropped: entries that are not http(s) URLs (the LLM sometimes lists "site - problem" as a link), resume links (they point to seniors' personal documents) and anything the anonymise regex
pass would change (emails, profile links). Structured files that fail to parse are skipped, since
structure.py may be writing them while this runs.

Run from the repo root:  python scripts/harvest_links.py
"""

import csv
import json
import re
from collections import Counter

from anonymise import header_field, regex_pass, split_header
from inventory import ROOT

CLEAN_DIR = ROOT / "data" / "work" / "clean"
STRUCTURED_DIR = ROOT / "data" / "work" / "structured"
OUT_CSV = ROOT / "data" / "work" / "links.csv"

MD_LINK = re.compile(r"\[((?:[^\[\]]|\[[^\]]*\])*)\]\((https?://[^\s)]+)\)")
BARE_URL = re.compile(r"(?<![(\[])\bhttps?://[^\s)\]>\"']+")
HEADING = re.compile(r"^#{1,6}\s+(.*)")
RESUME = re.compile(r"resume|\bcv\b", re.I)
FIELDS = ["url", "title", "heading", "line", "display_title", "tracks", "kind", "found_in", "host_type"]


def host_type(url):
    if re.match(r"https?://(?:drive|docs)\.google\.com/", url):
        return "drive"
    if re.match(r"https?://\d+\.\d+\.\d+\.\d+", url):
        return "ip"
    return "public"


def is_clean(url):
    return regex_pass(url, Counter()) == url


def from_clean(path):
    header, body = split_header(path.read_text(encoding="utf-8"))
    meta = {"display_title": header_field(header, "display_title"),
            "tracks": header_field(header, "tracks"), "kind": header_field(header, "kind")}
    heading = ""
    for line in body.split("\n"):
        m = HEADING.match(line)
        if m and not m.group(1).startswith("Page "):
            heading = m.group(1).strip()
        found = [(t.strip(), u) for t, u in MD_LINK.findall(line)]
        found += [("", u) for u in BARE_URL.findall(MD_LINK.sub("", line))]
        for title, url in found:
            yield {"url": url.rstrip(".,;"), "title": title, "heading": heading,
                   "line": line.strip()[:200], "found_in": "clean", **meta}


def from_structured(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = {"display_title": data.get("display_title", ""), "tracks": "; ".join(data.get("tracks") or []),
            "kind": data.get("kind", "")}
    for link in data.get("links") or []:
        yield {"url": link["url"], "title": link.get("title") or "", "heading": "", "line": "",
               "found_in": "structured", **meta}


def main():
    rows, seen, dropped = [], set(), Counter()
    sources = [(p, from_clean) for p in sorted(CLEAN_DIR.glob("*.md"))]
    sources += [(p, from_structured) for p in sorted(STRUCTURED_DIR.glob("*.json"))]
    for path, reader in sources:
        try:
            links = list(reader(path))
        except (json.JSONDecodeError, KeyError) as e:
            print(f"  skipped {path.name}: {e}")
            continue
        for row in links:
            key = (row["url"], row["display_title"])
            if key in seen:
                continue
            seen.add(key)
            if not row["url"].startswith(("http://", "https://")):
                dropped["not_a_url"] += 1
            elif RESUME.search(row["title"] + " " + row["url"]):
                dropped["resume"] += 1
            elif not is_clean(row["url"]):
                dropped["personal"] += 1
            else:
                rows.append({**row, "host_type": host_type(row["url"])})

    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"{len(rows)} links -> {OUT_CSV.relative_to(ROOT)}  (dropped: {dict(dropped) or 'none'})")
    print("by host type:", dict(Counter(r["host_type"] for r in rows)))
    by_track = Counter(t.strip() for r in rows for t in r["tracks"].split(";") if t.strip())
    print("by track:", dict(by_track.most_common()))


if __name__ == "__main__":
    main()
