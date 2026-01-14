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

    if (!ico || ico.length !== 8) {
        return new Response(JSON.stringify({ ok: false, found: false }), { headers });
    }

    try {
        // 1. Získaj ID účtovnej jednotky
        const listUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&ico=${ico}&max-zaznamov=1`;

        const resp1 = await fetch(listUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PortretneFilmy/1.0)'
            }
        });

        if (!resp1.ok) {
            return new Response(JSON.stringify({ ok: false, found: false }), { headers });
        }

        const body1 = await resp1.json();
        const ids = body1?.id || [];

        if (!ids || ids.length === 0) {
            return new Response(JSON.stringify({ ok: false, found: false }), { headers });
        }

        // 2. Získaj detail účtovnej jednotky
        const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${ids[0]}`;

        const resp2 = await fetch(detailUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; PortretneFilmy/1.0)'
            }
        });

        if (!resp2.ok) {
            return new Response(JSON.stringify({ ok: false, found: false }), { headers });
        }

        const firma = await resp2.json();

        return new Response(JSON.stringify({
            ok: true,
            found: true,
            company: {
                name: firma.nazovUJ || '',
                ico: firma.ico || ico,
                dic: firma.dic || '',
                city: firma.mesto || '',
                street: firma.ulica || '',
                cislo: firma.cislo || '',
                psc: firma.psc || '',
                icDph: firma.icDph || ''
            }
        }), { headers });

    } catch (error) {
        console.error('ICO lookup error:', error);
        return new Response(JSON.stringify({ ok: false, found: false }), { headers });
    }
}