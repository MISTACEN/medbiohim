import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fetchPrivateMedia } from "../src/media-stream.js";

test("fetchPrivateMedia follows signed storage redirects server-side", async () => {
  let redirected = false;
  const server = createServer((req, res) => {
    if (req.url === "/signed") {
      res.writeHead(302, { location: "/object" });
      res.end();
      return;
    }
    if (req.url === "/object") {
      redirected = true;
      res.writeHead(200, { "content-type": "image/jpeg" });
      res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const response = await fetchPrivateMedia(`http://127.0.0.1:${address.port}/signed`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(redirected, true);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0xff, 0xd8, 0xff, 0xd9]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("fetchPrivateMedia rejects an unavailable storage object", async () => {
  await assert.rejects(
    () => fetchPrivateMedia("https://storage.invalid/object", async () => new Response("unavailable", { status: 503 })),
    /did not return a readable object/,
  );
});
