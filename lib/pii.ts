// Port of the regexes in scripts/anonymise.py (PATTERNS). Keep the two in sync.
// Names are not covered: those need spaCy and only run in the Python pipeline.
const URL = String.raw`(?:https?://)?(?:www\.)?`;
const URL_END = String.raw`[^\s)\]>]*`;

const PATTERNS: RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  new RegExp(
    URL +
      String.raw`(?:[a-z]{2}\.)?(?:linkedin\.com/(?:in|posts|pub)/|instagram\.com/|(?:twitter|x)\.com/|(?:facebook|fb)\.com/)` +
      URL_END,
    "i",
  ), // profile link
  new RegExp(URL + String.raw`github\.com/[A-Za-z0-9-]+/?(?=[\s)\]>]|$)`, "i"), // GitHub profile
  /(?<![\d.,])(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?![\d.,])/, // phone
  /(?:roll\s*(?:no\.?|number)|enrol?l?ment\s*(?:no\.?|number)?)\s*[:#-]?\s*\d{6,10}/i, // roll no. with label
  /(?<![\d.,])(?:1[5-9]|2\d)\d{6}(?![\d.,])/, // bare roll no.
];

// True if the text holds an email, phone, roll number or personal profile link.
export function containsPersonalInfo(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text));
}
