function debounce(fn, ms = 450) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function setValue(sel, value) {
    const el = document.querySelector(sel);
    if (!el) return;
    el.value = (value ?? "").toString();
}

function setHidden(name, value) {
    const el = document.querySelector(`input[name="${name}"]`);
    if (!el) return;
    el.value = (value ?? "").toString();
}

function showAutoFields(form, show) {
    const box = form.querySelector("[data-auto-fields]");
    if (!box) return;
    box.classList.toggle("isVisible", !!show);
}

async function safeFetchJson(url, timeout = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return { ok: false };
        const text = await r.text();
        try {
            return JSON.parse(text);
        } catch {
            return { ok: false };
        }
    } catch {
        return { ok: false };
    } finally {
        clearTimeout(timer);
    }
}

async function icoLookup(ico) {
    return safeFetchJson(`/ico-lookup?ico=${encodeURIComponent(ico)}`);
}

async function domainCheck(domain) {
    return safeFetchJson(`/domain-check?domain=${encodeURIComponent(domain)}`);
}

function wireIcoForm(form) {
    const icoInput = form.querySelector('input[name="IČO"]');
    const status = form.querySelector("[data-ico-status]");
    if (!icoInput) return;

    const run = debounce(async () => {
        const ico = (icoInput.value || "").replace(/\s+/g, "");
        if (!ico) {
            status && (status.textContent = "");
            showAutoFields(form, false);
            return;
        }
        if (!/^\d{6,8}$/.test(ico)) {
            status && (status.textContent = "Zadajte platné IČO (6–8 číslic).");
            status && (status.className = "statusLine statusBad");
            showAutoFields(form, false);
            return;
        }
        status && (status.textContent = "Overujem IČO…");
        status && (status.className = "statusLine");

        const res = await icoLookup(ico);

        if (!res || !res.ok || !res.found) {
            status && (status.textContent = "IČO sa nepodarilo overiť automaticky.");
            status && (status.className = "statusLine statusBad");
            showAutoFields(form, false);
            return;
        }

        const c = res.company || {};
        setValue("#companyName", c.name);
        setValue("#companyDic", c.dic);
        setValue("#companyIcdph", c.icdph);
        setValue("#companyStreet", c.street);
        setValue("#companyNumber", c.number);
        setValue("#companyCity", c.city);
        setValue("#companyPsc", c.psc);
        setValue("#companyCountry", c.country);
        setValue("#companyAddressFull", c.addressFull);

        setHidden("Firma - názov", c.name);
        setHidden("Firma - DIČ", c.dic);
        setHidden("Firma - IČ DPH", c.icdph);
        setHidden("Firma - Ulica", c.street);
        setHidden("Firma - Číslo", c.number);
        setHidden("Firma - Mesto", c.city);
        setHidden("Firma - PSČ", c.psc);
        setHidden("Firma - Krajina", c.country);
        setHidden("Firma - Adresa (celá)", c.addressFull);

        showAutoFields(form, true);
        status && (status.textContent = "Firma načítaná.");
        status && (status.className = "statusLine statusOk");
    }, 500);

    icoInput.addEventListener("input", run);
}

function wireDomainForm(form) {
    const domainInput = form.querySelector('input[name="Doména (.sk)"]');
    const status = form.querySelector("[data-domain-status]");
    if (!domainInput) return;

    const run = debounce(async () => {
        const domain = (domainInput.value || "").trim().toLowerCase();
        if (!domain) {
            status && (status.textContent = "");
            return;
        }
        if (!/^[a-z0-9-]{1,63}\.sk$/.test(domain)) {
            status && (status.textContent = "Zadajte doménu v tvare nieco.sk");
            status && (status.className = "statusLine statusBad");
            return;
        }
        status && (status.textContent = "Overujem doménu…");
        status && (status.className = "statusLine");

        const res = await domainCheck(domain);

        if (!res || !res.ok) {
            status && (status.textContent = "Overenie domény zlyhalo.");
            status && (status.className = "statusLine statusBad");
            return;
        }
        status && (status.textContent = res.available ? "Doména je voľná." : "Doména už existuje.");
        status && (status.className = "statusLine " + (res.available ? "statusOk" : "statusBad"));
    }, 500);

    domainInput.addEventListener("input", run);
}

window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-ico-form]").forEach(wireIcoForm);
    document.querySelectorAll("form[data-domain-form]").forEach(wireDomainForm);
});
