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
        return new Response(JSON.stringify({
            success: false,
            error: 'IČO musí mať aspoň 6 znakov'
        }), { headers });
    }

    const cleanIco = ico.replace(/\s/g, '');
    const debug = { ico: cleanIco, attempts: [] };

    try {
        // Prvé API
        debug.attempts.push({ api: 'slovensko.digital', status: 'trying' });
        const res = await fetch(
            `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${cleanIco}&per_page=5`
        );

        debug.attempts[0].status = res.ok ? 'success' : 'failed';
        debug.attempts[0].httpStatus = res.status;

        if (res.ok) {
            const data = await res.json();
            debug.attempts[0].resultCount = data.length;

            if (Array.isArray(data) && data.length > 0) {
                const c = data.find(item => item.cin === cleanIco) || data[0];

                return new Response(JSON.stringify({
                    success: true,
                    name: c.name || '',
                    address: c.formatted_address || '',
                    dic: c.dic || '',
                    icDph: c.ic_dph || '',
                    _debug: debug
                }), { headers });
            }
        }
    } catch (e) {
        debug.attempts[0].error = e.message;
    }

    // Fallback - Register UZ
    try {
        debug.attempts.push({ api: 'register-uz', status: 'trying' });
        const res1 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${cleanIco}`);

        debug.attempts[1].status = res1.ok ? 'success' : 'failed';
        debug.attempts[1].httpStatus = res1.status;

        if (res1.ok) {
            const data1 = await res1.json();
            debug.attempts[1].hasId = !!data1.id;
            debug.attempts[1].idCount = data1.id?.length || 0;

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
                    icDph: firma.icDph || '',
                    _debug: debug
                }), { headers });
            }
        }
    } catch (e) {
        debug.attempts[1].error = e.message;
    }

    return new Response(JSON.stringify({
        success: false,
        _debug: debug
    }), { headers });
}