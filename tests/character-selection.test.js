const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("Die Auswahlvorschau zentriert sichtbare Pixel ohne das Spielbild zu veraendern", () => {
  const pixels = new Uint8ClampedArray(8 * 7 * 4);
  for (const [x, y] of [[0, 0], [2, 3]]) pixels[(y * 8 + x) * 4 + 3] = 255;
  const source = {
    width: 8, height: 7,
    getContext: () => ({ getImageData: () => ({ data: pixels }) }),
  };
  let draw;
  let output;
  const context = vm.createContext({
    console,
    document: {
      createElement: () => {
        output = {
          getContext: () => ({ drawImage: (...args) => { draw = args; } }),
          toDataURL: () => "preview",
        };
        return output;
      },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spiel", "charakter", "character-ui.js"), "utf8"), context);
  context.testImage = { canvas: source };
  assert.equal(vm.runInContext("centeredCharacterPreview(testImage)", context), "preview");
  assert.equal(output.width, 8);
  assert.equal(output.height, 7);
  assert.deepEqual(draw, [source, 3, 2]);
  assert.equal(pixels[(0 * 8 + 0) * 4 + 3], 255);
});

test("Eine vollstaendig transparente Vorschau wird gemeldet", () => {
  const warnings = [];
  const context = vm.createContext({ console: { warn: (...args) => warnings.push(args) } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spiel", "charakter", "character-ui.js"), "utf8"), context);
  context.testImage = { canvas: {
    width: 2, height: 2,
    getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(16) }) }),
    toDataURL: () => "empty",
  } };
  assert.equal(vm.runInContext("centeredCharacterPreview(testImage)", context), "empty");
  assert.equal(warnings.length, 1);
});

test("Die Pfeile waehlen auch ueber beide Listenenden hinweg den richtigen Charakter", () => {
  const elements = [];
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((name) => this.classes.add(name)),
        toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      };
      this.style = {};
      this.scrollLeft = 0;
      this.clientWidth = 100;
      this.offsetWidth = 50;
      elements.push(this);
    }
    setAttribute() {}
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    appendChild(child) { child.parent = this; this.children.push(child); }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    getBoundingClientRect() {
      if (this.classes.has("char-card")) {
        const index = this.parent.children.indexOf(this);
        return { left: 25 + index * 75 - this.parent.scrollLeft, width: 50 };
      }
      return { left: 0, width: 100 };
    }
    scrollTo(options) {
      this.lastScroll = options;
      this.scrollLeft = options.left;
      this.listeners.scroll();
    }
    remove() {}
  }
  const document = {
    createElement: () => new Element(),
    addEventListener() {},
    removeEventListener() {},
  };
  const context = vm.createContext({
    document,
    window: { addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: (callback) => callback(),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spiel", "charakter", "character-ui.js"), "utf8"), context);
  const selection = vm.runInContext("new CharacterSelectionBar(document.createElement('div'), [{name: '1'}, {name: '2'}, {name: '3'}])", context);
  selection.show(() => {}, () => {});

  const arrows = elements.filter((element) => element.classes.has("char-arrow"));
  const list = elements.find((element) => element.classes.has("char-select-list"));
  assert.equal(selection.selectedCharacter.name, "1");
  arrows[1].listeners.click();
  assert.equal(selection.selectedCharacter.name, "2");
  arrows[1].listeners.click();
  assert.equal(selection.selectedCharacter.name, "3");
  arrows[1].listeners.click();
  assert.equal(selection.selectedCharacter.name, "1");
  assert.equal(list.lastScroll.behavior, "instant");
  arrows[0].listeners.click();
  assert.equal(selection.selectedCharacter.name, "3");
});
