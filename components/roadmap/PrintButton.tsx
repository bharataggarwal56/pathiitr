"use client";

import { Printer } from "lucide-react";

// Opens the browser's print dialog, where "Save as PDF" is one of the printers.
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-accent-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent print:hidden"
    >
      <Printer className="size-4" aria-hidden />
      Print / save as PDF
    </button>
  );
}
