"""ComfyUI-LoadImageMulti - load 1 to 8 images in a single node."""

from .node_load_image_multi import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

# Folder served to the browser; holds the per-image upload buttons and previews.
WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
