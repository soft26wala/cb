const { jsPDF } = require('jspdf');
require('jspdf-autotable');

/**
 * Server-side Invoice PDF Generator fallback
 * Creates a buffer containing the PDF document for an invoice
 */
function generateServerInvoicePdf(invoice = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const creds = invoice.company_credentials || {
    company_name: 'GB Cabinet Doors Ltd.',
    business_number: '987654321 BC0001',
    gst_number: '12345 6789 RT0001',
    pst_number: 'PST-1001-8849',
    company_email: 'info@gbcabinetdoors.ca',
    company_phone: '(604) 503-3711',
    website: 'https://gbcabinetdoors.ca',
    address_line1: '12885 85 Ave',
    city: 'Surrey',
    province: 'BC',
    postal_code: 'V3W 0K8',
    country: 'Canada',
  };

  const invoiceNum = invoice.invoice_number || 'INV-10025';
  const customerName = invoice.company_name || invoice.customer_company_name || invoice.customer_name || invoice.client_name || 'Valued Customer';
  const customerAddress = invoice.address || 'Surrey, BC, Canada';
  const rawDate = invoice.invoice_date || invoice.created_at;
  const dateStr = rawDate ? new Date(rawDate).toLocaleDateString() : new Date().toLocaleDateString();

  const subtotal = parseFloat(invoice.subtotal || 0);
  const discount = parseFloat(invoice.discount_amount || 0);
  const delivery = parseFloat(invoice.delivery_charge || 0);
  const gst = parseFloat(invoice.gst_amount || (subtotal * 0.05));
  const pst = invoice.pst_exempt ? 0 : parseFloat(invoice.pst_amount || (subtotal * 0.07));
  const grandTotal = parseFloat(invoice.total_amount || (subtotal - discount + delivery + gst + pst));
  
  const isCashOrder = Boolean(
    (invoice.payment_type || '').toLowerCase().includes('cash') ||
    (invoice.payment_method || '').toLowerCase().includes('cash') ||
    (invoice.method || '').toLowerCase().includes('cash')
  );
  const paid = isCashOrder ? 0 : parseFloat(invoice.paid_amount || 0);
  const remaining = isCashOrder ? grandTotal : Math.max(0, grandTotal - paid);

  // Header Brand Band
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(185, 28, 28); // Red
  doc.text(creds.company_name, 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text(`${creds.address_line1}, ${creds.city}, ${creds.province} ${creds.postal_code}, ${creds.country}`, 14, 24);
  doc.text(`Phone: ${creds.company_phone} | Email: ${creds.company_email}`, 14, 29);

  // Title Box
  doc.setLineWidth(0.5);
  doc.setDrawColor(200);
  doc.line(14, 34, 196, 34);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`INVOICE #${invoiceNum}`, 14, 42);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${dateStr}`, 150, 42);

  // Bill To Box
  doc.setFillColor(248, 250, 252);
  doc.rect(14, 47, 182, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('BILL TO:', 18, 53);
  doc.setFont('helvetica', 'normal');
  doc.text(customerName, 18, 58);
  doc.text(`Address: ${customerAddress}`, 18, 63);

  // Items Table
  const items = invoice.items || [];
  const tableData = items.map((item, idx) => [
    idx + 1,
    item.product_name || item.description || 'Cabinet Door / Product',
    item.quantity || 1,
    `$${parseFloat(item.price || 0).toFixed(2)}`,
    `$${parseFloat(item.total || (item.price * item.quantity) || 0).toFixed(2)}`,
  ]);

  if (tableData.length === 0) {
    tableData.push([1, 'Cabinet Doors Order', 1, `$${subtotal.toFixed(2)}`, `$${subtotal.toFixed(2)}`]);
  }

  doc.autoTable({
    startY: 74,
    head: [['#', 'Description', 'QTY', 'Unit Price', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8.5 },
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  // Summary Totals
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Subtotal:`, 130, finalY);
  doc.text(`$${subtotal.toFixed(2)}`, 175, finalY);

  if (discount > 0) {
    doc.text(`Discount:`, 130, finalY + 5);
    doc.text(`-$${discount.toFixed(2)}`, 175, finalY + 5);
  }
  if (delivery > 0) {
    doc.text(`Delivery Charge:`, 130, finalY + 10);
    doc.text(`+$${delivery.toFixed(2)}`, 175, finalY + 10);
  }

  const taxY = finalY + (discount > 0 ? 5 : 0) + (delivery > 0 ? 5 : 0);
  doc.text(`GST (5%):`, 130, taxY + 5);
  doc.text(`$${gst.toFixed(2)}`, 175, taxY + 5);

  doc.text(`PST (7%):`, 130, taxY + 10);
  doc.text(invoice.pst_exempt ? 'EXEMPT' : `$${pst.toFixed(2)}`, 175, taxY + 10);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Grand Total:`, 130, taxY + 18);
  doc.text(`$${grandTotal.toFixed(2)} CAD`, 165, taxY + 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Paid Amount:`, 130, taxY + 24);
  doc.text(`$${paid.toFixed(2)}`, 175, taxY + 24);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(185, 28, 28);
  doc.text(`Balance Due:`, 130, taxY + 30);
  doc.text(`$${remaining.toFixed(2)} CAD`, 165, taxY + 30);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Thank you for choosing ${creds.company_name}!`, 14, 280);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

module.exports = {
  generateServerInvoicePdf,
};
