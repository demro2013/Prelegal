"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChatPane } from "./ChatPane";
import { DocumentList, DocumentPreview } from "./DocumentPreview";
import { buildAgreement } from "@/lib/agreement";
import { applyUpdates, GREETING, sendChat, type ChatMessage } from "@/lib/chat";
import type { AgreementTemplates } from "@/lib/document";
import {
  documentFilename,
  fetchTemplates,
  partyValues,
  validateDocument,
  withDefaults,
  type DocumentDefinition,
  type Values,
} from "@/lib/documents";
import { downloadPdf } from "@/lib/downloadPdf";

type Status =
  | { type: "idle" }
  | { type: "generating" }
  | { type: "downloaded"; filename: string }
  | { type: "failed" };

/** Set together, so the page never shows one document's terms under another's name. */
type Selection = {
  definition: DocumentDefinition;
  templates: AgreementTemplates;
};

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

const subscribeToNothing = () => () => {};

export function DocumentCreator({
  documents,
}: {
  documents: DocumentDefinition[];
}) {
  // The page is prerendered, so today's date is only known in the browser.
  const today = useSyncExternalStore(subscribeToNothing, todayIso, () => "");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [edits, setEdits] = useState<Values>({});
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

  const definition = selection?.definition;
  const values = useMemo(
    () => (definition ? withDefaults(definition, edits, today) : edits),
    [definition, edits, today],
  );
  const agreement = useMemo(
    () =>
      selection &&
      buildAgreement(selection.definition, selection.templates, values),
    [selection, values],
  );
  const errorMessages = useMemo(
    () =>
      definition && showErrors
        ? Object.values(validateDocument(definition, values))
        : [],
    [definition, showErrors, values],
  );

  async function requestReply(history: ChatMessage[]) {
    setChatStatus("pending");
    try {
      const turn = await sendChat(history, definition?.id ?? null, values, today);
      const next = documents.find(({ id }) => id === turn.documentType);

      if (next && next.id !== definition?.id) {
        const templates = await fetchTemplates(next.id);
        setSelection({ definition: next, templates });
        // Only the parties carry over to a different document.
        setEdits((current) => applyUpdates(partyValues(current), turn.updates));
        setShowErrors(false);
      } else {
        setEdits((current) => applyUpdates(current, turn.updates));
      }
      setMessages([...history, { role: "assistant", content: turn.reply }]);
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
    if (!definition || !agreement) return;
    if (Object.keys(validateDocument(definition, values)).length > 0) {
      setShowErrors(true);
      return;
    }

    setStatus({ type: "generating" });
    try {
      const filename = documentFilename(definition, values);
      await downloadPdf(agreement, definition, filename);
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
            {definition ? definition.name : "Create a legal agreement"}
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
          Based on{" "}
          <a
            href="https://commonpaper.com/standards/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Common Paper’s standard agreements
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
            disabled={!agreement || isGenerating || isPending}
            className="bg-ink hover:bg-ink-dark w-full cursor-pointer px-4 py-3 font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isGenerating ? "Creating PDF…" : "Download PDF"}
          </button>
          <div aria-live="polite" className="text-sm empty:hidden">
            {errorMessages.length > 0 && (
              <div className="text-error mt-2">
                <p className="font-medium">
                  {errorMessages.length === 1
                    ? "Fix 1 field to download the PDF. Tell the assistant:"
                    : `Fix ${errorMessages.length} fields to download the PDF. Tell the assistant:`}
                </p>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                  {errorMessages.map((message) => (
                    <li key={message}>{message}</li>
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
        aria-label={agreement ? "Agreement preview" : "Available documents"}
        tabIndex={0}
        className="bg-desk p-4 sm:p-8 lg:h-dvh lg:overflow-y-auto"
      >
        {agreement && definition ? (
          <>
            <p className="text-desk-text mx-auto mb-4 max-w-[46rem] text-sm">
              Blue shows what’s been filled in and yellow shows what’s still
              blank. Neither color appears in the PDF.
            </p>
            <DocumentPreview agreement={agreement} definition={definition} />
          </>
        ) : (
          <DocumentList documents={documents} />
        )}
      </section>
    </main>
  );
}
