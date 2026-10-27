const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
};
http
  .createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      return res.end("Bad request");
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    if (pathname === "/") pathname = "/index.html";
    if (
      pathname !== "/index.html" &&
      !/^\/src\/[a-zA-Z0-9_-]+\.(js|mjs|css)$/.test(pathname)
    ) {
      res.writeHead(404);
      return res.end();
    }
    fs.readFile(path.join(root, pathname), (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end();
      }
      res.setHeader("Content-Type", types[path.extname(pathname)]);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(req.method === "HEAD" ? undefined : data);
    });
  })
  .listen(5173, "0.0.0.0", () => console.log("Denax listening on port 5173"));
