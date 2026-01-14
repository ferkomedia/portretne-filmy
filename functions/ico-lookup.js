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
    const res = await fetch(
      `https://autoform.ekosystem.slovensko.digital/api/corporate_bodies/search?q=${cleanIco}&per_page=5`
    );

    if (!res.ok) {
      return new Response(JSON.stringify({ ok: false, error: 'API error' }), { headers });
    }

    const data = await res.json();

    if (Array.isArray(data) && data.length > 0) {
      const c = data.find(item => item.cin === cleanIco) || data[0];

      return new Response(JSON.stringify({
        ok: true,
        found: true,
        company: {
          name: c.name || '',
          addressFull: c.formatted_address || '',
          dic: c.dic || '',
          icdph: c.ic_dph || '',
          street: c.street || '',
          streetNumber: c.street_number || '',
          city: c.municipality || '',
          postalCode: c.postal_code || '',
          country: 'Slovensko'
        }
      }), { headers });
    }

    return new Response(JSON.stringify({ ok: true, found: false }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { headers });
  }
}
