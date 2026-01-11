// Email sender using Resend
// Endpoint: POST /api/send-email

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const { to, subject, html, replyTo } = await request.json();

        if (!to || !subject || !html) {
            return new Response(
                JSON.stringify({ error: 'Chýbajú povinné polia: to, subject, html' }),
                { status: 400, headers }
            );
        }

        const resendApiKey = env.RESEND_API_KEY;

        if (!resendApiKey) {
            console.error('RESEND_API_KEY not configured');
            return new Response(
                JSON.stringify({ error: 'Email služba nie je nakonfigurovaná' }),
                { status: 500, headers }
            );
        }

        const emailFrom = env.EMAIL_FROM || 'FerkoMedia <noreply@portretnefilmy.sk>';

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

        const result = await response.json();

        if (!response.ok) {
            console.error('Resend error:', result);
            return new Response(
                JSON.stringify({ error: result.message || 'Chyba pri odosielaní emailu' }),
                { status: 400, headers }
            );
        }

        return new Response(
            JSON.stringify({ ok: true, id: result.id }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Email error:', error);
        return new Response(
            JSON.stringify({ error: 'Nastala neočakávaná chyba' }),
            { status: 500, headers }
        );
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
