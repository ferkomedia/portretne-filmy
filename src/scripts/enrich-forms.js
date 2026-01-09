function $(id) { return document.getElementById(id); }

function safe(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.trim();
    if (typeof v === "number") return String(v);
    return "";
}

function setValue(id, val) {
    const el = $(id);
    if (!el) return;
    const v = safe(val);
    el.value = v;
}

function debounce(fn, ms = 500) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

async function icoLookup(ico) {
    const r = await fetch(`/.netlify/functions/ico-lookup?ico=${encodeURIComponent(ico)}`, { cache: "no-store" });
    return await r.json();
}

async function domainCheck(domain) {
    const r = await fetch(`/.netlify/functions/domain-check?domain=${encodeURIComponent(domain)}`, { cache: "no-store" });
    return await r.json();
}

function initIco() {
    const icoInput = $("ico");
    const icoStatus = $("icoStatus");
    if (!icoInput) return;

    const run = debounce(async () => {
        const ico = icoInput.value.trim();
        if (!/^\d{6,10}$/.test(ico)) { if (icoStatus) icoStatus.textContent = ""; return; }

        if (icoStatus) icoStatus.textContent = "Načítavam údaje…";

        const data = await icoLookup(ico);

        if (!data.ok) { if (icoStatus) icoStatus.textContent = data.error || "Chyba."; return; }
        if (!data.found) { if (icoStatus) icoStatus.textContent = "IČO sa nenašlo."; return; }

        // Hidden fields (Netlify Forms)
        setValue("companyNameHidden", data.company?.name);
        setValue("companyAddrHidden", data.addressLine); // STRING = bez [object Object]
        setValue("companyDicHidden", data.company?.dic);
        setValue("companyIcdphHidden", data.company?.icDph);
        setValue("companyCityHidden", data.company?.city);
        setValue("companyPscHidden", data.company?.psc);
        setValue("companyStreetHidden", data.company?.street);
        setValue("companyLegalFormHidden", data.company?.legalForm);
        setValue("companySkNaceHidden", data.company?.skNace);

        if (icoStatus) icoStatus.textContent = data.company?.name ? `Nájdené: ${data.company.name}` : "Údaje doplnené.";
    }, 500);

    icoInput.addEventListener("input", run);
}

function initDomain() {
    const domainInput = $("domain");
    const domainStatus = $("domainStatus");
    if (!domainInput) return;

    const run = debounce(async () => {
        const domain = domainInput.value.trim().toLowerCase();
        if (!/^[a-z0-9-]+\.sk$/.test(domain)) { if (domainStatus) domainStatus.textContent = ""; return; }

        if (domainStatus) domainStatus.textContent = "Overujem doménu…";

        const data = await domainCheck(domain);

        if (!data.ok) { if (domainStatus) domainStatus.textContent = data.error || "Chyba."; return; }

        if (domainStatus) domainStatus.textContent = data.available ? "Doména je voľná." : "Doména je obsadená.";
        setValue("domainAvailableHidden", data.available ? "Áno" : "Nie");
    }, 600);

    domainInput.addEventListener("input", run);
}

document.addEventListener("DOMContentLoaded", () => {
    initIco();
    initDomain();
});
