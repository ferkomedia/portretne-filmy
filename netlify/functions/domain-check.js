// netlify/functions/domain-check.js

export async function handler(event) {
    try {
        const domainRaw = (event.queryStringParameters?.domain || "").trim().toLowerCase();

        if (!domainRaw) {
            return json(400, { ok: false, error: "Chýba parameter domain." });
        }

        // Basic sanitize
        const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9-]+\.(sk)$/i.test(domain)) {
            return json(400, { ok: false, error: "Zadaj doménu vo formáte napr. mojadomena.sk" });
        }

        // 1) RDAP bootstrap - find RDAP base for .sk
        const bootstrapUrl = "https://data.iana.org/rdap/dns.json";
        const bootRes = await fetch(bootstrapUrl, { headers: { "accept": "application/json" } });
        if (!bootRes.ok) {
            return json(502, { ok: false, error: "Nepodarilo sa načítať RDAP bootstrap (IANA)." });
        }

        const boot = await bootRes.json();
        const services = Array.isArray(boot.services) ? boot.services : [];
        const tld = "sk";

        let rdapBase = null;
        for (const entry of services) {
            const tlds = entry?.[0];
            const urls = entry?.[1];
            if (Array.isArray(tlds) && tlds.includes(tld) && Array.isArray(urls) && urls.length) {
                rdapBase = urls[0];
                break;
            }
        }

        if (!rdapBase) {
            return json(502, { ok: false, error: "Nepodarilo sa nájsť RDAP server pre .sk." });
        }

        // Normalize base (ensure trailing slash)
        if (!rdapBase.endsWith("/")) rdapBase += "/";

        // 2) Query RDAP domain object
        const rdapUrl = `${rdapBase}domain/${encodeURIComponent(domain)}`;
        const rdapRes = await fetch(rdapUrl, { headers: { "accept": "application/rdap+json, application/json" } });

        if (rdapRes.status === 404) {
            return json(200, { ok: true, domain, available: true });
        }

        if (!rdapRes.ok) {
            // Some RDAP servers return 400 for invalid queries, 401/403 for redacted info, etc.
            return json(200, { ok: true, domain, available: false, note: `RDAP odpoveď: ${rdapRes.status}` });
        }

        const data = await rdapRes.json();

        // We keep it minimal (avoid leaking contacts even if present)
        const status = Array.isArray(data.status) ? data.status : [];
        const nameservers = Array.isArray(data.nameservers)
            ? data.nameservers.map(ns => ns?.ldhName).filter(Boolean).slice(0, 10)
            : [];

        return json(200, {
            ok: true,
            domain,
            available: false,
            status,
            nameservers
        });
    } catch (e) {
        return json(500, { ok: false, error: "Nastala chyba pri overení domény." });
    }
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
        },
        body: JSON.stringify(body)
    };
}
