// GET /api/contacts/list
// Returns all contacts from EMAIL_MARKETING KV

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

        // Sort by date (newest first)
        contacts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return new Response(JSON.stringify({
            ok: true,
            contacts: contacts,
            total: contacts.length
        }), { headers });

    } catch (err) {
        console.error('Error loading contacts:', err);
        return new Response(JSON.stringify({
            error: err.message
        }), {
            status: 500,
            headers
        });
    }
}