import {
  youtubeThumbnailUrl,
  youtubeWatchUrl,
  type Roadmap,
} from "@/lib/roadmaps";

const BRAND = "#FF385C";
const SEENTUBE_LOGO_PATH = "/icons/icon-192.png";
const ARIGATO_LOGO_PATH = "/arigato-single-logo.png";

/** Vector stand-in used whenever the PNG logo cannot be fetched. */
const SEENTUBE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SeenTube">
  <rect width="512" height="512" rx="112" fill="${BRAND}"/>
  <rect x="92" y="146" width="328" height="220" rx="68" fill="#fff" fill-opacity=".2"/>
  <path d="M218 193 333 256 218 319V193Z" fill="#fff"/>
</svg>`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formattedDate = () =>
  new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export const roadmapFileName = (roadmap: Pick<Roadmap, "title">, extension: string) => {
  const slug = roadmap.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "roadmap"}-roadmap.${extension}`;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Logos are inlined as data URLs so an exported file stays self-contained. */
const fetchDataUrl = async (path: string) => {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

type LogoAsset = { dataUrl: string; width: number; height: number };

/**
 * Source logos are far larger than they are ever rendered, and PDFs embed
 * bitmaps at full resolution — downscale them before inlining.
 */
const loadLogo = async (path: string, maxSize: number): Promise<LogoAsset | null> => {
  const dataUrl = await fetchDataUrl(path);
  if (!dataUrl) return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Logo could not be decoded"));
      element.src = dataUrl;
    });
    if (!image.width || !image.height) return null;

    const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { dataUrl, width: image.width, height: image.height };
    context.drawImage(image, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } catch {
    return null;
  }
};

type ExportAssets = {
  seentubeLogo: LogoAsset | null;
  arigatoLogo: LogoAsset | null;
};

const loadExportAssets = async (): Promise<ExportAssets> => {
  const [seentubeLogo, arigatoLogo] = await Promise.all([
    loadLogo(SEENTUBE_LOGO_PATH, 96),
    loadLogo(ARIGATO_LOGO_PATH, 64),
  ]);
  return { seentubeLogo, arigatoLogo };
};

type ExportContext = {
  /** Display name from the owner's profile. */
  ownerName: string;
  ownerUsername?: string;
  /** Absolute link back to this roadmap inside SeenTube, when available. */
  appUrl?: string;
};

const ownerByline = ({ ownerName, ownerUsername }: ExportContext) => {
  const name = ownerName.trim();
  const username = (ownerUsername || "").trim().replace(/^@/, "");
  if (name && username && name.toLowerCase() !== username.toLowerCase()) return `${name} (@${username})`;
  if (username) return `@${username}`;
  return name || "unknown";
};

export function buildRoadmapHtml(
  roadmap: Roadmap,
  context: ExportContext,
  assets: ExportAssets = { seentubeLogo: null, arigatoLogo: null },
) {
  const { appUrl } = context;
  const byline = ownerByline(context);
  const videoCount = roadmap.steps.length;
  const steps = roadmap.steps.map((step, index) => {
    const watchUrl = escapeHtml(youtubeWatchUrl(step.youtubeId));
    const thumbnail = escapeHtml(youtubeThumbnailUrl(step.youtubeId));
    const title = escapeHtml(step.title);
    return `
      <li class="step">
        <div class="step-index">${index + 1}</div>
        <div class="step-card">
          <a class="step-thumb-link" href="${watchUrl}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${title} on YouTube">
            <img class="step-thumb" src="${thumbnail}" alt="" loading="lazy" />
          </a>
          <div class="step-body">
            <h3 class="step-title"><a href="${watchUrl}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
            <a class="watch-button" href="${watchUrl}" target="_blank" rel="noopener noreferrer">
              <span class="play" aria-hidden="true"></span> Watch on YouTube
            </a>
          </div>
        </div>
      </li>`;
  }).join("");

  const seentubeMark = assets.seentubeLogo
    ? `<img class="mark" src="${assets.seentubeLogo.dataUrl}" alt="SeenTube" />`
    : `<span class="mark">${SEENTUBE_LOGO_SVG}</span>`;

  const arigatoMark = assets.arigatoLogo
    ? `<img class="arigato-mark" src="${assets.arigatoLogo.dataUrl}" alt="" />`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(roadmap.title)} — SeenTube roadmap</title>
