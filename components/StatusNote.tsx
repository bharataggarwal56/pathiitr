import { Loader2 } from "lucide-react";

// Shared loading / error / empty messages, so every page says "wait", "failed" and "nothing here" the same way.
export default function StatusNote({
  kind,
  children,
  action,
}: {
  kind: "loading" | "error" | "empty";
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  if (kind === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {children}
      </p>
    );
  }
  if (kind === "empty") {
    return <p className="rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-muted">{children}</p>;
  }
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border-l-4 border-accent bg-surface p-3 text-ink shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p>{children}</p>
      {action}
    </div>
  );
}
