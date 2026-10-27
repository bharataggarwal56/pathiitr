"""Anonymise extracted text: data/work/text/*.md -> data/work/clean/*.md (same file names).

All files:
  - emails, Indian phone numbers, roll/enrolment numbers and personal profile URLs
    (LinkedIn /in/ and /posts/, Instagram, Twitter/X, Facebook, bare GitHub user pages) are replaced
    with [email removed], [phone removed], [roll no. removed], [profile link removed].
    LinkedIn company/school pages and GitHub repo links are kept.
  - the header's path: line is dropped (original file names can contain names).
kind=guidance files only (seniors' material):
  - people's names found by spaCy (PERSON) are replaced with "a senior", or "a professor" when
    written as Prof./Dr. + name. Matching is case-sensitive and whole-word, and a name found in
    one guidance file is replaced in every guidance file.
  - one-word names that also occur as a lowercase word in the corpus (Will, Grace, Rich...) are
    only reported as name-flagged, never replaced, unless listed in the extra-names file.
Other kinds (published casebooks, PM books, DSA notes, curriculum) get the regex passes only.

Overrides:
  scripts/anonymise_keep.txt              public terms spaCy wrongly tags as people (committed)
  data/work/anonymise_extra_names.txt     names to always remove, in every file (never committed)

Report: data/work/anonymise_report.csv (file, type, original, replacement, count). It holds the
real names that were removed, so it stays in data/work/.

Run from the repo root:  python scripts/anonymise.py [--only SUBSTRING]
"""

import argparse
import csv
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import spacy

from inventory import ROOT

TEXT_DIR = ROOT / "data" / "work" / "text"
OUT_DIR = ROOT / "data" / "work" / "clean"
REPORT_CSV = ROOT / "data" / "work" / "anonymise_report.csv"
KEEP_FILE = ROOT / "scripts" / "anonymise_keep.txt"
EXTRA_NAMES_FILE = ROOT / "data" / "work" / "anonymise_extra_names.txt"

SENIOR = "a senior"
PROFESSOR = "a professor"

URL = r"(?:https?://)?(?:www\.)?"
URL_END = r"[^\s)\]>]*"
PATTERNS = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[email removed]"),
    ("profile_url", re.compile(
        URL + r"(?:[a-z]{2}\.)?(?:linkedin\.com/(?:in|posts|pub)/|instagram\.com/|(?:twitter|x)\.com/"
        r"|(?:facebook|fb)\.com/)" + URL_END, re.I), "[profile link removed]"),
    # github.com/<user> with nothing after it is a profile; github.com/<user>/<repo> is a resource
    ("profile_url", re.compile(URL + r"github\.com/[A-Za-z0-9-]+/?(?=[\s)\]>]|$)", re.I),
     "[profile link removed]"),
    ("phone", re.compile(r"(?<![\d.,])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d.,])"),
     "[phone removed]"),
    ("roll_no", re.compile(r"(?i:roll\s*(?:no\.?|number)|enrol?l?ment\s*(?:no\.?|number)?)\s*[:#-]?\s*\d{6,10}"),
     "[roll no. removed]"),
    ("roll_no", re.compile(r"(?<![\d.,])(?:1[5-9]|2\d)\d{6}(?![\d.,])"), "[roll no. removed]"),
]

