window.__ModuleLoader__.load({
  id: '@local/model-picker-resizer',
  factory() {
    const SIZE_KEY = 'model-picker-resizer.size'
    const POS_KEY = 'model-picker-resizer.pos'
    const CLS = 'pmr-model-menu'
    const HANDLE_CLS = 'pmr-resize-handle'
    const DEFAULTS = { w: 520, h: 620 }
    const MIN = { w: 280, h: 340 }
    // The model picker's MenuSurface is portaled to body and carries BOTH
    // --dsh-model-anchor and --dsh-menu-anchor inline. Other MenuSurfaces
    // (slash commands, context menus) only carry --dsh-menu-anchor, so the
    // combination pins this enhancement to the model picker alone.
    const PANEL_SELECTOR = 'body > div[style*="--dsh-model-anchor"][style*="--dsh-menu-anchor"]'
    // Elements that must keep their own pointer behaviour (clicks, text
    // selection, scrolling) instead of starting a panel move.
    const INTERACTIVE = 'button, input, textarea, select, a, label, [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="searchbox"], [role="button"], [role="slider"]'

    function clamp(value, axis) {
      const maxW = Math.max(MIN.w, Math.min(1400, window.innerWidth - 40))
      const maxH = Math.max(MIN.h, Math.min(1200, window.innerHeight - 40))
      const max = axis === 'w' ? maxW : maxH
      return Math.max(MIN[axis], Math.min(max, Math.round(value)))
    }

    function loadSize() {
      try {
        const raw = window.localStorage.getItem(SIZE_KEY)
        if (raw) {
          const v = JSON.parse(raw)
          if (Number.isFinite(v.w) && Number.isFinite(v.h)) {
            return { w: clamp(v.w, 'w'), h: clamp(v.h, 'h') }
          }
        }
      } catch { /* corrupt or unavailable storage */ }
      return { ...DEFAULTS }
    }

    function saveSize(w, h) {
      try { window.localStorage.setItem(SIZE_KEY, JSON.stringify({ w, h })) } catch { /* ignore */ }
    }

    function loadPos() {
      try {
        const raw = window.localStorage.getItem(POS_KEY)
        if (raw) {
          const v = JSON.parse(raw)
          if (Number.isFinite(v.x) && Number.isFinite(v.y)) return { x: v.x, y: v.y }
        }
      } catch { /* ignore */ }
      return null
    }

    function savePos(x, y) {
      try { window.localStorage.setItem(POS_KEY, JSON.stringify({ x, y })) } catch { /* ignore */ }
    }

    // Keep at least a 60px strip of the panel reachable inside the viewport,
    // so a dragged panel can never be lost off-screen.
    function clampPos(x, y, w, h) {
      return {
        x: Math.max(60 - w, Math.min(Math.round(x), window.innerWidth - 60)),
        y: Math.max(60 - h, Math.min(Math.round(y), window.innerHeight - 60)),
      }
    }

    function applySize(panel, w, h) {
      const s = panel.style
      s.setProperty('width', `${w}px`, 'important')
      s.setProperty('height', `${h}px`, 'important')
      s.setProperty('max-width', 'none', 'important')
      s.setProperty('max-height', 'none', 'important')
      s.setProperty('min-width', `${w}px`, 'important')
      s.setProperty('overflow', 'hidden', 'important')
    }

    // Freeze the panel at a fixed on-screen position. The base CSS anchors
    // right:anchor(right) (right edge pinned to the trigger) with left:12px;
    // a fixed width over-constrains that. Pinning left/top and releasing the
    // insets turns it into a plain absolutely-sized box whose bottom-right
    // corner follows width/height — which is what makes the drag handle track
    // the pointer instead of expanding leftward under a fixed right edge.
    function pin(panel, left, top) {
      const s = panel.style
      s.setProperty('left', `${Math.round(left)}px`, 'important')
      s.setProperty('top', `${Math.round(top)}px`, 'important')
      s.setProperty('right', 'auto', 'important')
      s.setProperty('bottom', 'auto', 'important')
    }

    function makeHandle(panel) {
      const handle = document.createElement('div')
      handle.className = HANDLE_CLS
      handle.setAttribute('aria-hidden', 'true')
      handle.title = '拖动调整模型面板大小'
      handle.style.cssText = [
        'position:absolute', 'right:0', 'bottom:0', 'width:22px', 'height:22px',
        'cursor:nwse-resize', 'z-index:1', 'touch-action:none', 'user-select:none',
        'display:flex', 'align-items:flex-end', 'justify-content:flex-end',
        'padding:0 3px 2px 0', 'box-sizing:border-box',
        'color:var(--dsw-alias-label-caption, currentColor)', 'opacity:.65',
        'line-height:1', 'font-size:14px',
      ].join(';')
      handle.textContent = '\u25E2' // ◢

      handle.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        const rect = panel.getBoundingClientRect()
        // Re-freeze at the real rendered position so resizing from a
        // not-yet-settled layout still tracks the pointer correctly.
        pin(panel, rect.left, rect.top)
        const start = { x: event.clientX, y: event.clientY, w: rect.width, h: rect.height, left: rect.left, top: rect.top }
        try { handle.setPointerCapture(event.pointerId) } catch { /* ignore */ }

        const move = (e) => {
          // left/top are pinned; limit growth to the space actually left on
          // screen so the bottom-right handle never leaves the viewport.
          const maxW = window.innerWidth - start.left - 4
          const maxH = window.innerHeight - start.top - 4
          const w = Math.min(clamp(start.w + (e.clientX - start.x), 'w'), Math.max(MIN.w, maxW))
          const h = Math.min(clamp(start.h + (e.clientY - start.y), 'h'), Math.max(MIN.h, maxH))
          applySize(panel, w, h)
        }
        const end = () => {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', end)
          document.removeEventListener('pointercancel', end)
          const final = panel.getBoundingClientRect()
          saveSize(final.width, final.height)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', end)
        document.addEventListener('pointercancel', end)
      }, true)
      return handle
    }

    // Dragging any non-interactive ("blank") part of the panel moves it.
    // Interactive descendants keep their own behaviour; the resize handle is
    // explicitly excluded so a resize never also moves the panel.
    function bindMover(panel) {
      const onDown = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        const t = event.target
        if (t instanceof Element && (t.closest(`.${HANDLE_CLS}`) || t.closest(INTERACTIVE))) return
        const rect = panel.getBoundingClientRect()
        const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
        try { panel.setPointerCapture(event.pointerId) } catch { /* ignore */ }
        event.preventDefault()
        panel.style.setProperty('cursor', 'move', 'important')

        const move = (e) => {
          const p = clampPos(start.left + (e.clientX - start.x), start.top + (e.clientY - start.y), rect.width, rect.height)
          pin(panel, p.x, p.y)
        }
        const end = () => {
          document.removeEventListener('pointermove', move)
          document.removeEventListener('pointerup', end)
          document.removeEventListener('pointercancel', end)
          panel.style.removeProperty('cursor')
          const r = panel.getBoundingClientRect()
          savePos(r.left, r.top)
        }
        document.addEventListener('pointermove', move)
        document.addEventListener('pointerup', end)
        document.addEventListener('pointercancel', end)
      }
      panel.addEventListener('pointerdown', onDown, true)
      return () => panel.removeEventListener('pointerdown', onDown, true)
    }

    function enhance(panel, seen, tracked) {
      if (!panel || seen.has(panel) || panel.classList.contains(CLS)) return
      seen.add(panel)
      panel.classList.add(CLS)
      // Capture the anchor-placed natural position first, then pin it so the
      // enlarged fixed size grows from where the picker actually opened
      // instead of snapping to the viewport's top-left corner. A previously
      // dragged position wins; both are clamped so the panel stays reachable.
      const natural = panel.getBoundingClientRect()
      const size = loadSize()
      const saved = loadPos()
      const p = clampPos(saved ? saved.x : natural.left, saved ? saved.y : natural.top, size.w, size.h)
      pin(panel, p.x, p.y)
      applySize(panel, size.w, size.h)
      panel.appendChild(makeHandle(panel))
      tracked.push({ panel, unbind: bindMover(panel) })
    }

    return {
      apply(ctx) {
        ctx.effect(() => {
          const seen = new WeakSet()
          const tracked = []

          const style = document.createElement('style')
          style.setAttribute('data-pmr', '')
          style.textContent = `
            ${PANEL_SELECTOR} { box-sizing: border-box; }
            ${PANEL_SELECTOR} .${HANDLE_CLS}:hover { opacity: 1; color: var(--dsw-alias-state-business-primary, #4c8bf5); }
          `
          document.head.appendChild(style)

          const scan = () => {
            document.querySelectorAll(PANEL_SELECTOR).forEach((p) => enhance(p, seen, tracked))
          }
          scan()

          const observer = new MutationObserver(scan)
          observer.observe(document.body, { childList: true })

          return () => {
            observer.disconnect()
            style.remove()
            for (const item of tracked) item.unbind()
          }
        }, 'model-picker-resizer: panels')
      },
    }
  },
})
