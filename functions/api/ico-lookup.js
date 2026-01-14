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

    if (!ico || ico.length < 6) {
        return new Response(JSON.stringify({ success: false }), { headers });
    }

    const cleanIco = ico.replace(/\s/g, '');

    try {
        // Prvé API - slovensko.digital
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
    } catch (e) {
        console.error('First API failed:', e);
    }

    // Fallback - Register UZ
    try {
        const res1 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${cleanIco}`);

        if (res1.ok) {
            const data1 = await res1.json();

            if (data1.id && data1.id.length > 0) {
                const id = data1.id[0];
                const res2 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${id}`);
                const firma = await res2.json();

                const fullAddress = `${firma.ulica || ''} ${firma.cislo || ''}, ${firma.psc || ''} ${firma.mesto || ''}`.trim();

                return new Response(JSON.stringify({
                    success: true,
                    name: firma.nazovUJ || '',
                    address: fullAddress,
                    dic: firma.dic || '',
                    icDph: firma.icDph || ''
                }), { headers });
            }
        }
    } catch (e) {
        console.error('Fallback API failed:', e);
    }

    return new Response(JSON.stringify({ success: false }), { headers });
}