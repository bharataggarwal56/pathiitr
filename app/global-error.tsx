"use client";

import "./globals.css";

// Replaces the root layout when the layout itself fails, so it brings its own <html> and <body>.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center bg-navy p-4 font-sans text-white">
        <title>Something went wrong · PathIITR</title>
        <div className="max-w-md text-center">
          <p className="text-lg font-semibold">PathIITR</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-3 text-white/75">PathIITR couldn&apos;t load. Please try again in a moment.</p>
          <button type="button" onClick={() => retry()} className="btn-primary btn-lg mt-8">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
