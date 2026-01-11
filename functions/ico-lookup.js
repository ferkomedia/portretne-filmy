// functions/ico-lookup.js
// Používa RegisterUZ.sk API (bezplatné, spoľahlivé)
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const ico = url.searchParams.get("ico")?.replace(/\s+/g, "");

    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    };

    if (!ico || !/^\d{6,8}$/.test(ico)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid ICO" }), { headers });
    }

    try {
        // Krok 1: Získaj ID účtovnej jednotky podľa IČO
        const searchUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&ico=${ico}`;
        const searchRes = await fetch(searchUrl);

        if (!searchRes.ok) {
            return new Response(JSON.stringify({ ok: false, error: "API error" }), { headers });
        }

        const searchData = await searchRes.json();

        if (!searchData.id || searchData.id.length === 0) {
            return new Response(JSON.stringify({ ok: true, found: false }), { headers });
        }

        // Krok 2: Získaj detaily účtovnej jednotky
        const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${searchData.id[0]}`;
        const detailRes = await fetch(detailUrl);

        if (!detailRes.ok) {
            return new Response(JSON.stringify({ ok: false, error: "Detail API error" }), { headers });
        }

        const company = await detailRes.json();

        // Parsuj adresu - ulica obsahuje aj číslo
        let street = "";
        let number = "";
        const ulica = company.ulica || "";

        // Skús oddeliť ulicu a číslo
        const match = ulica.match(/^(.+?)\s+(\d+[A-Za-z\/\-]*)$/);
        if (match) {
            street = match[1];
            number = match[2];
        } else {
            street = ulica;
        }

        const city = company.mesto || "";
        const psc = company.psc || "";

        // Zostav plnú adresu
        let addressFull = "";
        const parts = [];
        if (ulica) parts.push(ulica);
        if (psc || city) parts.push((psc ? psc + " " : "") + city);
        addressFull = parts.join(", ");

        return new Response(JSON.stringify({
            ok: true,
            found: true,
            company: {
                name: company.nazovUJ || "",
                ico: company.ico || ico,
                dic: company.dic || "",
                icdph: company.icDph || "",
                street: street,
                number: number,
                city: city,
                psc: psc,
                country: "Slovensko",
                addressFull: addressFull,
            },
        }), { headers });

    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { headers });
    }
}