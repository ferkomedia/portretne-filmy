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
        return new Response(JSON.stringify({ success: false, error: 'Invalid ICO' }), {
            status: 400,
            headers: corsHeaders
        });
    }

    try {
        const response = await fetch(
            'https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=' + ico,
            {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PortretneFilmy/1.0'
                }
            }
        );

        const data = await response.json();

        if (data && data.length > 0) {
            const company = data[0];
            return new Response(JSON.stringify({
                success: true,
                name: company.name || '',
                address: company.formatted_address || '',
                dic: company.dic || '',
                icDph: company.ic_dph || '',
                ico: company.cin || ico
            }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            success: false,
            error: 'Company not found'
        }), { headers: corsHeaders });

    } catch (err) {
        return new Response(JSON.stringify({
            success: false,
            error: 'Lookup failed'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}
