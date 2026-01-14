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
        return new Response(JSON.stringify({ ok: true, found: false }), { headers });
    }

    const cleanIco = ico.replace(/\s/g, '');

    try {
        // Skús prvé API
        const res = await fetch(
            `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${cleanIco}&per_page=5`
        );

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const c = data.find(item => item.cin === cleanIco) || data[0];

                return new Response(JSON.stringify({
                    ok: true,
                    found: true,
                    company: {
                        name: c.name || '',
                        addressFull: c.formatted_address || '',
                        dic: c.dic || '',
                        icdph: c.ic_dph || '',
                        street: c.street || '',
                        streetNumber: c.street_number || '',
                        city: c.municipality || '',
                        postalCode: c.postal_code || '',
                        country: 'Slovensko'
                    }
                }), { headers });
            }
        }
    } catch (e) {
        console.error('First API failed:', e);
    }

    // Fallback na Register UZ
    try {
        const res1 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${cleanIco}`);

        if (res1.ok) {
            const data1 = await res1.json();

            if (data1.id && data1.id.length > 0) {
                const id = data1.id[0];
                const res2 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${id}`);
                const firma = await res2.json();

                return new Response(JSON.stringify({
                    ok: true,
                    found: true,
                    company: {
                        name: firma.nazovUJ || '',
                        addressFull: `${firma.ulica || ''} ${firma.cislo || ''}, ${firma.psc || ''} ${firma.mesto || ''}`.trim(),
                        dic: firma.dic || '',
                        icdph: firma.icDph || '',
                        street: firma.ulica || '',
                        streetNumber: firma.cislo || '',
                        city: firma.mesto || '',
                        postalCode: firma.psc || '',
                        country: 'Slovensko'
                    }
                }), { headers });
            }
        }
    } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { headers });
    }

    return new Response(JSON.stringify({ ok: true, found: false }), { headers });
}