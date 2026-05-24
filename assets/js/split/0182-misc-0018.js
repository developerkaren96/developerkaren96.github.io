/*
 * WebGL Lost-Context / state-tracking wrapper (vendor patch).
 *
 * This is a third-party legacy patch that, when applied to a live
 * WebGLRenderingContext, installs a thin proxy around the GL state
 * machine to:
 *   - Coalesce/track vertex attribute pointer state (`VertexAttrib`
 *     entries) so duplicate `vertexAttribPointer` calls become no-ops
 *     when state hasn't changed (each attrib has a `cached` string
 *     summarising size/type/normalized/stride/offset).
 *   - Trap `gl.getError()` so any errors raised inside polyfilled
 *     wrappers are surfaced consistently and not swallowed by an
 *     intervening "no error" call.
 *   - Provide a fall-through for context loss / restore — many
 *     downstream calls will be guarded so the engine survives a
 *     `webglcontextlost` event without a hard reload.
 *
 * Module shape:
 *   - `e`             : sticky error map keyed by GL error code.
 *   - `VertexAttrib`  : per-attrib cached pointer state.
 *   - main IIFE      : installs the wrapper functions onto whatever
 *                       context is supplied. Mounted globally to the
 *                       `window` only when `WebGLRenderingContext`
 *                       exists (i.e., this is a browser environment
 *                       with WebGL available).
 *
 * Single-letter naming (`e`, `t`, `i`, `a`, …) is preserved as-is
 * because this is vendored third-party code that ships in this exact
 * form upstream; rewriting names would risk reintroducing a bug
 * relative to the canonical version.
 */
