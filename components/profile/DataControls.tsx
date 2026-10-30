"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { clearChatHistory, deleteMyData, type DataState } from "@/app/profile/actions";

const BTN =
  "inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60";

// Two destructive actions, each behind a native <dialog> confirm.
export default function DataControls() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Confirm
        label="Clear chat history"
        title="Clear your chat history?"
        action={clearChatHistory}
        confirmLabel="Clear chat history"
      >
        <p>This deletes all your conversations, the messages in them and your thumbs up/down feedback.</p>
        <p>Your profile and career matches are kept. This can&apos;t be undone.</p>
      </Confirm>
      <Confirm
        label="Delete my data"
        title="Delete all your data?"
        action={deleteMyData}
        confirmLabel="Yes, delete my data"
        danger
      >
        <p>This permanently deletes:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>your profile: year, branch, interests, target tracks and skill ratings</li>
          <li>your career matches and skill-gap summaries</li>
          <li>all your chat history and feedback</li>
        </ul>
        <p>
          <strong>Your Google sign-in account is not deleted.</strong> You stay signed in and can set up a new profile any
          time. This can&apos;t be undone.
        </p>
      </Confirm>
    </div>
  );
}

function Confirm({
  label,
  title,
  action,
  confirmLabel,
  danger,
  children,
}: {
  label: string;
  title: string;
  action: () => Promise<DataState>;
  confirmLabel: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const result = await action(); // deleteMyData redirects to "/" instead of returning
      if (result.error) return setError(result.error);
      setMessage(result.message ?? null);
      dialog.current?.close();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setMessage(null);
          dialog.current?.showModal();
        }}
        className={`${BTN} w-full sm:w-auto ${
          danger
            ? "border-red-300 bg-surface text-red-700 hover:bg-red-50"
            : "border-slate-300 bg-surface text-navy hover:border-brand"
        }`}
      >
        <Trash2 className="size-4" aria-hidden />
        {label}
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm font-medium text-navy">
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => pending && e.preventDefault()}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-surface p-0 text-ink shadow-xl backdrop:bg-navy/60"
      >
        <div className="space-y-3 p-5 text-sm">
          <h2 className="text-lg font-semibold text-navy">{title}</h2>
          {children}
          {error && (
            <p role="alert" className="rounded-lg border-l-4 border-accent bg-page p-3">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className={`${BTN} border-slate-300 bg-surface text-navy hover:border-brand`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={run}
              className={`${BTN} border-transparent font-semibold text-white ${danger ? "bg-red-700 hover:bg-red-800" : "bg-brand hover:bg-navy-light"}`}
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
