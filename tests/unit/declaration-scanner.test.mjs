import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTopLevelDeclarations, findDeclarationCollisions } from '../../scripts/check-newtab-static.mjs';

test('declaration-scanner: detects duplicate const declarations across files', () => {
  const scriptA = `
    const duplicateConst = 'valueA';
    const uniqueConstA = 123;
  `;
  const scriptB = `
    const duplicateConst = 'valueB';
    const uniqueConstB = 456;
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'fileA.js', text: scriptA },
    { src: 'fileB.js', text: scriptB }
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].name, 'duplicateConst');
  assert.equal(duplicates[0].occurrences.length, 2);
  assert.equal(duplicates[0].occurrences[0].type, 'const');
  assert.equal(duplicates[0].occurrences[1].type, 'const');
  assert.equal(duplicates[0].occurrences[0].file, 'fileA.js');
  assert.equal(duplicates[0].occurrences[1].file, 'fileB.js');
});

test('declaration-scanner: detects duplicate function declarations across files', () => {
  const scriptA = `
    function updateLayout(target) {
      return target;
    }
  `;
  const scriptB = `
    async function updateLayout(target) {
      await Promise.resolve();
      return target;
    }
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'fileA.js', text: scriptA },
    { src: 'fileB.js', text: scriptB }
  ]);

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].name, 'updateLayout');
  assert.equal(duplicates[0].occurrences.length, 2);
  assert.equal(duplicates[0].occurrences[0].type, 'function');
  assert.equal(duplicates[0].occurrences[1].type, 'function');
});

test('declaration-scanner: same name inside block/function scope does NOT trigger collision', () => {
  const scriptA = `
    function processUserData() {
      const temp = 100;
      let count = 0;
      var buffer = 'data';
      function innerHelper() {
        return temp + count;
      }
      if (temp > 50) {
        const scopedBlockVar = true;
      }
      return innerHelper();
    }
  `;
  const scriptB = `
    function renderComponent() {
      const temp = 999;
      let count = 42;
      var buffer = 'other';
      function innerHelper() {
        return 'clean';
      }
      if (count > 0) {
        const scopedBlockVar = false;
      }
      return innerHelper();
    }
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'fileA.js', text: scriptA },
    { src: 'fileB.js', text: scriptB }
  ]);

  // temp, count, buffer, innerHelper, scopedBlockVar are local/block scoped, so they MUST NOT collide
  assert.equal(duplicates.length, 0, 'Scoped variables must not trigger top-level collisions');
});

test('declaration-scanner: comments, strings, regex, and template interpolations do NOT trigger false positives', () => {
  const scriptA = `
    // const fakeCommentVar = 'ignore';
    /*
      let blockCommentVar = 1;
      function fakeCommentFunction() {}
    */
    const realGlobalA = \`template string with \${(() => {
      const insideInterpolation = 123;
      return insideInterpolation;
    })()}\`;
    const regexPattern = /function fakeInRegex\\(/;
    const strLiteral = 'const fakeInString = 1';
  `;
  const scriptB = `
    const fakeCommentVar = 'realInB';
    const fakeCommentFunction = () => {};
    const insideInterpolation = 'realInB';
  `;

  const declsA = parseTopLevelDeclarations(scriptA, 'scriptA.js');
  const namesA = declsA.map((d) => d.name);

  assert.ok(namesA.includes('realGlobalA'));
  assert.ok(namesA.includes('regexPattern'));
  assert.ok(namesA.includes('strLiteral'));
  assert.ok(!namesA.includes('fakeCommentVar'), 'Single-line comments must be ignored');
  assert.ok(!namesA.includes('blockCommentVar'), 'Multi-line comments must be ignored');
  assert.ok(!namesA.includes('fakeCommentFunction'), 'Comments must be ignored');
  assert.ok(!namesA.includes('insideInterpolation'), 'Template expressions inside blocks must not leak to top-level');
  assert.ok(!namesA.includes('fakeInRegex'), 'Regex literals must be ignored');
  assert.ok(!namesA.includes('fakeInString'), 'String literals must be ignored');
});

test('declaration-scanner: detects historical wallpaperObjectUrlCache duplicate const collision', () => {
  const wallpaperStorageCode = `
    const wallpaperObjectUrlCache = new Map();
    function getCachedWallpaperUrl(key) {
      return wallpaperObjectUrlCache.get(key);
    }
  `;
  const newTabCode = `
    const wallpaperObjectUrlCache = new Map();
    function initializePage() {}
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'src/newtab/wallpaper/wallpaper-storage.js', text: wallpaperStorageCode },
    { src: 'src/new-tab.js', text: newTabCode }
  ]);

  const collision = duplicates.find((d) => d.name === 'wallpaperObjectUrlCache');
  assert.ok(collision, 'Historical wallpaperObjectUrlCache duplicate MUST be detected');
  assert.equal(collision.occurrences[0].type, 'const');
  assert.equal(collision.occurrences[1].type, 'const');
});

test('declaration-scanner: detects historical setLastUsedFolderId duplicate function collision', () => {
  const bookmarkStorageCode = `
    async function setLastUsedFolderId(id) {
      await window.HomebaseStorage.set('last-used', id);
    }
  `;
  const newTabCode = `
    async function setLastUsedFolderId(id) {
      lastUsedBookmarkFolderId = id;
      await window.HomebaseBookmarkStorage.setLastUsedFolderId(id);
    }
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'src/newtab/bookmarks/bookmark-storage.js', text: bookmarkStorageCode },
    { src: 'src/new-tab.js', text: newTabCode }
  ]);

  const collision = duplicates.find((d) => d.name === 'setLastUsedFolderId');
  assert.ok(collision, 'Historical setLastUsedFolderId duplicate MUST be detected');
  assert.equal(collision.occurrences[0].type, 'function');
  assert.equal(collision.occurrences[1].type, 'function');
});

test('declaration-scanner: detects historical setText and setAttr duplicate function collisions', () => {
  const dataJsCode = `
    function setText(el, value) {
      if (!el) return;
      el.textContent = value;
    }
    function setAttr(el, name, value) {
      if (!el) return;
      el.setAttribute(name, value);
    }
  `;
  const weatherJsCode = `
    function setText(el, value) {
      if (!el) return;
      el.textContent = value;
    }
    function setAttr(el, name, value) {
      if (!el) return;
      el.setAttribute(name, value);
    }
  `;

  const { duplicates } = findDeclarationCollisions([
    { src: 'src/data.js', text: dataJsCode },
    { src: 'src/newtab/widgets/weather.js', text: weatherJsCode }
  ]);

  const textCollision = duplicates.find((d) => d.name === 'setText');
  const attrCollision = duplicates.find((d) => d.name === 'setAttr');

  assert.ok(textCollision, 'setText duplicate MUST be detected');
  assert.ok(attrCollision, 'setAttr duplicate MUST be detected');
  assert.equal(textCollision.occurrences.length, 2);
  assert.equal(attrCollision.occurrences.length, 2);
});
