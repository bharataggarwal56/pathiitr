// Checks on LLM-written text that must not bring in figures or links of its own.
// Pure code with no I/O, so `node --test` can run it.

// Ordinals like "2nd year" are fine; any other digit is not.
export function hasFigures(text: string): boolean {
  return /\d/.test(text.replace(/\b[1-5](st|nd|rd|th)[- ]year\b/gi, ""));
}

export function hasLinks(text: string): boolean {
  return /https?:|www\./i.test(text);
}
