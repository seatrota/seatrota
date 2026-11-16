# Patch queue

`patches/NNN-*.md` documents each seam patched in upstream core files. There are none yet.

When a seam exists:

- `patches/NNN-short-name.md` explains which upstream file changed and why the seam is needed.
- `patches/NNN-short-name.patch` (or `.diff`) is the queue entry `scripts/upstream-sync.sh` re-applies after an upstream diff.

Markdown notes are documentation. Only `.patch` and `.diff` files are applied. Number prefixes keep a stable order.
