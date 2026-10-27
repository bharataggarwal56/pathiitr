"""Parse the ECE curriculum structure into data/work/courses.json.

Input: data/work/clean/curriculum-structure-*.md (extract.py output of Structure_new.pdf). The PDF
tables come out one cell per line, so a row is: [S.No] code, title (one or more lines), then
subject area + credits (teaching scheme, elective and TEB lists), semester + credits (minor and
honours lists) or L-T-P + credits (open electives).

Per course: code, name, credits, year, semester, category (core | elective), subject_area,
elective_group (TEB basket), lists it appears on (scheme, pec, teb, minor, dhc, oec), topics.
topics is null: the PDF is a teaching scheme with no syllabus. Year/semester come from the
teaching scheme; electives in the lists have none (the DHC list gives an offering semester).
Placeholder rows (ECL-I, OEC-II, ECT-III, MSC/DHC-I, BTP...) go to "slots" with year, semester
and credits, not to courses.

Elective -> track mapping is kept by hand in data/work/elective_tracks.json
({code: {"tracks_helped": [...], "sub_area": "...", "reason": "..."}}) and merged in, so rerunning keeps it.

Run from the repo root:  python scripts/extract_courses.py
"""

import json
import re
from collections import Counter, defaultdict

from inventory import ROOT

CLEAN_DIR = ROOT / "data" / "work" / "clean"
OUT_JSON = ROOT / "data" / "work" / "courses.json"
TRACKS_JSON = ROOT / "data" / "work" / "elective_tracks.json"

CODE = re.compile(r"^[A-Z]{2,5}-\d{3}[A-Z]?$")
SLOT = re.compile(r"^(ECL|OEC|HSSEC|ECT)\s*-\s*[IVX]+$|^MSC/DHC\s*-\s*[IVX]+")
LTP = re.compile(r"^\d-\d-\d$")
AREAS = {"HSSC", "BSC", "PCC", "ESC", "TMI", "ESSC", "MC", "DSC", "TEB", "PEC", "OEC", "CORE",
         "HSSEC", "PCC/PEC*", "MSC/"}
CORE_AREAS = {"HSSC", "BSC", "PCC", "ESC", "TMI", "ESSC", "MC", "DSC", "CORE"}
ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4}
SECTIONS = [("List of Program Elective Courses", "pec"), ("List of Talent Enhancement Course", "teb"),
            ("Minor Specializations Courses", "minor"), ("Departmental Honours Courses", "dhc"),
            ("Open Elective Courses", "oec")]
TEB_GROUP = re.compile(r"^([A-Z]+-\d)\s*\((TEB-[A-H])\)$")


def credits(value):
    value = value.strip()
    return int(value) if value.isdigit() else value


def read_lines():
    [path] = CLEAN_DIR.glob("curriculum-structure-*.md")
    text = path.read_text(encoding="utf-8").split("\n---\n", 1)[1]
    return [line.strip() for line in text.split("\n") if line.strip()], path


