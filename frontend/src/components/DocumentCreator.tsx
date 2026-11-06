"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChatPane } from "./ChatPane";
import { DocumentPreview } from "./DocumentPreview";
import {
  applyUpdates,
  describeErrors,
  GREETING,
  sendChat,
  type ChatMessage,
} from "@/lib/chat";
import { downloadMndaPdf } from "@/lib/downloadMndaPdf";
import {
  buildMndaDocument,
  defaultValues,
  mndaFilename,
  validateMnda,
  type MndaDocument,
  type MndaValues,
} from "@/lib/mnda";

type Status =
  | { type: "idle" }
  | { type: "generating" }
  | { type: "downloaded"; filename: string }
  | { type: "failed" };

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const subscribeToNothing = () => () => {};

export function MndaCreator({ templates }: { templates: MndaDocument }) {
  // The page is prerendered, so today's date is only known in the browser.
  const today = useSyncExternalStore(subscribeToNothing, todayIso, () => "");
  const [edits, setEdits] = useState<MndaValues>(defaultValues);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [chatStatus, setChatStatus] = useState<"idle" | "pending" | "failed">(
    "idle",
  );
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const isGenerating = status.type === "generating";
  const isPending = chatStatus === "pending";

  const values = useMemo(
    () => ({ ...edits, effectiveDate: edits.effectiveDate || today }),
    [edits, today],
  );
  const document = useMemo(
    () => buildMndaDocument(templates, values),
    [templates, values],
  );
  const errors = useMemo(
    () => (showErrors ? validateMnda(values) : {}),
    [showErrors, values],
  );
  const errorDescriptions = describeErrors(errors);

  async function requestReply(history: ChatMessage[]) {
    setChatStatus("pending");
    try {
      const turn = await sendChat(history, values, today);
      setMessages([...history, { role: "assistant", content: turn.reply }]);
      setEdits((current) => applyUpdates(current, turn.updates));
      setStatus({ type: "idle" });
      setChatStatus("idle");
    } catch (error) {
      console.error(error);
      setChatStatus("failed");
    }
  }

  function handleSend(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    void requestReply(history);
  }

  async function handleDownload() {
    if (Object.keys(validateMnda(values)).length > 0) {
      setShowErrors(true);
      return;
    }

    setStatus({ type: "generating" });
    try {
      const filename = mndaFilename(values);
      await downloadMndaPdf(document, filename);
      setStatus({ type: "downloaded", filename });
    } catch (error) {
      console.error(error);
      setStatus({ type: "failed" });
    }
  }

  return (
    <main className="bg-pane text-text lg:grid lg:h-dvh lg:grid-cols-[minmax(24rem,29rem)_1fr]">
      <div className="flex flex-col lg:h-dvh lg:overflow-y-auto">
        <header className="p-6 pb-4 sm:px-8 sm:pt-8">
          <h1 className="font-serif text-[2.5rem] leading-[1.05] font-semibold text-balance">
            Create a Mutual NDA
          </h1>
          <p className="text-muted mt-3">
            Chat with the assistant and your agreement fills in as you go. Your
            messages are sent to an AI provider to do this, and Prelegal doesn’t
            save them.
          </p>
        </header>
        <ChatPane
          messages={messages}
          isPending={isPending}
          hasFailed={chatStatus === "failed"}
          isLocked={isPending || isGenerating}
          onSend={handleSend}
          onRetry={() => void requestReply(messages)}
        />
        <p className="text-muted px-6 pb-4 text-sm sm:px-8">
          Based on the{" "}
          <a
            href="https://commonpaper.com/standards/mutual-nda/1.0/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Common Paper Mutual NDA
          </a>
          , used under{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            CC BY 4.0
          </a>
          . Prelegal doesn’t provide legal advice.
        </p>
        <div className="bg-pane border-text/15 sticky bottom-0 border-t px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isGenerating || isPending}
            className="bg-ink hover:bg-ink-dark w-full cursor-pointer px-4 py-3 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-70"
          >
            {isGenerating ? "Creating PDF…" : "Download PDF"}
          </button>
          <div aria-live="polite" className="text-sm empty:hidden">
            {errorDescriptions.length > 0 && (
              <div className="text-error mt-2">
                <p className="font-medium">
                  {errorDescriptions.length === 1
                    ? "Fix 1 field to download the PDF. Tell the assistant:"
                    : `Fix ${errorDescriptions.length} fields to download the PDF. Tell the assistant:`}
                </p>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                  {errorDescriptions.map((description) => (
                    <li key={description}>{description}</li>
                  ))}
                </ul>
              </div>
            )}
            {status.type === "downloaded" && (
              <p className="mt-2 break-words">Downloaded {status.filename}</p>
            )}
            {status.type === "failed" && (
              <p className="text-error mt-2 font-medium">
                The PDF couldn’t be created. Try downloading it again.
              </p>
            )}
          </div>
        </div>
      </div>
      <section
        aria-label="Agreement preview"
        tabIndex={0}
        className="bg-desk p-4 sm:p-8 lg:h-dvh lg:overflow-y-auto"
      >
        <p className="text-desk-text mx-auto mb-4 max-w-[46rem] text-sm">
          Blue shows what’s been filled in and yellow shows what’s still blank.
          Neither color appears in the PDF.
        </p>
        <DocumentPreview document={document} />
      </section>
    </main>
  );
}
