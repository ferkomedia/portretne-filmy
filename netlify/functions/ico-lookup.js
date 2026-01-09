export async function handler(event) {
    try {
        const url = new URL(event.rawUrl);
        const ico = (url.searchParams.get("ico") || "").trim();

        if (!ico || !/^\d{6,10}$/.test(ico)) {
            return json(400, { ok: false, error: "Neplatné IČO." });
        }

        // RegisterUZ API – zoznam účtovných jednotiek podľa IČO
        const apiUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${encodeURIComponent(ico)}`;

        const r = await fetch(apiUrl, {
            headers: { accept: "application/json", "user-agent": "netlify-function/ico-lookup" }
        });

        if (!r.ok) return json(502, { ok: false, error: `RegisterUZ vrátil ${r.status}.` });

        const data = await r.json();
        const d = Array.isArray(data) ? data[0] : data;

        if (!d || (!d.ico && !d.nazovUJ)) return json(200, { ok: true, found: false, ico });

        // TEXTY iba ako string -> nikdy objekt
        const name = s(d.nazovUJ);
        const dic = s(d.dic);
        const icDph = s(d.icDph || d.ic_dph || d.icDPH);

        const city = s(d.mesto);
        const street = s(d.ulica);
        const psc = s(d.psc);
        const country = s(d.stat) || "Slovenská republika";

        const supisne = s(d.supisneCislo || d.cisloDomu || d.orientacneCislo);
        const streetLine = [street, supisne].filter(Boolean).join(" ").trim();

        const addressLine = [streetLine, psc, city, country].filter(Boolean).join(", ");

        const legalForm = s(d.pravnaForma);
        const skNace = s(d.skNace || d.nace);

        return json(200, {
            ok: true,
            found: true,
            ico: s(d.ico) || ico,
            company: {
                name,
                ico: s(d.ico) || ico,
                dic,
                icDph,
                street: streetLine,
                psc,
                city,
                country,
                legalForm,
                skNace
            },
            addressLine
        });
    } catch (e) {
        return json(500, { ok: false, error: "Chyba v ico-lookup.", detail: String(e?.message || e) });
    }
}

function s(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    return "";
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: JSON.stringify(body)
    };
}
