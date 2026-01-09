export async function handler(event) {
    try {
        const url = new URL(event.rawUrl);
        const ico = (url.searchParams.get("ico") || "").trim();

        if (!ico || !/^\d{6,10}$/.test(ico)) {
            return json(400, { ok: false, error: "Neplatné IČO." });
        }

        // PRESNE tento zdroj, ktorý chceš:
        const apiUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}`;

        const r = await fetch(apiUrl, {
            headers: {
                accept: "application/json",
                "user-agent": "netlify-function/ico-lookup"
            }
        });

        if (!r.ok) {
            return json(502, { ok: false, error: `RegisterUZ vrátil ${r.status}.` });
        }

        const payload = await r.json();

        // API môže vrátiť array alebo objekt; berieme prvý záznam, ak je array
        const d = Array.isArray(payload) ? payload[0] : payload;

        if (!d) {
            return json(200, { ok: true, found: false, ico });
        }

        // Pomocné bezpečné čítanie – vždy vráti string (nikdy objekt)
        const pick = (v) => {
            if (v === null || v === undefined) return "";
            if (typeof v === "string") return v.trim();
            if (typeof v === "number") return String(v);
            // častý prípad: { value: "Banská Bystrica", ... }
            if (typeof v === "object" && typeof v.value === "string") return v.value.trim();
            return "";
        };

        // === Namapovanie polí presne ako chceš ty ===
        const company_data = {
            name: pick(d.nazovUJ),
            ico: pick(d.ico) || ico,
            dic: pick(d.dic),
            city: pick(d.mesto),
            street: pick(d.ulica),
            psc: pick(d.psc)
        };

        // Fallbacky (len ak hore nič nie je) – lebo v tvojom JSONe je mesto v raw.addresses[0].municipality.value
        // ALE stále vrátime len string.
        if (!company_data.city) {
            const addr0 = Array.isArray(d.addresses) ? d.addresses[0] : null;
            company_data.city = pick(addr0?.municipality);
        }
        if (!company_data.street) {
            // niekedy ulica býva v addr0.street.value alebo addr0.street
            const addr0 = Array.isArray(d.addresses) ? d.addresses[0] : null;
            company_data.street = pick(addr0?.street);
        }
        if (!company_data.psc) {
            const addr0 = Array.isArray(d.addresses) ? d.addresses[0] : null;
            company_data.psc = pick(addr0?.postalCode) || pick(addr0?.psc);
        }

        // Ak nemáme ani názov ani mesto ani dic -> berieme to ako not found
        if (!company_data.name && !company_data.city && !company_data.dic) {
            return json(200, { ok: true, found: false, ico });
        }

        // pekná adresa ako čistý text
        const addressLine = [company_data.street, company_data.psc, company_data.city]
            .map((x) => (x || "").trim())
            .filter(Boolean)
            .join(", ");

        return json(200, {
            ok: true,
            found: true,
            ico: company_data.ico,
            company: company_data,
            addressLine
        });
    } catch (e) {
        return json(500, {
            ok: false,
            error: "Chyba v ico-lookup.",
            detail: String(e?.message || e)
        });
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
