export async function onRequest(context) {
    const url = new URL(context.request.url);
    const ico = url.searchParams.get('ico');

    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    if (context.request.method === 'OPTIONS') {
        return new Response(null, { headers });
    }

    if (!ico || ico.length < 8) {
        return new Response(JSON.stringify({ success: false }), { headers });
    }

    try {
        const res = await fetch(
            `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/cin/${ico.replace(/\s/g, '')}`
        );

        if (!res.ok) {
            return new Response(JSON.stringify({ success: false }), { headers });
        }

        const c = await res.json();

        return new Response(JSON.stringify({
            success: true,
            name: c.name || '',
            address: c.formatted_address || '',
            dic: c.dic || '',
            icDph: c.ic_dph || ''
        }), { headers });

    } catch (e) {
        return new Response(JSON.stringify({ success: false }), { headers });
    }
}