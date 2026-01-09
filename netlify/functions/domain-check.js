/**
 * Netlify Function: /netlify/functions/domain-check?domain=mojadomena.sk
 * WHOIS pre .sk: whois.sk-nic.sk (port 43)
 */

import net from "node:net";

export default async (req) => {
    try {
        const url = new URL(req.url);
        const domainRaw = (url.searchParams.get("domain") || "").trim().toLowerCase();

        const domain = normalizeDomain(domainRaw);
        if (!domain) {
            return json(400, { ok: false, error: "Neplatná doména. Použi napr. mojadomena.sk" });
        }
        if (!domain.endsWith(".sk")) {
            return json(400, { ok: false, error: "Táto kontrola je určená len pre .sk domény." });
        }

        const whoisText = await whoisQuery(domain, "whois.sk-nic.sk", 43);

        // Heuristika: pri voľnej doméne WHOIS často vráti "No match"/"NOT FOUND"/"No entries found".
        // Pri obsadenej doméne zvykne byť "Domain:" + údaje.
        const t = whoisText.toLowerCase();

        const available =
            t.includes("no match") ||
            t.includes("not found") ||
            t.includes("no entries found") ||
            t.includes("nenájden") ||
            t.includes("not registered");

        const registered = !available && (t.includes("domain:") || t.includes("registrar") || t.includes("status:"));

        return json(200, {
            ok: true,
            domain,
            available: Boolean(available) && !registered,
            registered: Boolean(registered),
            // Raw vraciame len keď chceš debugovať. Môžeš vypnúť.
            raw: whoisText,
        });
    } catch (e) {
        return json(500, { ok: false, error: "Server error", detail: String(e?.message || e) });
    }
};

function normalizeDomain(input) {
    const d = input
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0]
        .trim();

    // jednoduchá validácia (bez diakritiky, pomlčka ok, bodka)
    if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.sk$/.test(d) && !/^[a-z0-9]\.sk$/.test(d)) return "";
    return d;
}

function whoisQuery(q, host, port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port, timeout: 8000 }, () => {
            socket.write(q + "\r\n");
        });

        let data = "";
        socket.on("data", (chunk) => (data += chunk.toString("utf8")));
        socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("WHOIS timeout"));
        });
        socket.on("error", reject);
        socket.on("end", () => resolve(data));
        socket.on("close", () => resolve(data));
    });
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
