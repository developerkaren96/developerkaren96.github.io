/*
 * Tagged-template factories + DOMTemplate base class.
 *
 *   const view = html`<div class="${styleMap({active: state.active})}">${val}</div>`;
 *   const styles = css`.active { color: ${theme.color}; }`;
 *
 * Both tags walk the (`strings`, `...values`) pair produced by the JS tagged-
 * template machinery and replace each interpolation site with a unique
 * `{{hydra-N}}` marker, returning a `TemplateHTML` / `TemplateCSS`. The
 * `config` map carries every captured value, keyed by marker — that mapping
 * is what `TemplateRoot.modifyMarkers` later consults to inline bindings,
 * event handlers, and primitives.
 *
 *   markerID is module-scoped: it grows monotonically across every template
 *   produced in the application's lifetime. Uniqueness across templates
 *   matters because nested templates flatten into a single string in
 *   `TemplateRoot.consolidate`, and duplicate markers would collide.
 *
 * DOMTemplate
 *   Lifecycle: extends Element, hosts the actual render output, owns hot
 *   reload in LOCAL mode. Subclasses provide `render(html)` returning a
 *   TemplateHTML and (optionally) `dynamicStyle(css)` returning a
 *   TemplateCSS. `update()` schedules a render via a shared
 *   `Render.Worker` so multiple update() calls in the same frame coalesce.
 *
 *   `setSourceData(data)` re-renders whenever `data` fires Events.UPDATE.
 *
 * Static helpers (post-init):
 *   parser              — shared `DOMParser` instance used by TemplateHTML.
 *   schedule(cb)        — enqueue a render onto the global worker queue.
 *   clearScheduled(cb)  — remove a queued render before it runs (used when
 *                         a follow-up update() supersedes a pending one).
 *   updateGlobalStyles  — hot-reload path: re-fetches the compiled scss and
 *                         injects it into `<head>` as a debounced single
 *                         operation. UILSocket fires JS_FILE events on
 *                         change in LOCAL builds.
 */
!(function () {
  let markerID = 0;
  function makeMarker() { return `{{hydra-${markerID++}}}`; }

  // Tagged-template factory: walks (strings, values) into a flat string with
  // marker tokens and a parallel config map.
  function html(strings, ...values) {
    const config = {};
    let string = '';
    for (let i = 0; i < strings.length - 1; i++) {
      const marker = makeMarker();
      string += strings[i] + marker;
      config[marker] = values[i];
    }
    string += strings[strings.length - 1];
    return new TemplateHTML(string, config);
  }

  function css(strings, ...values) {
    const config = {};
    let string = '';
    for (let i = 0; i < strings.length - 1; i++) {
      const marker = makeMarker();
      string += strings[i] + marker;
      config[marker] = values[i];
    }
    string += strings[strings.length - 1];
    return new TemplateCSS(string, config);
  }

  Class(
    function DOMTemplate() {
      Inherit(this, Element);
      const self = this;
      this.data = [];

      // LOCAL hot-reload: when the engine's file-watcher emits a JS_FILE
      // change containing our constructor name, refresh the styles + re-render.
      if (Hydra.LOCAL && window.UILSocket) {
        const name = Utils.getConstructorName(self);
        self.events.sub(UILSocket.JS_FILE, (e) => {
          if (e.file.includes(name)) { DOMTemplate.updateGlobalStyles(); self.update(); }
        });
      }

      // Actual render pass: build dynamic CSS (if any), inflate HTML, then
      // fire the optional `postRender` hook.
      function update() {
        let cssContent;
        if (self.dynamicStyle) cssContent = self.dynamicStyle(css).inflate(self.element.div);
        self.render?.(html).inflate?.(self.element.div, cssContent);
        self.postRender?.();
      }

      // Queue an update. Coalesces back-to-back update() calls by removing
      // the pending one before re-scheduling.
      this.update = function () {
        DOMTemplate.clearScheduled(update);
        DOMTemplate.schedule(update);
      };

      // Subclass must override.
      this.render = function () { throw new Error('render() needs to be overwritten.'); };

      // Re-render whenever the supplied data model emits UPDATE.
      this.setSourceData = function (data) {
        self.data = data;
        this.update();
        self.events.sub(data, Events.UPDATE, this.update);
      };

      self.update();
    },
    (_) => {
      // Static init: shared parser + a 2-jobs-per-frame Render.Worker that
      // pulls callbacks off `queue`. The worker auto-pauses when the queue
      // empties, and resume()s on the next schedule().
      DOMTemplate.parser = new DOMParser();
      const queue = [];
      const worker = new Render.Worker((_) => {
        const callback = queue.shift();
        if (callback) callback(); else worker.pause();
      }, 2);
      let _css;
      worker.pause();

      DOMTemplate.schedule       = function (callback) { queue.push(callback); worker.resume(); };
      DOMTemplate.clearScheduled = function (callback) {
        for (let i = 0; i < queue.length; i++) if (queue[i] == callback) return queue.splice(i, 1);
      };

      // Debounced re-injection of compiled SCSS. Multiple change events in
      // quick succession collapse into one fetch + style swap.
      DOMTemplate.updateGlobalStyles = function () {
        Utils.debounce(async (_) => {
          const css = await get(Assets.getPath('assets/css/style-scss.css'));
          if (!_css) _css = $(document.head).create('DOMTemplate-hotload', 'style');
          _css.div.innerHTML = css;
        }, 20);
      };
    },
  );
})();
