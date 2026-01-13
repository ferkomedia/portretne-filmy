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

    const cleanIco = ico.replace(/\s/g, '');

    try {
        // Skús SEARCH endpoint (obsahuje aj živnostníkov)
        const res = await fetch(
            `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${cleanIco}&per_page=5`
        );

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const c = data.find(item => item.cin === cleanIco) || data[0];
                return new Response(JSON.stringify({
                    success: true,
                    name: c.name || '',
                    address: c.formatted_address || '',
                    dic: c.dic || '',
                    icDph: c.ic_dph || ''
                }), { headers });
            }
        }

        return new Response(JSON.stringify({ success: false }), { headers });
    } catch (e) {
        return new Response(JSON.stringify({ success: false }), { headers });
    }
}