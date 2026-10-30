"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAllowedSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DataState = { error: string | null; message?: string };

// Both actions run as the logged-in user, so RLS limits every delete to their own rows.
// Deleting a conversation cascades to its messages, and deleting a message cascades to its feedback.
// Returns how many conversations were deleted.
async function deleteChats(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { count, error } = await supabase.from("conversations").delete({ count: "exact" }).eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function signedInUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) return null;
  return auth.claims.sub;
}

export async function clearChatHistory(): Promise<DataState> {
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return { error: "Please log in with your IITR account." };
  let count: number;
  try {
    count = await deleteChats(supabase, userId);
  } catch (error) {
    console.error("[profile] clear chat failed", (error as { message?: string })?.message ?? error);
    return { error: "Couldn't clear your chat history. Please try again." };
  }
  revalidatePath("/chat");
  return { error: null, message: count ? `Cleared ${count} ${count === 1 ? "chat" : "chats"}.` : "No chat history to clear." };
}

export async function deleteMyData(): Promise<DataState> {
  const supabase = await createClient();
  const userId = await signedInUser(supabase);
  if (!userId) return { error: "Please log in with your IITR account." };
  try {
    await deleteChats(supabase, userId);
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) throw error;
  } catch (error) {
    console.error("[profile] delete data failed", (error as { message?: string })?.message ?? error);
    return { error: "Couldn't delete your data. Please try again." };
  }
  redirect("/");
}
