// Turns the on-screen pay sheet into a letter-size PDF file.
//
// iPhone home-screen web apps cannot print: window.print() does nothing there.
// A PDF file handed to the Share sheet can be printed or saved from any iPhone,
// so the sheet page builds one here. Pages break between table rows and section
// bands, never through the middle of a row.

const PAGE_W_IN = 8.5;
const PAGE_H_IN = 11;
const MARGIN_IN = 0.35;
// The sheet's own type (7–11px) was set for a full-width print and comes out
// unreadably small on letter paper. For the PDF it is laid out about 720px wide
// (roughly 0.78pt per px on the page) with every font enlarged 1.5x and never
// below 12px, so the smallest text prints at roughly 9pt. If the table still
// needs more room, the layout widens to fit it rather than cutting columns off.
const BASE_WIDTH = 720;
const FONT_SCALE = 1.5;
const MIN_FONT_PX = 12;
const SCALE = 2;

/** Lay out an off-screen copy of the sheet at print size and measure it. */
function stage(el: HTMLElement) {
  const box = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText = `position:absolute;left:-20000px;top:0;width:${BASE_WIDTH}px;background:#fff;`;
  box.innerHTML = el.innerHTML;
  document.body.appendChild(box);

  box.querySelectorAll<HTMLElement>(".mm-bar").forEach((n) => { n.style.display = "none"; });
  box.querySelectorAll<HTMLElement>(".scroll").forEach((n) => { n.style.overflow = "visible"; });
  const sheet = box.querySelector<HTMLElement>(".sheet");
  if (sheet) { sheet.style.margin = "0"; sheet.style.maxWidth = "none"; sheet.style.boxShadow = "none"; }

  // Read every size first, then write, so enlarged parents don't compound.
  const all = Array.from(box.querySelectorAll<HTMLElement>("*"));
  const sizes = all.map((n) => parseFloat(getComputedStyle(n).fontSize) || 11);
  all.forEach((n, i) => { n.style.fontSize = `${Math.max(sizes[i] * FONT_SCALE, MIN_FONT_PX)}px`; });

  // Widen until nothing overflows (wide tables, long notes).
  const widest = Math.max(BASE_WIDTH, ...Array.from(box.querySelectorAll<HTMLElement>("table, .sheet"))
    .map((n) => Math.ceil(n.scrollWidth)));
  box.style.width = `${widest}px`;

  const top = box.getBoundingClientRect().top;
  const breaks = Array.from(box.querySelectorAll<HTMLElement>("tr, .band, .band-note, .urgency, .empty, .footer, .source"))
    .map((n) => n.getBoundingClientRect().bottom - top)
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  return { box, width: Math.ceil(box.scrollWidth), height: Math.ceil(box.scrollHeight), breaks };
}

export async function buildSheetPdf(el: HTMLElement, fileName: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  try { await document.fonts?.ready; } catch { /* fonts optional */ }

  const { box, width, height, breaks } = stage(el);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(box, {
      scale: SCALE, backgroundColor: "#ffffff", useCORS: true, logging: false,
      width, height, windowWidth: width, windowHeight: height, x: 0, y: 0, scrollX: 0, scrollY: 0,
      onclone: (doc) => {
        // The copy is captured where it sits; bring it on-screen inside the clone.
        const copy = Array.from(doc.body.children).find((n) => n.getAttribute("aria-hidden") === "true"
          && (n as HTMLElement).style.left === "-20000px") as HTMLElement | undefined;
        if (copy) { copy.style.left = "0"; }
      },
    });
  } finally {
    box.remove();
  }

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
