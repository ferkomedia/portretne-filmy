/**
 * Netlify Function: /netlify/functions/ico-lookup?ico=12345678
 * Zdroj: registeruz.sk (CRUZ public API)
 *
 * 1) /cruz-public/api/uctovne-jednotky?...&ico=XXXX -> { id:[...], existujeDalsieId:false }
 * 2) /cruz-public/api/uctovna-jednotka?id=YYYY -> detaily
 */

export default async (req) => {
    try {
        const url = new URL(req.url);
        const icoRaw = (url.searchParams.get("ico") || "").trim();

        const ico = icoRaw.replace(/\s+/g, "");
        if (!/^\d{6,10}$/.test(ico)) {
            return json(400, { ok: false, error: "Neplatné IČO. Zadaj iba čísla (6–10)." });
        }

        const listUrl =
            "https://www.registeruz.sk/cruz-public/api/uctovne-jednotky" +
            "?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&ico=" +
            encodeURIComponent(ico);

        const listRes = await fetch(listUrl, { headers: { "accept": "application/json" } });
        if (!listRes.ok) {
            return json(502, { ok: false, error: "RegisterUZ: chyba pri vyhľadaní ID." });
        }

        const listJson = await listRes.json();
        const id = Array.isArray(listJson?.id) && listJson.id.length ? listJson.id[0] : null;

        if (!id) {
            return json(200, { ok: true, found: false, ico, company: null });
        }

        const detailUrl =
            "https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=" + encodeURIComponent(String(id));

        const detRes = await fetch(detailUrl, { headers: { "accept": "application/json" } });
        if (!detRes.ok) {
            return json(502, { ok: false, error: "RegisterUZ: chyba pri načítaní detailov." });
        }

        const d = await detRes.json();

        // Vždy vraciame ČISTÉ stringy (žiadne objekty) = koniec [object Object]
        const company = {
            // identifikácia
            nazov: s(d?.nazovUJ),
            ico: s(d?.ico) || ico,
            dic: s(d?.dic),

            // adresa
            ulica: s(d?.ulica),
            psc: s(d?.psc),
            mesto: s(d?.mesto),
            okres: s(d?.okres),
            kraj: s(d?.kraj),
            sidlo: s(d?.sidlo),
            country: "Slovenská republika",

            // meta
            pravnaForma: s(d?.pravnaForma),
            skNace: s(d?.skNace),
            velkostOrganizacie: s(d?.velkostOrganizacie),
            datumZalozenia: s(d?.datumZalozenia),
            datumPoslednejUpravy: s(d?.datumPoslednejUpravy),
            zdrojDat: s(d?.zdrojDat),
            konsolidovana: typeof d?.konsolidovana === "boolean" ? d.konsolidovana : null,
        };

        // Pekná skladaná adresa pre zobrazenie v UI
        const addressLine = joinNonEmpty([company.ulica, company.psc, company.mesto]);
        const addressFull = joinNonEmpty([addressLine, company.country]);

        return json(200, {
            ok: true,
            found: true,
            ico: company.ico,
            id: String(id),
            company,
            addressLine,
            addressFull,
        });
    } catch (e) {
        return json(500, { ok: false, error: "Server error", detail: String(e?.message || e) });
    }
};

function s(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    // objekt/array nechceme lepiť do stringu
    return "";
}

function joinNonEmpty(arr) {
    return arr.map((x) => (x || "").trim()).filter(Boolean).join(", ");
}

function json(status, obj) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
