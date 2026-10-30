import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Header from "@/components/Header";
import stats from "@/lib/site-stats.json";
import "./globals.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-29" -> "29 Oct 2026"
function formatDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PathIITR",
  description: "Career and academic guidance for IIT Roorkee students.",
  icons: { icon: "/iitr-logo.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased motion-reduce:scroll-auto`}
    >
      <body className="flex min-h-full flex-col">
        <Header />
        {/* Pages set their own width with `page-container`, so the home hero can run full width. */}
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-200 bg-surface print:hidden">
          <div className="page-container flex flex-col gap-1 py-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>A student project for ECC-399, IIT Roorkee.</p>
            <p className="flex gap-4">
              <span>Data updated {formatDate(stats.generated)}</span>
              <Link href="/privacy" className="text-brand underline-offset-2 hover:underline">
                Privacy
              </Link>
              <a
                href="https://github.com/bharataggarwal56/pathiitr"
                className="text-brand underline-offset-2 hover:underline"
              >
                GitHub
              </a>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
