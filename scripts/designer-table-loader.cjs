// Adapt the pinned designer's table creation flow at build time, without
// changing node_modules or the existing table editing/data-binding behavior.

// 1.7.39 renders the table cell inline editor (<textarea>) inside a v-for, so Vue
// stores its ref as an array (`ref_for: true`). startCellInlineEdit then calls
// `.focus()` / `.select()` on that array and throws "focus is not a function",
// which surfaces as a webpack-dev-server runtime overlay on every cell dblclick.
// Unwrap the element before the native calls; the edit/commit flow is untouched.
const CELL_EDITOR_BEFORE = "      (_b = inlineEditorRef.value) == null ? void 0 : _b.focus();\n"
  + "      (_c = inlineEditorRef.value) == null ? void 0 : _c.select();";
const CELL_EDITOR_UNWRAP = "Array.isArray(inlineEditorRef.value)"
  + " ? inlineEditorRef.value[inlineEditorRef.value.length - 1]"
  + " : inlineEditorRef.value";
const CELL_EDITOR_AFTER = `      (_b = ${CELL_EDITOR_UNWRAP}) == null ? void 0 : _b.focus();\n`
  + `      (_c = ${CELL_EDITOR_UNWRAP}) == null ? void 0 : _c.select();`;

function patchTableCellInlineEditor(source) {
  if (source.split(CELL_EDITOR_BEFORE).length !== 2) {
    throw new Error("Designer table cell inline editor changed; review the table adapter.");
  }
  return source.replace(CELL_EDITOR_BEFORE, () => CELL_EDITOR_AFTER);
}

// 1.7.39's canvas element context menu decides "粘贴" availability from the
// engine-internal element clipboard (store.clipboard), which the host's
// data-source copy flow never writes, and its click only clones elements.
// Let the host veto the disabled state and claim the click when a data-source
// field is armed; every other case keeps the native element paste semantics.
const PASTE_MENU_DISABLED_BEFORE = "                  disabled: unref(store).clipboard.length === 0,\n";
const PASTE_MENU_DISABLED_AFTER = "                  disabled: unref(store).clipboard.length === 0"
  + " && !(globalThis.__duoweiPasteDataSourceReady && globalThis.__duoweiPasteDataSourceReady()),\n";
const PASTE_MENU_CLICK_BEFORE = "                    unref(store).paste(getPasteTarget(clickX.value, clickY.value));\n";
const PASTE_MENU_CLICK_AFTER = "                    if (globalThis.__duoweiPasteDataSource"
  + " && globalThis.__duoweiPasteDataSource()) { showMenu.value = false; return; }\n"
  + PASTE_MENU_CLICK_BEFORE;

function patchCanvasPasteMenu(source) {
  if (source.split(PASTE_MENU_DISABLED_BEFORE).length !== 2) {
    throw new Error("Designer canvas paste menu state changed; review the table adapter.");
  }
  if (source.split(PASTE_MENU_CLICK_BEFORE).length !== 2) {
    throw new Error("Designer canvas paste action changed; review the table adapter.");
  }
  return source
    .replace(PASTE_MENU_DISABLED_BEFORE, () => PASTE_MENU_DISABLED_AFTER)
    .replace(PASTE_MENU_CLICK_BEFORE, () => PASTE_MENU_CLICK_AFTER);
}

// 1.7.39's stitchImages() hands the raw DOM Event from `img.onerror` to reject(),
// so one broken image becomes an unhandled rejection whose reason has no stack
// (the dev overlay can only print "[object Event]") and the whole export batch
// is aborted. Turn that into a readable Error, and degrade a broken page to a
// white page so the remaining pages still print.
const STITCH_FIRST_IMAGE_BEFORE = "      img.onload = () => resolve2(img);\n"
  + "      img.onerror = reject;\n"
  + "      img.src = images[0];";
const STITCH_FIRST_IMAGE_AFTER = "      img.onload = () => resolve2(img);\n"
  + "      img.onerror = (event) => reject(new Error(\""
  + "[duowei] print page image failed to load: \""
  + " + String(event && event.target && (event.target.currentSrc || event.target.src) || \"unknown\")));\n"
  + "      img.src = images[0];";
const STITCH_PAGE_IMAGE_BEFORE = "        img.onerror = reject;\n"
  + "        img.src = images[i];";
const STITCH_PAGE_IMAGE_AFTER = "        img.onerror = (event) => {\n"
  + "          console.warn(\"[duowei] print page image failed to load, keep a blank page:\", "
  + "String(event && event.target && (event.target.currentSrc || event.target.src) || \"unknown\"));\n"
  + "          ctx.fillStyle = \"#ffffff\";\n"
  + "          ctx.fillRect(0, i * imgHeight, imgWidth, imgHeight);\n"
  + "          resolve2();\n"
  + "        };\n"
  + "        img.src = images[i];";

function patchStitchedImageFailure(source) {
  if (source.split(STITCH_FIRST_IMAGE_BEFORE).length !== 2) {
    throw new Error("Designer stitched first page rendering changed; review the image fallback patch.");
  }
  if (source.split(STITCH_PAGE_IMAGE_BEFORE).length !== 2) {
    throw new Error("Designer stitched page rendering changed; review the image fallback patch.");
  }
  return source
    .replace(STITCH_FIRST_IMAGE_BEFORE, () => STITCH_FIRST_IMAGE_AFTER)
    .replace(STITCH_PAGE_IMAGE_BEFORE, () => STITCH_PAGE_IMAGE_AFTER);
}

module.exports = function designerTableLoader(source) {
  source = patchTableCellInlineEditor(source);
  source = patchCanvasPasteMenu(source);
  source = patchStitchedImageFailure(source);
  const fieldsStart = '    const tableCreateFields = computed(() => [';
  if (!source.includes(fieldsStart)) return source;
  const replaceOnce = (before, after) => {
    if (source.split(before).length !== 2) {
      throw new Error('Designer table creation changed; review the table adapter.');
    }
    source = source.replace(before, after);
  };
  replaceOnce('      mode: "testData",', '      mode: "custom",');
  const modeStart = source.indexOf(fieldsStart) + fieldsStart.length;
  const columnsStart = source.indexOf('      {\n        key: "columns",', modeStart);
  if (columnsStart < modeStart || !source.slice(modeStart, columnsStart).includes('canvas.tableCreateWithTestData')) {
    throw new Error('Designer table fields changed; review the table adapter.');
  }
  source = source.slice(0, modeStart) + '\n' + source.slice(columnsStart);
  // The form only submits visible fields. Always take the empty-table branch.
  replaceOnce(
    'const mode = String((payload == null ? void 0 : payload.mode) || "testData");',
    'const mode = "custom";',
  );
  const condition = '        showWhen: { key: "mode", value: "custom" }\n';
  if (source.split(condition).length !== 3) {
    throw new Error('Designer table row/column fields changed; review the table adapter.');
  }
  source = source.replaceAll(condition, '');
  return source;
};
