import jsPDF from "jspdf";

// ZAINEX_DOCUMENT_PDF_EXPORT_V1

export type PdfSection = {
  heading: string;
  paragraphs: string[];
};

export function downloadDocumentPdf(options: {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  filename: string;
}): void {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const marginX = 56;
  const marginBottom = 56;
  const pageWidth =
    doc.internal.pageSize.getWidth();
  const pageHeight =
    doc.internal.pageSize.getHeight();
  const maxWidth =
    pageWidth - marginX * 2;

  let y = 72;

  function ensureSpace(
    lineHeight: number,
  ): void {
    if (
      y + lineHeight >
      pageHeight - marginBottom
    ) {
      doc.addPage();
      y = 72;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(20, 20, 30);

  const titleLines: string[] =
    doc.splitTextToSize(
      options.title,
      maxWidth,
    );

  for (const line of titleLines) {
    ensureSpace(28);
    doc.text(line, marginX, y);
    y += 28;
  }

  if (options.subtitle) {
    doc.setFont(
      "helvetica",
      "normal",
    );
    doc.setFontSize(12);
    doc.setTextColor(110, 110, 120);

    const subtitleLines: string[] =
      doc.splitTextToSize(
        options.subtitle,
        maxWidth,
      );

    for (const line of subtitleLines) {
      ensureSpace(18);
      doc.text(line, marginX, y);
      y += 18;
    }

    doc.setTextColor(20, 20, 30);
  }

  y += 14;

  for (const section of options.sections) {
    ensureSpace(26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(
      section.heading,
      marginX,
      y,
    );
    y += 20;

    doc.setFont(
      "helvetica",
      "normal",
    );
    doc.setFontSize(11);
    doc.setTextColor(40, 40, 50);

    for (const paragraph of section.paragraphs) {
      const lines: string[] =
        doc.splitTextToSize(
          paragraph,
          maxWidth,
        );

      for (const line of lines) {
        ensureSpace(16);
        doc.text(line, marginX, y);
        y += 16;
      }

      y += 8;
    }

    doc.setTextColor(20, 20, 30);
    y += 10;
  }

  doc.save(options.filename);
}
