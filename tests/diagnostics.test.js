const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "spiel", "daten", "diagnostics.js"), "utf8");

function createDiagnostics(hostname, search, protocol = "http:") {
  const warnings = [];
  function element(tag) {
    return {
      tag, children: [], textContent: "",
      append(...children) { this.children.push(...children); },
      appendChild(child) { this.children.push(child); },
      querySelector(selector) { return this.children.find((child) => child.tag === selector); },
    };
  }
  const body = element("body");
  const document = {
    body,
    createElement: element,
    querySelector(selector) { return body.children.find((child) => `.${child.className}` === selector); },
  };
  const context = vm.createContext({
    window: { location: { hostname, search, protocol } },
    document, URLSearchParams,
    console: { warn: (...args) => warnings.push(args) },
  });
  vm.runInContext(source, context);
  return { context, body, warnings };
}

test("Diagnose ist nur lokal mit ausdruecklich aktiviertem Debug-Modus sichtbar", () => {
  for (const [host, query, protocol] of [
    ["localhost", "", "http:"], ["127.0.0.1", "?editor", "http:"],
    ["example.com", "?debug", "https:"], ["localhost.example.com", "?debug", "https:"],
    ["localhost", "?debug", "file:"],
  ]) {
    const { context, body, warnings } = createDiagnostics(host, query, protocol);
    vm.runInContext('showCatalogWarnings(["Fehlendes Tile"])', context);
    assert.equal(body.children.length, 0, `${host} ${query}`);
    assert.equal(warnings.length, 1);
  }
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const { context, body } = createDiagnostics(host, "?editor&debug");
    vm.runInContext('showCatalogWarnings(["Erster Hinweis"]); showCatalogWarnings(["Zweiter Hinweis"])', context);
    assert.equal(body.children.length, 1);
    assert.equal(body.children[0].tag, "details");
    assert.equal(body.children[0].querySelector("summary").textContent, "2 Hinweise – Details anzeigen");
    assert.deepEqual(body.children[0].querySelector("ul").children.map((item) => item.textContent), ["Erster Hinweis", "Zweiter Hinweis"]);
  }
});
