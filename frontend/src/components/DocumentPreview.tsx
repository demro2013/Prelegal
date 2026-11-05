import { isSignatureRow, type Block, type Inline } from "@/lib/document";
import type { MndaDocument } from "@/lib/mnda";

function PreviewInline({ content }: { content: Inline[] }) {
  return content.map((inline, index) => {
    switch (inline.type) {
      case "bold":
        return <strong key={index}>{inline.text}</strong>;
      case "term":
        return (
          <em key={index} className="font-medium">
            {inline.text}
          </em>
        );
      case "hint":
        return (
          <em key={index} className="text-muted">
            {inline.text}
          </em>
        );
      case "link":
        return (
          <a
            key={index}
            href={inline.href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {inline.text}
          </a>
        );
      case "field":
        return inline.filled ? (
          <span key={index} className="text-ink whitespace-pre-wrap">
            {inline.text}
          </span>
        ) : (
          <mark key={index} className="bg-flag text-text px-0.5">
            {inline.text}
          </mark>
        );
      default:
        return <span key={index}>{inline.text}</span>;
    }
  });
}

function isBlankField(cell: Inline[]) {
  return cell[0]?.type === "field" && !cell[0].filled;
}

function PartyTable({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <div className="my-5">
      <table className="w-full table-fixed border-collapse text-sm sm:text-[0.9375rem]">
        <thead>
          <tr>
            {block.header.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border-text/70 border p-1.5 text-left font-semibold sm:p-2"
              >
                <PreviewInline content={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => {
            const isSignature = isSignatureRow(row);
            return (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`border-text/70 border p-1.5 align-top wrap-anywhere sm:p-2 ${
                      isBlankField(cell) ? "bg-flag/35" : ""
                    } ${isSignature ? "h-16" : ""}`}
                  >
                    {isSignature && cellIndex > 0 ? (
                      <span className="sign-flag">Sign here</span>
                    ) : isBlankField(cell) ? null : (
                      <PreviewInline content={cell} />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      if (block.level === 1) {
        return (
          <h3 className="mb-5 text-[1.75rem] leading-tight font-semibold text-balance">
            <PreviewInline content={block.content} />
          </h3>
        );
      }
      if (block.level === 2) {
        return (
          <h4 className="mb-2 font-semibold">
            <PreviewInline content={block.content} />
          </h4>
        );
      }
      return (
        <h4 className="mt-5 mb-1 font-semibold">
          <PreviewInline content={block.content} />
        </h4>
      );
    case "paragraph":
      return (
        <p className="mb-2.5">
          <PreviewInline content={block.content} />
        </p>
      );
    case "numbered":
      return (
        <div className="mb-3 flex gap-2">
          <span className="w-6 shrink-0 tabular-nums">{block.number}.</span>
          <p className="min-w-0">
            <PreviewInline content={block.content} />
          </p>
        </div>
      );
    case "checkbox":
      return (
        <div className="mb-2 flex gap-2.5">
          <span
            role="img"
            aria-label={block.checked ? "Selected" : "Not selected"}
            className="border-text mt-1.5 flex size-3.5 shrink-0 items-center justify-center border"
          >
            {block.checked && <span className="bg-ink size-2" />}
          </span>
          <p className="min-w-0">
            <PreviewInline content={block.content} />
          </p>
        </div>
      );
    case "table":
      return <PartyTable block={block} />;
  }
}

function Sheet({ blocks, label }: { blocks: Block[]; label: string }) {
  return (
    <article
      aria-label={label}
      className="bg-paper text-text mx-auto w-full max-w-[46rem] p-6 font-serif text-[1.0625rem] leading-[1.6] wrap-anywhere shadow-[0_1px_2px_rgb(0_0_0/0.3),0_14px_30px_-12px_rgb(0_0_0/0.55)] sm:p-12"
    >
      {blocks.map((block, index) => (
        <PreviewBlock key={index} block={block} />
      ))}
    </article>
  );
}

export function DocumentPreview({ document }: { document: MndaDocument }) {
  return (
    <div className="flex flex-col gap-6">
      <Sheet blocks={document.coverPage} label="Cover Page" />
      <Sheet blocks={document.standardTerms} label="Standard Terms" />
    </div>
  );
}
