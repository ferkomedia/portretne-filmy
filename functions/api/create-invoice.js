// Create Invoice and send to customer
// Endpoint: POST /api/create-invoice
// Stores invoice in Cloudflare KV and sends PDF via email

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const data = await request.json();

        const {
            customerName,
            customerEmail,
            customerPhone,
            companyName,
            companyIco,
            companyDic,
            companyIcDph,
            companyAddress,
            productName,
            amount, // in cents
            paymentIntentId,
            paymentMethod, // 'card' | 'transfer'
        } = data;

        if (!customerEmail || !amount || !productName) {
            return new Response(
                JSON.stringify({ error: 'Chýbajú povinné polia' }),
                { status: 400, headers }
            );
        }

        // Generate invoice number: RRRRMMDD-XXX
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
        const invoiceNumber = `${dateStr}-${randomSuffix}`;

        // Invoice data
        const invoice = {
            id: invoiceNumber,
            createdAt: now.toISOString(),
            status: 'paid',

            // Customer
            customerName,
            customerEmail,
            customerPhone: customerPhone || '',

            // Company (if provided)
            companyName: companyName || '',
            companyIco: companyIco || '',
            companyDic: companyDic || '',
            companyIcDph: companyIcDph || '',
            companyAddress: companyAddress || '',

            // Product
            productName,
            amount: amount / 100, // convert to EUR
            amountCents: amount,
            currency: 'EUR',

            // Payment
            paymentIntentId: paymentIntentId || '',
            paymentMethod: paymentMethod || 'card',

            // Seller info
            sellerName: 'FerkoMedia s.r.o.',
            sellerIco: '56789012',
            sellerDic: '2123456789',
            sellerIcDph: '',
            sellerAddress: 'Červenej armády 1, 036 01 Martin',
            sellerIban: 'SK12 1234 5678 9012 3456 7890',
            sellerEmail: 'info@ferkomedia.sk',
            sellerPhone: '+421 949 460 832',
        };

        // Store invoice in KV
        if (env.INVOICES_KV) {
            await env.INVOICES_KV.put(`invoice:${invoiceNumber}`, JSON.stringify(invoice));

            // Also maintain a list of invoice IDs for easy retrieval
            const listKey = 'invoice_list';
            const existingList = await env.INVOICES_KV.get(listKey);
            const invoiceList = existingList ? JSON.parse(existingList) : [];
            invoiceList.unshift(invoiceNumber); // Add to beginning
            await env.INVOICES_KV.put(listKey, JSON.stringify(invoiceList.slice(0, 1000))); // Keep last 1000
        }

        // Generate invoice HTML
        const invoiceHtml = generateInvoiceHtml(invoice);

        // Send invoice email to customer
        await sendInvoiceEmail(env, invoice, invoiceHtml);

        // Send copy to admin
        await sendAdminNotification(env, invoice);

        return new Response(
            JSON.stringify({
                success: true,
                invoiceNumber,
                invoice
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Invoice creation error:', error);
        return new Response(
            JSON.stringify({ error: 'Chyba pri vytváraní faktúry: ' + error.message }),
            { status: 500, headers }
        );
    }
}

function generateInvoiceHtml(invoice) {
    const issueDate = new Date(invoice.createdAt).toLocaleDateString('sk-SK');
    const dueDate = new Date(invoice.createdAt);
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toLocaleDateString('sk-SK');

    const customerInfo = invoice.companyName
        ? `
      <strong>${invoice.companyName}</strong><br>
      ${invoice.companyAddress}<br>
      IČO: ${invoice.companyIco}<br>
      ${invoice.companyDic ? `DIČ: ${invoice.companyDic}<br>` : ''}
      ${invoice.companyIcDph ? `IČ DPH: ${invoice.companyIcDph}<br>` : ''}
    `
        : `
      <strong>${invoice.customerName}</strong><br>
      ${invoice.customerEmail}<br>
      ${invoice.customerPhone ? invoice.customerPhone + '<br>' : ''}
    `;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .logo { font-size: 24px; font-weight: bold; color: #f97316; }
    .invoice-title { text-align: right; }
    .invoice-title h1 { margin: 0; font-size: 28px; color: #333; }
    .invoice-number { color: #666; margin-top: 5px; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 40px; }
    .party { width: 45%; }
    .party-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
    .dates { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
    .dates-grid { display: flex; justify-content: space-between; }
    .date-item { text-align: center; }
    .date-label { font-size: 12px; color: #666; }
    .date-value { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f97316; color: white; padding: 12px; text-align: left; }
    td { padding: 12px; border-bottom: 1px solid #eee; }
    .amount-col { text-align: right; }
    .total-row td { font-weight: bold; font-size: 18px; border-top: 2px solid #333; }
    .payment-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
    .payment-info h3 { margin-top: 0; }
    .footer { text-align: center; color: #666; font-size: 12px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }
    .paid-stamp { background: #22c55e; color: white; padding: 10px 20px; display: inline-block; font-weight: bold; transform: rotate(-5deg); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">FerkoMedia</div>
    <div class="invoice-title">
      <h1>FAKTÚRA</h1>
      <div class="invoice-number">${invoice.id}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="party-label">Dodávateľ</div>
      <strong>${invoice.sellerName}</strong><br>
      ${invoice.sellerAddress}<br>
      IČO: ${invoice.sellerIco}<br>
      DIČ: ${invoice.sellerDic}<br>
      ${invoice.sellerIcDph ? `IČ DPH: ${invoice.sellerIcDph}<br>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Odberateľ</div>
      ${customerInfo}
    </div>
  </div>

  <div class="dates">
    <div class="dates-grid">
      <div class="date-item">
        <div class="date-label">Dátum vystavenia</div>
        <div class="date-value">${issueDate}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Dátum splatnosti</div>
        <div class="date-value">${dueDateStr}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Forma úhrady</div>
        <div class="date-value">${invoice.paymentMethod === 'card' ? 'Platobná karta' : 'Bankový prevod'}</div>
      </div>
      <div class="date-item">
        <div class="date-label">Stav</div>
        <div class="paid-stamp">UHRADENÁ</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Popis</th>
        <th>Množstvo</th>
        <th class="amount-col">Cena</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${invoice.productName}</td>
        <td>1</td>
        <td class="amount-col">${invoice.amount.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €</td>
      </tr>
      <tr class="total-row">
        <td colspan="2">Celkom k úhrade</td>
        <td class="amount-col">${invoice.amount.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €</td>
      </tr>
    </tbody>
  </table>

  <p style="color: #666; font-size: 12px;">
    Dodávateľ nie je platcom DPH.<br>
    ${invoice.paymentIntentId ? `Referencia platby: ${invoice.paymentIntentId}` : ''}
  </p>

  <div class="payment-info">
    <h3>Bankové spojenie</h3>
    <p>
      <strong>IBAN:</strong> ${invoice.sellerIban}<br>
      <strong>Variabilný symbol:</strong> ${invoice.id.replace(/-/g, '')}<br>
    </p>
  </div>

  <div class="footer">
    <p>Ďakujeme za vašu objednávku!</p>
    <p>${invoice.sellerName} | ${invoice.sellerEmail} | ${invoice.sellerPhone}</p>
    <p>portretnefilmy.sk</p>
  </div>
</body>
</html>
  `;
}

async function sendInvoiceEmail(env, invoice, invoiceHtml) {
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
        console.error('RESEND_API_KEY not configured');
        return;
    }

    const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: [invoice.customerEmail],
                subject: `Faktúra ${invoice.id} | FerkoMedia`,
                html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #f97316;">Ďakujeme za objednávku!</h1>
            <p>Dobrý deň ${invoice.customerName},</p>
            <p>V prílohe nájdete faktúru za vašu objednávku:</p>
            <ul>
              <li><strong>Služba:</strong> ${invoice.productName}</li>
              <li><strong>Suma:</strong> ${invoice.amount.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €</li>
              <li><strong>Číslo faktúry:</strong> ${invoice.id}</li>
            </ul>
            <p>Ozveme sa vám do 24 hodín s ďalšími informáciami.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">
              S pozdravom,<br>
              FerkoMedia<br>
              ${invoice.sellerPhone}<br>
              <a href="https://portretnefilmy.sk">portretnefilmy.sk</a>
            </p>
          </div>
          
          <div style="margin-top: 40px; padding: 20px; background: #f5f5f5;">
            <h2 style="margin-top: 0;">Faktúra č. ${invoice.id}</h2>
            ${invoiceHtml}
          </div>
        `,
            }),
        });
    } catch (e) {
        console.error('Email send error:', e);
    }
}

async function sendAdminNotification(env, invoice) {
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) return;

    const adminEmail = env.ADMIN_EMAIL || 'info@ferkomedia.sk';
    const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: [adminEmail],
                subject: `Nová faktúra ${invoice.id} - ${invoice.amount} €`,
                html: `
          <div style="font-family: sans-serif;">
            <h2>Nová faktúra vytvorená</h2>
            <table style="border-collapse: collapse;">
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Číslo:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.id}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Zákazník:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.customerName}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.customerEmail}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Firma:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.companyName || '-'}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>IČO:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.companyIco || '-'}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Produkt:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.productName}</td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Suma:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>${invoice.amount} €</strong></td></tr>
              <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Platba:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.paymentMethod}</td></tr>
            </table>
            <p style="margin-top: 20px;">
              <a href="https://dashboard.stripe.com/payments/${invoice.paymentIntentId}">Zobraziť v Stripe</a>
            </p>
          </div>
        `,
                reply_to: invoice.customerEmail,
            }),
        });
    } catch (e) {
        console.error('Admin notification error:', e);
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
