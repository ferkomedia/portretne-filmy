// netlify/functions/ico-lookup.js

export async function handler(event) {
    try {
        const url = new URL(event.rawUrl);
        const ico = (url.searchParams.get("ico") || "").replace(/\s+/g, "");

        if (!ico || !/^\d{6,10}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Zadajte platné IČO (6–10 číslic)." }, 400);
        }

        // POZNÁMKA:
        // Ty už evidentne používaš zdroj, ktorý vracia použiteľné dáta (podľa screenshotu).
        // Nechám tu "passthrough" cez tvoju existujúcu logiku, ale bezpečne to znormalizujem.
        // Ak máš vlastný endpoint, sem dosadíš jeho URL.
        //
        // Dočasne použijeme tvoje existujúce správanie: ak už máš v projekte fetch na zdroj,
        // nechaj ho, len na konci volaj normalizeCompany(payload).
        //
        // Keďže nevidím tvoj pôvodný kód, spravím robustnú verziu s fallbackom:
        // - najprv skúsim tvoj pôvodný endpoint, ak existuje cez ENV (odporúčané)
        // - ak nie, vrátim "not found" (aby si si tam dal správny zdroj)

        const sourceUrl = process.env.ICO_SOURCE_URL; // napr. https://tvoj-api/ico?ico=...
        if (!sourceUrl) {
            return json({
                ok: true,
                found: false,
                ico,
                error:
                    "Chýba ICO_SOURCE_URL v Netlify env. Nastav zdroj pre IČO lookup (alebo uprav funkciu na tvoj existujúci zdroj).",
            });
        }

        const res = await fetch(`${sourceUrl}${sourceUrl.includes("?") ? "&" : "?"}ico=${encodeURIComponent(ico)}`, {
            headers: { "User-Agent": "netlify-function" },
        });

        if (!res.ok) {
            return json({ ok: false, found: false, ico, error: `Zdroj pre IČO vrátil chybu: ${res.status}` }, 502);
        }

        const payload = await res.json();
        const normalized = normalizeCompany(payload, ico);

        return json({ ok: true, found: normalized.found, ico, company: normalized.company, fields: normalized.fields });
    } catch (e) {
        return json({ ok: false, found: false, error: String(e?.message || e) }, 500);
    }
}

function normalizeCompany(payload, ico) {
    // Podľa tvojho screenshotu payload vyzerá už „company: { name, address, ... }“ + ďalšie polia.
    // Spravíme bezpečné čítanie:
    const company = payload?.company || payload?.data?.company || payload || {};
    const name = safeStr(company?.name) || safeStr(payload?.name) || "";
    const city = safeStr(company?.municipality) || safeStr(company?.city) || "";
    const postalCode = safeStr(company?.postalCode) || safeStr(company?.zip) || "";
    const country = safeStr(company?.country) || "Slovenská republika";

    // Address line: priorita na string, nie pole objektov
    const street =
        safeStr(company?.street) ||
        safeStr(company?.addressLine) ||
        safeStr(company?.address) || // niekedy už býva hotový string
        "";

    // VAT / DPH: môže byť v rôznych miestach
    const icDph = safeStr(payload?.vatNumber) || safeStr(company?.vatNumber) || safeStr(payload?.icdph) || safeStr(company?.icdph) || "";

    // DIČ (ak existuje)
    const dic = safeStr(payload?.taxNumber) || safeStr(company?.taxNumber) || safeStr(payload?.dic) || safeStr(company?.dic) || "";

    const legalForm = safeStr(company?.legalForm) || safeStr(payload?.legalForm) || "";
    const status = safeStr(payload?.status) || safeStr(company?.status) || "";
    const established = safeStr(payload?.established) || safeStr(company?.establishment) || safeStr(payload?.establishment) || "";

    const found = Boolean(name || street || city || postalCode || dic || icDph);

    const companyObj = {
        name,
        ico,
        dic,
        icDph,
        street,
        city,
        postalCode,
        country,
        legalForm,
        status,
        established,
    };

    // fields pre hidden inputy
    const fields = {
        "Firma - názov": name,
        "Firma - IČO": ico,
        "Firma - DIČ": dic,
        "Firma - IČ DPH": icDph,
        "Firma - ulica": street,
        "Firma - mesto": city,
        "Firma - PSČ": postalCode,
        "Firma - krajina": country,
        "Firma - právna forma": legalForm,
        "Firma - stav": status,
        "Firma - založená": established,
    };

    return { found, company: companyObj, fields };
}

function safeStr(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    return ""; // ignoruj objekty/array, aby nevznikol [object Object]
}

function json(obj, status = 200) {
    return {
        statusCode: status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(obj),
    };
}
