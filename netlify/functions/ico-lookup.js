export const handler = async (event) => {
    try {
        const icoRaw = (event.queryStringParameters?.ico || "").trim();
        const ico = icoRaw.replace(/\s+/g, "");

        if (!/^\d{6,8}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Neplatné IČO." }, 400);
        }

        // 1. Skúsime RegisterUZ
        let result = await tryRegisterUZ(ico);

        // 2. Ak RegisterUZ zlyhá, skúsime DataHub
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

// ========== RegisterUZ (OPRAVENÉ - 2 kroky) ==========
async function tryRegisterUZ(ico) {
    try {
        // KROK 1: Získať ID účtovnej jednotky
        const searchUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=0&max-zaznamov=1&ico=${encodeURIComponent(ico)}`;

        const searchResponse = await fetch(searchUrl, {
            headers: {
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Netlify Function) FerkoMedia",
            },
        });

        const searchCt = (searchResponse.headers.get("content-type") || "").toLowerCase();
        const searchText = await searchResponse.text();

        if (!searchCt.includes("application/json")) {
            return {
                ok: false,
                found: false,
                error: "RegisterUZ blokuje požiadavku (WAF).",
                source: "registeruz",
            };
        }

        const searchData = JSON.parse(searchText);

        // Odpoveď je: {"id":[123456],"existujeDalsieId":false}
        const ids = Array.isArray(searchData?.id) ? searchData.id : [];

        if (ids.length === 0) {
            return { ok: true, found: false, ico, source: "registeruz" };
        }

        const entityId = ids[0];

        // KROK 2: Získať detail účtovnej jednotky
        const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${entityId}`;

        const detailResponse = await fetch(detailUrl, {
            headers: {
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Netlify Function) FerkoMedia",
            },
        });

        const detailCt = (detailResponse.headers.get("content-type") || "").toLowerCase();
        const detailText = await detailResponse.text();

        if (!detailCt.includes("application/json")) {
            return {
                ok: false,
                found: false,
                error: "RegisterUZ detail nedostupný.",
                source: "registeruz",
            };
        }

        const d = JSON.parse(detailText);

        if (!d || !d.nazovUJ) {
            return { ok: true, found: false, ico, source: "registeruz" };
        }

        const company = extractRegisterUZ(d, ico);

        return { ok: true, found: true, ico, company, source: "registeruz" };

    } catch (e) {
        console.error("RegisterUZ error:", e);
        return { ok: false, found: false, error: "RegisterUZ nedostupný.", source: "registeruz" };
    }
}

function extractRegisterUZ(d, ico) {
    const name = (d.nazovUJ ?? "").toString().trim();
    const dic = (d.dic ?? "").toString().trim();
    const icdph = (d.icDph ?? d.icdph ?? "").toString().trim();

    const street = (d.ulica ?? "").toString().trim();
    const city = (d.mesto ?? "").toString().trim();
    const psc = (d.psc ?? "").toString().trim();
    const country = "Slovenská republika";

    // RegisterUZ má ulicu aj s číslom v jednom poli
    const addressLine = street;
    const addressFull = [street, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    return {
        name,
        ico: d.ico ?? ico,
        dic,
        icdph,
        street,
        number: "", // RegisterUZ nemá oddelené číslo
        city,
        psc,
        country,
        addressLine,
        addressFull
    };
}

// ========== DataHub (záložný zdroj) ==========
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
    const number = (d.building_number ?? d.street_number ?? "").toString().trim();
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