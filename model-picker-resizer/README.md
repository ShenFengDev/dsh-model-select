# Model Picker Resizer

A DSH Client plugin that enlarges the conversation model picker, lets you
**drag its blank areas to move it**, and adds a bottom-right drag handle to
resize it. Size and position persist in `localStorage` under
`model-picker-resizer.size` and `model-picker-resizer.pos`.

- Default size: 520×620 px (original is about 288×360 px).
- Minimum size: 280×340 px; capped to fit the viewport.
- Drag blank panel areas (not search box, options, or the resize handle) to
  move it; the panel always keeps a reachable strip on screen.
- Works in the Desktop Electron app and the Web GUI (both share the same
  Client renderer).

Files: `index.js` (Host no-op), `client.js` (Client behavior),
`cordis.patch.yml`, `locale/*.json`, `icon.svg`.

## Install / update

```
plugin_manager install_bundle  F:\minecraft\mod coding\model-picker-resizer
plugin_manager remove_bundle   @local/model-picker-resizer
```

Reload the page / restart the app after install so the Client bundle is
picked up.
