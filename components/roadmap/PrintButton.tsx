"use client";

import { Printer } from "lucide-react";

// Opens the browser's print dialog, where "Save as PDF" is one of the printers.
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-primary print:hidden"
    >
      <Printer className="size-4" aria-hidden />
      Print / save as PDF
    </button>
  );
}
