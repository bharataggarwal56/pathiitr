"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteConversation } from "@/app/chat/actions";
import type { ConversationItem } from "@/lib/chat-history";

// The user's saved chats, newest first. A delete button on each opens a confirm dialog.
export default function History({
  conversations,
  activeId,
  onPick,
  onDeleted,
}: {
  conversations: ConversationItem[];
  activeId: string | null;
  onPick?: () => void;
  onDeleted: (id: string) => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<ConversationItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirmDelete() {
    if (!target) return;
    setError(null);
    start(async () => {
      const result = await deleteConversation(target.id);
      if (result.error) return setError(result.error);
      dialog.current?.close();
      onPick?.();
      onDeleted(target.id);
      router.refresh();
    });
  }

  if (!conversations.length) {
    return <p className="px-1 text-sm text-muted">No saved chats yet. Ask a question to start one.</p>;
  }

  return (
    <>
      <ul className="space-y-1">
        {conversations.map((c) => (
          <li key={c.id} className="group relative">
            <Link
              href={`/chat?c=${c.id}`}
              onClick={onPick}
              aria-current={c.id === activeId ? "page" : undefined}
              className={`block rounded-lg py-2 pr-10 pl-3 text-sm transition-colors ${
                c.id === activeId ? "bg-brand-tint text-navy" : "text-ink hover:bg-slate-100"
              }`}
            >
              <span className="line-clamp-2 font-medium">{c.title}</span>
              <span className="text-xs text-muted">{c.date}</span>
            </Link>
            <button
              type="button"
              aria-label={`Delete chat: ${c.title}`}
              onClick={() => {
                setError(null);
                setTarget(c);
                dialog.current?.showModal();
              }}
              className="absolute top-1.5 right-1.5 rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-brand md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onCancel={(e) => pending && e.preventDefault()}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-slate-200 bg-surface p-0 text-ink shadow-xl backdrop:bg-navy/60"
      >
        <div className="space-y-3 p-5 text-sm">
          <h2 className="text-lg font-semibold text-navy">Delete this chat?</h2>
          <p className="line-clamp-3 font-medium">{target?.title}</p>
          <p>Its messages and your feedback on its answers are deleted too. This can&apos;t be undone.</p>
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
              className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 font-medium text-navy hover:border-brand disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={confirmDelete}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2.5 font-semibold text-white hover:bg-red-800 disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Delete chat
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
