import { createServer, type Server } from "node:http";

export interface WorkerHealthOptions {
  port: number;
  /** 默认只听 127.0.0.1。健康检查在容器内执行，不需要映射到宿主机。 */
  host?: string;
  probe?: () => Promise<boolean>;
}

/** 拒绝把健康检查绑到所有网卡。调用方即使传了 0.0.0.0 也会落回本机。 */
export function workerHealthHost(raw: string | undefined): string {
  const host = raw?.trim() || "127.0.0.1";
  if (host === "0.0.0.0" || host === "::" || host === "[::]") return "127.0.0.1";
  return host;
}

export function startWorkerHealthServer(options: WorkerHealthOptions): Server {
  const host = workerHealthHost(options.host);
  const server = createServer((req, res) => {
    void (async () => {
      const path = req.url?.split("?")[0];
      if (req.method !== "GET" || path !== "/health") {
        res.writeHead(404, { "cache-control": "no-store" });
        res.end();
        return;
      }
      let ok = true;
      if (options.probe) {
        try {
          ok = await options.probe();
        } catch {
          ok = false;
        }
      }
      res.writeHead(ok ? 200 : 503, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify({ ok, service: "memora-worker" }));
    })();
  });
  server.listen(options.port, host);
  return server;
}
