// Load Image (Multi) - frontend.
// Starts with one image/one output. "+ Add image" adds slots (max 8),
// "Remove image N" removes one. Each slot has its own Upload button and
// preview. Default ComfyUI/LiteGraph colours only.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const MAX_SLOTS = 8;
const PREVIEW_HEIGHT = 130;

function splitName(value) {
  const v = String(value || "").replace(/\\/g, "/");
  const i = v.lastIndexOf("/");
  return i < 0
    ? { filename: v, subfolder: "" }
    : { filename: v.slice(i + 1), subfolder: v.slice(0, i) };
}

function viewURL(value) {
  const { filename, subfolder } = splitName(value);
  const params = new URLSearchParams({
    filename,
    type: "input",
    subfolder,
    rand: String(Math.random()),
  });
  return api.apiURL("/view?" + params.toString());
}

async function uploadFile(file) {
  const body = new FormData();
  body.append("image", file);
  body.append("type", "input");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body });
  if (resp.status !== 200) {
    throw new Error(`${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

// Hide/show a widget without removing it (so its value is still saved).
function setHidden(widget, hidden) {
  if (!widget) return;
  if (hidden) {
    if (widget.__l4Hidden) return;
    widget.__l4Hidden = true;
    widget.__l4Type = widget.type;
    widget.__l4OwnCompute = Object.prototype.hasOwnProperty.call(widget, "computeSize");
    widget.__l4Compute = widget.computeSize;
    widget.computeSize = () => [0, -4];
    widget.type = "converted-widget";
    try { widget.hidden = true; } catch (e) { /* read-only in some versions */ }
  } else {
    if (!widget.__l4Hidden) return;
    widget.__l4Hidden = false;
    widget.type = widget.__l4Type;
    if (widget.__l4OwnCompute) widget.computeSize = widget.__l4Compute;
    else delete widget.computeSize;
    try { widget.hidden = false; } catch (e) { /* read-only in some versions */ }
  }
}

function noSerialize(widget) {
  widget.serialize = false;
  widget.options = widget.options || {};
  widget.options.serialize = false;
}

function setupNode(node) {
  const countWidget = node.widgets.find((w) => w.name === "count");
  if (!countWidget) return;

  const slots = [];

  // ---- build per-slot widgets -------------------------------------------
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const enable = node.widgets.find((w) => w.name === `enable_${i}`);
    const combo = node.widgets.find((w) => w.name === `image_${i}`);
    if (!enable || !combo) continue;

    const slot = { i, enable, combo, img: null, shown: null };

    slot.refresh = () => {
      const value = combo.value;
      if (!value) {
        slot.img = null;
        slot.shown = null;
        node.setDirtyCanvas(true, true);
        return;
      }
      slot.shown = value;
      const img = new Image();
      img.onload = () => {
        if (slot.shown === value) {
          slot.img = img;
          node.setDirtyCanvas(true, true);
        }
      };
      img.onerror = () => {
        if (slot.shown === value) {
          slot.img = null;
          node.setDirtyCanvas(true, true);
        }
      };
      img.src = viewURL(value);
    };

    // Preview updates whenever the dropdown changes.
    const origCallback = combo.callback;
    combo.callback = function () {
      const r = origCallback ? origCallback.apply(this, arguments) : undefined;
      slot.refresh();
      return r;
    };

    // Upload button.
    slot.upload = node.addWidget("button", `Upload image ${i}`, null, () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff";
      input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          const name = await uploadFile(file);
          if (Array.isArray(combo.options.values) && !combo.options.values.includes(name)) {
            combo.options.values.push(name);
          }
          combo.value = name;
          if (combo.callback) combo.callback(name);
          node.setDirtyCanvas(true, true);
        } catch (err) {
          console.error("[LoadImage4] upload failed", err);
          alert(`Upload failed: ${err}`);
        }
      };
      input.click();
    });
    noSerialize(slot.upload);

    // Remove button.
    slot.remove = node.addWidget("button", `Remove image ${i}`, null, () => removeSlot(i));
    noSerialize(slot.remove);

    // Preview (canvas-drawn, default colours).
    slot.preview = {
      name: `preview_${i}`,
      type: "loadimage4_preview",
      value: "",
      options: { serialize: false },
      serialize: false,
      computeSize(width) {
        return [Math.min(width || 0, 200), PREVIEW_HEIGHT];
      },
      draw(ctx, drawNode, _width, y) {
        if (slot.preview.__l4Hidden) return;
        const LG = globalThis.LiteGraph || {};
        const margin = 15;
        const nodeWidth = (drawNode && drawNode.size && drawNode.size[0]) || _width;
        const x = margin;
        const w = Math.max(20, nodeWidth - margin * 2);
        const h = PREVIEW_HEIGHT - 8;
        const on = enable.value !== false;

        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        ctx.fillStyle = LG.WIDGET_BGCOLOR || "#222";
        ctx.fillRect(x, y, w, h);

        if (slot.img && slot.img.naturalWidth) {
          const scale = Math.min(w / slot.img.naturalWidth, h / slot.img.naturalHeight);
          const dw = slot.img.naturalWidth * scale;
          const dh = slot.img.naturalHeight * scale;
          ctx.globalAlpha = on ? 1 : 0.3;
          ctx.drawImage(slot.img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = LG.WIDGET_SECONDARY_TEXT_COLOR || "#999";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("No image", x + w / 2, y + h / 2 + 4);
        }

        if (!on) {
          ctx.fillStyle = LG.WIDGET_SECONDARY_TEXT_COLOR || "#999";
          ctx.font = "12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("Disabled", x + w / 2, y + h - 8);
        }
        ctx.restore();
      },
    };
    node.addCustomWidget(slot.preview);

    slots.push(slot);
  }

  // "+ Add image" button (always last).
  const addButton = node.addWidget("button", "+ Add image", null, () => addSlot());
  noSerialize(addButton);

  // Keep widgets grouped: count, then each slot together, then Add button.
  const ordered = [countWidget];
  for (const s of slots) ordered.push(s.enable, s.combo, s.upload, s.remove, s.preview);
  ordered.push(addButton);
  const others = node.widgets.filter((w) => !ordered.includes(w));
  node.widgets = [...ordered, ...others];

  // ---- helpers ------------------------------------------------------------
  const getCount = () => {
    const n = Math.round(Number(countWidget.value) || 1);
    return Math.min(MAX_SLOTS, Math.max(1, n));
  };

  const renameOutputs = () => {
    (node.outputs || []).forEach((o, idx) => {
      o.name = `image_${idx + 1}`;
      o.localized_name = o.name;
    });
  };

  // Make the number of outputs equal to `n` (only used when out of sync,
  // e.g. on creation; add/remove handle links themselves).
  const syncOutputs = (n) => {
    node.outputs = node.outputs || [];
    while (node.outputs.length > n) node.removeOutput(node.outputs.length - 1);
    while (node.outputs.length < n) node.addOutput(`image_${node.outputs.length + 1}`, "IMAGE");
    renameOutputs();
  };

  const applyLayout = () => {
    const n = getCount();
    setHidden(countWidget, true);
    for (const s of slots) {
      const visible = s.i <= n;
      setHidden(s.enable, !visible);
      setHidden(s.combo, !visible);
      setHidden(s.upload, !visible);
      setHidden(s.remove, !(visible && n > 1));
      setHidden(s.preview, !visible);
    }
    setHidden(addButton, n >= MAX_SLOTS);
    const size = node.computeSize();
    node.setSize([Math.max(node.size[0], 320), size[1]]);
    node.setDirtyCanvas(true, true);
  };

  const refreshAll = () => slots.forEach((s) => s.refresh());

  function addSlot() {
    const n = getCount();
    if (n >= MAX_SLOTS) return;
    node.addOutput(`image_${n + 1}`, "IMAGE");
    const s = slots[n];
    s.enable.value = true;
    const values = s.combo.options && s.combo.options.values;
    if (Array.isArray(values) && values.length) s.combo.value = values[0];
    countWidget.value = n + 1;
    renameOutputs();
    applyLayout();
    s.refresh();
  }

  function removeSlot(k) {
    const n = getCount();
    if (n <= 1 || k < 1 || k > n) return;
    // Shift later slots' settings down so each image keeps its own output
    // (removeOutput re-indexes the links of the outputs after it).
    for (let j = k; j < n; j++) {
      slots[j - 1].enable.value = slots[j].enable.value;
      slots[j - 1].combo.value = slots[j].combo.value;
    }
    node.removeOutput(k - 1);
    countWidget.value = n - 1;
    renameOutputs();
    applyLayout();
    refreshAll();
  }

  // Restore layout when a saved workflow is loaded.
  const origConfigure = node.onConfigure;
  node.onConfigure = function () {
    const r = origConfigure ? origConfigure.apply(this, arguments) : undefined;
    syncOutputs(getCount());
    applyLayout();
    refreshAll();
    return r;
  };

  // Initial state: one image, one output.
  syncOutputs(getCount());
  applyLayout();
  refreshAll();
}

app.registerExtension({
  name: "LoadImage4",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "LoadImage4") return;
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated ? origCreated.apply(this, arguments) : undefined;
      setupNode(this);
      return r;
    };
  },
});
