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

// 1.7.39's setCanvasSize() only assigns canvasSize and never touches elements, so
// switching A4 -> A5 keeps every coordinate and pushes content past the narrower
// page (the A4 two-column row ends at 744px while A5 is 559px wide). Scale the
// elements inside the same snapshot that the engine already takes for the resize,
// so paper size and element geometry collapse into ONE undo step. Only A-series
// page presets are scaled: the continuous/label layouts carry a content-height
// canvas and their own sizing rules, and custom sizes must stay untouched.
const CANVAS_RESIZE_BEFORE = "  setCanvasSize(width, height) {\n"
  + "    if (!this.isTemplateEditable) return;\n"
  + "    this.snapshot(HISTORY_ACTION.CANVAS_RESIZE);\n"
  + "    this.canvasSize = { width, height };\n"
  + "  },";
const CANVAS_RESIZE_AFTER = "  setCanvasSize(width, height) {\n"
  + "    if (!this.isTemplateEditable) return;\n"
  + "    this.snapshot(HISTORY_ACTION.CANVAS_RESIZE);\n"
  + "    if (globalThis.__duoweiFitCanvasOnResize !== false) {\n"
  + "      const A_SERIES = [[1123, 1587], [794, 1123], [559, 794]];\n"
  + "      const isASeries = (w, h) => A_SERIES.some(([aw, ah]) => Math.abs(aw - w) < 1 && Math.abs(ah - h) < 1);\n"
  + "      const prev = this.canvasSize || {};\n"
  + "      const prevW = Number(prev.width);\n"
  + "      const prevH = Number(prev.height);\n"
  + "      const nextW = Number(width);\n"
  + "      const nextH = Number(height);\n"
  + "      const pages = this.pages || [];\n"
  + "      const hasLabelGrid = pages.some((page) => ((page && page.elements) || []).some((el) => el && el.type === \"multiLabel\"));\n"
  + "      if (isASeries(prevW, prevH) && isASeries(nextW, nextH) && !hasLabelGrid\n"
  + "        && prevW > 0 && nextW > 0 && (prevW !== nextW || prevH !== nextH)) {\n"
  + "        const k = nextW / prevW;\n"
  + "        if (Number.isFinite(k) && k > 0) {\n"
  + "          const scaleValue = (value) => (typeof value === \"number\" && Number.isFinite(value)\n"
  + "            ? Math.round(value * k * 100) / 100\n"
  + "            : value);\n"
  + "          const STYLE_SIZE_KEYS = [\"fontSize\", \"headerFontSize\", \"footerFontSize\", \"rowHeight\", \"headerHeight\", \"footerHeight\", \"borderWidth\", \"borderRadius\", \"padding\", \"cellPadding\", \"letterSpacing\"];\n"
  + "          const TABLE_FONT_DEFAULTS = { fontSize: 14, headerFontSize: 14, footerFontSize: 14 };\n"
  + "          const scaleCellFonts = (rows) => {\n"
  + "            if (!Array.isArray(rows)) return;\n"
  + "            for (const row of rows) {\n"
  + "              if (!row || typeof row !== \"object\") continue;\n"
  + "              for (const key of Object.keys(row)) {\n"
  + "                const cell = row[key];\n"
  + "                const cellStyle = cell && typeof cell === \"object\" ? cell.style : null;\n"
  + "                if (cellStyle && typeof cellStyle === \"object\" && typeof cellStyle.fontSize === \"number\" && Number.isFinite(cellStyle.fontSize)) {\n"
  + "                  cellStyle.fontSize = scaleValue(cellStyle.fontSize);\n"
  + "                }\n"
  + "              }\n"
  + "            }\n"
  + "          };\n"
  + "          for (const page of pages) {\n"
  + "            for (const el of (page && page.elements) || []) {\n"
  + "              if (!el) continue;\n"
  + "              for (const key of [\"x\", \"y\", \"width\", \"height\", \"gapX\", \"gapY\"]) {\n"
  + "                if (typeof el[key] === \"number\") el[key] = scaleValue(el[key]);\n"
  + "              }\n"
  + "              const isTable = el.type === \"table\";\n"
  + "              if (el.style && typeof el.style === \"object\") {\n"
  + "                for (const key of STYLE_SIZE_KEYS) {\n"
  + "                  const raw = el.style[key];\n"
  + "                  if (typeof raw === \"number\") {\n"
  + "                    el.style[key] = scaleValue(raw);\n"
  + "                    continue;\n"
  + "                  }\n"
  + "                  if (isTable && (raw === void 0 || raw === null) && TABLE_FONT_DEFAULTS[key] !== void 0) {\n"
  + "                    el.style[key] = scaleValue(TABLE_FONT_DEFAULTS[key]);\n"
  + "                  }\n"
  + "                }\n"
  + "              }\n"
  + "              if (Array.isArray(el.columns)) {\n"
  + "                for (const column of el.columns) {\n"
  + "                  if (column && typeof column === \"object\") {\n"
  + "                    const rawWidth = Number(column.width);\n"
  + "                    if (Number.isFinite(rawWidth) && rawWidth > 0) column.width = scaleValue(rawWidth);\n"
  + "                  }\n"
  + "                }\n"
  + "              }\n"
  + "              if (isTable) {\n"
  + "                scaleCellFonts(el.data);\n"
  + "                scaleCellFonts(el.footerData);\n"
  + "              }\n"
  + "            }\n"
  + "          }\n"
  + "        }\n"
  + "      }\n"
  + "    }\n"
  + "    this.canvasSize = { width, height };\n"
  + "  },";

