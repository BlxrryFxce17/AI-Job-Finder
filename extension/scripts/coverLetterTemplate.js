// Cover Letter Template & Pure PDF Generator Module
// Implements the standard corporate business letter format with zero browser headers/footers,
// zero drive links, and 1-click automatic naming: [company]_[role]_CoverLetter.pdf

(() => {
  'use strict';

  // Helper: clean text of external URLs, Google Drive links, and hr separators
  function sanitizeLetterBody(text) {
    if (!text) return '';
    return text
      .replace(/https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s\)\>]+/gi, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // unwrap markdown links [text](url) -> text
      .replace(/(?:google\s*drive|drive\s*link|drive\s*folder|portfolio\s*link|resume\s*link)\s*:\s*[^\s\n]+/gi, '')
      .replace(/<hr\s*\/?>/gi, '')
      .replace(/^-{3,}$/gm, '')
      .replace(/^_{3,}$/gm, '')
      .trim();
  }

  // Format cover letter text strictly matching the user template:
  // [Your Name]
  // [Your Address]
  // [Your Contact Info]
  //
  // [Date]
  //
  // Dear [Hiring Manager's Name],
  //
  // [Body Paragraphs]
  //
  // Thank you for your time, and I look forward to speaking more!
  //
  // Best Regards,
  // [Your Name]
  function formatCoverLetterText(opts) {
    let { name, address, contact, date, hiringManager, company, role, rawBody } = opts;
    let text = sanitizeLetterBody(rawBody);

    // 1. Strip leading placeholder lines e.g. "Candidate Name\nSeptember 22, 2026\n"
    text = text.replace(/^(?:candidate\s*name|\[your\s*name\])[^\n]*\n+/i, '');
    text = text.replace(/^[a-z]+ \d{1,2},? \d{4}\n+/i, '');

    // 2. Detect and extract Salutation if present at start of text
    let salutationMatch = text.match(/^(dear\s+[^,\n]+,|to\s+the\s+[^,\n]+,)/i);
    let detectedSalutation = null;
    if (salutationMatch) {
      detectedSalutation = salutationMatch[1].trim();
      text = text.slice(salutationMatch[0].length).trim();
    }

    // 3. Determine clean company name casing
    let cleanCompany = (company || '').trim();
    if (cleanCompany) {
      const compRegex = new RegExp(`\\b(${cleanCompany})\\b`, 'i');
      const matchInBody = text.match(compRegex);
      if (matchInBody) {
        cleanCompany = matchInBody[0];
      } else {
        cleanCompany = cleanCompany.charAt(0).toUpperCase() + cleanCompany.slice(1);
      }
    }

    // Fix or generate salutation
    if (detectedSalutation) {
      if (cleanCompany && company) {
        detectedSalutation = detectedSalutation.replace(new RegExp(company, 'i'), cleanCompany);
      }
    } else {
      detectedSalutation = hiringManager ? `Dear ${hiringManager},` : (cleanCompany ? `Dear ${cleanCompany} Hiring Team,` : 'Dear Hiring Manager,');
    }

    // 4. Split into paragraphs
    let paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

    // Remove any redundant salutation remaining in paragraph 1
    if (paragraphs.length > 0 && /^(dear\s+[^,\n]+,|to\s+the\s+[^,\n]+,)/i.test(paragraphs[0])) {
      paragraphs[0] = paragraphs[0].replace(/^(dear\s+[^,\n]+,|to\s+the\s+[^,\n]+,)\s*/i, '').trim();
      if (!paragraphs[0]) paragraphs.shift();
    }

    // 5. Clean trailing sign-offs, closing statements, and candidate signatures from the LAST paragraph
    if (paragraphs.length > 0) {
      let lastP = paragraphs[paragraphs.length - 1];
      const linesInP = lastP.split('\n').map(l => l.trim());

      while (linesInP.length > 0) {
        const lastLine = linesInP[linesInP.length - 1];
        const lower = lastLine.toLowerCase();

        if (!lastLine) {
          linesInP.pop();
          continue;
        }
        if (lower.includes('candidate name') || lower.includes('[your name]')) {
          linesInP.pop();
          continue;
        }
        if (['best,', 'best', 'sincerely,', 'sincerely', 'warm regards,', 'best regards,', 'regards,', 'regards'].includes(lower)) {
          linesInP.pop();
          continue;
        }
        // Trailing thank you / closing line on its own (regardless of length)
        if (
          lower.startsWith('thank you for your time') ||
          lower.startsWith('thank you for your consideration') ||
          lower.startsWith('thank you for taking the time') ||
          lower.startsWith('thank you for considering') ||
          lower.startsWith('i look forward to') ||
          lower.startsWith('i welcome the opportunity')
        ) {
          linesInP.pop();
          continue;
        }
        // Trailing candidate name line like "Akash V."
        if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?|\s+[A-Z][a-z]+)*$/.test(lastLine)) {
          if (!name || name === 'Candidate Name' || name === 'Candidate') {
            name = lastLine;
          }
          linesInP.pop();
          continue;
        }
        break;
      }

      let cleanedP = linesInP.join('\n').trim();
      // Also strip inline closing sentences at the very end of the paragraph so the template closing is not redundant
      cleanedP = cleanedP.replace(/\s*thank\s+you\s+for\s+your\s+time\s+(?:and|\&)\s+consideration\.?\s*(?:i\s+welcome\s+the\s+opportunity\s+to\s+discuss[^\.]*\.?)?$/i, '');
      cleanedP = cleanedP.replace(/\s*i\s+welcome\s+the\s+opportunity\s+to\s+discuss[^\.]*\.?$/i, '');
      cleanedP = cleanedP.replace(/\s*i\s+look\s+forward\s+to\s+discussing[^\.]*\.?$/i, '');
      cleanedP = cleanedP.replace(/\s*thank\s+you\s+for\s+your\s+time\.?\s*$/i, '');
      cleanedP = cleanedP.replace(/\s*thank\s+you\s+for\s+your\s+consideration\.?\s*$/i, '');

      if (!cleanedP) {
        paragraphs.pop();
      } else {
        paragraphs[paragraphs.length - 1] = cleanedP;
      }
    }

    const finalName = (name && name !== 'Candidate Name' && name !== 'Candidate') ? name : 'Candidate';
    const closing = 'Thank you for your time, and I look forward to speaking more!';
    const signOff = `Best Regards,\n${finalName}`;

    return {
      name: finalName,
      address: address || '',
      contact: contact || '',
      date: date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      salutation: detectedSalutation,
      bodyParagraphs: paragraphs,
      closing,
      signOff
    };
  }

  // Pure Client-Side PDF 1.4 Binary Generator
  // Generates a standard, valid PDF without requiring any external libraries or browser print dialogs.
  // Produces clean typography, exact margins, and zero browser headers, dates, or URL footers.
  function buildPureCoverLetterPdfBytes(opts) {
    const formatted = formatCoverLetterText(opts);
    const pageWidth = 612; // 8.5 inches * 72 points
    const pageHeight = 792; // 11.0 inches * 72 points
    const margin = 54; // 0.75 inch margins
    const maxChars = 84;
    const leading = 15;

    // Build ordered list of lines to render
    const renderLines = [];

    // 1. [Your Name] (Bold, 13pt)
    if (formatted.name) {
      renderLines.push({ text: formatted.name, isBold: true, size: 13 });
    }
    // 2. [Your Address] (9.5pt)
    if (formatted.address) {
      renderLines.push({ text: formatted.address, isBold: false, size: 9.5 });
    }
    // 3. [Your Contact Info] (9.5pt)
    if (formatted.contact) {
      renderLines.push({ text: formatted.contact, isBold: false, size: 9.5 });
    }
    renderLines.push({ text: '', size: 9.5 });

    // 4. [Date] (10pt)
    if (formatted.date) {
      renderLines.push({ text: formatted.date, isBold: false, size: 10 });
    }
    renderLines.push({ text: '', size: 10 });

    // 5. Dear [Hiring Manager], (10.5pt)
    renderLines.push({ text: formatted.salutation, isBold: false, size: 10.5 });
    renderLines.push({ text: '', size: 10.5 });

    // Helper to calculate approximate Helvetica 10pt character widths for word spacing
    function getHelvetica10ptWidth(str) {
      let w = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c === 32) w += 2.78;
        else if ('ijlI1.:;,!|'.indexOf(str[i]) !== -1) w += 2.78;
        else if ('frtJ()[]'.indexOf(str[i]) !== -1) w += 3.33;
        else if ('abcdeghknopquvxyz023456789$'.indexOf(str[i]) !== -1) w += 5.56;
        else if ('mwMW_@%&'.indexOf(str[i]) !== -1) w += 8.33;
        else if (c >= 65 && c <= 90) w += 6.67;
        else w += 5.56;
      }
      return w;
    }

    // 6. Body paragraphs (10pt, wrapped and justified)
    formatted.bodyParagraphs.forEach(para => {
      const words = para.split(/\s+/);
      let curLine = '';
      words.forEach(w => {
        if (!curLine) {
          curLine = w;
        } else if ((curLine + ' ' + w).length <= maxChars) {
          curLine += ' ' + w;
        } else {
          renderLines.push({ text: curLine, isBold: false, size: 10, isJustified: true });
          curLine = w;
        }
      });
      if (curLine) {
        renderLines.push({ text: curLine, isBold: false, size: 10, isJustified: false });
      }
      renderLines.push({ text: '', size: 10 }); // blank line between paragraphs
    });

    // 7. Closing sentence
    renderLines.push({ text: formatted.closing, isBold: false, size: 10 });
    renderLines.push({ text: '', size: 10 });

    // 8. Best Regards, [Your Name]
    renderLines.push({ text: 'Best Regards,', isBold: false, size: 10 });
    renderLines.push({ text: formatted.name, isBold: false, size: 10 });

    // Multi-page splitting if content is long
    const maxLinesPerPage = 42;
    const pages = [];
    for (let i = 0; i < renderLines.length; i += maxLinesPerPage) {
      pages.push(renderLines.slice(i, i + maxLinesPerPage));
    }
    if (pages.length === 0) pages.push([{ text: '', size: 10 }]);

    const numPages = pages.length;
    const fontNormId = 3 + 2 * numPages;
    const fontBoldId = 3 + 2 * numPages + 1;
    const totalObjects = 3 + 2 * numPages + 2;

    const pageIds = [];
    for (let p = 0; p < numPages; p++) pageIds.push(3 + p);

    let out = '%PDF-1.4\n';
    const offsets = [];

    function addObj(id, content) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${content}\nendobj\n`;
    }

    addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
    addObj(2, `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${numPages} >>`);

    for (let p = 0; p < numPages; p++) {
      const pageObjId = 3 + p;
      const streamObjId = 3 + numPages + p;
      addObj(pageObjId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${streamObjId} 0 R /Resources << /Font << /F1 ${fontNormId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`);
    }

    for (let p = 0; p < numPages; p++) {
      const streamObjId = 3 + numPages + p;
      const pageLines = pages[p];

      let stream = 'BT\n';
      stream += `${margin} ${pageHeight - margin - 14} Td\n`;
      stream += `/F1 10 Tf\n${leading} TL\n`;

      let curFont = '/F1 10';
      pageLines.forEach((item, idx) => {
        const fStr = item.isBold ? `/F2 ${item.size}` : `/F1 ${item.size}`;
        if (fStr !== curFont) {
          stream += `${fStr} Tf\n`;
          curFont = fStr;
        }
        if (idx > 0) stream += 'T*\n';
        if (item.text) {
          const safe = item.text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
          if (item.isJustified) {
            const words = item.text.split(' ');
            if (words.length > 1) {
              const currentWidth = getHelvetica10ptWidth(item.text);
              const extraWidth = (pageWidth - 2 * margin) - currentWidth;
              if (extraWidth > 0 && extraWidth < 60) {
                const wordSpacing = extraWidth / (words.length - 1);
                stream += `${wordSpacing.toFixed(2)} Tw (${safe}) Tj 0 Tw\n`;
                return;
              }
            }
          }
          stream += `(${safe}) Tj\n`;
        }
      });
      stream += 'ET\n';

      addObj(streamObjId, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    }

    addObj(fontNormId, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    addObj(fontBoldId, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

    const startXref = out.length;
    out += `xref\n0 ${totalObjects}\n0000000000 65535 f \n`;
    for (let id = 1; id < totalObjects; id++) {
      out += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
    }
    out += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    // Convert to Uint8Array binary
    const uint8 = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) {
      uint8[i] = out.charCodeAt(i) & 0xff;
    }
    return uint8;
  }

  // 1-Click Direct Download as [company]_[role]_CoverLetter.pdf
  function downloadCoverLetterPdf(opts) {
    const cleanCompany = (opts.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanRole = (opts.role || 'Role').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanCompany}_${cleanRole}_CoverLetter.pdf`;

    const pdfBytes = buildPureCoverLetterPdfBytes(opts);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) {}
    }, 2000);

    return fileName;
  }

  // Clean Printable HTML Document (Zero browser headers, dates, URLs or page numbers)
  function printCoverLetterHtml(opts) {
    const formatted = formatCoverLetterText(opts);
    const cleanCompany = (opts.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanRole = (opts.role || 'Role').replace(/[^a-zA-Z0-9]/g, '_');
    const pdfFileName = `${cleanCompany}_${cleanRole}_CoverLetter`;

    let printFrame = document.getElementById('ai-cover-letter-print-frame');
    if (printFrame) printFrame.remove();

    printFrame = document.createElement('iframe');
    printFrame.id = 'ai-cover-letter-print-frame';
    printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow.document;
    const bodyHtml = formatted.bodyParagraphs
      .map(p => `<p class="cl-p">${escapeHtml(p)}</p>`)
      .join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(pdfFileName)}</title>
        <style>
          @page {
            size: letter portrait;
            margin: 0 !important; /* Zero margin suppresses browser default date, URL, title and page numbers */
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #000000;
          }
          .cl-page {
            padding: 22mm 20mm !important;
            box-sizing: border-box !important;
          }
          .cl-header {
            margin-bottom: 20px;
          }
          .cl-name {
            font-size: 13.5pt;
            font-weight: bold;
            color: #000000;
            margin-bottom: 3px;
          }
          .cl-sub {
            font-size: 10pt;
            color: #333333;
            line-height: 1.4;
          }
          .cl-date {
            font-size: 10.5pt;
            margin-bottom: 20px;
          }
          .cl-salutation {
            font-size: 10.5pt;
            margin-bottom: 16px;
          }
          .cl-p {
            margin: 0 0 16px 0;
            text-align: justify !important;
            text-justify: inter-word !important;
            line-height: 1.55;
          }
          .cl-closing {
            margin-top: 16px;
            margin-bottom: 20px;
          }
          .cl-signoff {
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="cl-page">
          <div class="cl-header">
            <div class="cl-name">${escapeHtml(formatted.name)}</div>
            ${formatted.address ? `<div class="cl-sub">${escapeHtml(formatted.address)}</div>` : ''}
            ${formatted.contact ? `<div class="cl-sub">${escapeHtml(formatted.contact)}</div>` : ''}
          </div>
          <div class="cl-date">${escapeHtml(formatted.date)}</div>
          <div class="cl-salutation">${escapeHtml(formatted.salutation)}</div>
          <div class="cl-body">
            ${bodyHtml}
          </div>
          <div class="cl-closing">${escapeHtml(formatted.closing)}</div>
          <div class="cl-signoff">
            Best Regards,<br/>
            ${escapeHtml(formatted.name)}
          </div>
        </div>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    }, 300);

    return pdfFileName;
  }

  // Helper: Download as plain .txt
  function downloadCoverLetterTxt(opts) {
    const formatted = formatCoverLetterText(opts);
    const cleanCompany = (opts.company || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanRole = (opts.role || 'Role').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${cleanCompany}_${cleanRole}_CoverLetter.txt`;

    const fullText = [
      formatted.name,
      formatted.address,
      formatted.contact,
      '',
      formatted.date,
      '',
      formatted.salutation,
      '',
      formatted.bodyParagraphs.join('\n\n'),
      '',
      formatted.closing,
      '',
      'Best Regards,',
      formatted.name
    ].filter(l => l !== undefined).join('\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_) {}
    }, 2000);

    return fileName;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Export to global window namespace
  window.CoverLetterTemplate = {
    sanitizeLetterBody,
    formatCoverLetterText,
    buildPureCoverLetterPdfBytes,
    downloadCoverLetterPdf,
    printCoverLetterHtml,
    downloadCoverLetterTxt
  };
})();
