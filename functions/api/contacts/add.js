// POST /api/contacts/add
// Add new contact to EMAIL_MARKETING KV

export async function onRequestPost(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        const body = await request.json();
        const { email, name, source } = body;

        if (!email || !source) {
            return new Response(JSON.stringify({
                error: 'Missing required fields: email, source'
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

        // Check if contact already exists
        const existingKey = `contact:${email}`;
        const existing = await EMAIL_MARKETING.get(existingKey);

        if (existing) {
            // Update existing contact
            const existingData = JSON.parse(existing);
            const updatedContact = {
                ...existingData,
                name: name || existingData.name,
                updatedAt: new Date().toISOString()
            };

            await EMAIL_MARKETING.put(existingKey, JSON.stringify(updatedContact));

            return new Response(JSON.stringify({
                ok: true,
                contact: updatedContact,
                updated: true
            }), { headers });
        }

        // Create new contact
        const contact = {
            email,
            name: name || '',
            source,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await EMAIL_MARKETING.put(existingKey, JSON.stringify(contact));

        return new Response(JSON.stringify({
            ok: true,
            contact: contact,
            created: true
        }), { headers });

    } catch (err) {
        console.error('Error adding contact:', err);
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