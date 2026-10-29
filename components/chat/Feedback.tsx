"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Rating = 1 | -1;

// Thumbs up/down on one saved answer, stored in message_feedback (RLS: own assistant messages only).
// Clicking the chosen thumb again removes the rating.
export default function Feedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<Rating | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function rate(next: Rating) {
    const previous = rating;
    const value = previous === next ? null : next;
    setRating(value);
    setSaving(true);
    setFailed(false);
    const supabase = createClient();
    const { error } = value
      ? await supabase.from("message_feedback").upsert({ message_id: messageId, rating: value }, { onConflict: "message_id" })
      : await supabase.from("message_feedback").delete().eq("message_id", messageId);
    setSaving(false);
    if (error) {
      setRating(previous);
      setFailed(true);
    }
  }

  const button = (value: Rating, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      onClick={() => rate(value)}
      disabled={saving}
      aria-label={label}
      aria-pressed={rating === value}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-60 ${
        rating === value ? "bg-brand-tint text-brand" : "text-muted hover:bg-slate-100 hover:text-navy"
      }`}
    >
      <Icon className="size-4" fill={rating === value ? "currentColor" : "none"} />
    </button>
  );

  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      {button(1, "Helpful", ThumbsUp)}
      {button(-1, "Not helpful", ThumbsDown)}
      {rating !== null && !failed && <span className="ml-1">Thanks for the feedback</span>}
      {failed && <span className="ml-1 text-red-700">Couldn&apos;t save. Try again.</span>}
    </div>
  );
}
