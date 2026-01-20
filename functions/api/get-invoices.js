// Get Invoices list
// Endpoint: GET /api/get-invoices
// Retrieves invoices from Cloudflare KV

export async function onRequestGet(context) {
    const { request, env } = context;

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
    };

    // Simple auth via query param (for admin dashboard)
    const url = new URL(request.url);
    const authKey = url.searchParams.get('key');
    const expectedKey = env.ADMIN_API_KEY;

    if (!expectedKey || authKey !== expectedKey) {
        return new Response(
            JSON.stringify({ error: 'Unauthorized - nastav ADMIN_API_KEY v Cloudflare' }),
            { status: 401, headers }
        );
    }

    try {
        if (!env.INVOICES_KV) {
            return new Response(
                JSON.stringify({ error: 'KV not configured', invoices: [] }),
                { status: 200, headers }
            );
        }

        // Get list of invoice IDs
        const listData = await env.INVOICES_KV.get('invoice_list');
        if (!listData) {
            return new Response(
                JSON.stringify({ invoices: [] }),
                { status: 200, headers }
            );
        }

        const invoiceIds = JSON.parse(listData);

        // Pagination
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = parseInt(url.searchParams.get('offset') || '0');
        const paginatedIds = invoiceIds.slice(offset, offset + limit);

        // Fetch invoice details
        const invoices = [];
        for (const id of paginatedIds) {
            const invoiceData = await env.INVOICES_KV.get(`invoice:${id}`);
            if (invoiceData) {
                invoices.push(JSON.parse(invoiceData));
            }
        }

        // Calculate stats
        const totalRevenue = invoices.reduce((sum, inv) => sum + inv.amount, 0);
        const thisMonth = new Date().toISOString().slice(0, 7);
        const monthlyRevenue = invoices
            .filter(inv => inv.createdAt.startsWith(thisMonth))
            .reduce((sum, inv) => sum + inv.amount, 0);

        return new Response(
            JSON.stringify({
                invoices,
                total: invoiceIds.length,
                limit,
                offset,
                stats: {
                    totalInvoices: invoiceIds.length,
                    totalRevenue,
                    monthlyRevenue,
                    monthlyCount: invoices.filter(inv => inv.createdAt.startsWith(thisMonth)).length,
                }
            }),
            { status: 200, headers }
        );

    } catch (error) {
        console.error('Get invoices error:', error);
        return new Response(
            JSON.stringify({ error: 'Chyba pri načítaní faktúr: ' + error.message }),
            { status: 500, headers }
        );
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}
