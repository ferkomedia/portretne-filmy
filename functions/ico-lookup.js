export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ico = url.searchParams.get('ico');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  if (!ico || ico.length < 6) {
    return new Response(JSON.stringify({ ok: true, found: false }), { headers });
  }

  const cleanIco = ico.replace(/\s/g, '');

  try {
    // 1) Zisti interné ID podľa IČO
    const res1 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovne-jednotky?ico=${cleanIco}`);

    if (!res1.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'API error' }), { headers });
    }

    const data1 = await res1.json();

    if (!data1.id || data1.id.length === 0) {
      return new Response(JSON.stringify({ ok: true, found: false }), { headers });
    }

    const id = data1.id[0];

    // 2) Potiahni detailné údaje
    const res2 = await fetch(`https://www.registeruz.sk/cruz-public/api/uctovna-jednotka?id=${id}`);
    const firma = await res2.json();

    return new Response(JSON.stringify({
      ok: true,
      found: true,
      company: {
        name: firma.nazovUJ || '',
        addressFull: `${firma.ulica || ''} ${firma.cislo || ''}, ${firma.psc || ''} ${firma.mesto || ''}`.trim(),
        dic: firma.dic || '',
        icdph: firma.icDph || '',
        street: firma.ulica || '',
        streetNumber: firma.cislo || '',
        city: firma.mesto || '',
        postalCode: firma.psc || '',
        country: 'Slovensko'
      }
    }), { headers });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers });
  }
}