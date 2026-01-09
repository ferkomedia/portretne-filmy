// netlify/functions/domain-check.js  (CommonJS WHOIS)

const net = require("net");

exports.handler = async (event) => {
    try {
        const domainRaw = (event.queryStringParameters?.domain || "").trim().toLowerCase();
        if (!domainRaw) return json(400, { ok: false, error: "Chýba parameter domain." });

        const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9-]+\.sk$/.test(domain)) {
            return json(400, { ok: false, error: "Zadajte doménu vo formáte napr. mojadomena.sk" });
        }

        const text = await whoisQuery(domain);

        // Heuristika: keď nie je registrovaná, WHOIS vráti "NOT FOUND" / "No entries found" (závisí)
        const lower = text.toLowerCase();

        const available =
            lower.includes("not found") ||
            lower.includes("no entries found") ||
            lower.includes("no match") ||
            lower.includes("domain not found");

        return json(200, {
            ok: true,
            domain,
            available,
            sample: text.slice(0, 4000) // len pre debug, môžeš neskôr vyhodiť
        });
    } catch (e) {
        return json(500, { ok: false, error: "Chyba pri overení domény." });
    }
};

function whoisQuery(query) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let data = "";

        socket.setTimeout(8000);

        socket.connect(43, "whois.sk-nic.sk", () => {
            socket.write(query + "\r\n");
        });

        socket.on("data", (chunk) => {
            data += chunk.toString("utf8");
        });

        socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("WHOIS timeout"));
        });

        socket.on("error", (err) => reject(err));

        socket.on("close", () => resolve(data));
    });
}

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store"
        },
        body: JSON.stringify(body)
    };
}
