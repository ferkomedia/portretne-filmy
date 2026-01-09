export const handler = async (event) => {
    try {
        const icoRaw = (event.queryStringParameters?.ico || "").trim();
        const ico = icoRaw.replace(/\s+/g, "");

        if (!/^\d{6,8}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Neplatné IČO." }, 400);
        }

        const endpoint = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}`;
        const r = await fetch(endpoint, { headers: { accept: "application/json" } });

        if (!r.ok) {
            return json({ ok: false, found: false, error: "RegisterUZ odpovedal chybou." }, 502);
        }

        const data = await r.json();
        const item = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data?.items?.[0] ?? data?.[0] ?? data);

        if (!item) return json({ ok: true, found: false, ico }, 200);

        const d = item;

        const name = d.nazovUJ ?? d.name ?? "";
        const dic = d.dic ?? d.DIC ?? "";
        const icdph = d.icDph ?? d.icdph ?? d.ICDPH ?? "";

        const street = (d.ulica ?? d.street ?? "").toString().trim();
        const number = (d.supCislo ?? d.supcislo ?? d.orientacneCislo ?? d.orientacnecislo ?? d.number ?? "").toString().trim();
        const city = (d.mesto ?? d.city ?? "").toString().trim();
        const psc = (d.psc ?? d.postalCode ?? "").toString().trim();
        const country = (d.stat ?? d.country ?? "Slovenská republika").toString().trim();

        const addressLine = [street, number].filter(Boolean).join(" ").trim();
        const addressFull = [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

        return json({
            ok: true,
            found: true,
            ico,
            company: { name, ico, dic, icdph, street, number, city, psc, country, addressLine, addressFull },
            raw: d,
        }, 200);
    } catch (e) {
        return json({ ok: false, found: false, error: "Chyba servera." }, 500);
    }
};

function json(obj, status = 200) {
    return {
        statusCode: status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        body: JSON.stringify(obj),
    };
}

export default async (req) => {
    try {
        const url = new URL(req.url);
        const icoRaw = (url.searchParams.get("ico") || "").trim();
        const ico = icoRaw.replace(/\s+/g, "");

        if (!/^\d{6,8}$/.test(ico)) {
            return json({ ok: false, found: false, error: "Neplatné IČO." }, 400);
        }

        const endpoint = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}`;
        const r = await fetch(endpoint, {
            headers: { "accept": "application/json" },
        });

        if (!r.ok) {
            return json({ ok: false, found: false, error: "RegisterUZ odpovedal chybou." }, 502);
        }

        const data = await r.json();

        // API môže vrátiť pole alebo objekt – ošetríme obe
        const item = Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data?.items?.[0] ?? data?.[0] ?? data);

        if (!item) {
            return json({ ok: true, found: false, ico }, 200);
        }

        // Namapovanie polí (podľa tvojej PHP logiky)
        // kľúče sa môžu líšiť – berieme najpravdepodobnejšie
        const d = item;

        const name = d.nazovUJ ?? d.name ?? "";
        const dic = d.dic ?? d.DIC ?? "";
        const icdph = d.icDph ?? d.icdph ?? d.ICDPH ?? "";

        // Adresa – skladáme LEN z reťazcov, aby nikdy nevzniklo [object Object]
        const street = (d.ulica ?? d.street ?? "").toString().trim();
        const number =
            (d.supCislo ?? d.supcislo ?? d.orientacneCislo ?? d.orientacnecislo ?? d.number ?? "").toString().trim();
        const city = (d.mesto ?? d.city ?? "").toString().trim();
        const psc = (d.psc ?? d.postalCode ?? "").toString().trim();
        const country = (d.stat ?? d.country ?? "Slovenská republika").toString().trim();

        const addressLine =
            [street, number].filter(Boolean).join(" ").trim();

        return json({
            ok: true,
            found: true,
            ico,
            company: {
                name,
                ico,
                dic,
                icdph,
                street,
                number,
                city,
                psc,
                country,
                addressLine,                    // "Červenej armády 1"
                addressFull: [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
            },
            raw: d,
        }, 200);

    } catch (e) {
        return json({ ok: false, found: false, error: "Chyba servera." }, 500);
    }
};

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
