/*
 * Data — the default application-wide Model singleton.
 *
 * Just a thin static instance of Model with no extra fields. Application
 * code uses `Data.push/pull`, `Data.loadData(url)`, `Data.handleRequest`,
 * etc. for its global JSON/state needs. Other named Model subclasses can
 * exist alongside it for scoped data.
 */
Class(function Data() {
  Inherit(this, Model);
}, 'static');
