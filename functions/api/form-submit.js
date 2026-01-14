// Form submission handler with email notifications
// Replaces Netlify Forms with custom solution

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const formData = await request.formData();
        const data = Object.fromEntries(formData.entries());

        const formName = data['form-name'] || 'unknown';
        delete data['form-name'];

        // Get admin email
        const adminEmail = env.ADMIN_EMAIL || 'info@ferkomedia.sk';
        const resendApiKey = env.RESEND_API_KEY;

        if (!resendApiKey) {
            console.error('RESEND_API_KEY not configured');
            return redirectToThankYou(formName);
        }

        // Build email content
        let subject, customerEmail, replyTo;

        if (formName === 'kontakt') {
            subject = `Nový dopyt: Portrétny film`;
            customerEmail = data['Email'];
            replyTo = customerEmail;
        } else if (formName === 'workshopy') {
            subject = `Nová rezervácia: Workshop`;
            customerEmail = data['E-mail'];
            replyTo = customerEmail;
        } else if (formName === 'dlhodoba-spolupraca') {
            subject = `Nová objednávka: Dlhodobá spolupráca`;
            customerEmail = data['E-mail'];
            replyTo = customerEmail;
        } else {
            subject = `Nový formulár: ${formName}`;
            customerEmail = data['Email'] || data['E-mail'];
            replyTo = customerEmail;
        }

        // Format form data for admin
        const formHtml = Object.entries(data)
            .filter(([key]) => !key.startsWith('Firma -') || data[key])
            .map(([key, value]) => `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; color: #333;">${key}:</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">${value || '—'}</td>
                </tr>
            `)
            .join('');

        // Send to admin
        await sendEmail(env, {
            to: adminEmail,
            subject,
            html: getAdminEmailTemplate(subject, formHtml),
            replyTo,
        });

        // Send confirmation to customer
        if (customerEmail) {
            const confirmationEmail = getCustomerEmailTemplate(formName, data);

            if (confirmationEmail) {
                await sendEmail(env, {
                    to: customerEmail,
                    subject: confirmationEmail.subject,
                    html: confirmationEmail.html,
                });
            }
        }

        return redirectToThankYou(formName);

    } catch (error) {
        console.error('Form submission error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers }
        );
    }
}

