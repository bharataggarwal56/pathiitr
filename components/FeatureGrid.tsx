"use client";

import Link from "next/link";
import { NAV_ITEMS } from "@/lib/nav";
import { useAuthEmail } from "@/components/AuthButton";

// Home-page feature cards. Chat is the main feature, so it gets the wide first card.
// The sign-in hint shows only once we know the visitor is signed out.
export default function FeatureGrid() {
  const { email, ready } = useAuthEmail();
  const signedOut = ready && !email;

  return (
    <>
      {signedOut && (
        <p className="mt-1 text-sm font-medium text-brand">
          Sign in with your IITR account to use these tools.
        </p>
      )}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon, get }, i) => {
          const featured = i === 0;
          return (
            <li key={href} className={featured ? "sm:col-span-2" : undefined}>
              <Link
                href={href}
                className={`flex h-full flex-col gap-3 rounded-xl border p-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  featured
                    ? "border-brand/20 bg-brand-tint hover:border-brand"
                    : "border-slate-200 bg-surface hover:border-brand"
                }`}
              >
                <span
                  className={`grid size-10 place-items-center rounded-lg ${
                    featured ? "bg-brand text-white" : "bg-brand-tint text-brand"
                  }`}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className={`font-semibold text-navy ${featured ? "text-xl" : "text-lg"}`}>
                    {label}
                  </h3>
                  <p className={`mt-1 text-muted ${featured ? "max-w-md" : "text-sm"}`}>{get}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
