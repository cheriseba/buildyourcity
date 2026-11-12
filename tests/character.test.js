const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createCharacter() {
  const requests = [];
  const errors = [];
  const context = vm.createContext({
    console: { error: (...args) => errors.push(args) },
    loadImage(url, onLoad, onError) {
      const image = {
        width: 23, height: 24, frame: 2,
        setFrame(frame) { this.frame = frame; },
        get() { return { frame: this.frame, canvas: {} }; },
      };
      requests.push({ url, image, onLoad, onError });
      return image;
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "spiel", "charakter", "character.js"), "utf8"), context);
  const character = vm.runInContext('new GameCharacter("character/char_1")', context);
  character.preloadAssets();
  return { character, requests, errors };
}

test("Standbilder werden aus dem ersten GIF-Frame beider Richtungen kopiert", () => {
  const { character, requests } = createCharacter();
  assert.deepEqual(requests.map((request) => request.url), [
    "character/char_1/animiert_vorn.gif",
    "character/char_1/animiert_hinten.gif",
  ]);
  for (const request of requests) request.onLoad(request.image);

  for (const [direction, request] of [["front", requests[0]], ["back", requests[1]]]) {
    character.lastDirection = direction;
    character.isMoving = false;
    const idle = character.getDisplayImage();
    assert.equal(idle.frame, 0);
    request.image.frame = 2;
    assert.equal(idle.frame, 0);
    character.isMoving = true;
    assert.equal(character.getDisplayImage(), request.image);
  }
});

test("Fehlgeschlagene GIF-Ladung wird gemeldet und nicht als Bild verwendet", () => {
  const { character, requests, errors } = createCharacter();
  const error = new Error("nicht gefunden");
  requests[0].onError(error);
  assert.equal(character.images.animFront, null);
  assert.equal(character.images.idleFront, null);
  assert.equal(character.getDisplayImage(), null);
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /animiert_vorn\.gif/);
  assert.equal(errors[0][1], error);
});
