import { createServer, type Server } from "node:http";

const DEFAULT_PORT = 3002;

export function workerHealthPort(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_PORT;
  const port = Number(raw.trim());
  if (port < 1 || port > 65535) return DEFAULT_PORT;
  return port;
}

/** 进程活着就返回 200。不读请求正文，也不打日志。 */
export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    const url = req.url?.split("?")[0] ?? "";
    if (req.method === "GET" && (url === "/health" || url === "/health/")) {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, service: "memora-worker" }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false }));
  });
  server.listen(port, "0.0.0.0");
  return server;
}
