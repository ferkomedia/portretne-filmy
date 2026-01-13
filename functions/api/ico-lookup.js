export async function onRequest(context) {
    const url = new URL(context.request.url);
    const ico = url.searchParams.get('ico');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (context.request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    if (!ico || ico.length < 8) {
        return new Response(JSON.stringify({
            success: false,
            error: 'IČO musí mať aspoň 8 znakov'
        }), { status: 400, headers: corsHeaders });
    }

    const cleanIco = ico.replace(/\s/g, '');

    try {
        // Method 1: Direct lookup by CIN (IČO)
        const directUrl = `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/cin/${cleanIco}`;

        let response = await fetch(directUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'PortretneFilmy/1.0'
            }
        });

        let data = null;
        let company = null;

        if (response.ok) {
            data = await response.json();
            if (data && data.name) {
                company = data;
            }
        }

        // Method 2: Search if direct lookup failed
        if (!company) {
            const searchUrl = `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${cleanIco}&per_page=5`;

            response = await fetch(searchUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PortretneFilmy/1.0'
                }
            });

            if (response.ok) {
                data = await response.json();
                if (Array.isArray(data) && data.length > 0) {
                    // Find exact match by CIN
                    company = data.find(c => c.cin === cleanIco) || data[0];
                }
            }
        }

        if (company && company.name) {
            return new Response(JSON.stringify({
                success: true,
                name: company.name || '',
                address: company.formatted_address || '',
                dic: company.dic || '',
                icDph: company.ic_dph || '',
                ico: company.cin || cleanIco
            }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            success: false,
            error: 'Firma s týmto IČO nebola nájdená',
            debug: { ico: cleanIco, apiResponse: data }
        }), { headers: corsHeaders });

    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Chyba pri vyhľadávaní: ' + err.message
        }), { headers: corsHeaders });
    }
}
