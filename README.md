# ComfyUI-LoadImageMulti

Load 1 to 8 images in one node.

- Starts with one image and one output.
- **+ Add image** adds another slot (up to 8) and another output.
- **Remove image N** removes a slot. Later images shift up and keep their
  connections.
- Each image has its own enable checkbox, Upload button and preview.
- A disabled image outputs nothing: nodes wired to it are skipped (uses
  ComfyUI's `ExecutionBlocker`).
- Stock ComfyUI colours (no custom branding).
- Outputs: `image_1` ... `image_N`.

## Install

Copy this folder into `ComfyUI/custom_nodes/` and restart ComfyUI, then refresh
the browser (Ctrl+F5) so the frontend script loads:

    cd ComfyUI\custom_nodes
    git clone https://github.com/PhillLittlewood/ComfyUI-LoadImageMulti

The node appears as **Load Image (Multi)** under the `image` category.

No extra Python dependencies are needed.
