// netlify/functions/ico-lookup.js

export async function handler(event) {
    try {
        const ico = (event.queryStringParameters?.ico || "").replace(/\s+/g, "").trim();

        if (!ico) {
            return json(400, { ok: false, error: "Chýba parameter ico." });
        }
        if (!/^\d{6,10}$/.test(ico)) {
            return json(400, { ok: false, error: "IČO má byť číslo (6–10 číslic)." });
        }

        const url = `https://api.statistics.sk/rpo/v1/search?identifier=${encodeURIComponent(ico)}`;

        const res = await fetch(url, { headers: { "accept": "application/json" } });
        if (!res.ok) {
            return json(502, { ok: false, error: "RPO API neodpovedá alebo vrátilo chybu." });
        }

        const data = await res.json();

        // RPO odpoveď býva pole výsledkov
        const item = Array.isArray(data) ? data[0] : (Array.isArray(data?.results) ? data.results[0] : null);

        if (!item) {
            return json(200, { ok: true, found: false, ico });
        }

        // normalize a few useful fields (names in API sa môžu mierne líšiť)
        const name =
            item?.name ||
            item?.businessName ||
            item?.corporateBodyName ||
            item?.formattedName ||
            "";

        const addressObj =
            item?.address ||
            item?.addresses?.[0] ||
            item?.residenceAddress ||
            null;

        const address = addressObj
            ? [
                addressObj?.street,
                addressObj?.buildingNumber,
                addressObj?.municipality,
                addressObj?.postalCode
            ].filter(Boolean).join(" ")
            : "";

        const dic =
            item?.dic ||
            item?.identifiers?.find(x => x?.type?.toLowerCase?.() === "dic")?.value ||
            "";

        return json(200, {
            ok: true,
            found: true,
            ico,
            name,
            dic,
            address,
            raw: item
        });
    } catch (e) {
        return json(500, { ok: false, error: "Nastala chyba pri vyhľadaní IČO." });
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
