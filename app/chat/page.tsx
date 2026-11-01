import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import StatusNote from "@/components/StatusNote";
import Chat from "@/components/chat/Chat";
import { listConversations, loadConversation } from "@/lib/chat-history";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Chat" };

export default function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="page-container py-8">
          <StatusNote kind="loading">Loading your chats…</StatusNote>
        </div>
      }
    >
      <ChatLoader searchParams={searchParams} />
    </Suspense>
  );
}

// /chat is a new chat; /chat?c=<id> opens a saved one.
async function ChatLoader({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await connection(); // the Supabase client reads the clock; keep it out of prefetch prerenders
  const { c } = await searchParams;
  const supabase = await createClient();
  const [conversations, opened] = await Promise.all([
    listConversations(supabase),
    c ? loadConversation(supabase, c) : null,
  ]);
  return (
    <Chat
      key={opened?.id ?? "new"}
      conversations={conversations}
      initialConversationId={opened?.id ?? null}
      initialTurns={opened?.turns ?? []}
    />
  );
}