function patchCanvasResizeScaling(source) {
  if (source.split(CANVAS_RESIZE_BEFORE).length !== 2) {
    throw new Error("Designer canvas resize changed; review the canvas scaling patch.");
  }
  return source.replace(CANVAS_RESIZE_BEFORE, () => CANVAS_RESIZE_AFTER);
}

// 1.7.39 keeps uploaded images as raw base64 data URLs (up to the 2MB gate), and
// the host persists templates as 10k-char chunks in bitable cells. A 2MB photo
// becomes ~267 chunk records written one bridge call at a time, so saving an
// image template takes 3-4 minutes. Downsample before the canvas takes the URL:
// longest edge 1600px (≈194dpi on A4 width, enough for print) and JPEG q0.85;
// PNG output is kept when the image carries transparency (e.g. logo overlays).
// Any failure degrades to the original data URL, so a broken canvas never
// blocks the upload. Kill switch: globalThis.__duoweiCompressImageUpload = false.
const IMAGE_UPLOAD_STORE_BEFORE = "          store.updateElement(props.element.id, { content: result });";
const IMAGE_UPLOAD_STORE_AFTER = "          (globalThis.__duoweiCompressImage"
  + " ? globalThis.__duoweiCompressImage(result)"
  + " : Promise.resolve(result)).then(function (compressed) {\n"
  + "            store.updateElement(props.element.id, { content: compressed });\n"
  + "          }).catch(function () {\n"
  + "            store.updateElement(props.element.id, { content: result });\n"
  + "          });";
const IMAGE_UPLOAD_EMIT_BEFORE = "        emit2(\"update:value\", result);";
const IMAGE_UPLOAD_EMIT_AFTER = "        (globalThis.__duoweiCompressImage"
  + " ? globalThis.__duoweiCompressImage(result)"
  + " : Promise.resolve(result)).then(function (compressed) {\n"
  + "          emit2(\"update:value\", compressed);\n"
  + "        }).catch(function () {\n"
  + "          emit2(\"update:value\", result);\n"
  + "        });";
