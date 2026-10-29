import { BookOpen, CalendarRange, Compass, MessageSquareText, Target } from "lucide-react";

// Feature routes shown in the header nav and on the home page.
// `blurb` is what the feature does; `get` is what the student walks away with.
export const NAV_ITEMS = [
  {
    href: "/chat",
    label: "Chat",
    icon: MessageSquareText,
    blurb: "Ask questions, get answers with sources.",
    get: "Straight answers on placements, interviews and courses, each one linked to the document it came from.",
  },
  {
    href: "/careers",
    label: "Careers",
    icon: Compass,
    blurb: "Find tracks that fit your interests and skills.",
    get: "A shortlist of tracks that suit you, from Software and Quant to ECE Core.",
  },
  {
    href: "/skill-gap",
    label: "Skill gap",
    icon: Target,
    blurb: "See what to learn for a role, with resources.",
    get: "The skills a role expects, the ones you're missing, and where to learn them.",
  },
  {
    href: "/electives",
    label: "Electives",
    icon: BookOpen,
    blurb: "Pick electives that match your track.",
    get: "Electives from the official curriculum, matched to the track you're aiming for.",
  },
  {
    href: "/roadmap",
    label: "Roadmap",
    icon: CalendarRange,
    blurb: "Plan your semesters step by step.",
    get: "A semester-by-semester plan of courses, skills and prep.",
  },
] as const;
