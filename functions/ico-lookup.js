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
        // Nové Slovensko.Digital DataHub API
        const apiUrl = `https://datahub.ekosystem.slovensko.digital/api/datahub/corporate_bodies/search?q=cin:${ico}`;
        const res = await fetch(apiUrl, {
            headers: { "Accept": "application/json" }
        });

        if (res.status === 404) {
            return new Response(JSON.stringify({ ok: true, found: false }), { headers });
        }

        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: "API error" }), { headers });
        }

        const company = await res.json();

        if (!company || !company.id) {
            return new Response(JSON.stringify({ ok: true, found: false }), { headers });
        }

        // Parse address from formatted_address or individual fields
        const address = company.formatted_address || "";
        let street = company.street || "";
        let number = company.building_number || company.reg_number || "";
        let city = company.municipality || company.city || "";
        let psc = company.postal_code || "";

        // If no individual fields, try to parse from formatted_address
        if (!street && address) {
            const addressParts = address.split(", ");
            if (addressParts.length >= 2) {
                const streetPart = addressParts[0] || "";
                const cityPart = addressParts[addressParts.length - 1] || "";

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
        }

        return new Response(JSON.stringify({
            ok: true,
            found: true,
            company: {
                name: company.name || "",
                ico: company.cin || ico,
                dic: company.tin ? company.tin.toString() : "",
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