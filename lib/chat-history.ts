import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Source } from "@/lib/chat-shared";

// Reads of the user's saved chats. Every call runs as the logged-in user, so RLS limits it to
// their own conversations, messages and feedback.

export type ConversationItem = { id: string; title: string; date: string };

export type SavedTurn = {
  key: string;
  question: string;
  answer: string;
  sources: Source[];
  messageId: string | null;
  rating: 1 | -1 | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

// Newest first. The date is formatted here so server and browser can't disagree on the time zone.
export async function listConversations(supabase: SupabaseClient): Promise<ConversationItem[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data.map((c) => ({ id: c.id, title: c.title?.trim() || "Untitled chat", date: formatDate(c.updated_at) }));
}

// null when the id isn't a conversation of this user.
export async function loadConversation(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string; turns: SavedTurn[] } | null> {
  if (!UUID.test(id)) return null;
  const { data: conversation, error } = await supabase.from("conversations").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!conversation) return null;

  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("id, role, content, citations")
    .eq("conversation_id", id)
    .order("created_at");
  if (messagesError) throw messagesError;

  const { data: feedback, error: feedbackError } = await supabase
    .from("message_feedback")
    .select("message_id, rating")
    .in("message_id", messages.map((m) => m.id));
  if (feedbackError) throw feedbackError;
  const ratings = new Map(feedback.map((f) => [f.message_id as string, f.rating as 1 | -1]));

  // A question is followed by its answer; a question whose answer failed to save has none.
  const turns: SavedTurn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ key: m.id, question: m.content, answer: "", sources: [], messageId: null, rating: null });
    } else {
      const turn = turns.at(-1);
      if (!turn || turn.answer) continue;
      const sources = Array.isArray(m.citations) ? (m.citations as Source[]) : [];
      // Saved text already holds final document numbers [n]; the page maps passage numbers [k] to
      // them, so give each source an identity mapping to keep the numbers as they are.
      turn.sources = sources.map((s) => ({ ...s, refs: [s.n] }));
      turn.answer = m.content;
      turn.messageId = m.id;
      turn.rating = ratings.get(m.id) ?? null;
    }
  }
  return { id, turns };
}
