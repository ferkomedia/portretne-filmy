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

async function icoLookup(ico) {
    const r = await fetch(`/.netlify/functions/ico-lookup?ico=${encodeURIComponent(ico)}`);
    return await r.json();
}

async function domainCheck(domain) {
    const r = await fetch(`/.netlify/functions/domain-check?domain=${encodeURIComponent(domain)}`);
    return await r.json();
}

function wireIcoForm(form) {
    const icoInput = form.querySelector('input[name="IČO"]');
    const status = form.querySelector("[data-ico-status]");
    if (!icoInput) return;

    const run = debounce(async () => {
        const ico = (icoInput.value || "").replace(/\s+/g, "");
        if (!ico) {
            if (status) status.textContent = "";
            showAutoFields(form, false);
            // vyčisti hidden
            [
                "Firma - názov","Firma - DIČ","Firma - IČ DPH","Firma - Ulica","Firma - Číslo",
                "Firma - Mesto","Firma - PSČ","Firma - Krajina","Firma - Adresa (celá)"
            ].forEach((k) => setHidden(k, ""));
            return;
        }

        if (!/^\d{6,8}$/.test(ico)) {
            if (status) {
                status.textContent = "Zadajte platné IČO (6–8 číslic).";
                status.className = "statusLine statusBad";
            }
            showAutoFields(form, false);
            return;
        }

        if (status) {
            status.textContent = "Overujem IČO…";
            status.className = "statusLine";
        }

        const res = await icoLookup(ico);

        if (!res.ok || !res.found) {
            if (status) {
                status.textContent = "Firma sa nenašla v registri.";
                status.className = "statusLine statusBad";
            }
            showAutoFields(form, false);
            return;
        }

        const c = res.company || {};
        // visible
        setValue('#companyName', c.name);
        setValue('#companyDic', c.dic);
        setValue('#companyIcdph', c.icdph);
        setValue('#companyStreet', c.street);
        setValue('#companyNumber', c.number);
        setValue('#companyCity', c.city);
        setValue('#companyPsc', c.psc);
        setValue('#companyCountry', c.country);
        setValue('#companyAddressFull', c.addressFull);

        // hidden for Netlify
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

        if (status) {
            status.textContent = "Firma načítaná.";
            status.className = "statusLine statusOk";
        }
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
            if (status) status.textContent = "";
            return;
        }

        if (!/^[a-z0-9-]{1,63}\.sk$/.test(domain)) {
            if (status) {
                status.textContent = "Zadajte doménu v tvare nieco.sk";
                status.className = "statusLine statusBad";
            }
            return;
        }

        if (status) {
            status.textContent = "Overujem doménu…";
            status.className = "statusLine";
        }

        const res = await domainCheck(domain);

        if (!res.ok) {
            if (status) {
                status.textContent = "Overenie domény zlyhalo.";
                status.className = "statusLine statusBad";
            }
            return;
        }

        if (status) {
            status.textContent = res.available ? "Doména je voľná." : "Doména už existuje.";
            status.className = "statusLine " + (res.available ? "statusOk" : "statusBad");
        }
    }, 500);

    domainInput.addEventListener("input", run);
}

window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("form[data-ico-form]").forEach(wireIcoForm);
    document.querySelectorAll("form[data-domain-form]").forEach(wireDomainForm);
});
