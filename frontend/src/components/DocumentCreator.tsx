"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChatPane } from "./ChatPane";
import { DocumentList, DocumentPreview } from "./DocumentPreview";
import { buildAgreement } from "@/lib/agreement";
import { ApiError } from "@/lib/api";
import { fetchAccount, logOut } from "@/lib/auth";
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

const REPLY_FAILED = "The assistant couldn’t reply.";
const TOO_MANY_MESSAGES =
  "That’s a lot of messages in a short time. Wait a minute, then try again.";

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
  const router = useRouter();
  // The page is prerendered, so today's date is only known in the browser.
  const today = useSyncExternalStore(subscribeToNothing, todayIso, () => "");
  const [email, setEmail] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [edits, setEdits] = useState<Values>({});
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [isPending, setIsPending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const isGenerating = status.type === "generating";

  useEffect(() => {
    fetchAccount().then(
      (account) => setEmail(account.email),
      () => router.replace("/login/"),
    );
  }, [router]);

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
  const errors = useMemo(
    () => (definition ? Object.values(validateDocument(definition, values)) : []),
    [definition, values],
  );
  const isReady = Boolean(agreement) && errors.length === 0;

  async function requestReply(history: ChatMessage[]) {
    setIsPending(true);
    setChatError(null);
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
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/login/");
        return;
      }
      setChatError(
        error instanceof ApiError && error.status === 429
          ? TOO_MANY_MESSAGES
          : REPLY_FAILED,
      );
    } finally {
      setIsPending(false);
    }
  }

  function handleSend(text: string) {
    const history: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    void requestReply(history);
  }

  async function handleDownload() {
    if (!definition || !agreement) return;
    if (!isReady) {
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

  async function handleLogOut() {
    await logOut().catch(console.error);
    router.replace("/login/");
  }

  if (!email) return <div className="bg-shell min-h-dvh" />;

  return (
    <main className="bg-bond text-text lg:grid lg:h-dvh lg:grid-cols-[minmax(24rem,29rem)_1fr]">
      <div className="on-shell bg-shell text-shell-text flex flex-col lg:h-dvh lg:overflow-y-auto">
        <div className="flex items-baseline justify-between gap-4 px-6 pt-5 sm:px-8">
          <p className="font-display text-2xl font-extrabold">Prelegal</p>
          <div className="flex min-w-0 items-baseline gap-3 text-sm">
            <span className="text-shell-muted truncate">{email}</span>
            <button
              type="button"
              onClick={handleLogOut}
              className="shrink-0 cursor-pointer underline underline-offset-2"
            >
              Log out
            </button>
          </div>
        </div>
        <header className="px-6 pt-6 pb-5 sm:px-8">
          <h1 className="font-display text-[3.25rem] leading-[0.95] font-extrabold text-balance">
            {definition ? definition.name : "Create a legal agreement"}
          </h1>
          <p className="text-shell-muted mt-3 text-sm">
            Your messages go to an AI provider to fill in the agreement.
            Prelegal doesn’t save them.
          </p>
        </header>
        <ChatPane
          messages={messages}
          isPending={isPending}
          error={chatError}
          isLocked={isPending || isGenerating}
          onSend={handleSend}
          onRetry={() => void requestReply(messages)}
        />
        <p className="text-shell-muted px-6 pb-4 text-sm sm:px-8">
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
        <div className="bg-shell border-shell-line sticky bottom-0 border-t px-6 py-4 sm:px-8 lg:static">
          <div aria-live="polite">
            {agreement && (
              <p className="mb-2 text-sm font-semibold">
                {isReady
                  ? "Ready to download"
                  : errors.length === 1
                    ? "1 detail still needed"
                    : `${errors.length} details still needed`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!agreement || isGenerating || isPending}
            className={`w-full cursor-pointer border px-4 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${
              isReady
                ? "bg-highlighter border-highlighter text-shell"
                : "border-shell-muted text-shell-text"
            }`}
          >
            {isGenerating ? "Creating PDF…" : "Download PDF"}
          </button>
          <div aria-live="polite" className="text-sm empty:hidden">
            {showErrors && errors.length > 0 && (
              <div className="text-error-soft mt-2">
                <p className="font-medium">
                  {errors.length === 1
                    ? "Fix 1 field to download the PDF. Tell the assistant:"
                    : `Fix ${errors.length} fields to download the PDF. Tell the assistant:`}
                </p>
                <ul className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
                  {errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}
            {status.type === "downloaded" && (
              <p className="mt-2 break-words">Downloaded {status.filename}</p>
            )}
            {status.type === "failed" && (
              <p className="text-error-soft mt-2 font-medium">
                The PDF couldn’t be created. Try downloading it again.
              </p>
            )}
          </div>
        </div>
      </div>
      <section
        aria-label={agreement ? "Agreement preview" : "Available documents"}
        tabIndex={0}
        className="bg-bond p-4 sm:p-8 lg:h-dvh lg:overflow-y-auto"
      >
        {agreement && definition ? (
          <>
            <p className="text-muted mx-auto mb-4 max-w-[46rem] text-sm">
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