<style>
  :root { --brand: ${BRAND}; --ink: #222222; --muted: #717171; --line: #EBEBEB; --soft: #F7F7F7; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 40px 20px 64px;
    background: #FFFFFF;
    color: var(--ink);
    font-family: "Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
    line-height: 1.5;
  }
  .sheet { max-width: 760px; margin: 0 auto; }
  .masthead { display: flex; align-items: center; gap: 12px; }
  .mark { width: 44px; height: 44px; border-radius: 12px; display: block; overflow: hidden; object-fit: contain; }
  .mark svg { width: 100%; height: 100%; display: block; }
  .wordmark { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; }
  .pill {
    margin-left: auto; font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: var(--brand); border: 1px solid var(--brand); border-radius: 999px; padding: 5px 12px;
  }
  h1 { font-size: 34px; line-height: 1.2; margin: 26px 0 6px; }
  .meta { margin: 0 0 34px; color: var(--muted); font-size: 14px; }
  h2 { font-size: 20px; margin: 0 0 18px; }
  ol { list-style: none; margin: 0; padding: 0; }
  .step { display: flex; gap: 14px; align-items: flex-start; padding-bottom: 14px; position: relative; }
  .step:not(:last-child)::after {
    content: ""; position: absolute; left: 17px; top: 40px; bottom: 0; width: 2px; background: var(--line);
  }
  .step-index {
    flex: 0 0 36px; height: 36px; border-radius: 999px; background: var(--brand); color: #FFFFFF;
    font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; z-index: 1;
  }
  .step-card {
    flex: 1; display: flex; gap: 14px; padding: 12px; border: 1px solid var(--line); border-radius: 14px; background: #FFFFFF;
  }
  .step-thumb-link { flex: 0 0 160px; line-height: 0; }
  .step-thumb { width: 160px; height: 90px; object-fit: cover; border-radius: 10px; background: var(--soft); }
  .step-body { min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .step-title { font-size: 16px; margin: 0; }
  .step-title a { color: inherit; text-decoration: none; }
  .step-title a:hover { color: var(--brand); }
  .watch-button {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
    background: var(--brand); color: #FFFFFF; font-size: 13px; font-weight: 600;
    padding: 8px 14px; border-radius: 999px;
  }
  .watch-button:hover { background: #E00B41; }
  .play {
    width: 0; height: 0; border-left: 8px solid currentColor;
    border-top: 5px solid transparent; border-bottom: 5px solid transparent;
  }
  .empty { padding: 40px; text-align: center; border: 1px dashed var(--line); border-radius: 14px; color: var(--muted); }
  footer { margin-top: 56px; padding-top: 28px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
  footer a { color: var(--brand); }
  .footer-note { margin: 0 0 10px; line-height: 1.7; }
  .arigato { display: flex; align-items: center; gap: 10px; margin-top: 28px; font-weight: 600; color: var(--ink); }
  .arigato-mark { width: 20px; height: 20px; object-fit: contain; }
  .copyright { margin: 10px 0 0; font-size: 12px; }
  @media print {
    body { padding: 0; }
    .step, .step-card { break-inside: avoid; }
    .watch-button { background: #FFFFFF; color: var(--brand); border: 1px solid var(--brand); }
  }
  @media (max-width: 560px) {
    .step-card { flex-direction: column; }
    .step-thumb-link { flex: none; }
    .step-thumb { width: 100%; height: auto; aspect-ratio: 16 / 9; }
  }
</style>
</head>
<body>
  <main class="sheet">
    <header class="masthead">
      ${seentubeMark}
      <span class="wordmark">SeenTube</span>
      <span class="pill">Roadmap</span>
    </header>

    <h1>${escapeHtml(roadmap.title)}</h1>
    <p class="meta">
      By ${escapeHtml(byline)} · ${videoCount} video${videoCount === 1 ? "" : "s"} · Exported on ${escapeHtml(formattedDate())}
    </p>

    <h2>Learning path</h2>
    ${videoCount > 0
      ? `<ol>${steps}</ol>`
      : `<p class="empty">This roadmap has no videos yet.</p>`}

    <footer>
      <p class="footer-note">Watch the videos in order — every card opens straight on YouTube.</p>
      ${appUrl ? `<p class="footer-note">Open in SeenTube: <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>` : ""}
      <div class="arigato">${arigatoMark}<span>SeenTube — an Arigato Labs product</span></div>
      <p class="copyright">© ${new Date().getFullYear()} Arigato Labs. All rights reserved.</p>
    </footer>
  </main>
</body>
</html>`;
}

export async function downloadRoadmapHtml(roadmap: Roadmap, context: ExportContext) {
  const assets = await loadExportAssets();
  const html = buildRoadmapHtml(roadmap, context, assets);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), roadmapFileName(roadmap, "html"));
}

/**
 * jsPDF's built-in fonts only cover Latin-1, so strip accents and drop
 * anything the standard encoding cannot render instead of emitting garbage.
 */
const pdfSafe = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

export async function downloadRoadmapPdf(roadmap: Roadmap, context: ExportContext) {
  const { appUrl } = context;
  const byline = ownerByline(context);
  const [{ jsPDF }, assets] = await Promise.all([import("jspdf"), loadExportAssets()]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin - 8;
  let cursorY = margin;

  const drawSeentubeMark = (x: number, y: number, size: number) => {
    const logo = assets.seentubeLogo;
    if (logo) {
      try {
        const width = size * (logo.width / logo.height);
        pdf.addImage(logo.dataUrl, "PNG", x, y, width, size);
        return;
      } catch {
        // fall through to the vector mark
      }
    }
    pdf.setFillColor(255, 56, 92);
    pdf.roundedRect(x, y, size, size, size * 0.22, size * 0.22, "F");
    pdf.setFillColor(255, 255, 255);
    pdf.triangle(
      x + size * 0.4, y + size * 0.32,
      x + size * 0.4, y + size * 0.68,
      x + size * 0.68, y + size * 0.5,
      "F",
    );
  };

  drawSeentubeMark(margin, cursorY, 11);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(34, 34, 34);
  pdf.text("SeenTube", margin + 14, cursorY + 5.5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(255, 56, 92);
  pdf.text("ROADMAP", margin + 14, cursorY + 10);
  cursorY += 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(34, 34, 34);
  const titleLines = pdf.splitTextToSize(pdfSafe(roadmap.title), contentWidth) as string[];
  titleLines.forEach((line) => {
    pdf.text(line, margin, cursorY + 6);
    cursorY += 8;
  });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(113, 113, 113);
  const videoCount = roadmap.steps.length;
  pdf.text(
    pdfSafe(`By ${byline}  ·  ${videoCount} video${videoCount === 1 ? "" : "s"}  ·  Exported ${formattedDate()}`),
    margin,
    cursorY + 5,
  );
  cursorY += 12;

  if (appUrl) {
    pdf.setFontSize(9);
    pdf.setTextColor(255, 56, 92);
    pdf.textWithLink(pdfSafe(appUrl), margin, cursorY, { url: appUrl });
    cursorY += 9;
  }

  pdf.setDrawColor(235, 235, 235);
  pdf.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 10;

  if (videoCount === 0) {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(11);
    pdf.setTextColor(113, 113, 113);
    pdf.text("This roadmap has no videos yet.", margin, cursorY + 6);
    cursorY += 14;
  }

  roadmap.steps.forEach((step, index) => {
    const watchUrl = youtubeWatchUrl(step.youtubeId);
    const textLeft = margin + 14;
    const textWidth = contentWidth - 18;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    const lines = pdf.splitTextToSize(pdfSafe(step.title) || "Untitled video", textWidth) as string[];
    const urlLines = pdf.splitTextToSize(watchUrl, textWidth) as string[];
    const cardHeight = 12 + lines.length * 5 + urlLines.length * 4.2;

    if (cursorY + cardHeight > bottomLimit) {
      pdf.addPage();
      cursorY = margin;
    }

    pdf.setDrawColor(235, 235, 235);
    pdf.setFillColor(255, 255, 255);
    pdf.roundedRect(margin, cursorY, contentWidth, cardHeight, 3, 3, "FD");

    pdf.setFillColor(255, 56, 92);
    pdf.circle(margin + 7, cursorY + 7, 4, "F");
    pdf.setFontSize(9);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(index + 1), margin + 7, cursorY + 8.4, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(34, 34, 34);
    let lineY = cursorY + 7.5;
    lines.forEach((line) => {
      pdf.text(line, textLeft, lineY);
      lineY += 5;
    });

    // The full URL stays visible in the PDF and is clickable.
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(255, 56, 92);
    lineY += 1;
    urlLines.forEach((line) => {
      pdf.textWithLink(line, textLeft, lineY, { url: watchUrl });
      lineY += 4.2;
    });

    pdf.link(margin, cursorY, contentWidth, cardHeight, { url: watchUrl });

    cursorY += cardHeight + 5;
  });

  const creditHeight = 32;
  if (cursorY + creditHeight > bottomLimit) {
    pdf.addPage();
    cursorY = margin;
  }
  cursorY += 12;
  pdf.setDrawColor(235, 235, 235);
  pdf.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 12;

  let creditLeft = margin;
  const arigatoLogo = assets.arigatoLogo;
  if (arigatoLogo) {
    try {
      const height = 6;
      const width = height * (arigatoLogo.width / arigatoLogo.height);
      pdf.addImage(arigatoLogo.dataUrl, "PNG", margin, cursorY - 4.4, width, height);
      creditLeft = margin + width + 3;
    } catch {
      creditLeft = margin;
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(34, 34, 34);
  pdf.text("SeenTube - an Arigato Labs product", creditLeft, cursorY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.setTextColor(113, 113, 113);
  pdf.text(`(c) ${new Date().getFullYear()} Arigato Labs. All rights reserved.`, creditLeft, cursorY + 6);

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text("Generated with SeenTube by Arigato Labs", margin, pageHeight - 8);
    pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  pdf.save(roadmapFileName(roadmap, "pdf"));
}
