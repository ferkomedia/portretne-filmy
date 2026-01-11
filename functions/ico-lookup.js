// functions/ico-lookup.js
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
        // Slovensko.Digital API (zadarmo)
        const apiUrl = `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${ico}&private_access_token=`;
        const res = await fetch(apiUrl);

        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: "API error" }), { headers });
        }

        const data = await res.json();

        if (!data || data.length === 0) {
            return new Response(JSON.stringify({ ok: true, found: false }), { headers });
        }

        const company = data[0];
        const address = company.formatted_address || "";
        const addressParts = address.split(", ");

        // Parse address (format: "Ulica číslo, PSČ Mesto")
        let street = "", number = "", city = "", psc = "";
        if (addressParts.length >= 2) {
            const streetPart = addressParts[0] || "";
            const cityPart = addressParts[1] || "";

            // Extract street and number
            const streetMatch = streetPart.match(/^(.+?)\s+(\d+[A-Za-z\/]*)$/);
            if (streetMatch) {
                street = streetMatch[1];
                number = streetMatch[2];
            } else {
                street = streetPart;
            }

            // Extract PSC and city
            const cityMatch = cityPart.match(/^(\d{3}\s?\d{2})\s+(.+)$/);
            if (cityMatch) {
                psc = cityMatch[1];
                city = cityMatch[2];
            } else {
                city = cityPart;
            }
        }

        return new Response(JSON.stringify({
            ok: true,
            found: true,
            company: {
                name: company.name || "",
                ico: company.cin || ico,
                dic: company.tin || "",
                icdph: company.vatin || "",
                street: street,
                number: number,
                city: city,
                psc: psc,
                country: "Slovensko",
                addressFull: address,
            },
        }), { headers });

    } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: err.message }), { headers });
    }
}