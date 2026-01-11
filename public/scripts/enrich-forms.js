async function icoLookup(ico) {
    return safeFetchJson(
        `/ico-lookup?ico=${encodeURIComponent(ico)}`
    );
}

async function domainCheck(domain) {
    return safeFetchJson(
        `/domain-check?domain=${encodeURIComponent(domain)}`
    );
}