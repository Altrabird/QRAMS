/* qr.js — turn QR records into scannable images + printable/exportable sheets.
   Uses QRious (canvas), JSZip (ZIP), jsPDF (PDF). All run in the browser. */

const QRGen = {
  brandColor: '#0f172a',

  /* Draw a QR onto a fresh canvas and return it. `text` is the scan URL. */
  canvas(text, size = 320) {
    const c = document.createElement('canvas');
    new QRious({ element: c, value: text, size, level: 'M', background: '#ffffff', foreground: this.brandColor });
    return c;
  },

  pngDataUrl(text, size = 320) { return this.canvas(text, size).toDataURL('image/png'); },

  /* One printable card: QR + name + id + class + task title. */
  cardHtml(qr, taskTitle) {
    const url = UI.scanUrl(qr.token);
    return `<div class="qr-card" data-token="${UI.esc(qr.token)}">
        <img alt="QR for ${UI.esc(qr.label)}" src="${this.pngDataUrl(url, 300)}">
        <div class="qr-name">${UI.esc(qr.label)}</div>
        <div class="qr-meta">${UI.esc(qr.entityId)}${qr.className ? ' · ' + UI.esc(qr.className) : ''}</div>
        <div class="qr-meta">${UI.esc(taskTitle || '')}</div>
        <div class="qr-meta text-muted" style="font-size:.66rem">${UI.esc(qr.token)}</div>
      </div>`;
  },

  /* Render a whole grid of cards into a container element. */
  renderGrid(container, qrList, taskTitle) {
    if (!qrList.length) { container.innerHTML = UI.emptyState('qr-code', 'No QR codes yet', 'Generate some from the QR Generator.'); return; }
    container.innerHTML = `<div class="qr-grid">${qrList.map(q => this.cardHtml(q, taskTitle)).join('')}</div>`;
  },

  /* Download a single QR as PNG. */
  downloadOne(qr) {
    const a = document.createElement('a');
    a.href = this.pngDataUrl(UI.scanUrl(qr.token), 512);
    a.download = (qr.label || qr.token).replace(/[^\w-]+/g, '_') + '.png';
    a.click();
  },

  /* Bundle every QR PNG into a single ZIP download. */
  async downloadZip(qrList, taskTitle) {
    const zip = new JSZip();
    const folder = zip.folder((taskTitle || 'QR_Codes').replace(/[^\w-]+/g, '_'));
    qrList.forEach(qr => {
      const data = this.pngDataUrl(UI.scanUrl(qr.token), 512).split(',')[1];
      folder.file((qr.label || qr.token).replace(/[^\w-]+/g, '_') + '.png', data, { base64: true });
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (taskTitle || 'QR_Codes').replace(/[^\w-]+/g, '_') + '.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  },

  /* Build a printable PDF sheet of QR cards. paper: 'a4' | 'a5'. */
  downloadPdf(qrList, taskTitle, paper = 'a4') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: paper });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10, cols = 3, gap = 6;
    const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
    const qrSize = cellW;            // square QR
    const cellH = qrSize + 16;       // QR + 2 text lines
    let x = margin, y = margin, col = 0;

    qrList.forEach((qr) => {
      if (y + cellH > pageH - margin) { doc.addPage(); x = margin; y = margin; col = 0; }
      const img = this.pngDataUrl(UI.scanUrl(qr.token), 400);
      doc.addImage(img, 'PNG', x, y, qrSize, qrSize);
      doc.setFontSize(8);
      doc.text(String(qr.label || '').slice(0, 28), x + qrSize / 2, y + qrSize + 4, { align: 'center' });
      doc.setFontSize(6);
      doc.text(`${qr.entityId || ''}  ${qr.className || ''}`.trim().slice(0, 34), x + qrSize / 2, y + qrSize + 8, { align: 'center' });

      col++;
      if (col >= cols) { col = 0; x = margin; y += cellH + gap; }
      else { x += cellW + gap; }
    });

    doc.save((taskTitle || 'QR_Sheet').replace(/[^\w-]+/g, '_') + '.pdf');
  },

  print() { window.print(); },
};
