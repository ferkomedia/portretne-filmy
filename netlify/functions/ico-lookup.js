export const handler = async (event) => {
    try {
        const icoRaw = (event.queryStringParameters?.ico || "").trim();
        const ico = icoRaw.replace(/\s+/g, "");

        if (!/^\d{6,8}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Neplatné IČO." }, 400);
        }

        // 1. Skúsime RegisterUZ (primárny zdroj)
        let result = await tryRegisterUZ(ico);

        // 2. Ak RegisterUZ zlyhá, skúsime Slovensko.Digital DataHub
        if (!result.ok || !result.found) {
            const fallbackResult = await tryDataHub(ico);
            if (fallbackResult.ok && fallbackResult.found) {
                result = fallbackResult;
            }
        }

        return json(result, result.ok ? 200 : 502);

    } catch (e) {
        console.error("Handler error:", e);
        return json({ ok: false, found: false, error: "Chyba servera." }, 500);
    }
};

// ========== RegisterUZ (primárny zdroj) ==========
async function tryRegisterUZ(ico) {
    try {
        const endpoint = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}`;

        const r = await fetch(endpoint, {
            headers: {
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Netlify Function) FerkoMedia",
            },
        });

        const ct = (r.headers.get("content-type") || "").toLowerCase();
        const text = await r.text();

        if (!ct.includes("application/json")) {
            return {
                ok: false,
                found: false,
                error: "RegisterUZ blokuje požiadavku (WAF).",
                source: "registeruz",
            };
        }

        const data = JSON.parse(text);

        const arr =
            Array.isArray(data) ? data :
                Array.isArray(data?.data) ? data.data :
                    Array.isArray(data?.items) ? data.items :
                        Array.isArray(data?.result) ? data.result :
                            [];

        const item = arr.find(x => String(x?.ico ?? x?.ICO ?? "").trim() === ico) ?? arr[0];

        if (!item) return { ok: true, found: false, ico, source: "registeruz" };

        const d = item;
        const company = extractRegisterUZ(d, ico);

        return { ok: true, found: true, ico, company, source: "registeruz" };

    } catch (e) {
        console.error("RegisterUZ error:", e);
        return { ok: false, found: false, error: "RegisterUZ nedostupný.", source: "registeruz" };
    }
}

function extractRegisterUZ(d, ico) {
    const name = (d.nazovUJ ?? d.name ?? "").toString().trim();
    const dic = (d.dic ?? d.DIC ?? "").toString().trim();
    const icdph = (d.icDph ?? d.icdph ?? d.ICDPH ?? "").toString().trim();

    const street = (d.ulica ?? d.street ?? "").toString().trim();
    const number = (
        d.supCislo ?? d.supcislo ?? d.orientacneCislo ?? d.orientacnecislo ?? d.number ?? ""
    ).toString().trim();
    const city = (d.mesto ?? d.city ?? "").toString().trim();
    const psc = (d.psc ?? d.postalCode ?? "").toString().trim();
    const country = (d.stat ?? d.country ?? "Slovenská republika").toString().trim();

    const addressLine = [street, number].filter(Boolean).join(" ").trim();
    const addressFull = [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    return { name, ico, dic, icdph, street, number, city, psc, country, addressLine, addressFull };
}

// ========== Slovensko.Digital DataHub (záložný zdroj) ==========
async function tryDataHub(ico) {
    try {
        const endpoint = `https://datahub.ekosystem.slovensko.digital/api/datahub/corporate_bodies/search?q=cin:${encodeURIComponent(ico)}`;

        const r = await fetch(endpoint, {
            headers: {
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Netlify Function) FerkoMedia",
            },
        });

        if (!r.ok) {
            return { ok: false, found: false, error: "DataHub nedostupný.", source: "datahub" };
        }

        const data = await r.json();

        // DataHub vracia pole výsledkov
        const items = Array.isArray(data) ? data : (data?.results ?? data?.items ?? []);
        const item = items.find(x => String(x?.cin ?? "").trim() === ico) ?? items[0];

        if (!item) return { ok: true, found: false, ico, source: "datahub" };

        const company = extractDataHub(item, ico);

        return { ok: true, found: true, ico, company, source: "datahub" };

    } catch (e) {
        console.error("DataHub error:", e);
        return { ok: false, found: false, error: "DataHub chyba.", source: "datahub" };
    }
}

function extractDataHub(d, ico) {
    const name = (d.name ?? "").toString().trim();
    const dic = (d.tin ?? "").toString().trim();
    const icdph = (d.vatin ?? "").toString().trim();

    const street = (d.street ?? "").toString().trim();
    const number = (d.reg_number ?? d.building_number ?? d.street_number ?? "").toString().trim();
    const city = (d.municipality ?? "").toString().trim();
    const psc = (d.postal_code ?? "").toString().trim();
    const country = (d.country ?? "Slovenská republika").toString().trim();

    const addressLine = (d.formatted_street ?? [street, number].filter(Boolean).join(" ")).trim();
    const addressFull = (d.formatted_address ?? [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")).trim();

    return { name, ico, dic, icdph, street, number, city, psc, country, addressLine, addressFull };
}

// ========== Helper ==========
function json(obj, statusCode = 200) {
    return {
        statusCode,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        body: JSON.stringify(obj),
    };
}