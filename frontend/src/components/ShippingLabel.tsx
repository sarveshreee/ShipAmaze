import type { Order } from "@/types/logistics";

export function generateShippingLabelHTML(order: Order): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Shipping Label - ${order.awb}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 4in 6in; margin: 0; }
        body { font-family: 'Arial', sans-serif; width: 4in; height: 6in; padding: 8px; }
        .label { border: 2px solid #000; height: 100%; display: flex; flex-direction: column; }
        .header { background: #1a1a2e; color: white; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 16px; font-weight: bold; }
        .header .awb { font-size: 11px; font-family: monospace; }
        .barcode { text-align: center; padding: 10px; border-bottom: 2px solid #000; font-family: monospace; font-size: 14px; letter-spacing: 3px; }
        .barcode-lines { display: flex; justify-content: center; gap: 1px; margin-bottom: 4px; }
        .barcode-lines span { display: inline-block; width: 2px; background: #000; }
        .section { padding: 8px 12px; border-bottom: 1px solid #ccc; }
        .section-title { font-size: 9px; text-transform: uppercase; color: #666; letter-spacing: 1px; margin-bottom: 3px; font-weight: bold; }
        .section-content { font-size: 12px; line-height: 1.4; }
        .section-content strong { display: block; font-size: 13px; }
        .row { display: flex; gap: 8px; }
        .row > div { flex: 1; }
        .payment-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .cod { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
        .prepaid { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
        .footer { margin-top: auto; padding: 6px 12px; background: #f3f4f6; font-size: 9px; color: #666; text-align: center; }
        .weight-box { background: #eef2ff; padding: 6px 12px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; align-items: center; }
        .weight-box span { font-size: 12px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="label">
        <div class="header">
          <h1>📦 ShipAmaze</h1>
          <div class="awb">${order.courier}</div>
        </div>
        <div class="barcode">
          <div class="barcode-lines">
            ${Array.from({ length: 60 }, (_, i) => `<span style="height:${20 + (i * 7 % 15)}px"></span>`).join('')}
          </div>
          ${order.awb}
        </div>
        <div class="section">
          <div class="section-title">Ship To</div>
          <div class="section-content">
            <strong>${order.customer}</strong>
            ${order.address}<br/>
            ${order.city} - ${order.pincode}<br/>
            📞 ${order.phone}
          </div>
        </div>
        <div class="section">
          <div class="section-title">Ship From</div>
          <div class="section-content">
            <strong>${order.pickupAddress || 'Mumbai Central Hub'}</strong>
            ShipAmaze Logistics
          </div>
        </div>
        <div class="row" style="border-bottom: 1px solid #ccc;">
          <div class="section" style="border-bottom:0; border-right: 1px solid #ccc;">
            <div class="section-title">Order ID</div>
            <div class="section-content"><strong>${order.id}</strong></div>
          </div>
          <div class="section" style="border-bottom:0;">
            <div class="section-title">Payment</div>
            <div class="section-content">
              <span class="payment-badge ${order.payment === 'COD' ? 'cod' : 'prepaid'}">${order.payment}</span>
              ${order.payment === 'COD' ? ` ₹${order.amount}` : ''}
            </div>
          </div>
        </div>
        <div class="weight-box">
          <span>Weight: ${order.weight}</span>
          <span>Dims: ${order.dimensions || 'N/A'}</span>
          <span>Zone: ${order.zone || '-'}</span>
        </div>
        <div class="section">
          <div class="section-title">Products</div>
          <div class="section-content">
            ${order.products.map(p => `${p.name} × ${p.qty}`).join(', ')}
          </div>
        </div>
        <div class="footer">
          Generated on ${new Date().toLocaleDateString('en-IN')} · ShipAmaze Logistics Platform
        </div>
      </div>
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;
}

export function printShippingLabel(order: Order) {
  const html = generateShippingLabelHTML(order);
  const win = window.open('', '_blank', 'width=420,height=630');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

export function printBulkLabels(orders: Order[]) {
  const pages = orders.map(o => {
    const single = generateShippingLabelHTML(o);
    // Extract body content
    const bodyMatch = single.match(/<body>([\s\S]*?)<script>/);
    return bodyMatch ? bodyMatch[1] : '';
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bulk Shipping Labels</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: 4in 6in; margin: 0; }
        body { font-family: 'Arial', sans-serif; }
        .page { width: 4in; height: 6in; padding: 8px; page-break-after: always; }
        .page:last-child { page-break-after: auto; }
        .label { border: 2px solid #000; height: 100%; display: flex; flex-direction: column; }
        .header { background: #1a1a2e; color: white; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 16px; font-weight: bold; }
        .header .awb { font-size: 11px; font-family: monospace; }
        .barcode { text-align: center; padding: 10px; border-bottom: 2px solid #000; font-family: monospace; font-size: 14px; letter-spacing: 3px; }
        .barcode-lines { display: flex; justify-content: center; gap: 1px; margin-bottom: 4px; }
        .barcode-lines span { display: inline-block; width: 2px; background: #000; }
        .section { padding: 8px 12px; border-bottom: 1px solid #ccc; }
        .section-title { font-size: 9px; text-transform: uppercase; color: #666; letter-spacing: 1px; margin-bottom: 3px; font-weight: bold; }
        .section-content { font-size: 12px; line-height: 1.4; }
        .section-content strong { display: block; font-size: 13px; }
        .row { display: flex; gap: 8px; }
        .row > div { flex: 1; }
        .payment-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: bold; }
        .cod { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
        .prepaid { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
        .footer { margin-top: auto; padding: 6px 12px; background: #f3f4f6; font-size: 9px; color: #666; text-align: center; }
        .weight-box { background: #eef2ff; padding: 6px 12px; border-bottom: 1px solid #ccc; display: flex; justify-content: space-between; align-items: center; }
        .weight-box span { font-size: 12px; font-weight: bold; }
      </style>
    </head>
    <body>
      ${pages.map(p => `<div class="page">${p}</div>`).join('')}
      <script>window.onload = function() { window.print(); }</script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
