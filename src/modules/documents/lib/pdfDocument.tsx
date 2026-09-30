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
 * Lists are keyed by Children.toArray rather than by hand. This tree is never
 * reconciled (`serialize` walks it once into Forme's JSON), and document
 * nodes have no identity beyond their position, so there is no stable id to
 * key by; toArray says exactly that without an index-as-key.
 */
import type { JSONContent } from "@tiptap/core";
import { Children, type ReactNode } from "react";
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
  return Children.toArray((nodes ?? []).map((n) => {
    if (n.type === "hardBreak") return "\n";
    if (n.type !== "text") return plainText(n);
    let el: ReactNode = n.text ?? "";
    for (const mark of n.marks ?? []) {
      switch (mark.type) {
        case "bold":
          el = <Text style={{ fontWeight: 700 }}>{el}</Text>;
          break;
        case "italic":
          el = <Em>{el}</Em>;
          break;
        case "underline":
          el = <Text style={{ textDecoration: "underline" }}>{el}</Text>;
          break;
        case "strike":
          el = <Text style={{ textDecoration: "line-through" }}>{el}</Text>;
          break;
        case "code":
          el = <Code>{el}</Code>;
          break;
        case "highlight":
          el = <Text style={{ backgroundColor: "#fef08a" }}>{el}</Text>;
          break;
        case "link": {
          const href = String(mark.attrs?.href ?? "");
          if (isAllowedHref(href)) {
            el = <Link href={href} style={{ color: theme.colors.accent }}>{el}</Link>;
          }
          break;
        }
      }
    }
    return <Text>{el}</Text>;
  }));
}

function list(n: JSONContent, theme: PdfTheme): ReactNode {
  const items = Children.toArray((n.content ?? []).map((item) => {
    const box = item.type === "taskItem" ? (item.attrs?.checked ? "[x] " : "[ ] ") : "";
    const [first, ...rest] = item.content ?? [];
    return (
      <ListItem>
        <Text>
          {box}
          {first?.type === "paragraph" ? inline(first.content, theme) : null}
        </Text>
        {blocks(first?.type === "paragraph" ? rest : item.content, theme)}
      </ListItem>
    );
  }));
  return n.type === "orderedList" ? (
    <OrderedList start={Number(n.attrs?.start) || 1}>{items}</OrderedList>
  ) : (
    <UnorderedList>{items}</UnorderedList>
  );
}

function blocks(nodes: JSONContent[] | undefined, theme: PdfTheme): ReactNode[] {
  const gap = { marginBottom: theme.paragraphGap };
  return Children.toArray((nodes ?? []).map((n) => {
    const textAlign = (n.attrs?.textAlign as "left" | "center" | "right" | "justify" | undefined) ?? undefined;
    switch (n.type) {
      case "paragraph":
        return <Text style={{ ...gap, textAlign }}>{inline(n.content, theme)}</Text>;
      case "heading": {
        const level = Math.min(6, Math.max(1, Number(n.attrs?.level) || 1));
        return (
          <Text
           
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
        return list(n, theme);
      case "blockquote":
        return (
          <View
           
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
          <View style={{ ...gap, padding: 10, backgroundColor: theme.colors.muted, borderRadius: 4 }}>
            <Text style={{ fontFamily: "Courier", fontSize: theme.body.fontSize - 1 }}>{plainText(n)}</Text>
          </View>
        );
      case "horizontalRule":
        return <View style={{ ...gap, borderBottomWidth: 1, borderBottomColor: theme.colors.border }} />;
      case "image": {
        const src = String(n.attrs?.src ?? "");
        const alt = n.attrs?.alt ? String(n.attrs.alt) : undefined;
        return src.startsWith("data:image/") ? (
          <Image src={src} alt={alt} style={{ ...gap, maxWidth: "100%" }} />
        ) : (
          <Text style={{ ...gap, fontStyle: "italic", color: theme.colors.mutedForeground }}>
            [{alt ? `${alt}: ` : ""}{src}]
          </Text>
        );
      }
      case "table":
        return (
          <Table style={gap}>
            {Children.toArray((n.content ?? []).map((row) => (
              <Row header={row.content?.every((c) => c.type === "tableHeader")}>
                {Children.toArray((row.content ?? []).map((cell) => (
                  <Cell
                   
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
                    {Children.toArray((cell.content ?? []).map((p) => <Text>{inline(p.content, theme)}</Text>))}
                  </Cell>
                )))}
              </Row>
            )))}
          </Table>
        );
      default: {
        const text = plainText(n);
        return text ? <Text style={gap}>{text}</Text> : null;
      }
    }
  }));
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
