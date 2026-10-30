"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, History as HistoryIcon, Loader2, MessageSquarePlus, RotateCcw, X } from "lucide-react";
import Answer, { SourceList, citedNumbers } from "@/components/chat/Answer";
import Feedback from "@/components/chat/Feedback";
import History from "@/components/chat/History";
import type { ConversationItem, SavedTurn } from "@/lib/chat-history";
import {
  MAX_QUESTION_CHARS,
  STARTER_QUESTIONS,
  TRACKS,
  type ChatEvent,
  type Source,
  type Track,
} from "@/lib/chat-shared";

type Turn = {
  key: string;
  question: string;
  track: Track | null;
  answer: string;
  sources: Source[];
  status: "searching" | "writing" | "done" | "error";
  error?: string;
  messageId: string | null;
  rating?: 1 | -1 | null;
};

export default function Chat({
  conversations,
  initialConversationId,
  initialTurns,
}: {
  conversations: ConversationItem[];
  initialConversationId: string | null;
  initialTurns: SavedTurn[];
}) {
  const router = useRouter();
  const drawer = useRef<HTMLDialogElement>(null);
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialTurns.map((t) => ({ ...t, track: null, status: t.answer ? "done" : "error", error: t.answer ? undefined : "This question has no saved answer." })),
  );
  const [track, setTrack] = useState<Track | null>(null);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.status === "searching" || t.status === "writing");

  const lastTurn = turns.at(-1);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, lastTurn?.status]);

  const update = (key: string, change: Partial<Turn> | ((turn: Turn) => Partial<Turn>)) =>
    setTurns((all) => all.map((t) => (t.key === key ? { ...t, ...(typeof change === "function" ? change(t) : change) } : t)));

  async function ask(question: string, askTrack: Track | null = track) {
    question = question.trim();
    if (!question || busy) return;
    const key = crypto.randomUUID();
    setTurns((all) => [
      ...all,
      { key, question, track: askTrack, answer: "", sources: [], status: "searching", messageId: null },
    ]);
    setInput("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, track: askTrack, conversationId }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Something went wrong. Please try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "sources") {
            setConversationId(event.conversationId);
            update(key, { sources: event.sources, status: "writing" });
          } else if (event.type === "delta") {
            update(key, (t) => ({ answer: t.answer + event.text }));
          } else if (event.type === "done") {
            update(key, { status: "done", messageId: event.messageId });
            router.refresh(); // the sidebar list: new chat appears, an older one moves to the top
          } else {
            update(key, { status: "error", error: event.message });
          }
        }
      }
      // A stream that ends without "done" or "error" (e.g. the connection dropped).
      update(key, (t) => (t.status === "done" || t.status === "error" ? {} : { status: "error", error: "The answer was cut off. Please try again." }));
    } catch (error) {
      update(key, { status: "error", error: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  // If the open chat was deleted, empty the screen too (the URL may already be /chat, so no navigation).
  function onDeleted(id: string) {
    if (id === conversationId) newChat();
  }

  function newChat() {
    setTurns([]);
    setConversationId(null);
    router.push("/chat");
  }

  return (
    <div className="page-container flex gap-8 py-6">
      <aside className="sticky top-24 hidden max-h-[calc(100vh-8rem)] w-64 shrink-0 self-start overflow-y-auto md:block">
        <NewChatButton onClick={newChat} disabled={busy} className="mb-3 w-full justify-center" />
        <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-muted uppercase">History</h2>
        <History conversations={conversations} activeId={conversationId} onDeleted={onDeleted} />
      </aside>

      <dialog
        ref={drawer}
        className="m-0 mr-auto h-dvh max-h-none w-[min(20rem,85vw)] border-r border-slate-200 bg-surface p-0 text-ink shadow-xl backdrop:bg-navy/60"
      >
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-lg font-semibold text-navy">History</h2>
          <button type="button" onClick={() => drawer.current?.close()} aria-label="Close history" className="rounded-md p-2 text-muted hover:bg-slate-100">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-3">
          <NewChatButton
            onClick={() => {
              drawer.current?.close();
              newChat();
            }}
            disabled={busy}
            className="w-full justify-center"
          />
          <History
              conversations={conversations}
              activeId={conversationId}
              onPick={() => drawer.current?.close()}
              onDeleted={onDeleted}
            />
        </div>
      </dialog>

      <div className="flex min-w-0 max-w-3xl flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-navy">Chat</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => drawer.current?.showModal()}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm text-navy hover:bg-brand-tint md:hidden"
            >
              <HistoryIcon className="size-4" aria-hidden />
              History
            </button>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span>Track</span>
              <select
                value={track ?? ""}
                onChange={(e) => setTrack((e.target.value || null) as Track | null)}
                className="rounded-md border border-slate-300 bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none"
              >
                <option value="">All tracks</option>
                {TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <NewChatButton onClick={newChat} disabled={busy} className="md:hidden" />
          </div>
        </div>

        {turns.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-lg font-medium text-navy">Ask about placements, internships and courses</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted">
              Answers come only from seniors&apos; notes, internship experiences and the official ECE curriculum,
              with the source of each point.
            </p>
            <div className="mt-6 grid gap-2.5 text-left sm:grid-cols-2">
              {STARTER_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="rounded-lg border border-slate-200 bg-surface px-4 py-3 text-sm text-ink shadow-sm transition-colors hover:border-brand/40 hover:bg-brand-tint"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="mt-6 space-y-6">
            {turns.map((turn) => (
              <li key={turn.key} className="space-y-3">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
                    {turn.question}
                  </p>
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-surface px-4 py-3.5 shadow-sm sm:px-5">
                  {turn.track && (
                    <p className="mb-2 text-xs text-muted">
                      Searched: <span className="font-medium text-navy">{turn.track}</span> + cross-track + curriculum
                    </p>
                  )}
                  {turn.answer ? (
                    <Answer text={turn.answer} sources={turn.sources} anchor={`src-${turn.key}`} />
                  ) : (
                    turn.status !== "error" && (
                      <p className="flex items-center gap-2 text-sm text-muted" role="status">
                        <Loader2 className="size-4 animate-spin" />
                        {turn.status === "searching" ? "Searching seniors' notes…" : "Writing the answer…"}
                      </p>
                    )
                  )}
                  {turn.status === "error" && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg bg-accent/15 px-3 py-2 text-sm text-navy">
                      <span>{turn.error}</span>
                      <button
                        type="button"
                        onClick={() => ask(turn.question, turn.track)}
                        disabled={busy}
                        className="flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" />
                        Try again
                      </button>
                    </div>
                  )}
                  {turn.answer && (
                    <SourceList sources={turn.sources} cited={citedNumbers(turn.answer, turn.sources)} anchor={`src-${turn.key}`} />
                  )}
                  {turn.status === "done" && turn.messageId && (
                    <div className="mt-3 border-t border-slate-100 pt-2">
                      <Feedback messageId={turn.messageId} initialRating={turn.rating ?? null} />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <div ref={endRef} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="sticky bottom-0 mt-6 bg-page pt-2 pb-4"
        >
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-surface p-2 shadow-sm focus-within:border-brand">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  ask(input);
                }
              }}
              rows={1}
              maxLength={MAX_QUESTION_CHARS}
              placeholder={track ? `Ask about ${track}…` : "Ask a question…"}
              aria-label="Your question"
              className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.95rem] text-ink placeholder:text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:bg-navy disabled:bg-slate-300"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-xs text-muted">
            Answers can be incomplete. Check the sources before acting on them.
          </p>
        </form>
      </div>
    </div>
  );
}

function NewChatButton({ onClick, disabled, className = "" }: { onClick: () => void; disabled: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 rounded-md border border-slate-300 bg-surface px-2.5 py-1.5 text-sm whitespace-nowrap text-navy hover:bg-brand-tint disabled:opacity-50 ${className}`}
    >
      <MessageSquarePlus className="size-4" aria-hidden />
      New chat
    </button>
  );
}
