import type { Metadata } from "next";
import Chat from "@/components/chat/Chat";

export const metadata: Metadata = { title: "Chat | PathIITR" };

export default function ChatPage() {
  return <Chat />;
}
