// Form submission handler with email notifications + automatic contact saving
// WITH SPAM PROTECTION: Cloudflare Turnstile + Honeypot

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const formData = await request.formData();
        const data = Object.fromEntries(formData.entries());

        // ============================================
        // SPAM PROTECTION CHECKS
        // ============================================

        // 1. HONEYPOT CHECK - ak je vyplnené, je to bot
        if (data['website'] && data['website'].trim() !== '') {
            console.log('Honeypot triggered - bot detected');
            // Vrátime úspech, ale nič neodošleme (bot si myslí, že prešiel)
            return redirectToThankYou(data['form-name'] || 'kontakt');
        }

        // Odstránime honeypot pole z dát
        delete data['website'];

        // 2. TURNSTILE VERIFICATION
        const turnstileToken = data['cf-turnstile-response'];
        const turnstileSecret = env.TURNSTILE_SECRET_KEY;

        if (turnstileSecret && turnstileToken) {
            const turnstileValid = await verifyTurnstile(turnstileToken, turnstileSecret, request);
            
            if (!turnstileValid) {
                console.log('Turnstile verification failed');
                return new Response(
                    JSON.stringify({ error: 'Overenie zlyhalo. Skúste to znova.' }),
                    { status: 400, headers }
                );
            }
        } else if (turnstileSecret && !turnstileToken) {
            // Ak máme secret ale chýba token, pravdepodobne bot
            console.log('Missing Turnstile token');
            return new Response(
                JSON.stringify({ error: 'Chýba overenie. Prosím, obnovte stránku.' }),
                { status: 400, headers }
            );
        }

        // Odstránime Turnstile response z dát
        delete data['cf-turnstile-response'];

        // 3. BASIC VALIDATION - kontrola podozrivého obsahu
        const spamCheck = checkForSpam(data);
        if (spamCheck.isSpam) {
            console.log('Spam detected:', spamCheck.reason);
            // Tichý návrat - bot si myslí, že prešiel
            return redirectToThankYou(data['form-name'] || 'kontakt');
        }

        // ============================================
        // ORIGINAL FORM PROCESSING
        // ============================================

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
        let subject, customerEmail, replyTo, customerName;

        if (formName === 'kontakt') {
            subject = `Nový dopyt: Portrétny film`;
            customerEmail = data['Email'];
            customerName = data['Meno a priezvisko'];
            replyTo = customerEmail;
        } else if (formName === 'workshopy') {
            subject = `Nová rezervácia: Workshop`;
            customerEmail = data['E-mail'];
            customerName = data['Meno a priezvisko'];
            replyTo = customerEmail;
        } else if (formName === 'dlhodoba-spolupraca') {
            subject = `Nová objednávka: Dlhodobá spolupráca`;
            customerEmail = data['E-mail'];
            customerName = data['Meno a priezvisko'];
            replyTo = customerEmail;
        } else {
            subject = `Nový formulár: ${formName}`;
            customerEmail = data['Email'] || data['E-mail'];
            customerName = data['Meno a priezvisko'];
            replyTo = customerEmail;
        }

        // **AUTOMATIC CONTACT SAVING TO EMAIL_MARKETING KV**
        if (customerEmail && env.EMAIL_MARKETING) {
            try {
                await saveContactToKV(env.EMAIL_MARKETING, {
                    email: customerEmail,
                    name: customerName || '',
                    source: formName
                });
            } catch (err) {
                console.error('Error saving contact to KV:', err);
                // Continue even if contact save fails
            }
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

// ============================================
// SPAM PROTECTION FUNCTIONS
// ============================================

async function verifyTurnstile(token, secret, request) {
    try {
        // Získaj IP adresu používateľa
        const ip = request.headers.get('CF-Connecting-IP') || 
                   request.headers.get('X-Forwarded-For') || 
                   '';

        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                secret: secret,
                response: token,
                remoteip: ip,
            }),
        });

        const result = await response.json();
        
        if (!result.success) {
            console.log('Turnstile verification failed:', result['error-codes']);
        }

        return result.success;
    } catch (error) {
        console.error('Turnstile verification error:', error);
        return false;
    }
}

function checkForSpam(data) {
    const allText = Object.values(data).join(' ').toLowerCase();
    
    // Typické spam vzory
    const spamPatterns = [
        /\b(viagra|cialis|casino|lottery|winner|prize|click here|buy now)\b/i,
        /\b(earn money|make money|work from home|bitcoin|crypto)\b/i,
        /(http[s]?:\/\/.*){3,}/i, // Viac ako 2 URL odkazy
        /\[url=/i, // BBCode linky
        /<a\s+href/i, // HTML linky
        /(.)\1{10,}/i, // Opakujúce sa znaky (napr. "aaaaaaaaaaaaa")
    ];

    for (const pattern of spamPatterns) {
        if (pattern.test(allText)) {
            return { isSpam: true, reason: `Pattern match: ${pattern}` };
        }
    }

    // Kontrola príliš krátkych mien s dlhými správami (typické pre boty)
    const name = data['Meno a priezvisko'] || '';
    const message = data['Správa'] || '';
    
    if (name.length < 3 && message.length > 500) {
        return { isSpam: true, reason: 'Short name with long message' };
    }

    // Kontrola či email vyzerá podozrivo
    const email = data['Email'] || data['E-mail'] || '';
    if (email && /^[a-z]{1,3}[0-9]{5,}@/.test(email)) {
        return { isSpam: true, reason: 'Suspicious email pattern' };
    }

    return { isSpam: false };
}

// ============================================
// CONTACT SAVING
// ============================================

async function saveContactToKV(kvNamespace, contactData) {
    const { email, name, source } = contactData;

    if (!email || !source) {
        return;
    }

    const key = `contact:${email}`;

    // Check if contact exists
    const existing = await kvNamespace.get(key);

    if (existing) {
        // Update existing contact
        const existingData = JSON.parse(existing);
        const updatedContact = {
            ...existingData,
            name: name || existingData.name,
            updatedAt: new Date().toISOString()
        };
        await kvNamespace.put(key, JSON.stringify(updatedContact));
    } else {
        // Create new contact
        const newContact = {
            email,
            name: name || '',
            source,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await kvNamespace.put(key, JSON.stringify(newContact));
    }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

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
                                    Táto správa bola odoslaná z kontaktného formulára na portretnefilmy.sk
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
    const firstName = (data['Meno a priezvisko'] || '').split(' ')[0];

    if (formName === 'kontakt') {
        return {
            subject: 'Ďakujeme za správu | Portrétny film',
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
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Ďakujeme za správu!</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                            Dobrý deň${firstName ? ' ' + firstName : ''},
                                        </p>
                                        <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                                            Ďakujeme za váš záujem o portrétny film. Vašu správu sme prijali a <strong style="color: #f97316;">ozveme sa vám do 24 hodín</strong>.
                                        </p>
                                        
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
                                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Rezervácia prijatá!</h1>
                                    </td>
                                </tr>
                                
                                <!-- Content -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px; color: #333; font-size: 16px; line-height: 1.6;">
                                            Dobrý deň${firstName ? ' ' + firstName : ''},
                                        </p>
                                        <p style="margin: 0 0 20px; color: #666; font-size: 16px; line-height: 1.6;">
                                            Ďakujeme za vašu rezerváciu na workshop. <strong style="color: #f97316;">Ozveme sa vám do 24 hodín</strong> s potvrdením a ďalšími detailami.
                                        </p>
                                        
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
