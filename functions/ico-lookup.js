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
    const searchUrl = `https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?zmenene-od=2000-01-01&pokracovat-za-id=1&max-zaznamov=1&ico=${ico}`;
    const searchRes = await fetch(searchUrl);
    
    if (!searchRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: "API error" }), { headers });
    }

    const searchData = await searchRes.json();

    if (!searchData.id || searchData.id.length === 0) {
      return new Response(JSON.stringify({ ok: true, found: false }), { headers });
    }

    const detailUrl = `https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${searchData.id[0]}`;
    const detailRes = await fetch(detailUrl);

    if (!detailRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: "Detail API error" }), { headers });
    }

    const company = await detailRes.json();

    // Parsuj ulicu a číslo
    let street = "";
    let number = "";
    const ulica = company.ulica || "";
    
    // Skús rôzne formáty: "Ulica 123", "Ulica 123/45", "Ulica 7608/12"
    const match = ulica.match(/^(.+?)\s+(\d+(?:\/\d+)?[A-Za-z]?)$/);
    if (match) {
      street = match[1].trim();
      number = match[2].trim();
    } else {
      street = ulica;
    }

    const city = company.mesto || "";
    const psc = company.psc || "";
    const dic = company.dic || "";
    
    // Skús získať IČ DPH z VIES ak máme DIČ
    let icdph = "";
    if (dic) {
      try {
        const viesUrl = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/SK/vat/${dic}`;
        const viesRes = await fetch(viesUrl, { 
          headers: { "Accept": "application/json" }
        });
        if (viesRes.ok) {
          const viesData = await viesRes.json();
          if (viesData.isValid) {
            icdph = "SK" + dic;
          }
        }
      } catch (e) {
        // VIES nedostupný, pokračuj bez IČ DPH
      }
    }

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
