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
            // Still redirect, just skip email
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
        } else {
            subject = `Nový formulár: ${formName}`;
            customerEmail = data['Email'] || data['E-mail'];
            replyTo = customerEmail;
        }

        // Format form data as HTML
        const formHtml = Object.entries(data)
            .filter(([key]) => !key.startsWith('Firma -') || data[key]) // Skip empty company fields
            .map(([key, value]) => `<p><strong>${key}:</strong> ${value || '—'}</p>`)
            .join('');

        // Send to admin
        await sendEmail(env, {
            to: adminEmail,
            subject,
            html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>${subject}</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
            ${formHtml}
          </div>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Odoslané z webu portretnefilmy.sk
          </p>
        </div>
      `,
            replyTo,
        });

        // Send confirmation to customer
        if (customerEmail) {
            let confirmationSubject, confirmationHtml;

            if (formName === 'kontakt') {
                confirmationSubject = 'Dopyt prijatý | Portrétny film';
                confirmationHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Ďakujeme za váš dopyt!</h1>
            <p>Dobrý deň${data['Meno a priezvisko'] ? ' ' + data['Meno a priezvisko'].split(' ')[0] : ''},</p>
            <p>Váš dopyt sme prijali a ozveme sa vám čo najskôr, zvyčajne do 24 hodín.</p>
            <p><strong>Čo ste nám napísali:</strong></p>
            <ul>
              <li>Typ filmu: ${data['Typ portrétneho filmu'] || '—'}</li>
              <li>Preferovaný termín: ${data['Preferovaný termín'] || 'neurčený'}</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">
              S pozdravom,<br>
              FerkoMedia<br>
              <a href="https://portretnefilmy.sk">portretnefilmy.sk</a>
            </p>
          </div>
        `;
            } else if (formName === 'workshopy') {
                confirmationSubject = 'Rezervácia prijatá | Workshop';
                confirmationHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Ďakujeme za rezerváciu!</h1>
            <p>Dobrý deň${data['Meno a priezvisko'] ? ' ' + data['Meno a priezvisko'].split(' ')[0] : ''},</p>
            <p>Vašu rezerváciu sme prijali. Ozveme sa vám s potvrdením a ďalšími detailmi.</p>
            <p><strong>Detaily rezervácie:</strong></p>
            <ul>
              <li>Workshop: ${data['Termín workshopu'] || '—'}</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 14px;">
              S pozdravom,<br>
              FerkoMedia<br>
              <a href="https://portretnefilmy.sk">portretnefilmy.sk</a>
            </p>
          </div>
        `;
            }

            if (confirmationSubject) {
                await sendEmail(env, {
                    to: customerEmail,
                    subject: confirmationSubject,
                    html: confirmationHtml,
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
