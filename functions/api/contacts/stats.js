// GET /api/contacts/stats
// Returns contact statistics

export async function onRequest(context) {
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
        const EMAIL_MARKETING = env.EMAIL_MARKETING;

        if (!EMAIL_MARKETING) {
            return new Response(JSON.stringify({ error: 'KV not configured' }), {
                status: 500,
                headers
            });
        }

        // List all contacts
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

        // Count by source
        const stats = {
            total: contacts.length,
            workshop: contacts.filter(c => c.source === 'workshopy').length,
            kontakt: contacts.filter(c => c.source === 'kontakt').length,
            'dlhodoba-spolupraca': contacts.filter(c => c.source === 'dlhodoba-spolupraca').length,
        };

        // Count campaigns
        const campaignsList = await EMAIL_MARKETING.list({ prefix: 'campaign:' });
        stats.campaigns = campaignsList.keys.length;

        return new Response(JSON.stringify({
            ok: true,
            ...stats
        }), { headers });

    } catch (err) {
        console.error('Error loading stats:', err);
        return new Response(JSON.stringify({
            error: err.message
        }), {
            status: 500,
            headers
        });
    }
}