function getAdminEmailTemplate(subject, formHtml) {
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
                            <td style="background: linear-gradient(135deg, #f97316 0%, #fb923c 100%); padding: 30px; text-align: center;">
                                <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">${subject}</h1>
                            </td>
                        </tr>
                        
                        <!-- Content -->
                        <tr>
                            <td style="padding: 30px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                    ${formHtml}
                                </table>
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                                <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                                    Odoslané z webu <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a>
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

function getCustomerEmailTemplate(formName, data) {
    const firstName = data['Meno a priezvisko'] ? data['Meno a priezvisko'].split(' ')[0] : '';

    if (formName === 'kontakt') {
        return {
            subject: 'Dopyt prijatý | Portrétny film',
            html: `
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
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Ďakujeme za váš dopyt!</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                            Dobrý deň${firstName ? ' ' + firstName : ''},
                                        </p>
                                        <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                                            Váš dopyt sme prijali a <strong style="color: #f97316;">ozveme sa vám čo najskôr</strong>, zvyčajne do 24 hodín.
                                        </p>
                                        
                                        ${data['Predmet'] ? `
                                        <div style="background-color: #fef3e8; border-left: 4px solid #f97316; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                            <p style="margin: 0; color: #333; font-size: 14px;">
                                                <strong>Predmet:</strong> ${data['Predmet']}
                                            </p>
                                        </div>
                                        ` : ''}
                                        
                                        <p style="margin: 20px 0 0; color: #666; font-size: 16px; line-height: 1.6;">
                                            Ak máte nejaké dodatočné otázky, neváhajte nám napísať na <a href="mailto:info@ferkomedia.sk" style="color: #f97316; text-decoration: none;">info@ferkomedia.sk</a> alebo zavolať na <a href="tel:+421949460832" style="color: #f97316; text-decoration: none;">0949 460 832</a>.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- CTA -->
                                <tr>
                                    <td style="padding: 0 30px 40px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center">
                                                    <a href="https://portretnefilmy.sk" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Navštíviť web</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
                                        <p style="margin: 0 0 10px; color: #333; font-size: 14px; font-weight: 600;">S pozdravom,</p>
                                        <p style="margin: 0; color: #666; font-size: 14px;">
                                            <strong>FerkoMedia</strong><br>
                                            <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a><br>
                                            <a href="tel:+421949460832" style="color: #666; text-decoration: none;">0949 460 832</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };
    }

    if (formName === 'workshopy') {
        return {
            subject: 'Rezervácia prijatá | Workshop',
            html: `
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
                                        <div style="background-color: rgba(255,255,255,0.2); width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                                            <span style="font-size: 32px;">✓</span>
                                        </div>
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Rezervácia potvrdená!</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                            Dobrý deň${firstName ? ' ' + firstName : ''},
                                        </p>
                                        <p style="margin: 0 0 30px; color: #666; font-size: 16px; line-height: 1.6;">
                                            Ďakujeme za vašu rezerváciu! Tešíme sa na stretnutie na workshope.
                                        </p>
                                        
                                        <!-- Reservation Details -->
                                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3e8; border-radius: 8px; overflow: hidden; margin-bottom: 30px;">
                                            <tr>
                                                <td style="padding: 24px;">
                                                    <h3 style="margin: 0 0 16px; color: #f97316; font-size: 18px;">Detaily rezervácie</h3>
                                                    ${data['Termín workshopu'] ? `
                                                    <p style="margin: 0 0 12px; color: #333; font-size: 15px;">
                                                        <strong>Termín:</strong><br>
                                                        ${data['Termín workshopu']}
                                                    </p>
                                                    ` : ''}
                                                    ${data['Doména'] ? `
                                                    <p style="margin: 0 0 12px; color: #333; font-size: 15px;">
                                                        <strong>Doména:</strong> ${data['Doména']}.sk
                                                    </p>
                                                    ` : ''}
                                                    ${data['Poznámka'] ? `
                                                    <p style="margin: 0; color: #666; font-size: 14px;">
                                                        <strong>Poznámka:</strong><br>
                                                        ${data['Poznámka']}
                                                    </p>
                                                    ` : ''}
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Company Info if provided -->
                                        ${data['Firma - názov'] ? `
                                        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-radius: 8px; overflow: hidden; margin-bottom: 30px;">
                                            <tr>
                                                <td style="padding: 20px;">
                                                    <h4 style="margin: 0 0 12px; color: #22c55e; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Fakturačné údaje</h4>
                                                    <p style="margin: 0 0 8px; color: #333; font-size: 14px;"><strong>${data['Firma - názov']}</strong></p>
                                                    ${data['IČO'] ? `<p style="margin: 0 0 4px; color: #666; font-size: 13px;">IČO: ${data['IČO']}</p>` : ''}
                                                    ${data['Firma - DIČ'] ? `<p style="margin: 0 0 4px; color: #666; font-size: 13px;">DIČ: ${data['Firma - DIČ']}</p>` : ''}
                                                    ${data['Firma - Adresa'] ? `<p style="margin: 0; color: #666; font-size: 13px;">${data['Firma - Adresa']}</p>` : ''}
                                                </td>
                                            </tr>
                                        </table>
                                        ` : ''}
                                        
                                        <!-- What to bring -->
                                        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                            <p style="margin: 0 0 8px; color: #1e40af; font-weight: 600; font-size: 14px;">Čo si priniesť:</p>
                                            <p style="margin: 0; color: #1e3a8a; font-size: 14px; line-height: 1.5;">
                                                ✓ Vlastný notebook s nabíjačkou<br>
                                                ✓ Dobrú náladu a chuť sa učiť<br>
                                                ✓ Káva, obed a občerstvenie je v cene
                                            </p>
                                        </div>
                                        
                                        <p style="margin: 20px 0 0; color: #666; font-size: 15px; line-height: 1.6;">
                                            Ak máte akékoľvek otázky, neváhajte nám napísať alebo zavolať.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- CTA -->
                                <tr>
                                    <td style="padding: 0 30px 40px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center">
                                                    <a href="https://portretnefilmy.sk/workshopy" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Informácie o workshopoch</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
                                        <p style="margin: 0 0 10px; color: #333; font-size: 14px; font-weight: 600;">Tešíme sa na vás!</p>
                                        <p style="margin: 0; color: #666; font-size: 14px;">
                                            <strong>FerkoMedia</strong><br>
                                            Červenej armády 1, 036 01 Martin<br>
                                            <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a><br>
                                            <a href="tel:+421949460832" style="color: #666; text-decoration: none;">0949 460 832</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };
    }

    if (formName === 'dlhodoba-spolupraca') {
        return {
            subject: 'Objednávka prijatá | Dlhodobá spolupráca',
            html: `
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
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Ďakujeme za záujem!</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                            Dobrý deň${firstName ? ' ' + firstName : ''},
                                        </p>
                                        <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                                            Ďakujeme za vašu objednávku konzultácie o dlhodobej spolupráci. <strong style="color: #f97316;">Ozveme sa vám do 24 hodín</strong> s návrhom spolupráce na mieru.
                                        </p>
                                        
                                        ${data['Balíček'] ? `
                                        <div style="background-color: #fef3e8; border-left: 4px solid #f97316; padding: 16px; margin: 20px 0; border-radius: 4px;">
                                            <p style="margin: 0; color: #333; font-size: 15px;">
                                                <strong>Vybraný balíček:</strong><br>
                                                ${data['Balíček']}
                                            </p>
                                        </div>
                                        ` : ''}
                                        
                                        <p style="margin: 20px 0 0; color: #666; font-size: 16px; line-height: 1.6;">
                                            Medzitým si môžete pozrieť viac informácií o našich službách na našom webe.
                                        </p>
                                    </td>
                                </tr>
                                
                                <!-- CTA -->
                                <tr>
                                    <td style="padding: 0 30px 40px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td align="center">
                                                    <a href="https://portretnefilmy.sk/blog/dlhodoba-spolupraca" style="display: inline-block; background-color: #f97316; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">Viac o dlhodobej spolupráci</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
                                        <p style="margin: 0 0 10px; color: #333; font-size: 14px; font-weight: 600;">S pozdravom,</p>
                                        <p style="margin: 0; color: #666; font-size: 14px;">
                                            <strong>FerkoMedia</strong><br>
                                            <a href="https://portretnefilmy.sk" style="color: #f97316; text-decoration: none;">portretnefilmy.sk</a><br>
                                            <a href="tel:+421949460832" style="color: #666; text-decoration: none;">0949 460 832</a>
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
            `
        };
    }

    return null;
}

function redirectToThankYou(formName) {
    const redirectUrl = formName === 'workshopy'
        ? '/dakujem-workshopy/'
        : '/dakujem/';

    return new Response(null, {
        status: 302,
        headers: {
            'Location': redirectUrl,
        },
    });
}

async function sendEmail(env, { to, subject, html, replyTo }) {
    const resendApiKey = env.RESEND_API_KEY;
    const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';

    try {
        const response = await fetch('https://api.resend.com/emails', {
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

        if (!response.ok) {
            const err = await response.json();
            console.error('Resend error:', err);
        }
    } catch (e) {
        console.error('Email send error:', e);
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