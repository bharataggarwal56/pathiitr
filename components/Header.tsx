"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import AuthButton from "@/components/AuthButton";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-navy text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="rounded-full bg-white p-0.5">
            <Image src="/iitr-logo.png" alt="IIT Roorkee logo" width={36} height={36} priority />
          </span>
          <span className="text-xl font-semibold tracking-tight">PathIITR</span>
        </Link>
        <nav className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
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
        <AuthButton />
      </div>
    </header>
  );
}
