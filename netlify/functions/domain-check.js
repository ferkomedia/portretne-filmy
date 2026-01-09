import net from "node:net";

export async function handler(event) {
    try {
        const url = new URL(event.rawUrl);
        const domainRaw = (url.searchParams.get("domain") || "").trim().toLowerCase();
        const domain = normalizeDomain(domainRaw);

        if (!domain) return json(400, { ok: false, error: "Neplatná doména. Napr. mojadomena.sk" });
        if (!domain.endsWith(".sk")) return json(400, { ok: false, error: "Iba .sk domény." });

        const whoisText = await whoisQuery(domain, "whois.sk-nic.sk", 43);
        const t = whoisText.toLowerCase();

        const available =
            t.includes("no match") ||
            t.includes("not found") ||
            t.includes("no entries found") ||
            t.includes("domain not found");

        const registered = !available && (t.includes("domain:") || t.includes("registrar") || t.includes("status:"));

        return json(200, { ok: true, domain, available: available && !registered });
    } catch (e) {
        return json(500, { ok: false, error: "Chyba v domain-check.", detail: String(e?.message || e) });
    }
}

function normalizeDomain(input) {
    const d = input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
    if (!/^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]\.sk$/.test(d) && !/^[a-z0-9]\.sk$/.test(d)) return "";
    return d;
}

function whoisQuery(q, host, port) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port, timeout: 8000 }, () => socket.write(q + "\r\n"));
        let data = "";
        socket.on("data", (chunk) => (data += chunk.toString("utf8")));
        socket.on("timeout", () => { socket.destroy(); reject(new Error("WHOIS timeout")); });
        socket.on("error", reject);
        socket.on("close", () => resolve(data));
    });
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
        body: JSON.stringify(body)
    };
}
