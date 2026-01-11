// Stripe Webhook Handler
// Handles successful payments and sends confirmation emails

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

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;

            const customerEmail = session.customer_details?.email;
            const customerName = session.customer_details?.name || 'Zákazník';
            const amountTotal = (session.amount_total / 100).toFixed(2);
            const currency = session.currency?.toUpperCase() || 'EUR';

            if (customerEmail) {
                // Send confirmation to customer
                await sendEmail(env, {
                    to: customerEmail,
                    subject: 'Potvrdenie objednávky | FerkoMedia',
                    html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Ďakujeme za objednávku!</h1>
              <p>Dobrý deň ${customerName},</p>
              <p>Vaša platba vo výške <strong>${amountTotal} ${currency}</strong> bola úspešne spracovaná.</p>
              <p>Ozveme sa vám do 24 hodín s ďalšími informáciami.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #666; font-size: 14px;">
                S pozdravom,<br>
                FerkoMedia<br>
                <a href="https://portretnefilmy.sk">portretnefilmy.sk</a>
              </p>
            </div>
          `,
                });

                // Send notification to admin
                const adminEmail = env.ADMIN_EMAIL || 'info@ferkomedia.sk';
                await sendEmail(env, {
                    to: adminEmail,
                    subject: `Nová objednávka: ${amountTotal} ${currency}`,
                    html: `
            <div style="font-family: sans-serif;">
              <h2>Nová objednávka!</h2>
              <p><strong>Zákazník:</strong> ${customerName}</p>
              <p><strong>Email:</strong> ${customerEmail}</p>
              <p><strong>Telefón:</strong> ${session.customer_details?.phone || 'neuvedený'}</p>
              <p><strong>Suma:</strong> ${amountTotal} ${currency}</p>
              <p><strong>Session ID:</strong> ${session.id}</p>
              <hr>
              <p><a href="https://dashboard.stripe.com/payments/${session.payment_intent}">Zobraziť v Stripe</a></p>
            </div>
          `,
                    replyTo: customerEmail,
                });
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

async function sendEmail(env, { to, subject, html, replyTo }) {
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
                to: Array.isArray(to) ? to : [to],
                subject,
                html,
                reply_to: replyTo,
            }),
        });
    } catch (e) {
        console.error('Email send error:', e);
    }
}
