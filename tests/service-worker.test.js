const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");

test("Charakterbilder werden netzwerk-first und ohne Browser-Cache geladen", async () => {
  const fetchCalls = [];
  let fetchHandler;
  const cache = {
    async match() {
      return { body: "veraltetes Bild" };
    },
    async put() {},
  };
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://example.test" },
      addEventListener(type, handler) {
        if (type === "fetch") fetchHandler = handler;
      },
    },
    caches: { async open() { return cache; } },
    fetch: async (...args) => {
      fetchCalls.push(args);
      return { ok: true, body: "aktuelles Bild", clone() { return this; } };
    },
  });
  vm.runInContext(source, context);

  let responsePromise;
  fetchHandler({
    request: {
      method: "GET",
      mode: "cors",
      url: "https://example.test/character/char_4/animiert_vorn.gif",
    },
    respondWith(response) {
      responsePromise = response;
    },
  });

  const response = await responsePromise;
  assert.equal(response.body, "aktuelles Bild");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][1].cache, "no-cache");
});