// Appended at the end of the module: a top-level IIFE registers the helper on
// globalThis when the bundle loads, long before any upload event can fire.
const IMAGE_COMPRESS_HELPER = "\n;(function () {\n"
  + "  \"use strict\";\n"
  + "  if (globalThis.__duoweiCompressImage) return;\n"
  + "  globalThis.__duoweiCompressImage = function (dataUrl) {\n"
  + "    if (globalThis.__duoweiCompressImageUpload === false) return Promise.resolve(dataUrl);\n"
  + "    if (typeof dataUrl !== \"string\" || dataUrl.slice(0, 5) !== \"data:\") return Promise.resolve(dataUrl);\n"
  + "    var commaIndex = dataUrl.indexOf(\",\");\n"
  + "    if (commaIndex < 0) return Promise.resolve(dataUrl);\n"
  + "    var mime = dataUrl.slice(5, commaIndex).split(\";\")[0];\n"
  + "    if (mime !== \"image/png\" && mime !== \"image/jpeg\" && mime !== \"image/webp\") return Promise.resolve(dataUrl);\n"
  + "    return new Promise(function (resolve) {\n"
  + "      var img = new Image();\n"
  + "      img.onload = function () {\n"
  + "        try {\n"
  + "          var naturalWidth = img.naturalWidth || 0;\n"
  + "          var naturalHeight = img.naturalHeight || 0;\n"
  + "          if (!naturalWidth || !naturalHeight) return resolve(dataUrl);\n"
  + "          var maxEdge = 1600;\n"
  + "          var scale = Math.min(1, maxEdge / Math.max(naturalWidth, naturalHeight));\n"
  + "          if (scale >= 1) return resolve(dataUrl);\n"
  + "          var w = Math.max(1, Math.round(naturalWidth * scale));\n"
  + "          var h = Math.max(1, Math.round(naturalHeight * scale));\n"
  + "          var canvas = document.createElement(\"canvas\");\n"
  + "          canvas.width = w;\n"
  + "          canvas.height = h;\n"
  + "          var ctx = canvas.getContext(\"2d\");\n"
  + "          if (!ctx) return resolve(dataUrl);\n"
  + "          ctx.drawImage(img, 0, 0, w, h);\n"
  + "          var hasAlpha = true;\n"
  + "          try {\n"
  + "            var data = ctx.getImageData(0, 0, w, h).data;\n"
  + "            hasAlpha = false;\n"
  + "            for (var i = 3; i < data.length; i += 4) {\n"
  + "              if (data[i] < 250) { hasAlpha = true; break; }\n"
  + "            }\n"
  + "          } catch (e) { hasAlpha = true; }\n"
  + "          var out = hasAlpha ? canvas.toDataURL(\"image/png\") : canvas.toDataURL(\"image/jpeg\", 0.85);\n"
  + "          resolve(out.length < dataUrl.length ? out : dataUrl);\n"
  + "        } catch (e) { resolve(dataUrl); }\n"
  + "      };\n"
  + "      img.onerror = function () { resolve(dataUrl); };\n"
  + "      img.src = dataUrl;\n"
  + "    });\n"
  + "  };\n"
  + "})();\n";

function patchImageUploadCompression(source) {
  if (source.split(IMAGE_UPLOAD_STORE_BEFORE).length !== 2) {
    throw new Error("Designer image upload store changed; review the image compression patch.");
  }
  if (source.split(IMAGE_UPLOAD_EMIT_BEFORE).length !== 2) {
    throw new Error("Designer image upload emit changed; review the image compression patch.");
  }
  return source
    .replace(IMAGE_UPLOAD_STORE_BEFORE, () => IMAGE_UPLOAD_STORE_AFTER)
    .replace(IMAGE_UPLOAD_EMIT_BEFORE, () => IMAGE_UPLOAD_EMIT_AFTER)
    + IMAGE_COMPRESS_HELPER;
}

module.exports = function designerTableLoader(source) {
  source = patchTableCellInlineEditor(source);
  source = patchCanvasPasteMenu(source);
  source = patchStitchedImageFailure(source);
  source = patchCanvasResizeScaling(source);
  source = patchImageUploadCompression(source);
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
