"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  onSend: (body: string, isInternal: boolean) => void;
  sending: boolean;
}

export function MessageInput({ onSend, sending }: MessageInputProps) {
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    onSend(body.trim(), isInternal);
    setBody("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-800">
      {/* Mode toggle */}
      <div className="flex border-b border-zinc-100 dark:border-zinc-800/50">
        <button
          type="button"
          onClick={() => setIsInternal(false)}
          className={cn(
            "px-4 py-2 text-xs font-medium transition-colors",
            !isInternal
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          )}
        >
          Reply
        </button>
        <button
          type="button"
          onClick={() => setIsInternal(true)}
          className={cn(
            "px-4 py-2 text-xs font-medium transition-colors",
            isInternal
              ? "border-b-2 border-yellow-500 text-yellow-600 dark:text-yellow-400"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          )}
        >
          Internal Note
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-3">
        <div
          className={cn(
            "rounded-lg border transition-colors",
            isInternal
              ? "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950/30"
              : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
          )}
        >
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isInternal
                ? "Write an internal note..."
                : "Type your reply..."
            }
            rows={3}
            className={cn(
              "w-full resize-none rounded-t-lg border-0 bg-transparent px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100",
              isInternal && "placeholder:text-yellow-500/70"
            )}
          />
          <div className="flex items-center justify-between px-3 pb-2">
            <div className="text-xs text-zinc-400">
              {isInternal ? (
                <span className="text-yellow-600 dark:text-yellow-400">
                  Only visible to your team
                </span>
              ) : (
                <span>Press Enter to send, Shift+Enter for new line</span>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || sending}
              className={cn(
                isInternal &&
                  "bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700"
              )}
            >
              {sending
                ? "Sending..."
                : isInternal
                  ? "Add Note"
                  : "Send"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