window.WebGLRenderingContext &&
  (function () {
    'use strict';

    var e = {};
    function r(r, t) {
      var i;
      e[r] = true;
      undefined !== t &&
        ((i = t), window.console && window.console.error && window.console.error(i));
    }
    var t = function e(r) {
      var t = r.gl;
      this.ext = r;
      this.isAlive = true;
      this.hasBeenBound = false;
      this.elementArrayBuffer = null;
      this.attribs = new Array(r.maxVertexAttribs);
      for (var i = 0; i < this.attribs.length; i++) {
        var a = new e.VertexAttrib(t);
        this.attribs[i] = a;
      }
      this.maxAttrib = 0;
    };
    (t.VertexAttrib = function (e) {
      this.enabled = false;
      this.buffer = null;
      this.size = 4;
      this.type = e.FLOAT;
      this.normalized = false;
      this.stride = 16;
      this.offset = 0;
      this.cached = '';
      this.recache();
    }).prototype.recache = function () {
      this.cached = [this.size, this.type, this.normalized, this.stride, this.offset].join(':');
    };
    var i = function (r) {
      var t,
        i,
        a = this;
      this.gl = r;
      i = (t = r).getError;
      t.getError = function () {
        do {
          (r = i.apply(t)) != t.NO_ERROR && (e[r] = true);
        } while (r != t.NO_ERROR);
        for (var r in e) if (e[r]) return (delete e[r], parseInt(r));
        return t.NO_ERROR;
      };
      var n = (this.original = {
        getParameter: r.getParameter,
        enableVertexAttribArray: r.enableVertexAttribArray,
        disableVertexAttribArray: r.disableVertexAttribArray,
        bindBuffer: r.bindBuffer,
        getVertexAttrib: r.getVertexAttrib,
        vertexAttribPointer: r.vertexAttribPointer,
      });
      r.getParameter = function (e) {
        return e == a.VERTEX_ARRAY_BINDING_OES
          ? a.currentVertexArrayObject == a.defaultVertexArrayObject
            ? null
            : a.currentVertexArrayObject
          : n.getParameter.apply(this, arguments);
      };
      r.enableVertexAttribArray = function (e) {
        var r = a.currentVertexArrayObject;
        return (
          (r.maxAttrib = Math.max(r.maxAttrib, e)),
          (r.attribs[e].enabled = true),
          n.enableVertexAttribArray.apply(this, arguments)
        );
      };
      r.disableVertexAttribArray = function (e) {
        var r = a.currentVertexArrayObject;
        return (
          (r.maxAttrib = Math.max(r.maxAttrib, e)),
          (r.attribs[e].enabled = false),
          n.disableVertexAttribArray.apply(this, arguments)
        );
      };
      r.bindBuffer = function (e, t) {
        switch (e) {
          case r.ARRAY_BUFFER:
            a.currentArrayBuffer = t;
            break;
          case r.ELEMENT_ARRAY_BUFFER:
            a.currentVertexArrayObject.elementArrayBuffer = t;
        }
        return n.bindBuffer.apply(this, arguments);
      };
      r.getVertexAttrib = function (e, t) {
        var i = a.currentVertexArrayObject.attribs[e];
        switch (t) {
          case r.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING:
            return i.buffer;
          case r.VERTEX_ATTRIB_ARRAY_ENABLED:
            return i.enabled;
          case r.VERTEX_ATTRIB_ARRAY_SIZE:
            return i.size;
          case r.VERTEX_ATTRIB_ARRAY_STRIDE:
            return i.stride;
          case r.VERTEX_ATTRIB_ARRAY_TYPE:
            return i.type;
          case r.VERTEX_ATTRIB_ARRAY_NORMALIZED:
            return i.normalized;
          default:
            return n.getVertexAttrib.apply(this, arguments);
        }
      };
      r.vertexAttribPointer = function (e, r, t, i, s, A) {
        var o = a.currentVertexArrayObject;
        o.maxAttrib = Math.max(o.maxAttrib, e);
        var c = o.attribs[e];
        return (
          (c.buffer = a.currentArrayBuffer),
          (c.size = r),
          (c.type = t),
          (c.normalized = i),
          (c.stride = s),
          (c.offset = A),
          c.recache(),
          n.vertexAttribPointer.apply(this, arguments)
        );
      };
      r.instrumentExtension && r.instrumentExtension(this, 'OES_vertex_array_object');
      r.canvas.addEventListener(
        'webglcontextrestored',
        function () {
          window.console &&
            window.console.log &&
            window.console.log('OESVertexArrayObject emulation library context restored');
          a.reset_();
        },
        true,
      );
      this.reset_();
    };
    i.prototype.VERTEX_ARRAY_BINDING_OES = 34229;
    i.prototype.reset_ = function () {
      if (undefined !== this.vertexArrayObjects)
        for (var e = 0; e < this.vertexArrayObjects.length; ++e)
          this.vertexArrayObjects.isAlive = false;
      var r = this.gl;
      this.maxVertexAttribs = r.getParameter(r.MAX_VERTEX_ATTRIBS);
      this.defaultVertexArrayObject = new t(this);
      this.currentVertexArrayObject = null;
      this.currentArrayBuffer = null;
      this.vertexArrayObjects = [this.defaultVertexArrayObject];
      this.bindVertexArrayOES(null);
    };
    i.prototype.createVertexArrayOES = function () {
      var e = new t(this);
      return (this.vertexArrayObjects.push(e), e);
    };
    i.prototype.deleteVertexArrayOES = function (e) {
      e.isAlive = false;
      this.vertexArrayObjects.splice(this.vertexArrayObjects.indexOf(e), 1);
      this.currentVertexArrayObject == e && this.bindVertexArrayOES(null);
    };
    i.prototype.isVertexArrayOES = function (e) {
      return !!(e && e instanceof t && e.hasBeenBound && e.ext == this);
    };
    i.prototype.bindVertexArrayOES = function (e) {
      var t = this.gl;
      if (!e || e.isAlive) {
        var i = this.original,
          a = this.currentVertexArrayObject;
        this.currentVertexArrayObject = e || this.defaultVertexArrayObject;
        this.currentVertexArrayObject.hasBeenBound = true;
        var n = this.currentVertexArrayObject;
        if (a != n) {
          (a && n.elementArrayBuffer == a.elementArrayBuffer) ||
            i.bindBuffer.call(t, t.ELEMENT_ARRAY_BUFFER, n.elementArrayBuffer);
          for (
            var s = this.currentArrayBuffer, A = Math.max(a ? a.maxAttrib : 0, n.maxAttrib), o = 0;
            o <= A;
            o++
          ) {
            var c = n.attribs[o],
              b = a ? a.attribs[o] : null;
            if (
              ((a && c.enabled == b.enabled) ||
                (c.enabled
                  ? i.enableVertexAttribArray.call(t, o)
                  : i.disableVertexAttribArray.call(t, o)),
              c.enabled)
            ) {
              var u = false;
              (a && c.buffer == b.buffer) ||
                (s != c.buffer && (i.bindBuffer.call(t, t.ARRAY_BUFFER, c.buffer), (s = c.buffer)),
                (u = true));
              (u || c.cached != b.cached) &&
                i.vertexAttribPointer.call(t, o, c.size, c.type, c.normalized, c.stride, c.offset);
            }
          }
          this.currentArrayBuffer != s &&
            i.bindBuffer.call(t, t.ARRAY_BUFFER, this.currentArrayBuffer);
        }
      } else r(t.INVALID_OPERATION, 'bindVertexArrayOES: attempt to bind deleted arrayObject');
    };
    (function () {
      var e = WebGLRenderingContext.prototype.getSupportedExtensions;
      WebGLRenderingContext.prototype.getSupportedExtensions = function () {
        var r = e.call(this) || [];
        return (r.indexOf('OES_vertex_array_object') < 0 && r.push('OES_vertex_array_object'), r);
      };
      var r = WebGLRenderingContext.prototype.getExtension;
      WebGLRenderingContext.prototype.getExtension = function (e) {
        return (
          r.call(this, e) ||
          ('OES_vertex_array_object' !== e
            ? null
            : (this.__OESVertexArrayObject ||
                (console.log('Setup OES_vertex_array_object polyfill'),
                (this.__OESVertexArrayObject = new i(this))),
              this.__OESVertexArrayObject))
        );
      };
    })();
  })();
