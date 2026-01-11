/**
 * Form enrichment: IČO lookup + Domain availability check
 * Works with both kontakt and workshopy forms
 */

// ─── Helpers ────────────────────────────────────────────────────────────────
function debounce(fn, ms = 400) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

function setValue(el, v) {
    if (!el) return;
    el.value = v ?? "";
}

function setHidden(form, name, value) {
    const input = form.querySelector(`input[type="hidden"][name="${name}"]`);
    if (input) input.value = value ?? "";
}

function showAutoFields(container, show) {
    if (!container) return;
    container.style.display = show ? "block" : "none";
}

async function safeFetchJson(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
        return await r.json();
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

// ─── IČO Lookup ─────────────────────────────────────────────────────────────
function wireIcoForm(form) {
    const icoInput = form.querySelector('input[name="IČO"]');
    const statusEl = form.querySelector("[data-ico-status]");
    const autoFieldsContainer = form.querySelector("[data-auto-fields]");

    if (!icoInput) return;

    // Detect which form we're on based on input IDs
    const isWorkshopyForm = form.querySelector('#wsIco') !== null;
    const prefix = isWorkshopyForm ? 'wsCompany' : 'company';

    // Field mappings based on form type
    const getField = (suffix) => {
        return form.querySelector(`#${prefix}${suffix}`) ||
            document.getElementById(`${prefix}${suffix}`);
    };

    const clearCompanyFields = () => {
        const suffixes = ['Name', 'AddressFull', 'Dic', 'Icdph', 'Street', 'Number', 'City', 'Psc', 'Country'];
        suffixes.forEach(s => setValue(getField(s), ""));

        // Clear hidden fields
        setHidden(form, "Firma - názov", "");
        setHidden(form, "Firma - DIČ", "");
        setHidden(form, "Firma - IČ DPH", "");
        setHidden(form, "Firma - Ulica", "");
        setHidden(form, "Firma - Číslo", "");
        setHidden(form, "Firma - Mesto", "");
        setHidden(form, "Firma - PSČ", "");
        setHidden(form, "Firma - Krajina", "");
        setHidden(form, "Firma - Adresa (celá)", "");

        showAutoFields(autoFieldsContainer, false);
    };

    const fillCompanyFields = (c) => {
        setValue(getField('Name'), c.name);
        setValue(getField('AddressFull'), c.addressFull);
        setValue(getField('Dic'), c.dic);
        setValue(getField('Icdph'), c.icdph);
        setValue(getField('Street'), c.street);
        setValue(getField('Number'), c.streetNumber);
        setValue(getField('City'), c.city);
        setValue(getField('Psc'), c.postalCode);
        setValue(getField('Country'), c.country);

        // Hidden fields for Netlify
        setHidden(form, "Firma - názov", c.name);
        setHidden(form, "Firma - DIČ", c.dic);
        setHidden(form, "Firma - IČ DPH", c.icdph);
        setHidden(form, "Firma - Ulica", c.street);
        setHidden(form, "Firma - Číslo", c.streetNumber);
        setHidden(form, "Firma - Mesto", c.city);
        setHidden(form, "Firma - PSČ", c.postalCode);
        setHidden(form, "Firma - Krajina", c.country);
        setHidden(form, "Firma - Adresa (celá)", c.addressFull);

        showAutoFields(autoFieldsContainer, true);
    };

    const lookup = debounce(async () => {
        const ico = icoInput.value.replace(/\s/g, "");

        if (!ico || ico.length < 6) {
            if (statusEl) statusEl.textContent = "";
            clearCompanyFields();
            return;
        }

        if (statusEl) {
            statusEl.textContent = "⏳ Načítavam údaje…";
            statusEl.className = "statusLine loading";
        }

        const data = await safeFetchJson(`/ico-lookup?ico=${ico}`);

        if (!data.ok) {
            if (statusEl) {
                statusEl.textContent = "⚠️ Chyba pri načítaní";
                statusEl.className = "statusLine error";
            }
            clearCompanyFields();
            return;
        }

        if (!data.found) {
            if (statusEl) {
                statusEl.textContent = "❌ IČO nenájdené";
                statusEl.className = "statusLine error";
            }
            clearCompanyFields();
            return;
        }

        const c = data.company;
        if (statusEl) {
            statusEl.textContent = `✅ ${c.name}`;
            statusEl.className = "statusLine success";
        }
        fillCompanyFields(c);
    }, 500);

    icoInput.addEventListener("input", lookup);
}

// ─── Domain Check ───────────────────────────────────────────────────────────
function wireDomainForm(form) {
    const domainInput = form.querySelector('input[name="Doména (.sk)"]');
    const statusEl = form.querySelector("[data-domain-status]");

    if (!domainInput) return;

    const check = debounce(async () => {
        let domain = domainInput.value.trim().toLowerCase();

        if (!domain) {
            if (statusEl) statusEl.textContent = "";
            return;
        }

        // Add .sk if missing
        if (!domain.includes(".")) {
            domain += ".sk";
        }

        // Basic validation
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/.test(domain)) {
            if (statusEl) {
                statusEl.textContent = "⚠️ Neplatný formát domény";
                statusEl.className = "statusLine error";
            }
            return;
        }

        if (statusEl) {
            statusEl.textContent = "⏳ Overujem dostupnosť…";
            statusEl.className = "statusLine loading";
        }

        const data = await safeFetchJson(`/domain-check?domain=${domain}`);

        if (!data.ok) {
            if (statusEl) {
                statusEl.textContent = "⚠️ Chyba pri overení";
                statusEl.className = "statusLine error";
            }
            return;
        }

        if (data.available) {
            if (statusEl) {
                statusEl.textContent = `✅ ${domain} je voľná`;
                statusEl.className = "statusLine success";
            }
        } else {
            if (statusEl) {
                statusEl.textContent = `❌ ${domain} je obsadená`;
                statusEl.className = "statusLine error";
            }
        }
    }, 500);

    domainInput.addEventListener("input", check);
}

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    // Wire all IČO forms
    document.querySelectorAll("form[data-ico-form]").forEach(wireIcoForm);

    // Wire all domain forms
    document.querySelectorAll("form[data-domain-form]").forEach(wireDomainForm);
});
