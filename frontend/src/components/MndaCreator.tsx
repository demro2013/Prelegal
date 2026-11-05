"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { DocumentPreview } from "./DocumentPreview";
import { MndaForm } from "./MndaForm";
import { downloadMndaPdf } from "@/lib/downloadMndaPdf";
import {
  buildMndaDocument,
  defaultValues,
  mndaFilename,
  validateMnda,
  type MndaDocument,
  type MndaValues,
  type Party,
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
  // Null until someone changes the date. After that, blank stays blank.
  const [editedDate, setEditedDate] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const isGenerating = status.type === "generating";

  const values = useMemo(
    () => ({ ...edits, effectiveDate: editedDate ?? today }),
    [edits, editedDate, today],
  );
  const document = useMemo(
    () => buildMndaDocument(templates, values),
    [templates, values],
  );
  const errors = useMemo(
    () => (showErrors ? validateMnda(values) : {}),
    [showErrors, values],
  );
  const errorCount = Object.keys(errors).length;

  function handleChange(patch: Partial<MndaValues>) {
    if (patch.effectiveDate !== undefined) setEditedDate(patch.effectiveDate);
    setEdits((current) => ({ ...current, ...patch }));
    setStatus({ type: "idle" });
  }

  function handlePartyChange(index: number, patch: Partial<Party>) {
    setEdits((current) => {
      const parties: MndaValues["parties"] = [...current.parties];
      parties[index] = { ...parties[index], ...patch };
      return { ...current, parties };
    });
    setStatus({ type: "idle" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const [firstInvalid] = Object.keys(validateMnda(values));
    if (firstInvalid) {
      setShowErrors(true);
      const element = event.currentTarget.elements.namedItem(firstInvalid);
      if (element instanceof HTMLElement) element.focus();
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
      <form
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col lg:h-dvh lg:overflow-y-auto"
      >
        <div className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
          <header>
            <h1 className="font-serif text-[2.5rem] leading-[1.05] font-semibold text-balance">
              Create a Mutual NDA
            </h1>
            <p className="text-muted mt-3">
              Your agreement updates as you type. What you enter stays in this
              browser and isn’t saved.
            </p>
          </header>
          {/* Locked while generating, so the PDF always matches the form. */}
          <fieldset disabled={isGenerating} className="contents">
            <MndaForm
              values={values}
              errors={errors}
              onChange={handleChange}
              onPartyChange={handlePartyChange}
            />
          </fieldset>
          <p className="text-muted border-text/15 border-t pt-5 text-sm">
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
        </div>
        <div className="bg-pane border-text/15 sticky bottom-0 border-t px-6 py-4 sm:px-8">
          <button
            type="submit"
            disabled={isGenerating}
            className="bg-ink hover:bg-ink-dark w-full cursor-pointer px-4 py-3 font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-70"
          >
            {isGenerating ? "Creating PDF…" : "Download PDF"}
          </button>
          <div aria-live="polite" className="text-sm empty:hidden">
            {errorCount > 0 && (
              <p className="text-error mt-2 font-medium">
                {errorCount === 1
                  ? "Fix 1 field to download the PDF."
                  : `Fix ${errorCount} fields to download the PDF.`}
              </p>
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
      </form>
      <section
        aria-label="Agreement preview"
        tabIndex={0}
        className="bg-desk p-4 sm:p-8 lg:h-dvh lg:overflow-y-auto"
      >
        <p className="text-desk-text mx-auto mb-4 max-w-[46rem] text-sm">
          Blue shows what you’ve entered and yellow shows what’s still blank.
          Neither color appears in the PDF.
        </p>
        <DocumentPreview document={document} />
      </section>
    </main>
  );
}
