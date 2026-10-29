"use client";

import { useEffect } from "react";

// Links from /careers point at a skill row (#anchor), but on a client navigation the list streams
// in after the browser has looked for the anchor. Scroll to it and highlight it once it's there.
export default function ScrollToSkill() {
  useEffect(() => {
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.dataset.highlight = "true";
  }, []);
  return null;
}