def parse(lines):
    courses, slots = {}, []
    section, year, semester, group = "scheme", None, None, None
    i = 0

    def take_title(start, stop):
        """Title lines from start until stop(line) is true; returns (title, index of the stop line)."""
        j, parts = start, []
        while j < len(lines) and not stop(lines[j]):
            parts.append(lines[j])
            j += 1
        return " ".join(parts).replace("- ", "-").replace(" -", "-").strip() if parts else "", j

    while i < len(lines):
        line = lines[i]
        for heading, name in SECTIONS:
            if line.startswith(heading):
                section, year, semester, group = name, None, None, None
        if line == "Year" and i + 2 < len(lines):
            nxt = [x for x in lines[i + 1:i + 3] if x != ":"]
            if nxt and nxt[0] in ROMAN:
                year = ROMAN[nxt[0]]
        if line in ("(Autumn)", "(Spring)"):
            semester = line.strip("()")
        if m := TEB_GROUP.match(line):
            group = m.group(1) + " (" + m.group(2) + ")"

        if line.startswith("ECP-"):  # BTP/project slot split over lines: "ECP-400A/" "ECL" or "ECP-" "400B/ECL"
            title, j = take_title(i + 1, lambda x: x in AREAS)
            title = re.sub(r"^(?:400[AB]/)?ECL\s*", "", title).rstrip(" *")
            slots.append({"slot": "ECP-400" + ("A" if semester == "Autumn" else "B"), "name": title,
                          "year": year, "semester": semester, "subject_area": lines[j],
                          "credits": credits(lines[j + 1])})
            i = j + 2
            continue

        if SLOT.match(line):
            code = re.match(r"^(\S+?\s*-\s*[IVX]+)", line).group(1).replace(" ", "")
            rest = line[len(re.match(r"^\S+\s*-\s*[IVX]+", line).group(0)):].strip()
            title, j = take_title(i + 1, lambda x: x in AREAS)
            title = (rest + " " + title).strip()
            area = lines[j]
            if area == "MSC/":  # "MSC/" "DHC" then credits
                area, j = "MSC/DHC", j + 1
            slots.append({"slot": code, "name": title, "year": year, "semester": semester,
                          "subject_area": area, "credits": credits(lines[j + 1])})
            i = j + 2
            continue

        if CODE.match(line):
            code = line
            if section in ("minor", "dhc"):
                title, j = take_title(i + 1, lambda x: x in ("Autumn", "Spring"))
                offered, cr, area = lines[j], credits(lines[j + 1]), section.upper()
                i = j + 2
            elif section == "oec":
                title, j = take_title(i + 1, lambda x: bool(LTP.match(x)))
                offered, cr, area = None, credits(lines[j + 1]), "OEC"
                i = j + 2
            else:
                title, j = take_title(i + 1, lambda x: x in AREAS)
                offered, cr, area = None, credits(lines[j + 1]), lines[j]
                i = j + 2
            rec = courses.get(code)
            if rec is None:
                rec = courses[code] = {
                    "code": code, "name": title.rstrip(" *"), "credits": cr,  # * marks a PDF footnote
                    "year": year if section == "scheme" else None,
                    "semester": semester if section == "scheme" else None,
                    "category": "core" if area in CORE_AREAS else "elective",
                    "subject_area": area, "elective_group": group if section == "teb" else None,
                    "lists": [], "offered": None, "topics": None,
                }
            if section not in rec["lists"]:
                rec["lists"].append(section)
            if section == "dhc" and offered:
                rec["offered"] = offered
            continue
        i += 1
    return courses, slots


def main():
    lines, path = read_lines()
    courses, slots = parse(lines)

    mapping = json.loads(TRACKS_JSON.read_text(encoding="utf-8")) if TRACKS_JSON.exists() else {}
    for rec in courses.values():
        if rec["category"] == "elective":
            m = mapping.get(rec["code"], {})
            rec["tracks_helped"] = m.get("tracks_helped", [])
            rec["sub_area"] = m.get("sub_area")
            rec["reason"] = m.get("reason")
            rec["mapping_basis"] = "title" if m else None
    unknown = set(mapping) - set(courses)

    same_name = defaultdict(list)
    for rec in courses.values():
        same_name[rec["name"].lower()].append(rec["code"])
    dup_names = [codes for codes in same_name.values() if len(codes) > 1]

    out = {
        "source": path.name,
        "programme": "B.Tech. Electronics and Communication Engineering, IIT Roorkee",
        "notes": [
            "topics is null: the curriculum PDF has no syllabus. Add syllabus PDFs to fill it.",
            "Electives have no fixed semester; they fill the slots below. 'offered' comes from the honours (DHC) list.",
            "tracks_helped is a draft mapping from course titles only (mapping_basis: title).",
        ],
        "courses": sorted(courses.values(), key=lambda r: (r["category"], r["year"] or 9, r["code"])),
        "slots": slots,
    }
    OUT_JSON.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"{len(courses)} courses, {len(slots)} slots -> {OUT_JSON.relative_to(ROOT)}")
    print("by category:", dict(Counter(r["category"] for r in courses.values())))
    print("by list:", dict(Counter(lst for r in courses.values() for lst in r["lists"])))
    print("\ncredits per semester (scheme courses + slots, max of ranges):")
    total = Counter()
    for r in list(courses.values()) + slots:
        if r.get("year") and r.get("semester"):
            c = r["credits"]
            total[(r["year"], r["semester"])] += c if isinstance(c, int) else int(re.findall(r"\d+", str(c))[-1])
    for (y, s), c in sorted(total.items()):
        print(f"  year {y} {s:<6} {c}")
    unmapped = [r["code"] for r in courses.values() if r["category"] == "elective" and not r["tracks_helped"]]
    print(f"\nelectives with no track mapping ({len(unmapped)}): {', '.join(sorted(unmapped))}")
    if dup_names:
        print("same name, different codes:", dup_names)
    if unknown:
        print("! mapping codes not in the curriculum:", sorted(unknown))


if __name__ == "__main__":
    main()
