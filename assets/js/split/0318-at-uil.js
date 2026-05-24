/*
 * UIL — static singleton: the Active Theory in-browser scene
 * editor / inspector. Builds a fixed-position DOM overlay
 * (`.UIL`) at z-index 1e5 with two panels (sidebar + global),
 * a tabbed view (Graph, Global, Performance, Memory), and a
 * giant CSS stylesheet appended once into <head>.
 *
 * Gate (when to NOT load):
 *   - Skips entirely unless `?editMode` query, OR a Dream-Platform
 *     local build with `?uil`, OR a local hydra detected non-mobile
 *     build with `?uil` or `hydra`.
 *   - In the no-load path, if a remote UILSocket session is
 *     present, stubs `sidebar`/`global` with a `null` titled
 *     UILPanel so remote-control code can still address them
 *     without crashing.
 *
 * Init pipeline (gated on `Hydra.ready` + `UILStorage.ready`):
 *   - `initContainer` — appends a fixed full-viewport `<UIL>`
 *     element to `<body>` with `contain: strict`, mouse disabled.
 *     (Children opt back in to pointer events.)
 *   - `initStyle` — injects the long CSS string as `#uil-style`.
 *     Owns the design tokens: Manrope font, neutral 0/10/20/30/40
 *     greys, blue `#1a6dea` accent, common form/input/range/
 *     scrollbar styling, toggle-switch checkbox styling, etc.
 *     `_style` is held so `addCSS(control, css)` can append per-
 *     control CSS exactly once (guarded by `control.styled`).
 *   - `initSidebar` — adds two UILPanels: 'sidebar' (right) and
 *     'global' (left, no toolbar). Builds a `UILTabs` with four
 *     tabs: Graph (playground), Global, Performance (UILPerformance),
 *     Memory (UILMemory).
 *   - `initGraph` — mounts `UILGraph.instance().element.div`
 *     inside the Graph tab (if sidebar exists).
 *
 * Public surface:
 *   - `ready()`               — waits for `loaded` flag.
 *   - `add(panel)`            — registers a panel as
 *     `self[panel.id]` and indexes it in `_ui` for `find`/`remove`.
 *   - `remove(id)`            — destroy + delete.
 *   - `find(id)`              — flat-walks `_ui` looking for the
 *     descendant with matching id.
 *   - `enableSorting(id, on)` — proxy to the panel's sorting API.
 *   - `addCSS(control, css)`  — append per-control CSS once.
 *   - `REORDER = 'uil_reorder'` — event name constant.
 */