# URLs are masked during name replacement so a name never breaks a link
URL_RE = re.compile(r"(?:https?://|www\.)[^\s)\]>]+")
TITLE = r"(?:(?P<title>Prof|Dr|Mr|Mrs|Ms)\.?\s+)?"
SUFFIX = r"(?:\s+(?:Sir|Ma'?am))?"
NAME_WORD = re.compile(r"^[A-Z][a-z'’-]+$")  # "Gupta" yes; "AtCoder", "JEE", "LoR" no
STRIP_TITLES = re.compile(r"^(?:(?:Prof|Dr|Mr|Mrs|Ms)\.?\s+)+|\s+(?:Sir|Ma'?am)$")
SENTENCE_START = re.compile(r"(?:(?:^|\n)[ \t]*(?:[-*#>•]+[ \t]+)?|[.!?:]\s+)$")
# A line that is only 2-3 capitalised words, e.g. a signature or contact line under a write-up.
# spaCy often misses these, so they are candidates too.
NAME_LINE = re.compile(r"^[ \t]*(?:[-*•][ \t]*)?((?:[A-Z][a-z]+[ \t]+){1,2}[A-Z][a-z]+)[ \t]*$", re.M)
# Prof./Dr. + capitalised words is always a person, even if spaCy misses it
TITLED_NAME = re.compile(r"\b(?:Prof|Dr)\.?[ \t]+((?:[A-Z][a-z]+[ \t]+){0,3}[A-Z][a-z]+)")
DICT_FILE = "/usr/share/dict/words"  # optional; lowercase entries count as common words


def load_list(path):
    if not path.exists():
        return []
    lines = (line.strip() for line in path.read_text(encoding="utf-8").splitlines())
    return [line for line in lines if line and not line.startswith("#")]


def split_header(text):
    """Return (header lines without path:, body). Header is the leading --- ... --- block."""
    lines = text.split("\n")
    if lines[0] != "---":
        return [], text
    end = lines.index("---", 1)
    header = [line for line in lines[: end + 1] if not line.startswith("path:")]
    return header, "\n".join(lines[end + 1:])


def header_field(header, name):
    for line in header:
        if line.startswith(name + ":"):
            return line.split(":", 1)[1].strip()
    return ""


def regex_pass(body, hits):
    for kind, pattern, replacement in PATTERNS:
        def sub(m, kind=kind, replacement=replacement):
            hits[(kind, m.group(0), replacement)] += 1
            return replacement
        body = pattern.sub(sub, body)
    return body


def clean_candidate(text):
    """Normalise a candidate span to "First Last", or None if it can't be a person's name."""
    name = " ".join(text.split()).strip(" .,;:()[]\"'*_-")
    name = STRIP_TITLES.sub("", name).strip()
    name = re.sub(r"['’]s$", "", name)
    words = name.split()
    if not 1 <= len(words) <= 4 or not all(NAME_WORD.match(w) for w in words) or len(name) < 3:
        return None
    return name


def classify(name, keep, common):
    """'replace', 'flag' (contains an ordinary English word, e.g. Will, Grace) or None (ignore)."""
    low = f" {name.lower()} "
    if any(f" {k} " in low for k in keep):
        return None
    is_common = [w.lower() in common for w in name.split()]
    if all(is_common):
        # "Binary Search", "Machine Learning" are topics; a lone "Grace" might be a person
        return "flag" if len(is_common) == 1 else None
    return "flag" if any(is_common) else "replace"


def find_names(nlp, bodies):
    """Pass 1: name candidates per guidance file -> ({name: Counter(file -> detections)}, titled names)."""
    found, titled = defaultdict(Counter), set()
    for fname, body in bodies.items():
        body = URL_RE.sub(" ", body)
        for m in TITLED_NAME.finditer(body):
            name = clean_candidate(m.group(1))
            if name:
                found[name][fname] += 1
                titled.add(name)
        for m in NAME_LINE.finditer(body):
            found[m.group(1)][fname] += 1
        paragraphs = [p for p in re.split(r"\n\s*\n", body) if p.strip()]
        for doc in nlp.pipe(paragraphs, batch_size=64):
            for ent in doc.ents:
                if ent.label_ != "PERSON" or re.match(r"['’]t\b", doc.text[ent.end_char:]):
                    continue  # skip "Don" from "Don't"
                # spaCy sometimes runs a name into the next line ("Name\nRole"); judge each line
                for part in ent.text.split("\n"):
                    name = clean_candidate(part)
                    if name:
                        found[name][fname] += 1
    return found, titled


def name_regex(names):
    alternatives = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"(?<![\w@/]){TITLE}(?P<name>{alternatives}){SUFFIX}(?![\w@])")


