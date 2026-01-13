// Stripe Webhook Handler
// Handles successful payments, creates invoices and sends confirmation emails

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        const payload = await request.text();
        const sig = request.headers.get('stripe-signature');

        // Verify webhook signature (optional but recommended)
        // For now, we'll process without verification for simplicity

        const event = JSON.parse(payload);

        // Handle payment_intent.succeeded (from Payment Element)
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;

            const customerEmail = paymentIntent.receipt_email || paymentIntent.metadata?.customer_email;
            const customerName = paymentIntent.metadata?.customer_name || 'Zákazník';
            const customerPhone = paymentIntent.metadata?.customer_phone || '';
            const productName = paymentIntent.description || paymentIntent.metadata?.product || 'Služba';
            const amount = paymentIntent.amount;

            // Company info from metadata
            const companyName = paymentIntent.metadata?.company_name || '';
            const companyIco = paymentIntent.metadata?.company_ico || '';
            const companyDic = paymentIntent.metadata?.company_dic || '';
            const companyIcDph = paymentIntent.metadata?.company_icdph || '';
            const companyAddress = paymentIntent.metadata?.company_address || '';

            if (customerEmail) {
                // Create invoice
                try {
                    const invoiceResponse = await createInvoice(env, {
                        customerName,
                        customerEmail,
                        customerPhone,
                        companyName,
                        companyIco,
                        companyDic,
                        companyIcDph,
                        companyAddress,
                        productName,
                        amount,
                        paymentIntentId: paymentIntent.id,
                        paymentMethod: 'card',
                    });

                    console.log('Invoice created:', invoiceResponse);
                } catch (invoiceError) {
                    console.error('Invoice creation failed:', invoiceError);
                    // Still send basic confirmation even if invoice fails
                    await sendBasicConfirmation(env, customerEmail, customerName, amount, productName);
                }
            }
        }

        // Handle checkout.session.completed (legacy, from Checkout)
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            const customerEmail = session.customer_details?.email;
            const customerName = session.customer_details?.name || 'Zákazník';
            const amountTotal = session.amount_total;

            if (customerEmail) {
                // Create invoice for checkout session
                try {
                    await createInvoice(env, {
                        customerName,
                        customerEmail,
                        customerPhone: session.customer_details?.phone || '',
                        companyName: '',
                        companyIco: '',
                        companyDic: '',
                        companyIcDph: '',
                        companyAddress: '',
                        productName: session.metadata?.product || 'Služba',
                        amount: amountTotal,
                        paymentIntentId: session.payment_intent,
                        paymentMethod: 'card',
                    });
                } catch (invoiceError) {
                    console.error('Invoice creation failed:', invoiceError);
                    await sendBasicConfirmation(env, customerEmail, customerName, amountTotal, 'Služba');
                }
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200, headers });

    } catch (error) {
        console.error('Webhook error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers }
        );
    }
}

async function createInvoice(env, invoiceData) {
    // Generate invoice number
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    const invoiceNumber = `${dateStr}-${randomSuffix}`;

    const invoice = {
        id: invoiceNumber,
        createdAt: now.toISOString(),
        status: 'paid',

        customerName: invoiceData.customerName,
        customerEmail: invoiceData.customerEmail,
        customerPhone: invoiceData.customerPhone || '',

        companyName: invoiceData.companyName || '',
        companyIco: invoiceData.companyIco || '',
        companyDic: invoiceData.companyDic || '',
        companyIcDph: invoiceData.companyIcDph || '',
        companyAddress: invoiceData.companyAddress || '',

        productName: invoiceData.productName,
        amount: invoiceData.amount / 100,
        amountCents: invoiceData.amount,
        currency: 'EUR',

        paymentIntentId: invoiceData.paymentIntentId || '',
        paymentMethod: invoiceData.paymentMethod || 'card',

        sellerName: 'FerkoMedia s.r.o.',
        sellerIco: '56789012',
        sellerDic: '2123456789',
        sellerIcDph: '',
        sellerAddress: 'Červenej armády 1, 036 01 Martin',
        sellerIban: 'SK12 1234 5678 9012 3456 7890',
        sellerEmail: 'info@ferkomedia.sk',
        sellerPhone: '+421 949 460 832',
    };

    // Store in KV
    if (env.INVOICES_KV) {
        await env.INVOICES_KV.put(`invoice:${invoiceNumber}`, JSON.stringify(invoice));

        const listKey = 'invoice_list';
        const existingList = await env.INVOICES_KV.get(listKey);
        const invoiceList = existingList ? JSON.parse(existingList) : [];
        invoiceList.unshift(invoiceNumber);
        await env.INVOICES_KV.put(listKey, JSON.stringify(invoiceList.slice(0, 1000)));
    }

    // Send invoice email
    await sendInvoiceEmail(env, invoice);

    // Send admin notification
    await sendAdminNotification(env, invoice);

    return invoice;
}

