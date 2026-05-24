/*
 * TemplateCSS — `css\`...\`` tagged-template product. Inflates to a single
 * `<style>` element whose `innerHTML` is the consolidated CSS string with
 * markers substituted.
 *
 * Unlike TemplateHTML, the CSS path doesn't track event handlers or per-
 * element bindings — CSS is rendered once per call, so `dataMarkers` and
 * `bindings` collected by `modifyMarkers` are unused (an empty array / list
 * is passed but never consulted).
 */
class TemplateCSS extends TemplateRoot {
  constructor(string, values) {
    super(string, values);
  }

  inflate(root) {
    const [template, config] = this.consolidate();
    const bindings = new LinkedList();
    const element  = document.createElement('style');
    element.innerHTML = this.modifyMarkers(template, config, [], bindings);
    return element;
  }
}