Class(function UIL() {
  Inherit(this, Component);
  const self = this;
  let _style,
    $el,
    _ui = {};
  Hydra.ready(async (_) => {
    if (
      (await UILStorage.ready(),
      !Utils.query('editMode') &&
        !(
          Hydra.LOCAL &&
          window.Platform &&
          window.Platform.isDreamPlatform &&
          Utils.query('uil')
        ) &&
        (!Hydra.LOCAL ||
          Device.mobile ||
          window._BUILT_ ||
          (!Utils.query('uil') && !Device.detect('hydra'))))
    )
      return (function doNotLoad() {
        Hydra.LOCAL &&
          UILSocket.remoteUIL &&
          (self.sidebar = self.global =
            new UILPanel({
              title: 'null',
            }));
      })();
    !(async function init() {
      (function initContainer() {
        $el = $('UIL');
        $el
          .css({
            position: 'fixed',
            contain: 'strict',
            top: 0,
          })
          .size('100%', '100%')
          .mouseEnabled(false);
        document.body.insertAdjacentElement('beforeend', $el.div);
        $el.setZ(1e5);
      })();
      (function initStyle() {
        let initial =
            '\n.UIL {\n  /********** Range Input Styles **********/\n  /*Range Reset*/\n  /* Removes default focus */\n  /***** Chrome, Safari, Opera and Edge Chromium styles *****/\n  /* slider track */\n  /* slider thumb */\n  /******** Firefox styles ********/\n  /* slider track */\n  /* slider thumb */\n}\n.UIL {\n  --color-black: #000000;\n  --color-white: #ffffff;\n  --color-neutral-0: var(--color-black);\n  --color-neutral-10: #161616;\n  --color-neutral-20: #272727;\n  --color-neutral-30: #303030;\n  --color-neutral-40: #363636;\n  --color-neutral-70: #737373;\n  --color-neutral-80: #8b8c8a;\n  --color-neutral-90: #cccccc;\n  --color-neutral-100: var(--color-white);\n  --color-accent-50: #1a6dea;\n  --color-accent-60: #3787ff;\n  --color-accent-80: #79aeff;\n  --color-error-60: #e64040;\n  --color-error: var(--color-error-60);\n  --color-highlight: var(--color-accent-50);\n  --color-hightlight-light: var(--color-accent-60);\n  --color-highlight-transparent: rgba(26, 109, 234, 0.24);\n  --font-color-base: var(--color-white);\n  --font-color-highlight: var(--color-accent-80);\n  --color-action: var(--color-highlight);\n  --color-action--alt: var(--color-hightlight-light);\n  --color-action--contrast: var(--color-white);\n  --color-action--disabled: var(--color-neutral-70);\n  --color-icon-default: var(--color-neutral-70);\n  --color-divider-main: var(--color-neutral-40);\n  --panel-background-color: var(--color-neutral-10);\n  --font-primary: "Manrope", Helvetica Neue, Helvetica, sans-serif;\n  --font-secondary: var(--font-primary);\n  --font-tertiary: Courier New, Courier, Lucida Sans Typewriter,\n    Lucida Typewriter, monospace;\n  --font-size-base: 12px;\n  --font-family: var(--font-primary);\n  --label1: normal 400 10px/120% var(--font-primary);\n  --label2: normal 400 11px/130% var(--font-primary);\n  --label3: normal 400 12px/130% var(--font-primary);\n  --label3-semi: normal 600 11px/130% var(--font-primary);\n  --label3-bold: normal 700 11px/130% var(--font-primary);\n  --label4-medium: 500 12px/15px var(--font-primary);\n  --line-height: 1.3;\n  --border-radius: 8px;\n  --spacing: 10px;\n  --spacing-small: 8px;\n  --border-width: 1px;\n  --border: var(--border-width) solid var(--color-neutral-40);\n  --focus-outline-width: 1px;\n  --focus-outline-offset: 0;\n  --focus-outline: var(--focus-outline-width) solid var(--color-action);\n  --duration: 300ms;\n  --timing: ease-out;\n}\n.UIL *,\n.UIL :after,\n.UIL :before {\n  background-repeat: no-repeat;\n  box-sizing: inherit;\n}\n.UIL :after,\n.UIL :before {\n  text-decoration: inherit;\n  vertical-align: inherit;\n}\n.UIL hr {\n  color: inherit;\n  height: 0;\n  overflow: visible;\n}\n.UIL details,\n.UIL main {\n  display: block;\n}\n.UIL summary {\n  display: list-item;\n}\n.UIL small {\n  font-size: 80%;\n}\n.UIL ul,\n.UIL ol {\n  list-style: none;\n  padding-left: 0;\n}\n.UIL [hidden] {\n  display: none;\n}\n.UIL abbr[title] {\n  border-bottom: none;\n  text-decoration: underline;\n  -webkit-text-decoration: underline dotted;\n          text-decoration: underline dotted;\n}\n.UIL a {\n  background-color: transparent;\n}\n.UIL a:active,\n.UIL a:hover {\n  outline-width: 0;\n}\n.UIL code,\n.UIL kbd,\n.UIL pre,\n.UIL samp {\n  font-family: monospace, monospace;\n}\n.UIL pre {\n  font-size: 1em;\n}\n.UIL b,\n.UIL strong {\n  font-weight: bolder;\n}\n.UIL sub,\n.UIL sup {\n  font-size: 75%;\n  line-height: 0;\n  position: relative;\n  vertical-align: baseline;\n}\n.UIL sub {\n  bottom: -0.25em;\n}\n.UIL sup {\n  top: -0.5em;\n}\n.UIL table {\n  border-color: inherit;\n  text-indent: 0;\n}\n.UIL iframe {\n  border-style: none;\n}\n.UIL [type=number]::-webkit-inner-spin-button,\n.UIL [type=number]::-webkit-outer-spin-button {\n  height: var(--spacing);\n  position: absolute;\n  right: 0;\n  top: 50%;\n  -webkit-transform: translateY(-50%);\n          transform: translateY(-50%);\n}\n.UIL [type=search] {\n  -webkit-appearance: textfield;\n  outline-offset: -2px;\n}\n.UIL [type=search]::-webkit-search-decoration {\n  -webkit-appearance: none;\n}\n.UIL textarea {\n  overflow: auto;\n  resize: vertical;\n}\n.UIL optgroup {\n  font-weight: 700;\n}\n.UIL button {\n  overflow: visible;\n}\n.UIL button,\n.UIL select {\n  text-transform: none;\n}\n.UIL [role=button],\n.UIL [type=button],\n.UIL [type=reset],\n.UIL [type=submit],\n.UIL button {\n  cursor: pointer;\n}\n.UIL [type=button]::-moz-focus-inner,\n.UIL [type=reset]::-moz-focus-inner,\n.UIL [type=submit]::-moz-focus-inner,\n.UIL button::-moz-focus-inner {\n  border-style: none;\n  padding: 0;\n}\n.UIL [type=button]::-moz-focus-inner,\n.UIL [type=reset]::-moz-focus-inner,\n.UIL [type=submit]::-moz-focus-inner,\n.UIL button:-moz-focusring {\n  outline: 1px dotted ButtonText;\n}\n.UIL [type=reset],\n.UIL [type=submit],\n.UIL button,\n.UIL html [type=button] {\n  -webkit-appearance: button;\n}\n.UIL a:focus,\n.UIL button:focus,\n.UIL input:focus,\n.UIL select:focus,\n.UIL textarea:focus {\n  outline-width: 0;\n}\n.UIL select {\n  -moz-appearance: none;\n  -webkit-appearance: none;\n}\n.UIL select::-ms-expand {\n  display: none;\n}\n.UIL select::-ms-value {\n  color: currentColor;\n}\n.UIL legend {\n  border: 0;\n  color: inherit;\n  display: table;\n  max-width: 100%;\n  white-space: normal;\n}\n.UIL ::-webkit-file-upload-button {\n  -webkit-appearance: button;\n  color: inherit;\n  font: inherit;\n}\n.UIL [disabled] {\n  cursor: default;\n}\n.UIL img {\n  border-style: none;\n}\n.UIL progress {\n  vertical-align: baseline;\n}\n.UIL [aria-busy=true] {\n  cursor: progress;\n}\n.UIL [aria-controls] {\n  cursor: pointer;\n}\n.UIL [aria-disabled=true] {\n  cursor: default;\n}\n.UIL button,\n.UIL [type=button],\n.UIL [type=reset],\n.UIL [type=submit] {\n  -webkit-appearance: none;\n          appearance: none;\n  background-color: transparent;\n  border: var(--border);\n  border-color: var(--color-white);\n  border-radius: calc(var(--border-radius) * 1.5);\n  color: var(--color-action) --contrast;\n  cursor: pointer;\n  display: inline-block;\n  font: var(--label4-medium);\n  padding: calc(var(--spacing-small) * 1.5) calc(var(--spacing) * 2);\n  text-align: center;\n  text-decoration: none;\n  transition: background-color var(--duration) var(--timing);\n  -webkit-user-select: none;\n      -ms-user-select: none;\n          user-select: none;\n  vertical-align: middle;\n  white-space: nowrap;\n}\n.UIL button:hover,\n.UIL [type=button]:hover,\n.UIL [type=reset]:hover,\n.UIL [type=submit]:hover {\n  background-color: var(--color-action);\n  border-color: var(--color-action);\n}\n.UIL button:focus,\n.UIL [type=button]:focus,\n.UIL [type=reset]:focus,\n.UIL [type=submit]:focus {\n  outline: var(--focus-outline);\n  outline-offset: var(--focus-outline-offset);\n}\n.UIL button:disabled,\n.UIL [type=button]:disabled,\n.UIL [type=reset]:disabled,\n.UIL [type=submit]:disabled {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\n.UIL button.solid,\n.UIL [type=button].solid,\n.UIL [type=reset].solid,\n.UIL [type=submit].solid {\n  background-color: var(--color-action);\n  border-color: var(--color-action);\n}\n.UIL button.solid:hover,\n.UIL [type=button].solid:hover,\n.UIL [type=reset].solid:hover,\n.UIL [type=submit].solid:hover {\n  background-color: transparent;\n  border-color: var(--color-white);\n}\n.UIL button.small,\n.UIL [type=button].small,\n.UIL [type=reset].small,\n.UIL [type=submit].small {\n  border-radius: var(--border-radius);\n  font: var(--label1);\n  padding: calc(var(--spacing) / 2) var(--spacing);\n}\n.UIL {\n  --form-box-shadow: inset 0 --border-width 0.1875rem rgba(#000, 0.06);\n  --form-box-shadow-focus: var(--form-box-shadow),\n    0 0 0.3125rem var(--color-action);\n  --form-group-width: 256px;\n  --form-content-max-width: 180px;\n}\n.UIL fieldset {\n  background-color: transparent;\n  border: 0;\n  margin: 0;\n  padding: 0;\n}\n.UIL legend {\n  font-weight: 600;\n  margin-bottom: var(--spacing-small);\n  padding: 0;\n}\n.UIL .form-group {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: var(--spacing-small);\n  width: 100%;\n}\n.UIL .form-group > label,\n.UIL .form-group > .label {\n  word-wrap: break-word;\n  -webkit-hyphens: auto;\n      -ms-hyphens: auto;\n          hyphens: auto;\n  white-space: normal;\n  padding-left: 5px;\n  max-width: calc( (var(--form-group-width) - var(--form-content-max-width) - var(--spacing-small)) * 1.5 );\n}\n.UIL .form-group > *:last-child {\n  width: 100%;\n  max-width: var(--form-content-max-width);\n}\n.UIL .label,\n.UIL label {\n  display: block;\n  font: var(--label2);\n  margin-bottom: 0;\n}\n.UIL input,\n.UIL select,\n.UIL textarea {\n  display: block;\n  font-family: var(--font-family);\n}\n.UIL select {\n  background-color: transparent;\n  border: none;\n  padding-right: calc(var(--spacing) * 2);\n  margin: 0;\n}\n.UIL .select-wrapper {\n  width: 100%;\n}\n.UIL select,\n.UIL [type=color],\n.UIL [type=date],\n.UIL [type=datetime],\n.UIL [type=datetime-local],\n.UIL [type=email],\n.UIL [type=month],\n.UIL [type=number],\n.UIL [type=password],\n.UIL [type=search],\n.UIL [type=tel],\n.UIL [type=text]:not(.no-style),\n.UIL [type=time],\n.UIL [type=url],\n.UIL [type=week],\n.UIL input:not([type]),\n.UIL textarea {\n  -webkit-appearance: none;\n          appearance: none;\n  background-color: var(--color-black);\n  border: var(--border);\n  border-radius: var(--border-radius);\n  box-shadow: var(--form-box-shadow);\n  box-sizing: border-box;\n  color: var(--font-color-highlight);\n  font: var(--label2);\n  margin-bottom: 0;\n  padding: var(--spacing-small);\n  transition: border-color var(--duration) var(--timing);\n  width: 100%;\n  position: relative;\n}\n.UIL select:focus,\n.UIL [type=color]:focus,\n.UIL [type=date]:focus,\n.UIL [type=datetime]:focus,\n.UIL [type=datetime-local]:focus,\n.UIL [type=email]:focus,\n.UIL [type=month]:focus,\n.UIL [type=number]:focus,\n.UIL [type=password]:focus,\n.UIL [type=search]:focus,\n.UIL [type=tel]:focus,\n.UIL [type=text]:focus:not(.no-style),\n.UIL [type=time]:focus,\n.UIL [type=url]:focus,\n.UIL [type=week]:focus,\n.UIL input:not([type]):focus,\n.UIL textarea:focus {\n  box-shadow: var(--form-box-shadow-focus);\n}\n.UIL select:disabled,\n.UIL [type=color]:disabled,\n.UIL [type=date]:disabled,\n.UIL [type=datetime]:disabled,\n.UIL [type=datetime-local]:disabled,\n.UIL [type=email]:disabled,\n.UIL [type=month]:disabled,\n.UIL [type=number]:disabled,\n.UIL [type=password]:disabled,\n.UIL [type=search]:disabled,\n.UIL [type=tel]:disabled,\n.UIL [type=text]:disabled,\n.UIL [type=time]:disabled,\n.UIL [type=url]:disabled,\n.UIL [type=week]:disabled,\n.UIL input:not([type]):disabled,\n.UIL textarea:disabled {\n  cursor: not-allowed;\n}\n.UIL select:disabled:hover,\n.UIL [type=color]:disabled:hover,\n.UIL [type=date]:disabled:hover,\n.UIL [type=datetime]:disabled:hover,\n.UIL [type=datetime-local]:disabled:hover,\n.UIL [type=email]:disabled:hover,\n.UIL [type=month]:disabled:hover,\n.UIL [type=number]:disabled:hover,\n.UIL [type=password]:disabled:hover,\n.UIL [type=search]:disabled:hover,\n.UIL [type=tel]:disabled:hover,\n.UIL [type=text]:disabled:hover,\n.UIL [type=time]:disabled:hover,\n.UIL [type=url]:disabled:hover,\n.UIL [type=week]:disabled:hover,\n.UIL input:not([type]):disabled:hover,\n.UIL textarea:disabled:hover {\n  border: var(--border);\n}\n.UIL select::-webkit-input-placeholder, .UIL [type=color]::-webkit-input-placeholder, .UIL [type=date]::-webkit-input-placeholder, .UIL [type=datetime]::-webkit-input-placeholder, .UIL [type=datetime-local]::-webkit-input-placeholder, .UIL [type=email]::-webkit-input-placeholder, .UIL [type=month]::-webkit-input-placeholder, .UIL [type=number]::-webkit-input-placeholder, .UIL [type=password]::-webkit-input-placeholder, .UIL [type=search]::-webkit-input-placeholder, .UIL [type=tel]::-webkit-input-placeholder, .UIL [type=text]::-webkit-input-placeholder, .UIL [type=time]::-webkit-input-placeholder, .UIL [type=url]::-webkit-input-placeholder, .UIL [type=week]::-webkit-input-placeholder, .UIL input:not([type])::-webkit-input-placeholder, .UIL textarea::-webkit-input-placeholder {\n  color: var(--font-color-base);\n  opacity: 0.25;\n}\n.UIL select:-ms-input-placeholder, .UIL [type=color]:-ms-input-placeholder, .UIL [type=date]:-ms-input-placeholder, .UIL [type=datetime]:-ms-input-placeholder, .UIL [type=datetime-local]:-ms-input-placeholder, .UIL [type=email]:-ms-input-placeholder, .UIL [type=month]:-ms-input-placeholder, .UIL [type=number]:-ms-input-placeholder, .UIL [type=password]:-ms-input-placeholder, .UIL [type=search]:-ms-input-placeholder, .UIL [type=tel]:-ms-input-placeholder, .UIL [type=text]:-ms-input-placeholder, .UIL [type=time]:-ms-input-placeholder, .UIL [type=url]:-ms-input-placeholder, .UIL [type=week]:-ms-input-placeholder, .UIL input:not([type]):-ms-input-placeholder, .UIL textarea:-ms-input-placeholder {\n  color: var(--font-color-base);\n  opacity: 0.25;\n}\n.UIL select::-ms-input-placeholder, .UIL [type=color]::-ms-input-placeholder, .UIL [type=date]::-ms-input-placeholder, .UIL [type=datetime]::-ms-input-placeholder, .UIL [type=datetime-local]::-ms-input-placeholder, .UIL [type=email]::-ms-input-placeholder, .UIL [type=month]::-ms-input-placeholder, .UIL [type=number]::-ms-input-placeholder, .UIL [type=password]::-ms-input-placeholder, .UIL [type=search]::-ms-input-placeholder, .UIL [type=tel]::-ms-input-placeholder, .UIL [type=text]::-ms-input-placeholder, .UIL [type=time]::-ms-input-placeholder, .UIL [type=url]::-ms-input-placeholder, .UIL [type=week]::-ms-input-placeholder, .UIL input:not([type])::-ms-input-placeholder, .UIL textarea::-ms-input-placeholder {\n  color: var(--font-color-base);\n  opacity: 0.25;\n}\n.UIL select::placeholder,\n.UIL [type=color]::placeholder,\n.UIL [type=date]::placeholder,\n.UIL [type=datetime]::placeholder,\n.UIL [type=datetime-local]::placeholder,\n.UIL [type=email]::placeholder,\n.UIL [type=month]::placeholder,\n.UIL [type=number]::placeholder,\n.UIL [type=password]::placeholder,\n.UIL [type=search]::placeholder,\n.UIL [type=tel]::placeholder,\n.UIL [type=text]::placeholder,\n.UIL [type=time]::placeholder,\n.UIL [type=url]::placeholder,\n.UIL [type=week]::placeholder,\n.UIL input:not([type])::placeholder,\n.UIL textarea::placeholder {\n  color: var(--font-color-base);\n  opacity: 0.25;\n}\n.UIL [type=search] {\n  -webkit-appearance: textfield;\n}\n.UIL textarea {\n  resize: vertical;\n}\n.UIL [type=file] {\n  width: 100%;\n}\n.UIL select {\n  width: 100%;\n}\n.UIL input:focus-visible:not(.no-style),\n.UIL textarea:focus-visible,\n.UIL select:focus-visible {\n  outline: var(--focus-outline);\n  outline-offset: var(--focus-outline-offset);\n}\n.UIL input[type=checkbox]:not(.regular-checkbox),\n.UIL input[type=radio] {\n  height: 0;\n  width: 0;\n  visibility: visible;\n  margin: 0;\n}\n.UIL input[type=checkbox]:not(.regular-checkbox) + label,\n.UIL input[type=radio] + label {\n  cursor: pointer;\n  border: var(--border);\n  text-indent: -9999px;\n  width: 44px;\n  height: 28px;\n  background: var(--color-black);\n  display: block;\n  border-radius: 28px;\n  position: relative;\n}\n.UIL input[type=checkbox]:not(.regular-checkbox) + label:after,\n.UIL input[type=radio] + label:after {\n  content: "";\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  width: 12px;\n  height: 12px;\n  background-color: var(--color-action--disabled);\n  border-radius: 12px;\n  transition: 0.3s;\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):checked + label,\n.UIL input[type=radio]:checked + label {\n  background: var(--color-action);\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):checked + label:after,\n.UIL input[type=radio]:checked + label:after {\n  background-color: var(--color-white);\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):checked + label:after,\n.UIL input[type=radio]:checked + label:after {\n  left: calc(100% - 8px);\n  -webkit-transform: translateX(-100%);\n          transform: translateX(-100%);\n}\n.UIL input[type=checkbox]:not(.regular-checkbox) + label:active:after,\n.UIL input[type=radio] + label:active:after {\n  width: 16px;\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):focus-visible,\n.UIL input[type=radio]:focus-visible {\n  outline: none;\n  border: none;\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):focus-visible + label,\n.UIL input[type=checkbox]:not(.regular-checkbox):focus-visible + .label,\n.UIL input[type=radio]:focus-visible + label,\n.UIL input[type=radio]:focus-visible + .label {\n  border: var(--border);\n  border-color: var(--color-action);\n}\n.UIL input[type=checkbox]:not(.regular-checkbox):focus-visible:checked + label,\n.UIL input[type=checkbox]:not(.regular-checkbox):focus-visible:checked + .label,\n.UIL input[type=radio]:focus-visible:checked + label,\n.UIL input[type=radio]:focus-visible:checked + .label {\n  border: var(--border);\n  border-color: var(--color-white);\n}\n.UIL .checkbox-control {\n  display: flex;\n  gap: calc(var(--spacing-small) / 2);\n  align-items: center;\n  line-height: 1;\n}\n.UIL .regular-checkbox {\n  -webkit-appearance: none;\n          appearance: none;\n  background-color: var(--color-black);\n  margin: 0;\n  width: 20px;\n  height: 20px;\n  max-width: 20px;\n  min-width: 20px;\n  color: currentColor;\n  border: var(--border);\n  border-radius: calc(var(--border-radius) / 2);\n  -webkit-transform: translateY(-0.075em);\n          transform: translateY(-0.075em);\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\n.UIL .regular-checkbox:before {\n  border-radius: calc(var(--border-radius) / 4);\n  content: "";\n  width: calc(20px / 2);\n  height: calc(20px / 2);\n  -webkit-transform: scale(0);\n          transform: scale(0);\n  transition: 120ms -webkit-transform ease-in-out;\n  transition: 120ms transform ease-in-out;\n  transition: 120ms transform ease-in-out, 120ms -webkit-transform ease-in-out;\n  box-shadow: inset 1em 1em var(--color-action);\n}\n.UIL .regular-checkbox:checked::before {\n  -webkit-transform: scale(1);\n          transform: scale(1);\n}\n.UIL {\n  box-sizing: border-box;\n  scroll-behavior: smooth;\n}\n.UIL *,\n.UIL *::before,\n.UIL *::after {\n  box-sizing: inherit;\n}\n.UIL figure {\n  margin: 0;\n}\n.UIL img,\n.UIL picture {\n  display: block;\n  margin: 0;\n  max-width: 100%;\n}\n.UIL {\n  color: var(--font-color-base);\n  font-family: var(--font-family);\n  font-size: var(--font-size-base);\n  line-height: var(--line-height);\n  letter-spacing: 0.01em;\n}\n.UIL ::selection {\n  background-color: var(--color-action);\n  color: var(--color-action--contrast);\n}\n.UIL p {\n  margin: 0 0 var(--spacing-small);\n  overflow-wrap: break-word;\n  -webkit-hyphens: auto;\n      -ms-hyphens: auto;\n          hyphens: auto;\n}\n.UIL a {\n  -webkit-text-decoration-skip: ink;\n          text-decoration-skip-ink: auto;\n  transition: color var(--duration) var(--timing);\n}\n.UIL a:focus {\n  outline: var(--focus-outline);\n  outline-offset: var(--focus-outline-offset);\n}\n.UIL hr {\n  border-bottom: var(--border);\n  border-left: 0;\n  border-right: 0;\n  border-top: 0;\n  margin: var(--spacing) 0;\n}\n.UIL .color-selector {\n  background-color: var(--color-black);\n  border: var(--border);\n  border-radius: var(--border-radius);\n  box-shadow: var(--form-box-shadow);\n  color: var(--font-color-highlight);\n  font: var(--label2);\n  margin-bottom: 0;\n  padding: var(--spacing-small);\n  transition: border-color var(--duration) var(--timing);\n  width: 100%;\n  position: relative;\n  display: flex;\n  gap: var(--spacing-small);\n  align-items: center;\n}\n.UIL .color-selector:has(input:focus-visible) {\n  outline: var(--focus-outline);\n  outline-offset: var(--focus-outline-offset);\n}\n.UIL .color-selector .color-chip {\n  width: 20px;\n  height: 16px;\n  border-radius: calc(var(--border-radius) / 2);\n  border: var(--border);\n}\n.UIL .color-selector .color-text {\n  text-transform: uppercase;\n}\n.UIL .color-selector .hidden {\n  position: absolute;\n  left: 0;\n  opacity: 0;\n}\n.UIL {\n  --thumb-size: var(--spacing-small);\n  --thumb-radius: calc(var(--thumb-size) / 2);\n  --color-track: var(--color-black);\n  --track-height: calc(var(--thumb-size) / 2);\n}\n.UIL input[type=range] {\n  -webkit-appearance: none;\n  appearance: none;\n  background: transparent;\n  cursor: pointer;\n  width: 100%;\n}\n.UIL input[type=range]:focus {\n  outline: none;\n}\n.UIL input[type=range]::-webkit-slider-runnable-track {\n  background-color: var(--color-track);\n  border-radius: calc(var(--track-height) / 2);\n  height: var(--track-height);\n  border: var(--border);\n}\n.UIL input[type=range]::-webkit-slider-thumb {\n  -webkit-appearance: none;\n  /* Override default look */\n  appearance: none;\n  margin-top: -4px;\n  /* Centers thumb on the track */\n  /*custom styles*/\n  background-color: var(--color-action);\n  height: var(--thumb-size);\n  width: var(--thumb-size);\n  border-radius: var(--thumb-radius);\n}\n.UIL input[type=range]:focus::-webkit-slider-thumb {\n  border: var(--border);\n  outline: 1px solid var(--color-hightlight-light);\n  outline-offset: 0.125rem;\n}\n.UIL input[type=range]::-moz-range-track {\n  background-color: var(--color-track);\n  border-radius: calc(var(--track-height) / 2);\n  height: var(--track-height);\n  border: var(--border);\n}\n.UIL input[type=range]::-moz-range-thumb {\n  border: none;\n  /*Removes extra border that FF applies*/\n  border-radius: var(--thumb-radius);\n  /*Removes default border-radius that FF applies*/\n  /*custom styles*/\n  background-color: var(--color-action);\n  height: var(--thumb-size);\n  width: var(--thumb-size);\n}\n.UIL input[type=range]:focus::-moz-range-thumb {\n  border: var(--border);\n  outline: 1px solid var(--color-hightlight-light);\n  outline-offset: 0.125rem;\n}\n.UIL ::-webkit-scrollbar {\n  width: 2px;\n  height: 2px;\n}\n.UIL ::-webkit-scrollbar-track {\n  background: var(--color-neutral-10);\n}\n.UIL ::-webkit-scrollbar-thumb {\n  background: var(--color-highlight);\n}\n.UIL .sr-only,\n.UIL .visibility-hidden {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: -1px;\n  padding: 0;\n  overflow: hidden;\n  clip: rect(0, 0, 0, 0);\n  border: 0;\n}\n',
          style = document.head.appendChild(document.createElement('style'));
        style.type = 'text/css';
        style.id = 'uil-style';
        style.appendChild(document.createTextNode(initial));
        _style = style;
      })();
      (function initSidebar() {
        self.add(
          new UILPanel({
            title: 'sidebar',
          }),
        );
        self.add(
          new UILPanel({
            title: 'global',
            options: {
              side: 'left',
              hideToolbar: true,
            },
          }),
        );
        self.globalTabs = self.initClass(
          UILTabs,
          [
            {
              id: 'playground',
              label: 'Graph',
              content: null,
              active: true,
              disabled: false,
              hidden: false,
              draggable: false,
              hideToobar: true,
            },
            {
              id: 'global',
              label: 'Global',
              content: null,
              active: false,
              disabled: false,
              hidden: false,
              draggable: false,
            },
            {
              id: 'performance',
              label: 'Performance',
              content: UILPerformance,
              active: false,
              disabled: false,
              hidden: false,
              draggable: false,
            },
            {
              id: 'memory',
              label: 'Memory',
              content: UILMemory,
              active: false,
              disabled: false,
              hidden: false,
              draggable: false,
            },
          ],
          [self.global.element],
        );
      })();
      (function initGraph() {
        if (!self.sidebar) return;
        self.globalTabs.addGraph(UILGraph.instance().element.div);
      })();
    })();
    self.loaded = true;
  });
  this.ready = function () {
    return self.wait(self, 'loaded');
  };
  this.add = function (panel) {
    return ((_ui[panel.id] = panel), (self[panel.id] = panel), $el.add(panel), self);
  };
  this.remove = function (id) {
    let $panel = _ui[id];
    return (
      $panel.eliminate && $panel.eliminate(),
      $panel.destroy(),
      delete _ui[id],
      delete self[id],
      self
    );
  };
  this.find = function (id) {
    return Object.values(_ui).reduce((acc, el) => acc.concat(el.find(id)), []);
  };
  this.enableSorting = function (id, enable) {
    let el = self.find(id)[0];
    return (el && el.enableSorting && el.enableSorting(enable), self);
  };
  this.addCSS = function (control, style) {
    if (control.styled) return;
    let node = document.createTextNode(style);
    return (_style && _style.appendChild(node), (control.styled = true), self);
  };
  this.REORDER = 'uil_reorder';
}, 'static');
