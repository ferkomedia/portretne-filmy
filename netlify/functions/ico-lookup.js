// netlify/functions/ico-lookup.js  (CommonJS)

exports.handler = async (event) => {
    try {
        const ico = (event.queryStringParameters?.ico || "").replace(/\s+/g, "").trim();

        if (!ico) return json(400, { ok: false, error: "Chýba parameter ico." });
        if (!/^\d{6,10}$/.test(ico)) return json(400, { ok: false, error: "IČO má byť 6–10 číslic." });

        const url = `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`;
        const res = await fetch(url, { headers: { accept: "application/json" } });

        if (!res.ok) return json(502, { ok: false, error: "RPO API vrátilo chybu." });

        const data = await res.json();

        // RPO odpoveď je objekt s results[]
        const item = Array.isArray(data?.results) ? data.results[0] : null;
        if (!item) return json(200, { ok: true, found: false, ico });

        // Názov firmy: fullNames[0].value
        const name = Array.isArray(item.fullNames) && item.fullNames.length ? (item.fullNames[0]?.value || "") : "";

        // Adresa: addresses[0] + municipality.value
        const addr = Array.isArray(item.addresses) && item.addresses.length ? item.addresses[0] : null;

        const street = addr?.street || "";
        const buildingNumber = addr?.buildingNumber || "";
        const postalCode = Array.isArray(addr?.postalCodes) && addr.postalCodes.length ? (addr.postalCodes[0] || "") : "";
        const municipality = addr?.municipality?.value || "";
        const country = addr?.country?.value || "";

        const addressLine1 = [street, buildingNumber].filter(Boolean).join(" ").trim();
        const addressLine2 = [postalCode, municipality].filter(Boolean).join(" ").trim();
        const address = [addressLine1, addressLine2, country].filter(Boolean).join(", ");

        // Register / zdroj: sourceRegister (ak existuje)
        const sr = item?.sourceRegister || {};
        const sourceRegisterName = sr?.value?.value?.value || "";
        const registrationOffice = Array.isArray(sr?.registrationOffices) && sr.registrationOffices.length
            ? (sr.registrationOffices[0]?.value || "")
            : "";
        const registrationNumber = Array.isArray(sr?.registrationNumbers) && sr.registrationNumbers.length
            ? (sr.registrationNumbers[0]?.value || "")
            : "";

        return json(200, {
            ok: true,
            found: true,
            ico,
            company: {
                name,
                address,
                municipality,
                postalCode,
                country,
                sourceRegisterName,
                registrationOffice,
                registrationNumber,
                // RPO často DIČ/IČDPH nemá → necháme prázdne
                dic: "",
                icdph: "",
            },
            raw: item
        });
    } catch (e) {
        return json(500, { ok: false, error: "Nastala chyba pri vyhľadaní IČO." });
    }
};

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
// netlify/functions/ico-lookup.js  (CommonJS)

exports.handler = async (event) => {
    try {
        const ico = (event.queryStringParameters?.ico || "").replace(/\s+/g, "").trim();

        if (!ico) return json(400, { ok: false, error: "Chýba parameter ico." });
        if (!/^\d{6,10}$/.test(ico)) return json(400, { ok: false, error: "IČO má byť 6–10 číslic." });

        const url = `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`;
        const res = await fetch(url, { headers: { accept: "application/json" } });

        if (!res.ok) return json(502, { ok: false, error: "RPO API vrátilo chybu." });

        const data = await res.json();

        // RPO odpoveď je objekt s results[]
        const item = Array.isArray(data?.results) ? data.results[0] : null;
        if (!item) return json(200, { ok: true, found: false, ico });

        // Názov firmy: fullNames[0].value
        const name = Array.isArray(item.fullNames) && item.fullNames.length ? (item.fullNames[0]?.value || "") : "";

        // Adresa: addresses[0] + municipality.value
        const addr = Array.isArray(item.addresses) && item.addresses.length ? item.addresses[0] : null;

        const street = addr?.street || "";
        const buildingNumber = addr?.buildingNumber || "";
        const postalCode = Array.isArray(addr?.postalCodes) && addr.postalCodes.length ? (addr.postalCodes[0] || "") : "";
        const municipality = addr?.municipality?.value || "";
        const country = addr?.country?.value || "";

        const addressLine1 = [street, buildingNumber].filter(Boolean).join(" ").trim();
        const addressLine2 = [postalCode, municipality].filter(Boolean).join(" ").trim();
        const address = [addressLine1, addressLine2, country].filter(Boolean).join(", ");

        // Register / zdroj: sourceRegister (ak existuje)
        const sr = item?.sourceRegister || {};
        const sourceRegisterName = sr?.value?.value?.value || "";
        const registrationOffice = Array.isArray(sr?.registrationOffices) && sr.registrationOffices.length
            ? (sr.registrationOffices[0]?.value || "")
            : "";
        const registrationNumber = Array.isArray(sr?.registrationNumbers) && sr.registrationNumbers.length
            ? (sr.registrationNumbers[0]?.value || "")
            : "";

        return json(200, {
            ok: true,
            found: true,
            ico,
            company: {
                name,
                address,
                municipality,
                postalCode,
                country,
                sourceRegisterName,
                registrationOffice,
                registrationNumber,
                // RPO často DIČ/IČDPH nemá → necháme prázdne
                dic: "",
                icdph: "",
            },
            raw: item
        });
    } catch (e) {
        return json(500, { ok: false, error: "Nastala chyba pri vyhľadaní IČO." });
    }
};

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
