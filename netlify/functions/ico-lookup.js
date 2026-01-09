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

        const item =
            Array.isArray(data) ? data[0] : (data?.data?.[0] ?? data?.items?.[0] ?? data?.[0] ?? data);

        if (!item) {
            return json({ ok: true, found: false, ico }, 200);
        }

        const d = item;

        const name = (d.nazovUJ ?? d.name ?? "").toString().trim();
        const dic = (d.dic ?? d.DIC ?? "").toString().trim();
        const icdph = (d.icDph ?? d.icdph ?? d.ICDPH ?? "").toString().trim();

        const street = (d.ulica ?? d.street ?? "").toString().trim();
        const number =
            (d.supCislo ?? d.supcislo ?? d.orientacneCislo ?? d.orientacnecislo ?? d.number ?? "")
                .toString()
                .trim();
        const city = (d.mesto ?? d.city ?? "").toString().trim();
        const psc = (d.psc ?? d.postalCode ?? "").toString().trim();
        const country = (d.stat ?? d.country ?? "Slovenská republika").toString().trim();

        const addressLine = [street, number].filter(Boolean).join(" ").trim();
        const addressFull = [addressLine, [psc, city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

        return json(
            {
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
                    addressLine,
                    addressFull,
                },
            },
            200
        );
    } catch (e) {
        return json({ ok: false, found: false, error: "Chyba servera." }, 500);
    }
};

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
