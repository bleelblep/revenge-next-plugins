// Debug websocket server for Revenge Next (protocol-level, not plugin-format-specific --
// same script bleelblep/revengeplugins uses for classic Revenge).
//
//   node devtools.mjs
//
// Point the client's "Debugger URL" at <this machine's LAN IP>:9090 and toggle
// "Connect to debug websocket". Anything sent over the socket is eval'd in the
// client and the result comes back.
//
// A control port (9091) accepts plain-text JS over HTTP POST and returns the
// client's reply, so probes can be scripted:
//
//   curl -s -X POST --data-binary "1 + 1" http://localhost:9091
//
// Everything the client sends is also logged here, including unsolicited output
// (console.log/error from a loaded plugin, if this build forwards it over the socket).

import { WebSocketServer } from "ws";
import { createServer } from "http";
import { networkInterfaces } from "os";

const WS_PORT = 9090;
const CTRL_PORT = 9091;
const TIMEOUT_MS = 10_000;

let client = null;
/** Replies arrive on the same socket with no correlation id, so serve one probe at a time. */
const queue = [];

const wss = new WebSocketServer({ port: WS_PORT, host: "0.0.0.0" });

wss.on("connection", (socket, req) => {
    client = socket;
    console.log(`\n[connected] ${req.socket.remoteAddress}\n`);

    socket.on("message", (data) => {
        const text = data.toString();
        console.log(`[client] ${text}`);

        const waiter = queue.shift();
        if (waiter) {
            clearTimeout(waiter.timer);
            waiter.resolve(text);
        }
    });

    socket.on("close", () => {
        console.log("\n[disconnected]\n");
        if (client === socket) client = null;
    });

    socket.on("error", (err) => console.log(`[socket error] ${err.message}`));
});

wss.on("error", (err) => console.error(`[server error] ${err.message}`));

function evaluate(code) {
    return new Promise((resolve) => {
        if (!client || client.readyState !== 1) return resolve("ERROR: client not connected");

        const timer = setTimeout(() => {
            const index = queue.findIndex((w) => w.timer === timer);
            if (index !== -1) queue.splice(index, 1);
            resolve("ERROR: timed out waiting for a reply");
        }, TIMEOUT_MS);

        queue.push({ resolve, timer });
        console.log(`[eval] ${code}`);
        client.send(code);
    });
}

createServer((req, res) => {
    if (req.method !== "POST") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        return res.end(client ? "client connected\n" : "no client connected\n");
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
        const result = await evaluate(body);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(result + "\n");
    });
}).listen(CTRL_PORT, "127.0.0.1");

const lanIp = Object.entries(networkInterfaces())
    .filter(([name]) => !/vmware|virtualbox|vethernet|wsl|loopback/i.test(name))
    .flatMap(([, addrs]) => addrs ?? [])
    .find((a) => a.family === "IPv4" && !a.internal)?.address;

console.log(`Debug websocket listening on ${WS_PORT}`);
console.log(`Control port on ${CTRL_PORT} (localhost only)`);
console.log(`\n  Set the client's Debugger URL to:  ${lanIp ?? "localhost"}:${WS_PORT}\n`);
console.log("Waiting for the client to connect...");
