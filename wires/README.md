# wires/ — quick mockups for Claude

Drop sketches here so Claude can **see** your intended layout instead of parsing a
text description. Claude reads images directly, so anything that produces a PNG
works — this folder just standardises where they live and how they're named.

## Fastest loop: Excalidraw in VSCode

1. Install the **Excalidraw** extension (`pomdtr.excalidraw-editor`).
2. New File → name it `something.excalidraw.png` (the **`.png`** matters — see below).
   - Or duplicate [`_template.excalidraw`](_template.excalidraw) and "Save As" a
     `.excalidraw.png`.
3. Draw boxes / labels / arrows with the mouse, hit **Save**.
4. Tell Claude: *"look at `wires/limits-modal.excalidraw.png`"*.

### Why the `.excalidraw.png` extension

A file named `*.excalidraw.png` is **both** an editable Excalidraw canvas *and* a
valid PNG image. So you keep editing the same file, and Claude can `Read` it as an
image with no export step. (`*.excalidraw` alone is JSON — Claude can read it, but
can't *see* the rendered drawing. `*.excalidraw.svg` also works as an image.)

## No-setup fallback

Any screenshot works — MS Paint, Snipping Tool, a phone photo of paper. Sketch it,
then paste/drag the image straight into the Claude chat, or save it here.

## Tips

- Rough beats polished: boxes + text labels + an arrow or two convey layout intent
  fine. Don't pixel-push — you draw crude wires 10× faster and Claude infers the
  rest.
- Name by feature/view: `selection-badges.excalidraw.png`, `tempo-tile.excalidraw.png`.
- **Throwaway** sketches → put them in `wires/scratch/` (git-ignored). Wires worth
  keeping as design history → commit them in `wires/` directly.