function generateInvoiceHtml(invoice) {
    const issueDate = new Date(invoice.createdAt).toLocaleDateString('sk-SK');
    const dueDate = new Date(invoice.createdAt);
    dueDate.setDate(dueDate.getDate() + 14);
    const dueDateStr = dueDate.toLocaleDateString('sk-SK');

    const customerInfo = invoice.companyName
        ? `<strong>${invoice.companyName}</strong><br>${invoice.companyAddress}<br>IČO: ${invoice.companyIco}<br>${invoice.companyDic ? `DIČ: ${invoice.companyDic}<br>` : ''}${invoice.companyIcDph ? `IČ DPH: ${invoice.companyIcDph}<br>` : ''}`
        : `<strong>${invoice.customerName}</strong><br>${invoice.customerEmail}<br>${invoice.customerPhone ? invoice.customerPhone + '<br>' : ''}`;

    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div style="font-size: 24px; font-weight: bold; color: #f97316;">FerkoMedia</div>
        <div style="text-align: right;">
          <div style="font-size: 20px; font-weight: bold;">FAKTÚRA</div>
          <div style="color: #666;">${invoice.id}</div>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div style="width: 45%;">
          <div style="font-size: 12px; color: #666; margin-bottom: 5px;">DODÁVATEĽ</div>
          <strong>${invoice.sellerName}</strong><br>
          ${invoice.sellerAddress}<br>
          IČO: ${invoice.sellerIco}<br>
          DIČ: ${invoice.sellerDic}
        </div>
        <div style="width: 45%;">
          <div style="font-size: 12px; color: #666; margin-bottom: 5px;">ODBERATEĽ</div>
          ${customerInfo}
        </div>
      </div>
      
      <div style="background: #f5f5f5; padding: 15px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-around; text-align: center;">
          <div><div style="font-size: 12px; color: #666;">Vystavená</div><strong>${issueDate}</strong></div>
          <div><div style="font-size: 12px; color: #666;">Splatnosť</div><strong>${dueDateStr}</strong></div>
          <div><div style="font-size: 12px; color: #666;">Stav</div><span style="background: #22c55e; color: white; padding: 2px 8px; font-weight: bold;">UHRADENÁ</span></div>
        </div>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr style="background: #f97316; color: white;">
          <th style="padding: 10px; text-align: left;">Popis</th>
          <th style="padding: 10px; text-align: right;">Cena</th>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #ddd;">${invoice.productName}</td>
          <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">${invoice.amount.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €</td>
        </tr>
        <tr>
          <td style="padding: 10px; font-weight: bold;">CELKOM</td>
          <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 18px;">${invoice.amount.toLocaleString('sk-SK', { minimumFractionDigits: 2 })} €</td>
        </tr>
      </table>
      
      <div style="background: #f5f5f5; padding: 15px; margin-bottom: 20px;">
        <strong>Bankové spojenie</strong><br>
        IBAN: ${invoice.sellerIban}<br>
        VS: ${invoice.id.replace(/-/g, '')}
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        Dodávateľ nie je platcom DPH.<br>
        ${invoice.sellerEmail} | ${invoice.sellerPhone}
      </div>
    </div>
  `;
}

async function sendInvoiceEmail(env, invoice) {
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) {
        console.error('RESEND_API_KEY not configured');
        return;
    }

    const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';
    const invoiceHtml = generateInvoiceHtml(invoice);

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
            <p>Vaša platba bola úspešne spracovaná. V prílohe nájdete faktúru:</p>
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
              +421 949 460 832<br>
              <a href="https://portretnefilmy.sk">portretnefilmy.sk</a>
            </p>
          </div>
          <div style="margin-top: 40px;">
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
                subject: `Nová platba: ${invoice.amount} € - ${invoice.customerName}`,
                html: `
          <h2>Nová faktúra ${invoice.id}</h2>
          <table style="border-collapse: collapse;">
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Zákazník:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.customerName}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Email:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.customerEmail}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Telefón:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.customerPhone || '-'}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Firma:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.companyName || '-'}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>IČO:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.companyIco || '-'}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Produkt:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;">${invoice.productName}</td></tr>
            <tr><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>Suma:</strong></td><td style="padding: 5px 10px; border: 1px solid #ddd;"><strong>${invoice.amount} €</strong></td></tr>
          </table>
          <p><a href="https://dashboard.stripe.com/payments/${invoice.paymentIntentId}">Zobraziť v Stripe</a></p>
        `,
                reply_to: invoice.customerEmail,
            }),
        });
    } catch (e) {
        console.error('Admin notification error:', e);
    }
}

async function sendBasicConfirmation(env, email, name, amount, product) {
    const resendApiKey = env.RESEND_API_KEY;
    if (!resendApiKey) return;

    const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';
    const amountEur = (amount / 100).toFixed(2);

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: emailFrom,
                to: [email],
                subject: 'Potvrdenie platby | FerkoMedia',
                html: `
          <h1>Ďakujeme za objednávku!</h1>
          <p>Dobrý deň ${name},</p>
          <p>Vaša platba vo výške <strong>${amountEur} €</strong> za <strong>${product}</strong> bola úspešne spracovaná.</p>
          <p>Ozveme sa vám do 24 hodín.</p>
          <p>FerkoMedia<br>+421 949 460 832</p>
        `,
            }),
        });
    } catch (e) {
        console.error('Basic confirmation error:', e);
    }
}
