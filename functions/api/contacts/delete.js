// POST /api/contacts/delete
// Delete contact from EMAIL_MARKETING KV

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
        const { email } = body;

        if (!email) {
            return new Response(JSON.stringify({
                error: 'Missing email'
            }), {
                status: 400,
                headers
            });
        }

        const EMAIL_MARKETING = env.EMAIL_MARKETING;

        if (!EMAIL_MARKETING) {
            return new Response(JSON.stringify({ error: 'KV not configured' }), {
                status: 500,
                headers
            });
        }

        const key = `contact:${email}`;
        await EMAIL_MARKETING.delete(key);

        return new Response(JSON.stringify({
            ok: true,
            deleted: email
        }), { headers });

    } catch (err) {
        console.error('Error deleting contact:', err);
        return new Response(JSON.stringify({
            error: err.message
        }), {
            status: 500,
            headers
        });
    }
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