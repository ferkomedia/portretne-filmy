// functions/api/domain-check.js
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const domain = url.searchParams.get("domain")?.trim().toLowerCase();

    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    };

    if (!domain || !/^[a-z0-9-]{1,63}\.sk$/.test(domain)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid domain" }), { headers });
    }

    try {
        // DNS lookup cez Cloudflare DoH
        const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${domain}&type=A`;
        const res = await fetch(dnsUrl, {
            headers: { "Accept": "application/dns-json" },
        });

        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: "DNS lookup failed" }), { headers });
        }

        const data = await res.json();

        // Ak má DNS záznamy (Answer), doména je obsadená
        // Ak Status=3 (NXDOMAIN), doména neexistuje = voľná
        const available = data.Status === 3 || (!data.Answer || data.Answer.length === 0);

        return new Response(JSON.stringify({
            ok: true,
            domain: domain,
            available: available,
        }), { headers });

    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { headers });
    }
}