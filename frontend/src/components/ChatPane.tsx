import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatMessage } from "@/lib/chat";

type ChatPaneProps = {
  messages: ChatMessage[];
  isPending: boolean;
  hasFailed: boolean;
  /** True while a reply or the PDF is in progress, so the agreement can't change. */
  isLocked: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
};

export function ChatPane({
  messages,
  isPending,
  hasFailed,
  isLocked,
  onSend,
  onRetry,
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, isPending, hasFailed]);

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={logRef}
        role="log"
        aria-label="Conversation"
        tabIndex={0}
        className="flex max-h-[40dvh] min-h-48 flex-1 flex-col gap-3 overflow-y-auto px-6 pb-4 sm:px-8 lg:max-h-none lg:min-h-24"
      >
        {messages.map((message, index) => (
          <p
            key={index}
            className={
              message.role === "user"
                ? "bg-ink ml-8 self-end px-3 py-2 break-words whitespace-pre-wrap text-white"
                : "bg-paper border-text/15 mr-8 self-start border px-3 py-2 break-words whitespace-pre-wrap"
            }
          >
            {message.content}
          </p>
        ))}
        {isPending && <p className="text-muted">The assistant is replying…</p>}
        {hasFailed && (
          <div role="alert" className="text-error font-medium">
            <p>The assistant couldn’t reply.</p>
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
        className="border-text/15 flex items-end gap-2 border-t px-6 py-4 sm:px-8"
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
            className="field-input mt-0 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={isLocked}
          className="bg-ink hover:bg-ink-dark cursor-pointer px-4 py-2 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-70"
        >
          Send
        </button>
      </form>
    </div>
  );
}
