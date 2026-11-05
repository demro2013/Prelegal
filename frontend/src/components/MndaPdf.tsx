import {
  Document,
  Font,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { isSignatureRow, type Block, type Inline } from "@/lib/document";
import type { MndaDocument } from "@/lib/mnda";

const LONG_WORD_LENGTH = 24;
const MAX_CHUNK_LENGTH = 16;

/**
 * Lets long strings such as email addresses wrap instead of overflowing. Empty
 * parts mark line breaks that don't add a hyphen, which would change the text.
 */
export function splitLongWord(word: string): string[] {
  if (word.length <= LONG_WORD_LENGTH) return [word];
  const chunks = word
    .split(/(?<=[@./_-])/)
    .flatMap((part) => part.match(new RegExp(`.{1,${MAX_CHUNK_LENGTH}}`, "g")) ?? []);
  return chunks.flatMap((chunk, index) => (index === 0 ? [chunk] : ["", chunk]));
}

// Legal text should not hyphenate words across lines.
Font.registerHyphenationCallback(splitLongWord);

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    lineHeight: 1.4,
    paddingTop: 54,
    paddingBottom: 60,
    paddingHorizontal: 60,
  },
  bold: { fontFamily: "Times-Bold" },
  italic: { fontFamily: "Times-Italic" },
  hint: { fontFamily: "Times-Italic", color: "#555555" },
  link: { color: "#000000" },
  heading1: { fontFamily: "Times-Bold", fontSize: 18, marginBottom: 12 },
  heading2: { fontFamily: "Times-Bold", fontSize: 11, marginBottom: 6 },
  heading3: {
    fontFamily: "Times-Bold",
    fontSize: 11,
    marginTop: 10,
    marginBottom: 3,
  },
  paragraph: { marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 6 },
  number: { width: 20 },
  flexible: { flex: 1 },
  checkbox: {
    width: 9,
    height: 9,
    marginTop: 2.5,
    marginRight: 7,
    borderWidth: 0.75,
    borderColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxMark: { width: 5, height: 5, backgroundColor: "#000000" },
  table: {
    marginTop: 8,
    marginBottom: 12,
    borderTopWidth: 0.75,
    borderLeftWidth: 0.75,
    borderColor: "#000000",
  },
  tableRow: { flexDirection: "row" },
  tableCell: {
    flex: 1,
    minHeight: 24,
    padding: 5,
    borderRightWidth: 0.75,
    borderBottomWidth: 0.75,
    borderColor: "#000000",
  },
  signatureCell: { minHeight: 42 },
  footerLabel: {
    position: "absolute",
    left: 60,
    bottom: 30,
    fontSize: 8.5,
    color: "#555555",
  },
});

function PdfInline({ content }: { content: Inline[] }) {
  return content.map((inline, index) => {
    switch (inline.type) {
      case "bold":
        return (
          <Text key={index} style={styles.bold}>
            {inline.text}
          </Text>
        );
      case "term":
        return (
          <Text key={index} style={styles.italic}>
            {inline.text}
          </Text>
        );
      case "hint":
        return (
          <Text key={index} style={styles.hint}>
            {inline.text}
          </Text>
        );
      case "link":
        return (
          <Link key={index} src={inline.href} style={styles.link}>
            {inline.text}
          </Link>
        );
      default:
        return <Text key={index}>{inline.text}</Text>;
    }
  });
}

function PdfBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const style =
        block.level === 1
          ? styles.heading1
          : block.level === 2
            ? styles.heading2
            : styles.heading3;
      return (
        <Text style={style} minPresenceAhead={30}>
          <PdfInline content={block.content} />
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text style={styles.paragraph}>
          <PdfInline content={block.content} />
        </Text>
      );
    case "numbered":
      return (
        <View style={styles.row} wrap={false}>
          <Text style={styles.number}>{block.number}.</Text>
          <Text style={styles.flexible}>
            <PdfInline content={block.content} />
          </Text>
        </View>
      );
    case "checkbox":
      return (
        <View style={styles.row} wrap={false}>
          <View style={styles.checkbox}>
            {block.checked && <View style={styles.checkboxMark} />}
          </View>
          <Text style={styles.flexible}>
            <PdfInline content={block.content} />
          </Text>
        </View>
      );
    case "table":
      return (
        <View style={styles.table} wrap={false}>
          <View style={styles.tableRow}>
            {block.header.map((cell, index) => (
              <View key={index} style={styles.tableCell}>
                <Text style={styles.bold}>
                  <PdfInline content={cell} />
                </Text>
              </View>
            ))}
          </View>
          {block.rows.map((row, rowIndex) => {
            const isSignature = isSignatureRow(row);
            return (
              <View key={rowIndex} style={styles.tableRow}>
                {row.map((cell, cellIndex) => (
                  <View
                    key={cellIndex}
                    style={
                      isSignature
                        ? [styles.tableCell, styles.signatureCell]
                        : styles.tableCell
                    }
                  >
                    <Text>
                      <PdfInline content={cell} />
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      );
  }
}

function PdfPage({ blocks, label }: { blocks: Block[]; label: string }) {
  return (
    <Page size="LETTER" style={styles.page}>
      {blocks.map((block, index) => {
        // The sentence before the signature table stays on the same page.
        if (blocks[index + 1]?.type === "table") return null;
        if (block.type === "table" && index > 0) {
          return (
            <View key={index} wrap={false}>
              <PdfBlock block={blocks[index - 1]} />
              <PdfBlock block={block} />
            </View>
          );
        }
        return <PdfBlock key={index} block={block} />;
      })}
      <Text style={styles.footerLabel} fixed>
        {label}
      </Text>
    </Page>
  );
}

export function MndaPdf({ document }: { document: MndaDocument }) {
  return (
    <Document title="Mutual Non-Disclosure Agreement" creator="Prelegal">
      <PdfPage blocks={document.coverPage} label="Mutual NDA Cover Page" />
      <PdfPage
        blocks={document.standardTerms}
        label="Mutual NDA Standard Terms"
      />
    </Document>
  );
}
