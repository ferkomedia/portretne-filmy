// netlify/functions/domain-check.js

export async function handler(event) {
    try {
        const url = new URL(event.rawUrl);
        let domain = (url.searchParams.get("domain") || "").trim().toLowerCase();

        if (!domain) return json({ ok: false, error: "Chýba parameter domain" }, 400);

        domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
            return json({ ok: false, error: "Zadajte doménu v tvare napr. mojadomena.sk" }, 400);
        }

        // DNS overenie (SOA je najlepší indikátor existencie zóny)
        const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=SOA`;
        const res = await fetch(dohUrl, {
            headers: { accept: "application/dns-json", "user-agent": "netlify-function" },
        });

        if (!res.ok) {
            return json({ ok: false, error: `DNS overenie zlyhalo: ${res.status}` }, 502);
        }

        const data = await res.json();

        // Cloudflare DoH: Status 3 = NXDOMAIN
        if (data?.Status === 3) {
            return json({ ok: true, domain, available: true, reason: "NXDOMAIN (doména neexistuje v DNS)" });
        }

        // Ak sú Answer/Authority, je veľká šanca, že existuje
        const hasAnswer = Array.isArray(data?.Answer) && data.Answer.length > 0;
        const hasAuthority = Array.isArray(data?.Authority) && data.Authority.length > 0;

        return json({
            ok: true,
            domain,
            available: false,
            reason: hasAnswer || hasAuthority ? "DNS záznamy existujú" : "Nejasné (doména môže byť delegovaná inak)",
            debug: { Status: data?.Status, Answer: data?.Answer || [], Authority: data?.Authority || [] },
        });
    } catch (e) {
        return json({ ok: false, error: String(e?.message || e) }, 500);
    }
}

function json(obj, status = 200) {
    return {
        statusCode: status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(obj),
    };
}