def replace_names(body, pattern, hits):
    def sub(m, segment):
        replacement = PROFESSOR if m.group("title") in ("Prof", "Dr") else SENIOR
        if SENTENCE_START.search(segment[: m.start()][-40:]):
            replacement = replacement[0].upper() + replacement[1:]
        hits[("name", m.group(0), replacement.lower())] += 1
        return replacement

    out, last = [], 0
    for url in URL_RE.finditer(body):
        segment = body[last:url.start()]
        out.append(pattern.sub(lambda m, s=segment: sub(m, s), segment))
        out.append(url.group(0))
        last = url.end()
    segment = body[last:]
    out.append(pattern.sub(lambda m, s=segment: sub(m, s), segment))
    return "".join(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="only write files whose name contains this substring")
    args = parser.parse_args()
    start = time.time()

    keep = [k.lower() for k in load_list(KEEP_FILE)]
    extra = load_list(EXTRA_NAMES_FILE)
    files = sorted(TEXT_DIR.glob("*.md"))

    # Regex passes first, so spaCy never sees emails, phones or profile links
    docs, hits = {}, defaultdict(Counter)
    for path in files:
        header, body = split_header(path.read_text(encoding="utf-8"))
        docs[path.name] = (header, regex_pass(body, hits[path.name]))
    guidance = {f: body for f, (header, body) in docs.items() if header_field(header, "kind") == "guidance"}

    print(f"Finding names in {len(guidance)} guidance files (of {len(files)}) ...")
    nlp = spacy.load("en_core_web_sm", disable=["parser", "lemmatizer", "attribute_ruler", "tagger"])
    nlp.max_length = 2_000_000
    found, titled = find_names(nlp, guidance)

    # Ordinary English words: lowercase dictionary entries plus every lowercase word in the corpus
    common = set()
    if Path(DICT_FILE).exists():
        common.update(w for w in Path(DICT_FILE).read_text(encoding="utf-8").split() if w.islower())
    for _, body in docs.values():
        common.update(re.findall(r"\b[a-z][a-z'’-]+\b", body))

    extra_set = set(extra)
    verdicts = {n: classify(n, keep, common) for n in found if n not in extra_set}
    for n in titled:
        if verdicts.get(n) == "flag":  # a title makes it a person even if a word is common
            verdicts[n] = "replace"
    names = {n for n, v in verdicts.items() if v == "replace"} | extra_set
    for n, v in verdicts.items():
        if v == "flag":  # reported with spaCy's detection count, never replaced
            for fname, count in found[n].items():
                hits[fname][("name-flagged", n, "(kept)")] += count

    guidance_pattern = name_regex(names) if names else None
    extra_pattern = name_regex(extra_set) if extra_set else None

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    flagged = sum(v == "flag" for v in verdicts.values())
    for fname, (header, body) in docs.items():
        pattern = guidance_pattern if fname in guidance else extra_pattern
        if pattern:
            body = replace_names(body, pattern, hits[fname])
        if args.only and args.only not in fname:
            continue
        out = OUT_DIR / fname
        tmp = out.with_suffix(".md.tmp")
        tmp.write_text("\n".join(header + [body]), encoding="utf-8")
        tmp.replace(out)
        written += 1

    with REPORT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["file", "type", "original", "replacement", "count"])
        for fname in sorted(hits):
            for (kind, original, replacement), count in sorted(hits[fname].items()):
                writer.writerow([fname, kind, original, replacement, count])

    totals = Counter()
    for counter in hits.values():
        for (kind, _, _), count in counter.items():
            totals[kind] += count
    print(f"\nWrote {written} files to {OUT_DIR.relative_to(ROOT)}; report in {REPORT_CSV.relative_to(ROOT)}")
    for kind, count in sorted(totals.items()):
        print(f"  {kind:13} {count}")
    print(f"  distinct names replaced: {len(names)}, flagged (kept): {flagged}; {time.time() - start:.0f}s")


if __name__ == "__main__":
    main()
