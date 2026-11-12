const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");

test("Charakterbilder im Unterverzeichnis werden netzwerk-first und ohne Browser-Cache geladen", async () => {
  const fetchCalls = [];
  const cacheKeys = [];
  let fetchHandler;
  const cache = {
    async match(key) {
      cacheKeys.push(key);
      return { body: "veraltetes Bild" };
    },
    async put(key) { cacheKeys.push(key); },
  };
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://example.test" },
      registration: { scope: "https://example.test/nordstadt/" },
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
      url: "https://example.test/nordstadt/character/char_4/animiert_vorn.gif?character-update=123",
    },
    respondWith(response) {
      responsePromise = response;
    },
  });

  const response = await responsePromise;
  assert.equal(response.body, "aktuelles Bild");
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][1].cache, "no-cache");
  assert.deepEqual(cacheKeys, [
    "https://example.test/nordstadt/character/char_4/animiert_vorn.gif",
    "https://example.test/nordstadt/character/char_4/animiert_vorn.gif",
  ]);
});

test("Charakterbilder bleiben bei Netzfehlern versionsunabhaengig im Cache auffindbar", async () => {
  let fetchHandler;
  const context = vm.createContext({
    URL,
    self: {
      location: { origin: "https://example.test" },
      registration: { scope: "https://example.test/" },
      addEventListener(type, handler) {
        if (type === "fetch") fetchHandler = handler;
      },
    },
    caches: {
      async open() {
        return {
          async match(key) {
            return key === "https://example.test/character/char_1/animiert_vorn.gif"
              ? { body: "gespeichertes Bild" }
              : undefined;
          },
        };
      },
    },
    fetch: async () => { throw new Error("offline"); },
  });
  vm.runInContext(source, context);

  let responsePromise;
  fetchHandler({
    request: {
      method: "GET",
      mode: "cors",
      url: "https://example.test/character/char_1/animiert_vorn.gif?character-update=456",
    },
    respondWith(response) { responsePromise = response; },
  });

  assert.equal((await responsePromise).body, "gespeichertes Bild");
});
