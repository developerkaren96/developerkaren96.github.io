/*
 * HydraCSS — programmatic stylesheet that batches writes into a single
 * `<style>` tag in `<head>`.
 *
 *   HydraCSS.style('.hero', { width: 100, height: 60, opacity: 0.5 });
 *
 * Behavior:
 *   - JS keys are camelCase → CSS keys are kebab-case via `objToCSS`.
 *   - Non-string numeric values get a `px` suffix automatically, except
 *     for `opacity` (unitless).
 *   - Every rule emitted has `!important` appended so framework-level
 *     styles win over inline/external CSS.
 *   - All updates are coalesced — the actual `innerHTML =` write happens
 *     once per frame via `defer(setHTML)`.
 */
Class(function HydraCSS() {
  const self = this;
  let styleTag;
  let rulesBySelector;
  let renderedCSS;
  let updateScheduled;

  /** camelCase → kebab-case (just the first capital, suffices for CSS props). */
  function objToCSS(key) {
    const match = key.match(/[A-Z]/);
    const camelIndex = match ? match.index : null;
    if (!camelIndex) return key;
    const head = key.slice(0, camelIndex);
    const tail = key.slice(camelIndex);
    return head + '-' + tail.toLowerCase();
  }

  function flushToStyleTag() {
    styleTag.innerHTML = renderedCSS;
    updateScheduled = false;
  }

  // The `<style>` tag is only created once the DOM is ready.
  Hydra.ready(() => {
    rulesBySelector = {};
    renderedCSS = '';
    styleTag = document.createElement('style');
    styleTag.type = 'text/css';
    document.getElementsByTagName('head')[0].appendChild(styleTag);
  });

  this._read = function () { return renderedCSS; };

  /** Replace the rendered CSS and schedule a flush. */
  this._write = function (css) {
    renderedCSS = css;
    if (updateScheduled) return;
    updateScheduled = true;
    defer(flushToStyleTag);
  };

  /**
   * Merge new declarations into `selector`'s rule and re-render the
   * whole sheet. Existing keys for the same selector are overwritten.
   */
  this.style = function (selector, declarations = {}) {
    if (!rulesBySelector[selector]) rulesBySelector[selector] = {};
    Object.assign(rulesBySelector[selector], declarations);

    let css = '';
    for (const sel in rulesBySelector) {
      css += `${sel} {`;
      const block = rulesBySelector[sel];
      for (const key in block) {
        const prop = objToCSS(key);
        let val = block[key];
        // Auto px-suffix numerics, except opacity.
        if (typeof val !== 'string' && key !== 'opacity') val += 'px';
        css += prop + ':' + val + '!important;';
      }
      css += '}';
    }
    self._write(css);
  };

  /** Read back stored declarations. Clone so callers can't mutate state. */
  this.get = function (selector, prop) {
    if (!rulesBySelector[selector]) return prop ? null : {};
    const block = Object.assign({}, rulesBySelector[selector]);
    return prop ? block[prop] : block;
  };

  /**
   * Measure a text element's natural size by cloning it off-screen.
   * Pulled out into HydraCSS because it touches the document's stylesheet
   * (via the cloned element's classes).
   */
  this.textSize = function ($obj) {
    const $clone = $obj.clone();
    $clone.css({
      position: 'relative',
      cssFloat: 'left',
      styleFloat: 'left',
      marginTop: -99999, // park far above the viewport
      width: '',
      height: '',
    });
    __body.addChild($clone);
    const width = $clone.div.offsetWidth;
    const height = $clone.div.offsetHeight;
    $clone.remove();
    return { width, height };
  };

  /**
   * Prepend the current vendor prefix to a style property name.
   * E.g. on a WebKit browser, `'Transform' → '-webkit-transform'`.
   */
  this.prefix = function (style) {
    if (self.styles.vendor === '') return style.charAt(0).toLowerCase() + style.slice(1);
    return self.styles.vendor + style;
  };

  /** Exposed for use by Element/CSSTransition. */
  this._toCSS = objToCSS;
}, 'Static');
