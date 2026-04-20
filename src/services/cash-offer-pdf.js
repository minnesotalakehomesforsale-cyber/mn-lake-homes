/**
 * cash-offer-pdf.js — Branded PDF generator for cash-offer leads.
 *
 * Builds a preliminary, non-binding cash offer document using pdfkit and
 * streams it directly to the Express response.
 *
 * Brand:
 *   - Accent blue:  #1d6df2  (MN Lake Homes primary)
 *   - Header black: #0a0a0a
 *   - Body grey:    #2d3748
 */

const PDFDocument = require('pdfkit');

const BRAND_BLUE   = '#1d6df2';
const HEADER_BLACK = '#0a0a0a';
const BODY_GREY    = '#2d3748';
const MUTED_GREY   = '#718096';
const LINE_GREY    = '#e2e8f0';

function fmtCurrency(n) {
    if (n === null || n === undefined || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    });
}

function fmtDate(d) {
    if (!d) return '—';
    const date = d instanceof Date ? d : new Date(d);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtNumber(n, suffix = '') {
    if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—';
    return `${Number(n).toLocaleString('en-US')}${suffix}`;
}

/**
 * Pipe a branded offer PDF directly to the response.
 *
 * @param {import('express').Response} res
 * @param {Object} lead — row from cash_offer_leads
 */
function streamOfferPdf(res, lead) {
    const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 56, bottom: 56, left: 56, right: 56 },
        info: {
            Title:   `Cash Offer — ${lead.address_raw || 'Property'}`,
            Author:  'MN Lake Homes',
            Subject: 'Preliminary Cash Offer',
        },
    });

    // Streaming response: set headers + pipe.
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
        'Content-Disposition',
        `attachment; filename="cash-offer-${lead.id}.pdf"`
    );
    doc.pipe(res);

    // ── Header band ─────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 72).fill(HEADER_BLACK);
    doc.fillColor('#ffffff')
       .font('Helvetica-Bold')
       .fontSize(18)
       .text('MN Lake Homes', 56, 26, { lineBreak: false });
    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#ffffff')
       .text('Preliminary Cash Offer', doc.page.width - 240, 30, {
           width: 184,
           align: 'right',
       });

    // Reset text cursor below header
    doc.y = 104;
    doc.x = 56;

    // ── Title block ─────────────────────────────────────────────────────────
    doc.fillColor(HEADER_BLACK)
       .font('Helvetica-Bold')
       .fontSize(22)
       .text('Your Preliminary Cash Offer', { align: 'left' });

    doc.moveDown(0.4);
    doc.fillColor(MUTED_GREY)
       .font('Helvetica')
       .fontSize(11)
       .text(`Offer date: ${fmtDate(lead.offer_generated_at || lead.created_at)}`);

    // ── Offer amount callout ────────────────────────────────────────────────
    doc.moveDown(1.2);
    const calloutY = doc.y;
    const calloutH = 92;
    doc.roundedRect(56, calloutY, doc.page.width - 112, calloutH, 10)
       .fill(BRAND_BLUE);
    doc.fillColor('#ffffff')
       .font('Helvetica')
       .fontSize(11)
       .text('All-cash offer', 72, calloutY + 18, { lineBreak: false });
    doc.font('Helvetica-Bold')
       .fontSize(38)
       .text(fmtCurrency(lead.offer_amount), 72, calloutY + 34, { lineBreak: false });

    doc.y = calloutY + calloutH + 24;
    doc.x = 56;

    // ── Property address block ──────────────────────────────────────────────
    sectionHeader(doc, 'Property');
    doc.font('Helvetica-Bold')
       .fontSize(13)
       .fillColor(HEADER_BLACK)
       .text(lead.address_raw || '—');

    // ── Property detail table ───────────────────────────────────────────────
    doc.moveDown(0.6);
    const detailRows = [
        ['Bedrooms',    fmtNumber(lead.beds)],
        ['Bathrooms',   fmtNumber(lead.baths)],
        ['Square Feet', fmtNumber(lead.sqft)],
        ['Year Built',  lead.year_built ? String(lead.year_built) : '—'],
        ['Lot Size',    fmtNumber(lead.lot_size)],
        ['Condition',   lead.condition || '—'],
    ];
    if (lead.last_sale_price) {
        detailRows.push(['Last Sale', `${fmtCurrency(lead.last_sale_price)} · ${fmtDate(lead.last_sale_date)}`]);
    }
    drawKeyValueTable(doc, detailRows);

    // ── Contact info ────────────────────────────────────────────────────────
    doc.moveDown(1.2);
    sectionHeader(doc, 'Prepared For');
    const contactRows = [
        ['Name',  lead.full_name || '—'],
        ['Email', lead.email     || '—'],
        ['Phone', lead.phone     || '—'],
    ];
    drawKeyValueTable(doc, contactRows);

    // ── Disclaimer ──────────────────────────────────────────────────────────
    doc.moveDown(1.4);
    doc.roundedRect(56, doc.y, doc.page.width - 112, 80, 8)
       .lineWidth(1)
       .stroke(LINE_GREY);
    const disclaimerY = doc.y + 14;
    doc.fillColor(HEADER_BLACK)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text('Disclaimer', 72, disclaimerY, { lineBreak: false });
    doc.font('Helvetica')
       .fontSize(10)
       .fillColor(BODY_GREY)
       .text(
           'This is a preliminary, non-binding cash offer. Final offer subject to in-person inspection and title review.',
           72,
           disclaimerY + 16,
           { width: doc.page.width - 144, align: 'left' }
       );

    // ── Footer ──────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 56;
    doc.moveTo(56, footerY - 10).lineTo(doc.page.width - 56, footerY - 10)
       .lineWidth(0.5)
       .stroke(LINE_GREY);
    doc.fillColor(MUTED_GREY)
       .font('Helvetica')
       .fontSize(9)
       .text(
           'Minnesota Lake Homes · minnesotalakehomesforsale.com · minnesotalakehomesforsale@gmail.com',
           56,
           footerY,
           { width: doc.page.width - 112, align: 'center', lineBreak: false }
       );

    doc.end();
}

// ── helpers ────────────────────────────────────────────────────────────────
function sectionHeader(doc, label) {
    doc.fillColor(BRAND_BLUE)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text(label.toUpperCase(), { characterSpacing: 1.2 });
    doc.moveDown(0.3);
    doc.fillColor(BODY_GREY);
}

function drawKeyValueTable(doc, rows) {
    const startY = doc.y;
    const colKeyX = 56;
    const colValX = 200;
    const rowH = 18;

    rows.forEach((row, i) => {
        const y = startY + i * rowH;
        doc.fillColor(MUTED_GREY)
           .font('Helvetica')
           .fontSize(10)
           .text(row[0], colKeyX, y, { lineBreak: false, width: 140 });
        doc.fillColor(HEADER_BLACK)
           .font('Helvetica-Bold')
           .fontSize(11)
           .text(row[1] ?? '—', colValX, y, { lineBreak: false, width: doc.page.width - colValX - 56 });
    });

    doc.y = startY + rows.length * rowH;
    doc.x = 56;
}

module.exports = { streamOfferPdf };
