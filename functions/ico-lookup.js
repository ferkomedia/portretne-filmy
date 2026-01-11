// functions/ico-lookup.js
// Používa oficiálne RPO API od Štatistického úradu SR
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
        // Oficiálne RPO API od Štatistického úradu SR (bezplatné)
        const apiUrl = `https://api.statistics.sk/rpo/v1/search?identifier=${ico}`;
        const res = await fetch(apiUrl, {
            headers: { "Accept": "application/json" }
        });

        if (!res.ok) {
            return new Response(JSON.stringify({ ok: false, error: "API error" }), { headers });
        }

        const data = await res.json();

        // API vracia pole výsledkov
        if (!data || !Array.isArray(data) || data.length === 0) {
            return new Response(JSON.stringify({ ok: true, found: false }), { headers });
        }

        const company = data[0];

        // Získaj aktuálnu adresu
        let street = "";
        let number = "";
        let city = "";
        let psc = "";
        let addressFull = "";

        if (company.addresses && company.addresses.length > 0) {
            // Nájdi aktuálnu adresu (bez effectiveTo alebo s najnovším dátumom)
            const currentAddress = company.addresses.find(a => !a.effectiveTo) || company.addresses[0];

            street = currentAddress.street || "";
            number = currentAddress.buildingNumber || currentAddress.regNumber || "";
            if (currentAddress.regNumber && currentAddress.buildingNumber) {
                number = `${currentAddress.regNumber}/${currentAddress.buildingNumber}`;
            }
            city = currentAddress.municipality || "";
            psc = currentAddress.postalCode || "";

            // Zostav plnú adresu
            const parts = [];
            if (street) parts.push(street + (number ? " " + number : ""));
            if (psc || city) parts.push((psc ? psc + " " : "") + city);
            addressFull = parts.join(", ");
        }

        // Získaj aktuálny názov
        let name = "";
        if (company.names && company.names.length > 0) {
            const currentName = company.names.find(n => !n.effectiveTo) || company.names[0];
            name = currentName.value || "";
        }

        // DIČ a IČ DPH - RPO API ich nemusí obsahovať, použijeme Register UZ ako zálohu
        let dic = "";
        let icdph = "";

        // Skús získať DIČ z Register účtovných závierok
        try {
            const uzUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&ico=${ico}`;
            const uzRes = await fetch(uzUrl);
            if (uzRes.ok) {
                const uzData = await uzRes.json();
                if (uzData.id && uzData.id.length > 0) {
                    const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${uzData.id[0]}`;
                    const detailRes = await fetch(detailUrl);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        dic = detail.dic || "";
                        icdph = detail.icDph || "";
                    }
                }
            }
        } catch (e) {
            // Ignoruj chyby z Register UZ, nie je kritické
        }

        return new Response(JSON.stringify({
            ok: true,
            found: true,
            company: {
                name: name,
                ico: company.identifier || ico,
                dic: dic,
                icdph: icdph,
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
