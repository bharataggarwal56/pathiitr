// Pure helpers for the electives page (no I/O, so `npm test` can run them).
// A course can sit on several lists (e.g. PEC and a TEB basket); it is shown in each group it belongs to.

export type Elective = {
  code: string;
  name: string;
  credits: number;
  elective_group: string | null;
  lists: string[];
  tracks_helped: string[];
  track_reason: string | null;
};

export type ElectiveGroup = {
  id: string;
  title: string;
  /** TEB baskets share a "TEB baskets" section heading; the others have none. */
  section: "Program electives" | "TEB baskets" | "Open electives";
  courses: Elective[];
};

export const helpsTrack = (course: Elective, track: string | null) =>
  track !== null && course.tracks_helped.includes(track);

/** Groups in display order: program electives, TEB-A..H, open electives. Empty groups are dropped. */
export function groupElectives(rows: Elective[], track: string | null): ElectiveGroup[] {
  const sorted = (courses: Elective[]) =>
    [...courses].sort(
      (a, b) => Number(helpsTrack(b, track)) - Number(helpsTrack(a, track)) || a.code.localeCompare(b.code),
    );

  const groups: ElectiveGroup[] = [
    { id: "pec", title: "Program electives", section: "Program electives", courses: rows.filter((c) => c.lists.includes("pec")) },
  ];

  const baskets = [...new Set(rows.filter((c) => c.lists.includes("teb") && c.elective_group).map((c) => c.elective_group!))].sort();
  for (const basket of baskets) {
    groups.push({
      id: basket.toLowerCase(),
      title: basket,
      section: "TEB baskets",
      courses: rows.filter((c) => c.lists.includes("teb") && c.elective_group === basket),
    });
  }

  groups.push({ id: "oec", title: "Open electives", section: "Open electives", courses: rows.filter((c) => c.lists.includes("oec")) });

  return groups.filter((g) => g.courses.length).map((g) => ({ ...g, courses: sorted(g.courses) }));
}
