// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

/**
 * The editor's JSON as a Forme document tree. Pure: no WASM, no IO, so it is
 * testable on its own and the 6.9 MB engine is only fetched when an export
 * actually runs (`pdfExport.ts`).
 *
 * Like the docx mapper, a node it does not know keeps its text. Linked
 * (non-embedded) images are written as their alt text and URL rather than
 * fetched: an export should not reach the network.
 *
 * Keys are array indices, and react-doctor's no-array-index-as-key flags every
 * one. That rule is about reconciliation, and this tree is never reconciled:
 * `serialize` walks it once into Forme's JSON. Document nodes also have no
 * identity other than their position, so an index is the honest key.
 */
import type { JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import {
  Cell,
  Code,
  Document,
  Em,
  Image,
  Link,
  ListItem,
  OrderedList,
  Page,
  Row,
  Table,
  Text,
  UnorderedList,
  View,
} from "@formepdf/react";
import { isAllowedHref } from "./extensions";
import type { PdfPageSize, PdfTheme } from "./pdfThemes";

function plainText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainText).join("");
}

function inline(nodes: JSONContent[] | undefined, theme: PdfTheme): ReactNode[] {
  return (nodes ?? []).map((n, i) => {
    if (n.type === "hardBreak") return "\n";
    if (n.type !== "text") return plainText(n);
    let el: ReactNode = n.text ?? "";
    for (const mark of n.marks ?? []) {
      switch (mark.type) {
        case "bold":
          el = <Text key={i} style={{ fontWeight: 700 }}>{el}</Text>;
          break;
        case "italic":
          el = <Em key={i}>{el}</Em>;
          break;
        case "underline":
          el = <Text key={i} style={{ textDecoration: "underline" }}>{el}</Text>;
          break;
        case "strike":
          el = <Text key={i} style={{ textDecoration: "line-through" }}>{el}</Text>;
          break;
        case "code":
          el = <Code key={i}>{el}</Code>;
          break;
        case "highlight":
          el = <Text key={i} style={{ backgroundColor: "#fef08a" }}>{el}</Text>;
          break;
        case "link": {
          const href = String(mark.attrs?.href ?? "");
          if (isAllowedHref(href)) {
            el = <Link key={i} href={href} style={{ color: theme.colors.accent }}>{el}</Link>;
          }
          break;
        }
      }
    }
    return <Text key={i}>{el}</Text>;
  });
}

function list(n: JSONContent, theme: PdfTheme, key: number): ReactNode {
  const items = (n.content ?? []).map((item, i) => {
    const box = item.type === "taskItem" ? (item.attrs?.checked ? "[x] " : "[ ] ") : "";
    const [first, ...rest] = item.content ?? [];
    return (
      <ListItem key={i}>
        <Text>
          {box}
          {first?.type === "paragraph" ? inline(first.content, theme) : null}
        </Text>
        {blocks(first?.type === "paragraph" ? rest : item.content, theme)}
      </ListItem>
    );
  });
  return n.type === "orderedList" ? (
    <OrderedList key={key} start={Number(n.attrs?.start) || 1}>{items}</OrderedList>
  ) : (
    <UnorderedList key={key}>{items}</UnorderedList>
  );
}

function blocks(nodes: JSONContent[] | undefined, theme: PdfTheme): ReactNode[] {
  const gap = { marginBottom: theme.paragraphGap };
  return (nodes ?? []).map((n, i) => {
    const textAlign = (n.attrs?.textAlign as "left" | "center" | "right" | "justify" | undefined) ?? undefined;
    switch (n.type) {
      case "paragraph":
        return <Text key={i} style={{ ...gap, textAlign }}>{inline(n.content, theme)}</Text>;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
        return (
          <Text
            key={i}
            bookmark={level <= 2 ? plainText(n) : undefined}
            style={{
              fontFamily: theme.heading.fontFamily,
              fontWeight: theme.heading.fontWeight,
              fontSize: theme.heading.sizes[level - 1],
              lineHeight: theme.heading.lineHeight,
              marginTop: theme.paragraphGap,
              marginBottom: theme.paragraphGap * 0.6,
              textAlign,
            }}
          >
            {inline(n.content, theme)}
          </Text>
        );
      }
      case "bulletList":
      case "orderedList":
      case "taskList":
        return list(n, theme, i);
      case "blockquote":
        return (
          <View
            key={i}
            style={{
              ...gap,
              paddingLeft: 12,
              borderLeftWidth: 3,
              borderLeftColor: theme.colors.border,
              color: theme.colors.mutedForeground,
            }}
          >
            {blocks(n.content, theme)}
          </View>
        );
      case "codeBlock":
        return (
          <View key={i} style={{ ...gap, padding: 10, backgroundColor: theme.colors.muted, borderRadius: 4 }}>
            <Text style={{ fontFamily: "Courier", fontSize: theme.body.fontSize - 1 }}>{plainText(n)}</Text>
          </View>
        );
      case "horizontalRule":
        return <View key={i} style={{ ...gap, borderBottomWidth: 1, borderBottomColor: theme.colors.border }} />;
      case "image": {
        const src = String(n.attrs?.src ?? "");
        const alt = n.attrs?.alt ? String(n.attrs.alt) : undefined;
        return src.startsWith("data:image/") ? (
          <Image key={i} src={src} alt={alt} style={{ ...gap, maxWidth: "100%" }} />
        ) : (
          <Text key={i} style={{ ...gap, fontStyle: "italic", color: theme.colors.mutedForeground }}>
            [{alt ? `${alt}: ` : ""}{src}]
          </Text>
        );
      }
      case "table":
        return (
          <Table key={i} style={gap}>
            {(n.content ?? []).map((row, r) => (
              <Row key={r} header={row.content?.every((c) => c.type === "tableHeader")}>
                {(row.content ?? []).map((cell, c) => (
                  <Cell
                    key={c}
                    colSpan={Number(cell.attrs?.colspan) > 1 ? Number(cell.attrs?.colspan) : undefined}
                    rowSpan={Number(cell.attrs?.rowspan) > 1 ? Number(cell.attrs?.rowspan) : undefined}
                    style={{
                      padding: 6,
                      borderWidth: 0.5,
                      borderColor: theme.colors.border,
                      ...(cell.type === "tableHeader" && { fontWeight: 700, backgroundColor: theme.colors.muted }),
                    }}
                  >
                    {/* Paragraph gaps inside a cell would pad every row. */}
                    {(cell.content ?? []).map((p, k) => (
                      <Text key={k}>{inline(p.content, theme)}</Text>
                    ))}
                  </Cell>
                ))}
              </Row>
            ))}
          </Table>
        );
      default: {
        const text = plainText(n);
        return text ? <Text key={i} style={gap}>{text}</Text> : null;
      }
    }
  });
}

export function pdfDocumentFor(
  doc: JSONContent,
  opts: { title: string; theme: PdfTheme; size: PdfPageSize },
) {
  const { theme } = opts;
  return (
    <Document
      title={opts.title}
      creator="Nexis"
      style={{
        fontFamily: theme.body.fontFamily,
        fontSize: theme.body.fontSize,
        lineHeight: theme.body.lineHeight,
        color: theme.colors.foreground,
      }}
    >
      <Page size={opts.size} margin={theme.margin}>
        {blocks(doc.content, theme)}
      </Page>
    </Document>
  );
}
