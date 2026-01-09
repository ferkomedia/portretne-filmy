import net from "node:net";

export const handler = async (event) => {
    try {
        const domainRaw = (event.queryStringParameters?.domain || "").trim().toLowerCase();
        if (!domainRaw) return json({ ok: false, error: "Chýba domain parameter." }, 400);

        const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9-]{1,63}\.sk$/.test(domain)) {
            return json({ ok: false, error: "Zadajte doménu v tvare nieco.sk" }, 400);
        }

        const whoisText = await whoisQuery(domain);
        const t = whoisText.toLowerCase();
        const available =
            t.includes("no entries found") ||
            t.includes("not found") ||
            t.includes("no match") ||
            t.includes("nenašlo sa") ||
            t.includes("neexistuje");

        return json({ ok: true, domain, available }, 200);
    } catch (e) {
        return json({ ok: false, error: "Chyba pri overovaní domény." }, 500);
    }
};

function whoisQuery(domain) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(43, "whois.sk-nic.sk");
        let data = "";
        socket.setTimeout(7000);

        socket.on("connect", () => socket.write(domain + "\r\n"));
        socket.on("data", (chunk) => (data += chunk.toString("utf8")));
        socket.on("end", () => resolve(data));
        socket.on("timeout", () => { socket.destroy(); reject(new Error("WHOIS timeout")); });
        socket.on("error", reject);
    });
}

function json(obj, status = 200) {
    return {
        statusCode: status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
        body: JSON.stringify(obj),
    };
}

import net from "node:net";

export default async (req) => {
    try {
        const url = new URL(req.url);
        const domainRaw = (url.searchParams.get("domain") || "").trim().toLowerCase();

        if (!domainRaw) return json({ ok: false, error: "Chýba domain parameter." }, 400);

        const domain = domainRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
        if (!/^[a-z0-9-]{1,63}\.sk$/.test(domain)) {
            return json({ ok: false, error: "Zadajte doménu v tvare nieco.sk" }, 400);
        }

        const whoisText = await whoisQuery(domain);

        // Heuristika – SK-NIC typicky vracia "No entries found", "NOT FOUND" a podobne
        const t = whoisText.toLowerCase();
        const available =
            t.includes("no entries found") ||
            t.includes("not found") ||
            t.includes("no match") ||
            t.includes("nenašlo sa") ||
            t.includes("neexistuje");

        return json({
            ok: true,
            domain,
            available,
            // pre debug (ak chceš vypnúť, stačí zmazať)
            raw: whoisText.slice(0, 1800),
        }, 200);

    } catch (e) {
        return json({ ok: false, error: "Chyba pri overovaní domény." }, 500);
    }
};

function whoisQuery(domain) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(43, "whois.sk-nic.sk");
        let data = "";

        socket.setTimeout(7000);

        socket.on("connect", () => {
            socket.write(domain + "\r\n");
        });

        socket.on("data", (chunk) => {
            data += chunk.toString("utf8");
        });

        socket.on("end", () => resolve(data));
        socket.on("timeout", () => {
            socket.destroy();
            reject(new Error("WHOIS timeout"));
        });
        socket.on("error", (err) => reject(err));
    });
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
        },
    });
}
