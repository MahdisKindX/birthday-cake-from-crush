// src/utils/generateReflectionPdf.ts
import { jsPDF } from "jspdf";

type ReflectionData = {
  moments22: string;
  goals23: string;
  title?: string;
};

export function generateReflectionPdf({ moments22, goals23, title }: ReflectionData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  const wrap = (text: string, maxW: number) => doc.splitTextToSize(text, maxW) as string[];

  // background
  doc.setFillColor(248, 245, 255);
  doc.rect(0, 0, pageW, pageH, "F");

  // header card
  const headerH = 86;
  doc.setFillColor(55, 25, 90);
  doc.roundedRect(M, M, pageW - M * 2, headerH, 18, 18, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title ?? "A little birthday reflection", M + 22, M + 34);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(220, 210, 235);
  doc.text(new Date().toLocaleString(), M + 22, M + 58);

  // section card helper
  const section = (y: number, heading: string, body: string) => {
    const cardW = pageW - M * 2;
    const innerM = 18;

    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, y, cardW, 1, 16, 16, "F"); // will be resized after we compute height

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(55, 25, 90);
    doc.text(heading, M + innerM, y + 30);

    doc.setDrawColor(220, 210, 235);
    doc.setLineWidth(1);
    doc.line(M + innerM, y + 42, M + cardW - innerM, y + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(35, 25, 55);

    const lines = wrap(body.trim(), cardW - innerM * 2);
    const lineH = 16;
    const startY = y + 68;
    doc.text(lines, M + innerM, startY);

    const bodyH = lines.length * lineH;
    const cardH = 86 + bodyH + 18;

    // redraw card with proper height (over the placeholder)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, y, cardW, cardH, 16, 16, "F");

    // re-draw text after the fill (so it stays on top)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(55, 25, 90);
    doc.text(heading, M + innerM, y + 30);

    doc.setDrawColor(220, 210, 235);
    doc.setLineWidth(1);
    doc.line(M + innerM, y + 42, M + cardW - innerM, y + 42);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(35, 25, 55);
    doc.text(lines, M + innerM, startY);

    return y + cardH + 18;
  };

  let y = M + headerH + 22;

  y = section(
    y,
    "Favorite moments of being 22",
    moments22 || "—"
  );

  y = section(
    y,
    "Goals + accomplishments for 23",
    goals23 || "—"
  );

  // footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 105, 140);
  doc.text("Made with love ✦", M, pageH - 24);

  return doc;
}
