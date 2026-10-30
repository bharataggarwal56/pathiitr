"use server";

import { revalidatePath } from "next/cache";
import { isAllowedSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Deletes one of the user's own conversations (RLS), and its messages and feedback by cascade.
export async function deleteConversation(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims || !isAllowedSession(auth.claims)) return { error: "Please log in with your IITR account." };
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) {
    console.error("[chat] delete conversation failed", error.message);
    return { error: "Couldn't delete this chat. Please try again." };
  }
  revalidatePath("/chat");
  return { error: null };
}
