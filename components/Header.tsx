"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import AuthButton from "@/components/AuthButton";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-navy text-white shadow-md shadow-navy/20 print:hidden">
      {/* Mobile: logo + sign-in on one row, nav scrolls underneath. Desktop: all on one row. */}
      <div className="page-container flex flex-wrap items-center justify-between gap-x-6 pt-3 sm:flex-nowrap sm:py-2.5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
        >
          <span className="rounded-full bg-white p-0.5">
            <Image src="/iitr-logo.png" alt="IIT Roorkee logo" width={34} height={34} priority />
          </span>
          <span className="text-lg font-semibold tracking-tight">PathIITR</span>
        </Link>
        <div className="sm:order-last">
          <AuthButton />
        </div>
        <nav className="-mx-4 mt-1 w-[calc(100%+2rem)] overflow-x-auto px-2 [scrollbar-width:none] sm:mx-0 sm:mt-0 sm:ml-auto sm:w-auto sm:px-0">
          <ul className="flex gap-1 whitespace-nowrap text-sm">
            {NAV_ITEMS.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={`block border-b-2 px-2.5 py-2 sm:px-3 transition-colors ${
                      active
                        ? "border-accent text-white"
                        : "border-transparent text-white/75 hover:text-white"
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
