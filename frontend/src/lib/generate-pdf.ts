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

export type PdfSlide = {
  heading: string;
  bullets: string[];
};

export function downloadSlideDeckPdf(options: {
  title: string;
  subtitle?: string;
  slides: PdfSlide[];
  filename: string;
}): void {
  const doc = new jsPDF({
    unit: "pt",
    format: [720, 405],
    orientation: "landscape",
  });

  const marginX = 56;
  const pageWidth =
    doc.internal.pageSize.getWidth();
  const pageHeight =
    doc.internal.pageSize.getHeight();
  const maxWidth =
    pageWidth - marginX * 2;

  function drawFooter(
    pageLabel: string,
  ): void {
    doc.setFont(
      "helvetica",
      "bold",
    );
    doc.setFontSize(9);
    doc.setTextColor(
      140,
      140,
      150,
    );
    doc.text(
      "ZAINEX",
      marginX,
      pageHeight - 24,
    );
    doc.text(
      pageLabel,
      pageWidth - marginX,
      pageHeight - 24,
      {
        align: "right",
      },
    );
  }

  // Title slide
  doc.setFont("helvetica", "bold");
  doc.setFontSize(30);
  doc.setTextColor(20, 20, 30);

  const titleLines: string[] =
    doc.splitTextToSize(
      options.title,
      maxWidth,
    );

  let titleY =
    pageHeight / 2 -
    (titleLines.length * 34) / 2;

  for (const line of titleLines) {
    doc.text(
      line,
      marginX,
      titleY,
    );
    titleY += 34;
  }

  if (options.subtitle) {
    doc.setFont(
      "helvetica",
      "normal",
    );
    doc.setFontSize(14);
    doc.setTextColor(
      110,
      110,
      120,
    );

    const subtitleLines: string[] =
      doc.splitTextToSize(
        options.subtitle,
        maxWidth,
      );

    for (const line of subtitleLines) {
      doc.text(
        line,
        marginX,
        titleY + 10,
      );
      titleY += 20;
    }
  }

  drawFooter(
    `1 / ${options.slides.length + 1}`,
  );

  options.slides.forEach(
    (slide, index) => {
      doc.addPage();

      doc.setFont(
        "helvetica",
        "bold",
      );
      doc.setFontSize(22);
      doc.setTextColor(
        20,
        20,
        30,
      );

      const headingLines: string[] =
        doc.splitTextToSize(
          slide.heading,
          maxWidth,
        );

      let y = 70;

      for (const line of headingLines) {
        doc.text(
          line,
          marginX,
          y,
        );
        y += 28;
      }

      y += 14;

      doc.setFont(
        "helvetica",
        "normal",
      );
      doc.setFontSize(13);
      doc.setTextColor(
        40,
        40,
        50,
      );

      for (const bullet of slide.bullets) {
        const lines: string[] =
          doc.splitTextToSize(
            `•  ${bullet}`,
            maxWidth - 14,
          );

        for (const line of lines) {
          doc.text(
            line,
            marginX + 14,
            y,
          );
          y += 20;
        }

        y += 6;
      }

      drawFooter(
        `${index + 2} / ${options.slides.length + 1}`,
      );
    },
  );

  doc.save(options.filename);
}
