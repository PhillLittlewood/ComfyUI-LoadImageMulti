"""Load Image (Multi) - load 1 to 8 images in one node.

The node starts with one image and one output. The frontend script
(web/load_image_4.js) adds a "+ Add image" button (up to MAX_SLOTS) and a
"Remove image N" button on each slot, and grows/shrinks the outputs to match.

Each slot has an enable checkbox, an Upload button and a preview. Outputs are
image_1 ... image_N. A disabled slot outputs nothing: its output is an
ExecutionBlocker, so any node wired to it is silently skipped.

All MAX_SLOTS slots are declared here so the backend accepts every input; the
hidden `count` widget says how many are actually in use.
"""

import hashlib
import os

import numpy as np
import torch
from PIL import Image, ImageOps, ImageSequence

import folder_paths
import node_helpers

try:
    from comfy_execution.graph_utils import ExecutionBlocker
except Exception:  # very old ComfyUI without ExecutionBlocker
    ExecutionBlocker = None

MAX_SLOTS = 8

# 16-bit PIL modes that need rescaling to 8-bit range.
_I16_MODES = {"I;16", "I;16L", "I;16B", "I;16N"}


def _list_input_images():
    """Walk input/ recursively so subfolders appear in the dropdown."""
    input_dir = folder_paths.get_input_directory()
    files = []
    if os.path.isdir(input_dir):
        for root, _dirs, fnames in os.walk(input_dir):
            rel_root = os.path.relpath(root, input_dir)
            for fname in fnames:
                rel = fname if rel_root == "." else os.path.join(rel_root, fname)
                files.append(rel.replace("\\", "/"))
    files = folder_paths.filter_files_content_types(files, ["image"])
    return sorted(files)


def _tensor_dtype():
    try:
        import comfy.model_management as mm
        return mm.intermediate_dtype()
    except Exception:
        return torch.float32


def _placeholder(dtype):
    return torch.zeros((1, 64, 64, 3), dtype=dtype)


def _load_one(image_name, dtype):
    """Load an image file -> IMAGE tensor [B, H, W, 3]."""
    image_path = folder_paths.get_annotated_filepath(image_name)
    img = node_helpers.pillow(Image.open, image_path)

    frames = []
    size = None

    for frame in ImageSequence.Iterator(img):
        frame = node_helpers.pillow(ImageOps.exif_transpose, frame)
        if frame.mode == "I":
            frame = frame.point(lambda px: px * (1 / 255))
        elif frame.mode in _I16_MODES:
            frame = frame.convert("I").point(lambda px: px * (1 / 257))
        rgb = frame.convert("RGB")

        if size is None:
            size = rgb.size
        if rgb.size != size:
            continue  # skip frames whose size differs from the first

        arr = np.array(rgb).astype(np.float32) / 255.0
        frames.append(torch.from_numpy(arr)[None,].to(dtype=dtype))

        if img.format == "MPO":
            break

    if not frames:
        return _placeholder(dtype)
    return torch.cat(frames, dim=0) if len(frames) > 1 else frames[0]


class LoadImage4:
    DESCRIPTION = (
        "Load 1 to 8 images in one node. Use + Add image to add more and "
        "Remove image N to remove one. Each image has its own enable "
        "checkbox, Upload button and preview. A disabled image outputs "
        "nothing, so nodes connected to it are skipped."
    )

    @classmethod
    def INPUT_TYPES(cls):
        files = _list_input_images()
        required = {
            # Managed by the frontend (hidden widget): how many slots are used.
            "count": ("INT", {
                "default": 1, "min": 1, "max": MAX_SLOTS,
                "tooltip": "Number of images in use. Managed by the + / Remove buttons.",
            }),
        }
        for i in range(1, MAX_SLOTS + 1):
            required[f"enable_{i}"] = ("BOOLEAN", {
                "default": True,
                "tooltip": f"Enable image {i}. When off, image {i} outputs nothing.",
            })
            # No "image_upload" flag on purpose: web/load_image_4.js adds a
            # separate Upload button and preview for every slot.
            required[f"image_{i}"] = (files, {
                "tooltip": f"Image {i}. Pick a file from the dropdown or use the Upload button below it.",
            })
        return {"required": required}

    CATEGORY = "image"
    RETURN_TYPES = ("IMAGE",) * MAX_SLOTS
    RETURN_NAMES = tuple(f"image_{i}" for i in range(1, MAX_SLOTS + 1))
    FUNCTION = "load_images"

    @staticmethod
    def _active(kwargs):
        try:
            count = int(kwargs.get("count", 1))
        except (TypeError, ValueError):
            count = 1
        return max(1, min(MAX_SLOTS, count))

    def load_images(self, **kwargs):
        dtype = _tensor_dtype()
        count = self._active(kwargs)
        results = []
        for i in range(1, MAX_SLOTS + 1):
            enabled = i <= count and bool(kwargs.get(f"enable_{i}", False))
            name = kwargs.get(f"image_{i}")
            if enabled and name:
                results.append(_load_one(name, dtype))
            elif ExecutionBlocker is not None:
                # Output nothing: downstream nodes wired to this slot are
                # skipped silently.
                results.append(ExecutionBlocker(None))
            else:
                results.append(_placeholder(dtype))
        return tuple(results)

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        m = hashlib.sha256()
        count = cls._active(kwargs)
        m.update(f"count:{count}".encode("utf-8"))
        for i in range(1, count + 1):
            enabled = bool(kwargs.get(f"enable_{i}", False))
            m.update(f"{i}:{enabled}".encode("utf-8"))
            name = kwargs.get(f"image_{i}")
            if enabled and name:
                m.update(name.encode("utf-8"))
                try:
                    path = folder_paths.get_annotated_filepath(name)
                    with open(path, "rb") as f:
                        m.update(f.read())
                except Exception:
                    pass
        return m.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        # Only slots in use AND enabled need a valid file.
        count = cls._active(kwargs)
        for i in range(1, count + 1):
            if not kwargs.get(f"enable_{i}", False):
                continue
            name = kwargs.get(f"image_{i}")
            if not name or not folder_paths.exists_annotated_filepath(name):
                return f"Invalid image file for image_{i}: {name}"
        return True


NODE_CLASS_MAPPINGS = {"LoadImage4": LoadImage4}
NODE_DISPLAY_NAME_MAPPINGS = {"LoadImage4": "Load Image (Multi)"}
