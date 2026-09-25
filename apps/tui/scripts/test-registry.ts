import type {
  PackageReport,
  PackageManifest,
  SizeBudgets,
} from "./release-types.ts";
// Read-only localhost registry serving only the exact release tarballs.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const directory = path.resolve(process.argv[2]);
const reports: PackageReport[] = JSON.parse(
  fs.readFileSync(path.join(directory, "sizes.json"), "utf8"),
);
const packages = new Map(
  reports.map((report) => {
    const data = fs.readFileSync(path.join(directory, report.filename));
    const integrity = `sha512-${createHash("sha512").update(data).digest("base64")}`;
    if (integrity !== report.integrity)
      throw new Error(`Tarball integrity mismatch: ${report.filename}`);
    return [report.name, { report, data }] as const;
  }),
);
const downloaded: string[] = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || "/").split("?")[0].slice(1));
  const entry = packages.get(name);
  if (entry) {
    const { report } = entry;
    const manifest = {
      ...report.manifest,
      dist: {
        tarball: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}/tarballs/${report.filename}`,
        integrity: report.integrity,
      },
    };
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        name,
        "dist-tags": { latest: report.version },
        versions: { [report.version]: manifest },
      }),
    );
  } else if (name.startsWith("tarballs/")) {
    const item = [...packages.values()].find(
      (p) => `tarballs/${p.report.filename}` === name,
    );
    if (!item) {
      res.writeHead(404);
      res.end();
      return;
    }
    downloaded.push(item.report.name);
    res.end(item.data);
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(0, "127.0.0.1", () =>
  process.send!({
    url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`,
  }),
);
process.on("disconnect", () => server.close());

process.on("message", (message) => {
  if (message === "downloads") process.send!({ downloaded });
});
