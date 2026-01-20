// POST /api/campaigns/send
// Send email campaign to contacts

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    // Check authorization
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== 'MyFilmy2026@') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers
        });
    }

    try {
        const body = await request.json();
        const { name, subject, template, content, segment, selectedEmails } = body;

        if (!name || !subject || !template) {
            return new Response(JSON.stringify({
                error: 'Missing required fields'
            }), {
                status: 400,
                headers
            });
        }

        const EMAIL_MARKETING = env.EMAIL_MARKETING;
        const RESEND_API_KEY = env.RESEND_API_KEY;

        if (!EMAIL_MARKETING || !RESEND_API_KEY) {
            return new Response(JSON.stringify({ error: 'Services not configured' }), {
                status: 500,
                headers
            });
        }

        // Get recipients based on segment
        let recipients = [];

        if (segment === 'selected' && selectedEmails && selectedEmails.length > 0) {
            // Use selected emails
            recipients = selectedEmails;
        } else {
            // Load all contacts
            const list = await EMAIL_MARKETING.list({ prefix: 'contact:' });
            const contacts = [];

            for (const key of list.keys) {
                const value = await EMAIL_MARKETING.get(key.name);
                if (value) {
                    try {
                        contacts.push(JSON.parse(value));
                    } catch (e) {
                        console.error('Error parsing contact:', e);
                    }
                }
            }

            // Filter by segment
            if (segment === 'all') {
                recipients = contacts.map(c => c.email);
            } else if (segment === 'workshop') {
                recipients = contacts.filter(c => c.source === 'workshopy').map(c => c.email);
            } else if (segment === 'kontakt') {
                recipients = contacts.filter(c => c.source === 'kontakt').map(c => c.email);
            } else if (segment === 'dlhodoba-spolupraca') {
                recipients = contacts.filter(c => c.source === 'dlhodoba-spolupraca').map(c => c.email);
            }
        }

        if (recipients.length === 0) {
            return new Response(JSON.stringify({
                error: 'No recipients found'
            }), {
                status: 400,
                headers
            });
        }

        // Generate email HTML based on template
        let emailHtml = '';

        if (template === 'custom') {
            emailHtml = content;
        } else if (template === 'newsletter') {
            emailHtml = getNewsletterTemplate(content);
        } else if (template === 'workshop-promo') {
            emailHtml = getWorkshopPromoTemplate();
        }

        // Send emails via Resend (batch send)
        const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';

        let sentCount = 0;
        const batchSize = 50; // Resend limit

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);

            try {
                const response = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${RESEND_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: emailFrom,
                        to: batch,
                        subject: subject,
                        html: emailHtml,
                    }),
                });

                if (response.ok) {
                    sentCount += batch.length;
                } else {
                    console.error('Resend error:', await response.text());
                }
            } catch (err) {
                console.error('Send error:', err);
            }
        }

        // Save campaign to KV
        const campaign = {
            id: `campaign-${Date.now()}`,
            name,
            subject,
            template,
            segment,
            recipientCount: recipients.length,
            sentCount: sentCount,
            createdAt: new Date().toISOString()
        };

        await EMAIL_MARKETING.put(`campaign:${campaign.id}`, JSON.stringify(campaign));

        return new Response(JSON.stringify({
            ok: true,
            sent: sentCount,
            total: recipients.length,
            campaign: campaign
        }), { headers });

    } catch (err) {
        console.error('Error sending campaign:', err);
        return new Response(JSON.stringify({
            error: err.message
        }), {
            status: 500,
            headers
        });
    }
}

function getNewsletterTemplate(content) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); padding: 40px 30px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">FerkoMedia Newsletter</h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                ${content || '<p>Váš newsletter obsah...</p>'}
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                                <p style="margin: 0 0 10px; color: #333; font-size: 14px; font-weight: 600;">FerkoMedia</p>
                                <p style="margin: 0; color: #666; font-size: 14px;">
                                    <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a><br>
                                    <a href="tel:+421949460832" style="color: #666; text-decoration: none;">0949 460 832</a>
                                </p>
                                <p style="margin: 10px 0 0; color: #999; font-size: 12px;">
                                    <a href="{{unsubscribe}}" style="color: #999; text-decoration: underline;">Odhlásiť z odberu</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

function getWorkshopPromoTemplate() {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px 0;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <!-- Header -->
                        <tr>
                            <td style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); padding: 40px 30px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700;">Nové termíny workshopov! 🎓</h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 40px 30px;">
                                <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                    Dobrý deň,
                                </p>
                                <p style="margin: 0 0 30px; color: #666; font-size: 16px; line-height: 1.6;">
                                    Práve sme otvorili nové termíny našich workshopov. Naučte sa vytvoriť web, e-shop alebo Google reklamu za jediný deň!
                                </p>
                                
                                <!-- Workshop Box -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3e8; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                                    <tr>
                                        <td style="padding: 24px;">
                                            <h3 style="margin: 0 0 12px; color: #f97316; font-size: 20px;">📌 Aktuálne workshopy:</h3>
                                            <ul style="margin: 0; padding-left: 20px; color: #333;">
                                                <li style="margin-bottom: 8px;">Web za 1 deň - Martin</li>
                                                <li style="margin-bottom: 8px;">E-shop za 1 deň - Martin</li>
                                                <li style="margin-bottom: 8px;">Google reklama za 1 deň - Martin</li>
                                            </ul>
                                            <p style="margin: 16px 0 0; color: #666; font-size: 14px;">
                                                Cena: <strong style="color: #f97316;">149 €</strong> | Kapacita: <strong>12 miest</strong>
                                            </p>
                                        </td>
                                    </tr>
                                </table>
                                
                                <!-- CTA Button -->
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td align="center" style="padding: 20px 0;">
                                            <a href="https://portretnefilmy.sk/workshopy" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 18px;">Pozrieť termíny a rezervovať</a>
                                        </td>
                                    </tr>
                                </table>
                                
                                <p style="margin: 20px 0 0; color: #666; font-size: 15px; line-height: 1.6;">
                                    V cene je zahrnuté kompletné vybavenie, občerstvenie a lunch. Stačí priniesť notebook a dobrú náladu!
                                </p>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
                                <p style="margin: 0 0 10px; color: #333; font-size: 14px; font-weight: 600;">Tešíme sa na vás!</p>
                                <p style="margin: 0; color: #666; font-size: 14px;">
                                    <strong>FerkoMedia</strong><br>
                                    Červenej armády 1, 036 01 Martin<br>
                                    <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a><br>
                                    <a href="tel:+421949460832" style="color: #666; text-decoration: none;">0949 460 832</a>
                                </p>
                                <p style="margin: 10px 0 0; color: #999; font-size: 12px;">
                                    <a href="{{unsubscribe}}" style="color: #999; text-decoration: underline;">Odhlásiť z odberu</a>
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}