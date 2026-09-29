import { describe, expect, it } from "vitest";
import { copyPathFor, documentFormatFor, newDocumentPath, pdfPathFor } from "./paths";

const taken = (...paths: string[]) => async (p: string) => paths.includes(p);

describe("documentFormatFor", () => {
  it("maps extensions case-insensitively and rejects the rest", () => {
    expect(documentFormatFor("/a/Report.DOCX")).toBe("docx");
    expect(documentFormatFor("C:\\a\\notes.markdown")).toBe("markdown");
    expect(documentFormatFor("/a/b.md")).toBe("markdown");
    expect(documentFormatFor("/a/b.mdx")).toBeNull();
    expect(documentFormatFor("/a/b.doc")).toBeNull();
  });
});

describe("copyPathFor", () => {
  it("adds (edited) and counts past names already taken", async () => {
    expect(await copyPathFor("/w/report.docx", taken())).toBe("/w/report (edited).docx");
    expect(
      await copyPathFor("C:\\w\\report.docx", taken("C:\\w\\report (edited).docx")),
    ).toBe("C:\\w\\report (edited 2).docx");
  });

  it("only touches the last extension", async () => {
    expect(await copyPathFor("/w/v1.2.final.docx", taken())).toBe("/w/v1.2.final (edited).docx");
  });
});

describe("newDocumentPath", () => {
  it("picks the first free Untitled name with the separator the directory uses", async () => {
    expect(await newDocumentPath("/w", "markdown", taken())).toBe("/w/Untitled.md");
    expect(await newDocumentPath("C:\\w\\", "docx", taken("C:\\w\\Untitled.docx"))).toBe(
      "C:\\w\\Untitled 2.docx",
    );
  });
});

describe("pdfPathFor", () => {
  it("swaps the extension beside the source", () => {
    expect(pdfPathFor("/w/report.docx")).toBe("/w/report.pdf");
    expect(pdfPathFor("C:\\w\\notes.md")).toBe("C:\\w\\notes.pdf");
  });
});
