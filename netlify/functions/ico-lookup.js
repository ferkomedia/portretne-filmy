export const handler = async (event) => {
    try {
        const icoRaw = (event.queryStringParameters?.ico || "").trim();
        const ico = icoRaw.replace(/\s+/g, "");

        if (!/^\d{6,8}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Neplatné IČO." }, 400);
        }

        // 1) Primárne: RegisterUZ
        let res = await tryRegisterUZ(ico);

        // 2) Fallback: Slovensko.Digital DataHub
        if (!res.ok || !res.found) {
            const fb = await tryDataHub(ico);
            if (fb.ok && fb.found) res = fb;
        }

        // Ak ani jeden zdroj nevrátil firmu, ale aspoň jeden zdroj bol dostupný:
        // nech je ok:true, found:false (nie 502), aby UI nevyzeralo "rozbité"
        if (!res.found && (res.source === "registeruz" || res.source === "datahub")) {
            // ak res.ok je false a máme jasný blok / nedostupnosť, nech UI dostane správu
            // ale HTTP necháme 200, aby to nespadlo ako "crash"
            if (!res.ok) return json(res, 200);
            return json(res, 200);
        }

        return json(res, res.ok ? 200 : 502);
    } catch (e) {
        console.error("ICO handler error:", e);
        return json({ ok: false, found: false, error: "Chyba servera." }, 500);
    }
};

/* ================= RegisterUZ ================= */
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

        // WAF / HTML block
        if (!ct.includes("application/json")) {
            return {
                ok: false,
                found: false,
                ico,
                error: "RegisterUZ blokuje požiadavku (WAF).",
                source: "registeruz",
                status: r.status,
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

        return {
            ok: true,
            found: true,
            ico,
            company: extractRegisterUZ(item, ico),
            source: "registeruz",
        };
    } catch (e) {
        console.error("RegisterUZ error:", e);
        return { ok: false, found: false, ico, error: "RegisterUZ nedostupný.", source: "registeruz" };
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

/* ================= Slovensko.Digital DataHub =================
   Poznámka: DataHub vracia rôzne štruktúry podľa endpointu.
   Zoberieme bezpečne najpravdepodobnejšie polia a urobíme fallbacky.
*/
async function tryDataHub(ico) {
    try {
        // Tento endpoint môže vrátiť results/items/array – ošetríme
        const endpoint = `https://datahub.ekosystem.slovensko.digital/api/datahub/corporate_bodies/search?q=cin:${encodeURIComponent(ico)}`;

        const r = await fetch(endpoint, {
            headers: {
                accept: "application/json",
                "user-agent": "Mozilla/5.0 (Netlify Function) FerkoMedia",
            },
        });

        if (!r.ok) {
            return { ok: false, found: false, ico, error: "DataHub nedostupný.", source: "datahub", status: r.status };
        }

        const data = await r.json();

        const items =
            Array.isArray(data) ? data :
                Array.isArray(data?.results) ? data.results :
                    Array.isArray(data?.items) ? data.items :
                        Array.isArray(data?.data) ? data.data :
                            [];

        // niekde to môže byť “cin”, niekde “ico”
        const item =
            items.find(x => String(x?.cin ?? x?.ico ?? x?.ICO ?? "").trim() === ico) ??
            items[0];

        if (!item) return { ok: true, found: false, ico, source: "datahub" };

        return {
            ok: true,
            found: true,
            ico,
            company: extractDataHub(item, ico),
            source: "datahub",
        };
    } catch (e) {
        console.error("DataHub error:", e);
        return { ok: false, found: false, ico, error: "DataHub chyba.", source: "datahub" };
    }
}

function extractDataHub(d, ico) {
    const name = (d.name ?? d.full_name ?? d.business_name ?? "").toString().trim();

    // TIN / DIC / VATIN môžu byť rôzne názvy
    const dic = (d.tin ?? d.dic ?? d.tax_id ?? "").toString().trim();
    const icdph = (d.vatin ?? d.icdph ?? d.vat_id ?? "").toString().trim();

    // adresa
    const street = (d.street ?? d.address_street ?? d.ulica ?? "").toString().trim();
    const number = (d.reg_number ?? d.building_number ?? d.street_number ?? d.number ?? "").toString().trim();
    const city = (d.municipality ?? d.city ?? d.mesto ?? "").toString().trim();
    const psc = (d.postal_code ?? d.zip ?? d.psc ?? "").toString().trim();
    const country = (d.country ?? "Slovenská republika").toString().trim();

    const addressLine = (d.formatted_street ?? [street, number].filter(Boolean).join(" ")).toString().trim();
    const addressFull = (d.formatted_address ?? [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")).toString().trim();

    return { name, ico, dic, icdph, street, number, city, psc, country, addressLine, addressFull };
}

/* ================= Helper ================= */
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
