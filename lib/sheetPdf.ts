// Turns the on-screen pay sheet into a letter-size PDF file.
//
// iPhone home-screen web apps cannot print: window.print() does nothing there.
// A PDF file handed to the Share sheet can be printed or saved from any iPhone,
// so the sheet page builds one here. Pages break between table rows and section
// bands, never through the middle of a row.

const PAGE_W_IN = 8.5;
const PAGE_H_IN = 11;
const MARGIN_IN = 0.35;
const RENDER_WIDTH = 1000; // lay the sheet out at desktop width, not phone width
const SCALE = 2;

export async function buildSheetPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  try { await document.fonts?.ready; } catch { /* fonts optional */ }

  // Bottom edges (CSS px from the top of the sheet) where a page may break.
  let breaks: number[] = [];
  const canvas = await html2canvas(el, {
    scale: SCALE,
    backgroundColor: "#ffffff",
    windowWidth: RENDER_WIDTH,
    useCORS: true,
    logging: false,
    onclone: (doc) => {
      const root = doc.getElementById(el.id);
      if (!root) return;
      doc.querySelectorAll<HTMLElement>(".mm-bar").forEach((n) => { n.style.display = "none"; });
      doc.querySelectorAll<HTMLElement>(".scroll").forEach((n) => { n.style.overflow = "visible"; });
      const sheet = root.querySelector<HTMLElement>(".sheet");
      if (sheet) { sheet.style.margin = "0 auto"; sheet.style.boxShadow = "none"; }
      const top = root.getBoundingClientRect().top;
      breaks = Array.from(root.querySelectorAll<HTMLElement>("tr, .band, .band-note, .urgency, .empty, .footer, .source"))
        .map((n) => n.getBoundingClientRect().bottom - top)
        .filter((y) => y > 0)
        .sort((a, b) => a - b);
    },
  });

  const pdf = new jsPDF({ unit: "in", format: "letter", orientation: "portrait" });
  const usableW = PAGE_W_IN - 2 * MARGIN_IN;
  const usableH = PAGE_H_IN - 2 * MARGIN_IN;
  const pxPerIn = canvas.width / usableW;            // canvas px per inch on the page
  const pageHpx = Math.floor(usableH * pxPerIn);     // canvas px that fit on one page
  const breakPx = breaks.map((y) => Math.round(y * SCALE)).filter((y) => y < canvas.height);

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    let end = Math.min(y + pageHpx, canvas.height);
    if (end < canvas.height) {
      // Break at the last row edge that fits; fall back to a hard cut if none does.
      const fit = breakPx.filter((b) => b > y + pageHpx * 0.5 && b <= end);
      if (fit.length) end = fit[fit.length - 1];
    }
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = end - y;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", MARGIN_IN, MARGIN_IN, usableW, slice.height / pxPerIn);
    first = false;
    y = end;
  }

  const blob = pdf.output("blob");
  return new File([blob], fileName, { type: "application/pdf" });
}
