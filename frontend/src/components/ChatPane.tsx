import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/chat";

type ChatPaneProps = {
  messages: ChatMessage[];
  isPending: boolean;
  /** What went wrong with the last message, if anything. */
  error: string | null;
  /** True while a reply or the PDF is in progress, so the agreement can't change. */
  isLocked: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
};

export function ChatPane({
  messages,
  isPending,
  error,
  isLocked,
  onSend,
  onRetry,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, isPending, error]);

  function send() {
    const text = draft.trim();
    if (!text || isLocked) return;
    onSend(text);
    setDraft("");
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  return (
    // The minimum height keeps the message box's space reserved in a short window,
    // while the conversation scrolls inside whatever height is left.
    <div className="flex min-h-64 flex-1 flex-col lg:h-0">
      <div
        ref={logRef}
        role="log"
        aria-label="Conversation"
        tabIndex={0}
        className="flex max-h-[40dvh] min-h-48 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 sm:px-8 lg:max-h-none lg:min-h-0"
      >
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.role === "user"
                ? "reply-flag ml-8 self-end break-words whitespace-pre-wrap"
                : "break-words whitespace-pre-wrap"
            }
          >
            <span className="sr-only">
              {message.role === "user" ? "You said: " : "The assistant said: "}
            </span>
            <span>{message.content}</span>
          </p>
        ))}
        {isPending && <p className="text-shell-muted">The assistant is replying…</p>}
        {error && (
          <div role="alert" className="text-error-soft font-medium">
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 cursor-pointer underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}
      </div>
      <form
        onSubmit={handleSubmit}
        className="border-shell-line flex items-end gap-2 border-t px-6 py-4 sm:px-8"
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="chat-message" className="sr-only">
            Your message
          </label>
          <textarea
            id="chat-message"
            rows={2}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer…"
            className="field-input resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={isLocked}
          className="bg-highlighter text-shell cursor-pointer px-4 py-2 font-semibold disabled:cursor-wait disabled:opacity-70"
        >
          Send
        </button>
      </form>
    </div>
  );
}
