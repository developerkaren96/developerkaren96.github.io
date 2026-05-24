(() => {
  var ap = Object.create,
    Et = Object.defineProperty,
    sp = Object.defineProperties,
    pp = Object.getOwnPropertyDescriptor,
    lp = Object.getOwnPropertyDescriptors,
    up = Object.getOwnPropertyNames,
    ln = Object.getOwnPropertySymbols,
    fp = Object.getPrototypeOf,
    un = Object.prototype.hasOwnProperty,
    cp = Object.prototype.propertyIsEnumerable,
    lo = (e, t, r) =>
      t in e
        ? Et(e, t, {
            enumerable: true,
            configurable: true,
            writable: true,
            value: r,
          })
        : (e[t] = r),
    _ = (e, t) => {
      for (var r in t || (t = {})) un.call(t, r) && lo(e, r, t[r]);
      if (ln) for (var r of ln(t)) cp.call(t, r) && lo(e, r, t[r]);
      return e;
    },
    V = (e, t) => sp(e, lp(t)),
    fn = (e) =>
      Et(e, '__esModule', {
        value: true,
      }),
    Kt = (e, t) => () => (
      t ||
        e(
          (t = {
            exports: {},
          }).exports,
          t,
        ),
      t.exports
    ),
    uo = (e, t) => {
      for (var r in (fn(e), t))
        Et(e, r, {
          get: t[r],
          enumerable: true,
        });
    },
    Gt = (e) =>
      ((e, t, r) => {
        if ((t && 'object' == typeof t) || 'function' == typeof t)
          for (let o of up(t))
            !un.call(e, o) &&
              'default' !== o &&
              Et(e, o, {
                get: () => t[o],
                enumerable: !(r = pp(t, o)) || r.enumerable,
              });
        return e;
      })(
        fn(
          Et(
            null != e ? ap(fp(e)) : {},
            'default',
            e && e.__esModule && 'default' in e
              ? {
                  get: () => e.default,
                  enumerable: true,
                }
              : {
                  value: e,
                  enumerable: true,
                },
          ),
        ),
        e,
      ),
    d = (e, t, r) => (lo(e, 'symbol' != typeof t ? t + '' : t, r), r),
    fi = Kt((Ej, ui) => {
      ui.exports = (function () {
        function e(t, r, o, n) {
          this.set(t, r, o, n);
        }
        return (
          (e.prototype.set = function (t, r, o, n) {
            this._cx = 3 * t;
            this._bx = 3 * (o - t) - this._cx;
            this._ax = 1 - this._cx - this._bx;
            this._cy = 3 * r;
            this._by = 3 * (n - r) - this._cy;
            this._ay = 1 - this._cy - this._by;
          }),
          (e.epsilon = 1e-6),
          (e.prototype._sampleCurveX = function (t) {
            return ((this._ax * t + this._bx) * t + this._cx) * t;
          }),
          (e.prototype._sampleCurveY = function (t) {
            return ((this._ay * t + this._by) * t + this._cy) * t;
          }),
          (e.prototype._sampleCurveDerivativeX = function (t) {
            return (3 * this._ax * t + 2 * this._bx) * t + this._cx;
          }),
          (e.prototype._solveCurveX = function (t, r) {
            var o, n, i, a, s, l;
            for (
              i = undefined,
                a = undefined,
                s = undefined,
                l = undefined,
                o = undefined,
                n = undefined,
                s = t,
                n = 0;
              n < 8;
            ) {
              if (((l = this._sampleCurveX(s) - t), Math.abs(l) < r)) return s;
              if (((o = this._sampleCurveDerivativeX(s)), Math.abs(o) < r)) break;
              s -= l / o;
              n++;
            }
            if ((s = t) < (i = 0)) return i;
            if (s > (a = 1)) return a;
            for (; i < a; ) {
              if (((l = this._sampleCurveX(s)), Math.abs(l - t) < r)) return s;
              t > l ? (i = s) : (a = s);
              s = 0.5 * (a - i) + i;
            }
            return s;
          }),
          (e.prototype.solve = function (t, r) {
            return this._sampleCurveY(this._solveCurveX(t, r));
          }),
          (e.prototype.solveSimple = function (t) {
            return this._sampleCurveY(this._solveCurveX(t, 1e-6));
          }),
          e
        );
      })();
    }),
    ks = Kt((eO, Cs) => {
      var Lr, No;
      Lr = [];
      No = [];
      Cs.exports = function Yh(e, t, r) {
        var o, n, i, a, s, l, p, u;
        if (e === t) return 0;
        if (((o = e.length), (n = t.length), 0 === o)) return n;
        if (0 === n) return o;
        for (r && ((e = e.toLowerCase()), (t = t.toLowerCase())), p = 0; p < o; ) {
          No[p] = e.charCodeAt(p);
          Lr[p] = ++p;
        }
        for (u = 0; u < n; )
          for (i = t.charCodeAt(u), a = s = u++, p = -1; ++p < o; ) {
            l = i === No[p] ? s : s + 1;
            s = Lr[p];
            Lr[p] = a = s > a ? (l > a ? a + 1 : l) : l > s ? s + 1 : l;
          }
        return a;
      };
    }),
    Rs = Kt((tO, Es) => {
      var Ds = ks();
      Es.exports = function Xh() {
        var e,
          t,
          r,
          o,
          n,
          i = 0,
          a = arguments[0],
          s = arguments[1],
          l = s.length,
          p = arguments[2];
        p && ((o = p.threshold), (n = p.ignoreCase));
        undefined === o && (o = 0);
        for (var u = 0; u < l; ++u)
          (e =
            (t = n ? Ds(a, s[u], true) : Ds(a, s[u])) > a.length
              ? 1 - t / s[u].length
              : 1 - t / a.length) > i && ((i = e), (r = s[u]));
        return i >= o ? r : null;
      };
    }),
    qo = Kt((fw, zs) => {
      'use strict';

      zs.exports = function e(t, r) {
        if (t === r) return true;
        if (t && r && 'object' == typeof t && 'object' == typeof r) {
          if (t.constructor !== r.constructor) return false;
          var o, n, i;
          if (Array.isArray(t)) {
            if ((o = t.length) != r.length) return false;
            for (n = o; 0 != n--; ) if (!e(t[n], r[n])) return false;
            return true;
          }
          if (t.constructor === RegExp) return t.source === r.source && t.flags === r.flags;
          if (t.valueOf !== Object.prototype.valueOf) return t.valueOf() === r.valueOf();
          if (t.toString !== Object.prototype.toString) return t.toString() === r.toString();
          if ((o = (i = Object.keys(t)).length) !== Object.keys(r).length) return false;
          for (n = o; 0 != n--; ) if (!Object.prototype.hasOwnProperty.call(r, i[n])) return false;
          for (n = o; 0 != n--; ) {
            var a = i[n];
            if (!e(t[a], r[a])) return false;
          }
          return true;
        }
        return t != t && r != r;
      };
    }),
    pn = {};
  uo(pn, {
    createRafDriver: () => Ft,
    getProject: () => np,
    notify: () => pe,
    onChange: () => Rr,
    setCoreRafDriver: () => zr,
    types: () => Yr,
    val: () => ip,
  });
  var sn = {};
  uo(sn, {
    createRafDriver: () => Ft,
    getProject: () => np,
    notify: () => pe,
    onChange: () => Rr,
    setCoreRafDriver: () => zr,
    types: () => Yr,
    val: () => ip,
  });
  var $ = Array.isArray,
    Ht = 'object' == typeof window && window && window.Object === Object && window,
    gp = 'object' == typeof self && self && self.Object === Object && self,
    N = Ht || gp || Function('return this')(),
    W = N.Symbol,
    cn = Object.prototype,
    Pp = cn.hasOwnProperty,
    jp = cn.toString,
    Rt = W ? W.toStringTag : undefined;
  var dn = function _p(e) {
      var t = Pp.call(e, Rt),
        r = e[Rt];
      try {
        e[Rt] = undefined;
        var o = true;
      } catch (i) {}
      var n = jp.call(e);
      return (o && (t ? (e[Rt] = r) : delete e[Rt]), n);
    },
    Tp = Object.prototype.toString;
  var mn = function xp(e) {
      return Tp.call(e);
    },
    hn = W ? W.toStringTag : undefined;
  var X = function Ap(e) {
    return null == e
      ? undefined === e
        ? '[object Undefined]'
        : '[object Null]'
      : hn && hn in Object(e)
        ? dn(e)
        : mn(e);
  };
  var B = function Op(e) {
    return null != e && 'object' == typeof e;
  };
  var Te = function Cp(e) {
      return 'symbol' == typeof e || (B(e) && '[object Symbol]' == X(e));
    },
    kp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
    Dp = /^\w*$/;
  var et = function Ep(e, t) {
    if ($(e)) return false;
    var r = typeof e;
    return (
      !('number' != r && 'symbol' != r && 'boolean' != r && null != e && !Te(e)) ||
      Dp.test(e) ||
      !kp.test(e) ||
      (null != t && e in Object(t))
    );
  };
  var M = function Rp(e) {
    var t = typeof e;
    return null != e && ('object' == t || 'function' == t);
  };
  var e,
    Jt = function $p(e) {
      if (!M(e)) return false;
      var t = X(e);
      return (
        '[object Function]' == t ||
        '[object GeneratorFunction]' == t ||
        '[object AsyncFunction]' == t ||
        '[object Proxy]' == t
      );
    },
    Yt = N['__core-js_shared__'],
    gn = (e = /[^.]+$/.exec((Yt && Yt.keys && Yt.keys.IE_PROTO) || '')) ? 'Symbol(src)_1.' + e : '';
  var yn = function Fp(e) {
      return !!gn && gn in e;
    },
    qp = Function.prototype.toString;
  var me = function zp(e) {
      if (null != e) {
        try {
          return qp.call(e);
        } catch (t) {}
        try {
          return e + '';
        } catch (t) {}
      }
      return '';
    },
    Kp = /^\[object .+?Constructor\]$/,
    Gp = Function.prototype,
    Hp = Object.prototype,
    Jp = Gp.toString,
    Yp = Hp.hasOwnProperty,
    Xp = RegExp(
      '^' +
        Jp.call(Yp)
          .replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
          .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') +
        '$',
    );
  var bn = function Zp(e) {
    return !(!M(e) || yn(e)) && (Jt(e) ? Xp : Kp).test(me(e));
  };
  var Pn = function Qp(e, t) {
    return null == e ? undefined : e[t];
  };
  var K = function el(e, t) {
      var r = Pn(e, t);
      return bn(r) ? r : undefined;
    },
    he = K(Object, 'create');
  var jn = function rl() {
    this.__data__ = he ? he(null) : {};
    this.size = 0;
  };
  var _n = function ol(e) {
      var t = this.has(e) && delete this.__data__[e];
      return ((this.size -= t ? 1 : 0), t);
    },
    al = Object.prototype.hasOwnProperty;
  var vn = function sl(e) {
      var t = this.__data__;
      if (he) {
        var r = t[e];
        return '__lodash_hash_undefined__' === r ? undefined : r;
      }
      return al.call(t, e) ? t[e] : undefined;
    },
    ll = Object.prototype.hasOwnProperty;
  var Tn = function ul(e) {
    var t = this.__data__;
    return he ? undefined !== t[e] : ll.call(t, e);
  };
  var xn = function cl(e, t) {
    var r = this.__data__;
    return (
      (this.size += this.has(e) ? 0 : 1),
      (r[e] = he && undefined === t ? '__lodash_hash_undefined__' : t),
      this
    );
  };
  function tt(e) {
    var t = -1,
      r = null == e ? 0 : e.length;
    for (this.clear(); ++t < r; ) {
      var o = e[t];
      this.set(o[0], o[1]);
    }
  }
  tt.prototype.clear = jn;
  tt.prototype.delete = _n;
  tt.prototype.get = vn;
  tt.prototype.has = Tn;
  tt.prototype.set = xn;
  var fo = tt;
  var Sn = function dl() {
    this.__data__ = [];
    this.size = 0;
  };
  var rt = function ml(e, t) {
    return e === t || (e != e && t != t);
  };
  var xe = function hl(e, t) {
      for (var r = e.length; r--; ) if (rt(e[r][0], t)) return r;
      return -1;
    },
    yl = Array.prototype.splice;
  var In = function bl(e) {
    var t = this.__data__,
      r = xe(t, e);
    return !(r < 0) && (r == t.length - 1 ? t.pop() : yl.call(t, r, 1), --this.size, true);
  };
  var An = function Pl(e) {
    var t = this.__data__,
      r = xe(t, e);
    return r < 0 ? undefined : t[r][1];
  };
  var On = function jl(e) {
    return xe(this.__data__, e) > -1;
  };
  var wn = function _l(e, t) {
    var r = this.__data__,
      o = xe(r, e);
    return (o < 0 ? (++this.size, r.push([e, t])) : (r[o][1] = t), this);
  };
  function ot(e) {
    var t = -1,
      r = null == e ? 0 : e.length;
    for (this.clear(); ++t < r; ) {
      var o = e[t];
      this.set(o[0], o[1]);
    }
  }
  ot.prototype.clear = Sn;
  ot.prototype.delete = In;
  ot.prototype.get = An;
  ot.prototype.has = On;
  ot.prototype.set = wn;
  var Se = ot,
    Ie = K(N, 'Map');
  var Cn = function Tl() {
    this.size = 0;
    this.__data__ = {
      hash: new fo(),
      map: new (Ie || Se)(),
      string: new fo(),
    };
  };
  var kn = function xl(e) {
    var t = typeof e;
    return 'string' == t || 'number' == t || 'symbol' == t || 'boolean' == t
      ? '__proto__' !== e
      : null === e;
  };
  var Ae = function Sl(e, t) {
    var r = e.__data__;
    return kn(t) ? r['string' == typeof t ? 'string' : 'hash'] : r.map;
  };
  var Dn = function Il(e) {
    var t = Ae(this, e).delete(e);
    return ((this.size -= t ? 1 : 0), t);
  };
  var En = function Al(e) {
    return Ae(this, e).get(e);
  };
  var Rn = function Ol(e) {
    return Ae(this, e).has(e);
  };
  var Vn = function wl(e, t) {
    var r = Ae(this, e),
      o = r.size;
    return (r.set(e, t), (this.size += r.size == o ? 0 : 1), this);
  };
  function nt(e) {
    var t = -1,
      r = null == e ? 0 : e.length;
    for (this.clear(); ++t < r; ) {
      var o = e[t];
      this.set(o[0], o[1]);
    }
  }
  nt.prototype.clear = Cn;
  nt.prototype.delete = Dn;
  nt.prototype.get = En;
  nt.prototype.has = Rn;
  nt.prototype.set = Vn;
  var Be = nt;
  function co(e, t) {
    if ('function' != typeof e || (null != t && 'function' != typeof t))
      throw new TypeError('Expected a function');
    var r = function () {
      var o = arguments,
        n = t ? t.apply(this, o) : o[0],
        i = r.cache;
      if (i.has(n)) return i.get(n);
      var a = e.apply(this, o);
      return ((r.cache = i.set(n, a) || i), a);
    };
    return ((r.cache = new (co.Cache || Be)()), r);
  }
  co.Cache = Be;
  var Nn = co;
  var Ln = function Dl(e) {
      var t = Nn(e, function (o) {
          return (500 === r.size && r.clear(), o);
        }),
        r = t.cache;
      return t;
    },
    El =
      /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,
    Rl = /\\(\\)?/g,
    Vl = Ln(function (e) {
      var t = [];
      return (
        46 === e.charCodeAt(0) && t.push(''),
        e.replace(El, function (r, o, n, i) {
          t.push(n ? i.replace(Rl, '$1') : o || r);
        }),
        t
      );
    }),
    Mn = Vl;
  var $n = function Nl(e, t) {
      for (var r = -1, o = null == e ? 0 : e.length, n = Array(o); ++r < o; ) n[r] = t(e[r], r, e);
      return n;
    },
    Bn = W ? W.prototype : undefined,
    Fn = Bn ? Bn.toString : undefined;
  var Xt = function Un(e) {
    if ('string' == typeof e) return e;
    if ($(e)) return $n(e, Un) + '';
    if (Te(e)) return Fn ? Fn.call(e) : '';
    var t = e + '';
    return '0' == t && 1 / e == -Infinity ? '-0' : t;
  };
  var Zt = function Ml(e) {
    return null == e ? '' : Xt(e);
  };
  var Oe = function $l(e, t) {
    return $(e) ? e : et(e, t) ? [e] : Mn(Zt(e));
  };
  var re = function Fl(e) {
    if ('string' == typeof e || Te(e)) return e;
    var t = e + '';
    return '0' == t && 1 / e == -Infinity ? '-0' : t;
  };
  var it = function Ul(e, t) {
    for (var r = 0, o = (t = Oe(t, e)).length; null != e && r < o; ) e = e[re(t[r++])];
    return r && r == o ? e : undefined;
  };
  var at = function ql(e, t, r) {
    var o = null == e ? undefined : it(e, t);
    return undefined === o ? r : o;
  };
  var Qt = function zl(e, t) {
      return function (r) {
        return e(t(r));
      };
    },
    st = Qt(Object.getPrototypeOf, Object),
    Gl = Function.prototype,
    Hl = Object.prototype,
    qn = Gl.toString,
    Jl = Hl.hasOwnProperty,
    Yl = qn.call(Object);
  var Vt = function Xl(e) {
    if (!B(e) || '[object Object]' != X(e)) return false;
    var t = st(e);
    if (null === t) return true;
    var r = Jl.call(t, 'constructor') && t.constructor;
    return 'function' == typeof r && r instanceof r && qn.call(r) == Yl;
  };
  var er = function Zl(e) {
      var t = null == e ? 0 : e.length;
      return t ? e[t - 1] : undefined;
    },
    mo = new WeakMap(),
    zn = new WeakMap(),
    Wn = Symbol('pointerMeta'),
    Ql = {
      get(e, t) {
        if (t === Wn) return mo.get(e);
        let r = zn.get(e);
        r || ((r = new Map()), zn.set(e, r));
        let o = r.get(t);
        if (undefined !== o) return o;
        let n = mo.get(e),
          i = Kn({
            root: n.root,
            path: [...n.path, t],
          });
        return (r.set(t, i), i);
      },
    },
    pt = (e) => e[Wn],
    Z = (e) => {
      let { root: t, path: r } = pt(e);
      return {
        root: t,
        path: r,
      };
    };
  function Kn(e) {
    var o;
    let t = {
        root: e.root,
        path: null != (o = e.path) ? o : [],
      },
      r = {};
    return (mo.set(r, t), new Proxy(r, Ql));
  }
  var ge = Kn,
    ae = (e) => e && !!pt(e);
  var tr = (e, t, r) => {
      if (0 === t.length) return r(e);
      if (Array.isArray(e)) {
        let [o, ...n] = t;
        o = parseInt(String(o), 10);
        isNaN(o) && (o = 0);
        let i = e[o],
          a = tr(i, n, r);
        if (i === a) return e;
        let s = [...e];
        return (s.splice(o, 1, a), s);
      }
      if ('object' == typeof e && null !== e) {
        let [o, ...n] = t,
          i = e[o],
          a = tr(i, n, r);
        return i === a
          ? e
          : V(_({}, e), {
              [o]: a,
            });
      }
      {
        let [o, ...n] = t;
        return {
          [o]: tr(undefined, n, r),
        };
      }
    },
    lt = class {
      constructor() {
        this._head = undefined;
      }
      peek() {
        return this._head && this._head.data;
      }
      pop() {
        let t = this._head;
        if (t) return ((this._head = t.next), t.data);
      }
      push(t) {
        let r = {
          next: this._head,
          data: t,
        };
        this._head = r;
      }
    };
  function we(e) {
    return !(!e || !e.isPrism || true !== e.isPrism);
  }
  function Gn() {
    let t = new lt(),
      r = () => {};
    return {
      type: 'Dataverse_discoveryMechanism',
      startIgnoringDependencies: () => {
        t.push(r);
      },
      stopIgnoringDependencies: () => {
        t.peek() !== r || t.pop();
      },
      reportResolutionStart: (p) => {
        let u = t.peek();
        u && u(p);
        t.push(r);
      },
      reportResolutionEnd: (p) => {
        t.pop();
      },
      pushCollector: (p) => {
        t.push(p);
      },
      popCollector: (p) => {
        if (t.peek() !== p) throw new Error('Popped collector is not on top of the stack');
        t.pop();
      },
    };
  }
  var {
      startIgnoringDependencies: ut,
      stopIgnoringDependencies: ft,
      reportResolutionEnd: Hn,
      reportResolutionStart: Jn,
      pushCollector: Yn,
      popCollector: Xn,
    } = (function eu() {
      let e = '__dataverse_discoveryMechanism_sharedStack',
        t = 'undefined' != typeof window || 'undefined' != typeof window ? window : {};
      if (t) {
        let r = t[e];
        if (r && 'object' == typeof r && 'Dataverse_discoveryMechanism' === r.type) return r;
        {
          let o = Gn();
          return ((t[e] = o), o);
        }
      }
      return Gn();
    })(),
    Zn = () => {},
    Qn = class {
      constructor(t, r) {
        this._fn = t;
        this._prismInstance = r;
        this._didMarkDependentsAsStale = false;
        this._isFresh = false;
        this._cacheOfDendencyValues = new Map();
        this._dependents = new Set();
        this._dependencies = new Set();
        this._possiblyStaleDeps = new Set();
        this._scope = new rr(this);
        this._lastValue = undefined;
        this._forciblySetToStale = false;
        this._reactToDependencyGoingStale = (t) => {
          this._possiblyStaleDeps.add(t);
          this._markAsStale();
        };
        for (let o of this._dependencies) o._addDependent(this._reactToDependencyGoingStale);
        ut();
        this.getValue();
        ft();
      }
      get hasDependents() {
        return this._dependents.size > 0;
      }
      removeDependent(t) {
        this._dependents.delete(t);
      }
      addDependent(t) {
        this._dependents.add(t);
      }
      destroy() {
        for (let t of this._dependencies) t._removeDependent(this._reactToDependencyGoingStale);
        ti(this._scope);
      }
      getValue() {
        if (!this._isFresh) {
          let t = this._recalculate();
          this._lastValue = t;
          this._isFresh = true;
          this._didMarkDependentsAsStale = false;
          this._forciblySetToStale = false;
        }
        return this._lastValue;
      }
      _recalculate() {
        let t;
        if (!this._forciblySetToStale && this._possiblyStaleDeps.size > 0) {
          let n = false;
          ut();
          for (let i of this._possiblyStaleDeps)
            if (this._cacheOfDendencyValues.get(i) !== i.getValue()) {
              n = true;
              break;
            }
          if ((ft(), this._possiblyStaleDeps.clear(), !n)) return this._lastValue;
        }
        let r = new Set();
        this._cacheOfDendencyValues.clear();
        let o = (n) => {
          r.add(n);
          this._addDependency(n);
        };
        Yn(o);
        G.push(this._scope);
        try {
          t = this._fn();
        } catch (n) {
          console.error(n);
        } finally {
          G.pop() !== this._scope &&
            console.warn('The Prism hook stack has slipped. This is a bug.');
        }
        Xn(o);
        for (let n of this._dependencies) r.has(n) || this._removeDependency(n);
        this._dependencies = r;
        ut();
        for (let n of r) this._cacheOfDendencyValues.set(n, n.getValue());
        return (ft(), t);
      }
      forceStale() {
        this._forciblySetToStale = true;
        this._markAsStale();
      }
      _markAsStale() {
        if (!this._didMarkDependentsAsStale) {
          this._didMarkDependentsAsStale = true;
          this._isFresh = false;
          for (let t of this._dependents) t(this._prismInstance);
        }
      }
      _addDependency(t) {
        this._dependencies.has(t) ||
          (this._dependencies.add(t), t._addDependent(this._reactToDependencyGoingStale));
      }
      _removeDependency(t) {
        !this._dependencies.has(t) ||
          (this._dependencies.delete(t), t._removeDependent(this._reactToDependencyGoingStale));
      }
    },
    tu = {},
    ei = class {
      constructor(t) {
        this._fn = t;
        this.isPrism = true;
        this._state = {
          hot: false,
          handle: undefined,
        };
      }
      get isHot() {
        return this._state.hot;
      }
      onChange(t, r, o = false) {
        let n = () => {
            t.onThisOrNextTick(a);
          },
          i = tu,
          a = () => {
            let l = this.getValue();
            l !== i && ((i = l), r(l));
          };
        return (
          this._addDependent(n),
          o && ((i = this.getValue()), r(i)),
          () => {
            this._removeDependent(n);
            t.offThisOrNextTick(a);
            t.offNextTick(a);
          }
        );
      }
      onStale(t) {
        let o = () => t();
        return (
          this._addDependent(o),
          () => {
            this._removeDependent(o);
          }
        );
      }
      keepHot() {
        return this.onStale(() => {});
      }
      _addDependent(t) {
        this._state.hot || this._goHot();
        this._state.handle.addDependent(t);
      }
      _goHot() {
        let t = new Qn(this._fn, this);
        this._state = {
          hot: true,
          handle: t,
        };
      }
      _removeDependent(t) {
        let r = this._state;
        if (!r.hot) return;
        let o = r.handle;
        o.removeDependent(t);
        o.hasDependents ||
          ((this._state = {
            hot: false,
            handle: undefined,
          }),
          o.destroy());
      }
      getValue() {
        Jn(this);
        let r,
          t = this._state;
        return (
          (r = t.hot
            ? t.handle.getValue()
            : (function uu(e) {
                let r,
                  t = new nr();
                G.push(t);
                try {
                  r = e();
                } catch (o) {
                  console.error(o);
                } finally {
                  G.pop() !== t && console.warn('The Prism hook stack has slipped. This is a bug.');
                }
                return r;
              })(this._fn)),
          Hn(this),
          r
        );
      }
    },
    rr = class {
      constructor(t) {
        this._hotHandle = t;
        this._refs = new Map();
        this.isPrismScope = true;
        this.subs = {};
        this.effects = new Map();
        this.memos = new Map();
      }
      ref(t, r) {
        let o = this._refs.get(t);
        if (undefined !== o) return o;
        {
          let n = {
            current: r,
          };
          return (this._refs.set(t, n), n);
        }
      }
      effect(t, r, o) {
        let n = this.effects.get(t);
        undefined === n &&
          ((n = {
            cleanup: Zn,
            deps: undefined,
          }),
          this.effects.set(t, n));
        ri(n.deps, o) && (n.cleanup(), ut(), (n.cleanup = or(r, Zn).value), ft(), (n.deps = o));
      }
      memo(t, r, o) {
        let n = this.memos.get(t);
        return (
          undefined === n &&
            ((n = {
              cachedValue: null,
              deps: undefined,
            }),
            this.memos.set(t, n)),
          ri(n.deps, o) && (ut(), (n.cachedValue = or(r, undefined).value), ft(), (n.deps = o)),
          n.cachedValue
        );
      }
      state(t, r) {
        let { value: o, setValue: n } = this.memo(
          'state/' + t,
          () => {
            let i = {
              current: r,
            };
            return {
              value: i,
              setValue: (s) => {
                i.current = s;
                this._hotHandle.forceStale();
              },
            };
          },
          [],
        );
        return [o.current, n];
      }
      sub(t) {
        return (this.subs[t] || (this.subs[t] = new rr(this._hotHandle)), this.subs[t]);
      }
      cleanupEffects() {
        for (let t of this.effects.values()) or(t.cleanup, undefined);
        this.effects.clear();
      }
      source(t, r) {
        return (
          this.effect(
            '$$source/blah',
            () =>
              t(() => {
                this._hotHandle.forceStale();
              }),
            [t],
          ),
          r()
        );
      }
    };
  function ti(e) {
    for (let t of Object.values(e.subs)) ti(t);
    e.cleanupEffects();
  }
  function or(e, t) {
    try {
      return {
        value: e(),
        ok: true,
      };
    } catch (r) {
      return (
        setTimeout(function () {
          throw r;
        }),
        {
          value: t,
          ok: false,
        }
      );
    }
  }
  var G = new lt();
  function ri(e, t) {
    if (undefined === e || undefined === t) return true;
    let r = e.length;
    if (r !== t.length) return true;
    for (let o = 0; o < r; o++) if (e[o] !== t[o]) return true;
    return false;
  }
  function oi(e, t, r) {
    let o = G.peek();
    if (!o) throw new Error('prism.memo() is called outside of a prism() call.');
    return o.memo(e, t, r);
  }
  var se = (e) => new ei(e),
    nr = class {
      effect(t, r, o) {
        console.warn('prism.effect() does not run in cold prisms');
      }
      memo(t, r, o) {
        return r();
      }
      state(t, r) {
        return [r, () => {}];
      }
      ref(t, r) {
        return {
          current: r,
        };
      }
      sub(t) {
        return new nr();
      }
      source(t, r) {
        return r();
      }
    };
  se.ref = function ru(e, t) {
    let r = G.peek();
    if (!r) throw new Error('prism.ref() is called outside of a prism() call.');
    return r.ref(e, t);
  };
  se.effect = function ou(e, t, r) {
    let o = G.peek();
    if (!o) throw new Error('prism.effect() is called outside of a prism() call.');
    return o.effect(e, t, r);
  };
  se.memo = oi;
  se.ensurePrism = function iu() {
    if (!G.peek()) throw new Error('The parent function is called outside of a prism() call.');
  };
  se.state = function nu(e, t) {
    let r = G.peek();
    if (!r) throw new Error('prism.state() is called outside of a prism() call.');
    return r.state(e, t);
  };
  se.scope = function au(e, t) {
    let r = G.peek();
    if (!r) throw new Error('prism.scope() is called outside of a prism() call.');
    let o = r.sub(e);
    G.push(o);
    let n = or(t, undefined).value;
    return (G.pop(), n);
  };
  se.sub = function su(e, t, r) {
    return oi(e, () => se(t), r).getValue();
  };
  se.inPrism = function pu() {
    return !!G.peek();
  };
  se.source = function lu(e, t) {
    let r = G.peek();
    if (!r) throw new Error('prism.source() is called outside of a prism() call.');
    return r.source(e, t);
  };
  var Ce,
    o,
    g = se;
  (o = Ce || (Ce = {}))[(o.Dict = 0)] = 'Dict';
  o[(o.Array = 1)] = 'Array';
  o[(o.Other = 2)] = 'Other';
  var go = (e) => (Array.isArray(e) ? 1 : Vt(e) ? 0 : 2),
    ni = (e, t, r = go(e)) =>
      (0 === r && 'string' == typeof t) || (1 === r && fu(t)) ? e[t] : undefined,
    fu = (e) => {
      let t = 'number' == typeof e ? e : parseInt(e, 10);
      return !isNaN(t) && t >= 0 && t < 1 / 0 && (0 | t) === t;
    },
    ir = class {
      constructor(t, r) {
        this._parent = t;
        this._path = r;
        this.children = new Map();
        this.identityChangeListeners = new Set();
      }
      addIdentityChangeListener(t) {
        this.identityChangeListeners.add(t);
      }
      removeIdentityChangeListener(t) {
        this.identityChangeListeners.delete(t);
        this._checkForGC();
      }
      removeChild(t) {
        this.children.delete(t);
        this._checkForGC();
      }
      getChild(t) {
        return this.children.get(t);
      }
      getOrCreateChild(t) {
        let r = this.children.get(t);
        return (r || ((r = r = new ir(this, this._path.concat([t]))), this.children.set(t, r)), r);
      }
      _checkForGC() {
        this.identityChangeListeners.size > 0 ||
          this.children.size > 0 ||
          (this._parent && this._parent.removeChild(er(this._path)));
      }
    },
    I = class {
      constructor(t) {
        this.$$isPointerToPrismProvider = true;
        this.pointer = ge({
          root: this,
          path: [],
        });
        this.prism = this.pointerToPrism(this.pointer);
        this._onPointerValueChange = (t, r) => {
          let { path: o } = Z(t),
            n = this._getOrCreateScopeForPath(o);
          return (
            n.identityChangeListeners.add(r),
            () => {
              n.identityChangeListeners.delete(r);
            }
          );
        };
        this._currentState = t;
        this._rootScope = new ir(undefined, []);
      }
      set(t) {
        let r = this._currentState;
        this._currentState = t;
        this._checkUpdates(this._rootScope, r, t);
      }
      get() {
        return this._currentState;
      }
      getByPointer(t) {
        let r = ae(t) ? t : t(this.pointer),
          o = Z(r).path;
        return this._getIn(o);
      }
      _getIn(t) {
        return 0 === t.length ? this.get() : at(this.get(), t);
      }
      reduce(t) {
        this.set(t(this.get()));
      }
      reduceByPointer(t, r) {
        let o = ae(t) ? t : t(this.pointer),
          n = Z(o).path,
          i = (function ho(e, t, r) {
            return 0 === t.length ? r(e) : tr(e, t, r);
          })(this.get(), n, r);
        this.set(i);
      }
      setByPointer(t, r) {
        this.reduceByPointer(t, () => r);
      }
      _checkUpdates(t, r, o) {
        if (r === o) return;
        for (let a of t.identityChangeListeners) a(o);
        if (0 === t.children.size) return;
        let n = go(r),
          i = go(o);
        if (2 !== n || n !== i)
          for (let [a, s] of t.children) {
            let l = ni(r, a, n),
              p = ni(o, a, i);
            this._checkUpdates(s, l, p);
          }
      }
      _getOrCreateScopeForPath(t) {
        let r = this._rootScope;
        for (let o of t) r = r.getOrCreateChild(o);
        return r;
      }
      pointerToPrism(t) {
        let { path: r } = Z(t),
          o = (i) => this._onPointerValueChange(t, i),
          n = () => this._getIn(r);
        return g(() => g.source(o, n));
      }
    },
    ii = new WeakMap();
  var ke = (e) => {
      let t = pt(e),
        r = ii.get(t);
      if (!r) {
        let o = t.root;
        if (
          !(function cu(e) {
            return 'object' == typeof e && null !== e && true === e.$$isPointerToPrismProvider;
          })(o)
        )
          throw new Error(
            'Cannot run pointerToPrism() on a pointer whose root is not an PointerToPrismProvider',
          );
        r = o.pointerToPrism(e);
        ii.set(t, r);
      }
      return r;
    },
    j = (e) => (ae(e) ? ke(e).getValue() : we(e) ? e.getValue() : e),
    ct = class {
      constructor(t) {
        this._conf = t;
        this._ticking = false;
        this._dormant = true;
        this._numberOfDormantTicks = 0;
        this.__ticks = 0;
        this._scheduledForThisOrNextTick = new Set();
        this._scheduledForNextTick = new Set();
        this._timeAtCurrentTick = 0;
      }
      get dormant() {
        return this._dormant;
      }
      onThisOrNextTick(t) {
        this._scheduledForThisOrNextTick.add(t);
        this._dormant && this._goActive();
      }
      onNextTick(t) {
        this._scheduledForNextTick.add(t);
        this._dormant && this._goActive();
      }
      offThisOrNextTick(t) {
        this._scheduledForThisOrNextTick.delete(t);
      }
      offNextTick(t) {
        this._scheduledForNextTick.delete(t);
      }
      get time() {
        return this._ticking ? this._timeAtCurrentTick : performance.now();
      }
      _goActive() {
        var t, r;
        !this._dormant ||
          ((this._dormant = false),
          null == (r = null == (t = this._conf) ? undefined : t.onActive) || r.call(t));
      }
      _goDormant() {
        var t, r;
        this._dormant ||
          ((this._dormant = true),
          (this._numberOfDormantTicks = 0),
          null == (r = null == (t = this._conf) ? undefined : t.onDormant) || r.call(t));
      }
      tick(t = performance.now()) {
        if (
          (this.__ticks++,
          !this._dormant &&
            0 === this._scheduledForNextTick.size &&
            0 === this._scheduledForThisOrNextTick.size &&
            (this._numberOfDormantTicks++, this._numberOfDormantTicks >= 180))
        )
          this._goDormant();
        else {
          this._ticking = true;
          this._timeAtCurrentTick = t;
          for (let r of this._scheduledForNextTick) this._scheduledForThisOrNextTick.add(r);
          this._scheduledForNextTick.clear();
          this._tick(0);
          this._ticking = false;
        }
      }
      _tick(t) {
        let r = this.time;
        if ((t > 10 && console.warn('_tick() recursing for 10 times'), t > 100))
          throw new Error('Maximum recursion limit for _tick()');
        let o = this._scheduledForThisOrNextTick;
        this._scheduledForThisOrNextTick = new Set();
        for (let n of o) n(r);
        if (this._scheduledForThisOrNextTick.size > 0) return this._tick(t + 1);
      }
    },
    Fe = class {
      constructor(t) {
        this.$$isPointerToPrismProvider = true;
        this._currentPointerBox = new I(t);
        this.pointer = ge({
          root: this,
          path: [],
        });
      }
      setPointer(t) {
        this._currentPointerBox.set(t);
      }
      pointerToPrism(t) {
        let { path: r } = pt(t);
        return g(() => {
          let o = this._currentPointerBox.prism.getValue(),
            n = r.reduce((i, a) => i[a], o);
          return j(n);
        });
      }
    },
    mu = new (class {
      constructor() {
        d(
          this,
          'atom',
          new I({
            projects: {},
          }),
        );
      }
      add(t, r) {
        this.atom.setByPointer((o) => o.projects[t], r);
      }
      get(t) {
        return this.atom.get().projects[t];
      }
      has(t) {
        return !!this.get(t);
      }
      remove(t) {
        this.atom.setByPointer((r) => r.projects[t], undefined);
      }
    })(),
    Ue = mu,
    si = new WeakMap();
  function T(e) {
    return si.get(e);
  }
  function ue(e, t) {
    si.set(e, t);
  }
  var ar = [];
  function sr(e, t) {
    return 0 === t.length ? e : at(e, t);
  }
  var De = class {
      constructor() {
        d(this, '_values', {});
      }
      get(t, r) {
        if (this.has(t)) return this._values[t];
        {
          let o = r();
          return ((this._values[t] = o), o);
        }
      }
      has(t) {
        return this._values.hasOwnProperty(t);
      }
    },
    hu = (function () {
      try {
        var e = K(Object, 'defineProperty');
        return (e({}, '', {}), e);
      } catch (t) {}
    })(),
    yo = hu;
  var dt = function gu(e, t, r) {
      '__proto__' == t && yo
        ? yo(e, t, {
            configurable: true,
            enumerable: true,
            value: r,
            writable: true,
          })
        : (e[t] = r);
    },
    bu = Object.prototype.hasOwnProperty;
  var mt = function Pu(e, t, r) {
      var o = e[t];
      (!bu.call(e, t) || !rt(o, r) || (undefined === r && !(t in e))) && dt(e, t, r);
    },
    _u = /^(?:0|[1-9]\d*)$/;
  var ht = function vu(e, t) {
    var r = typeof e;
    return (
      !!(t = null == t ? 9007199254740991 : t) &&
      ('number' == r || ('symbol' != r && _u.test(e))) &&
      e > -1 &&
      e % 1 == 0 &&
      e < t
    );
  };
  var pi = function Tu(e, t, r, o) {
    if (!M(e)) return e;
    for (var n = -1, i = (t = Oe(t, e)).length, a = i - 1, s = e; null != s && ++n < i; ) {
      var l = re(t[n]),
        p = r;
      if ('__proto__' === l || 'constructor' === l || 'prototype' === l) return e;
      if (n != a) {
        var u = s[l];
        undefined === (p = o ? o(u, l, s) : undefined) && (p = M(u) ? u : ht(t[n + 1]) ? [] : {});
      }
      mt(s, l, p);
      s = s[l];
    }
    return e;
  };
  var li = function xu(e, t, r) {
      return null == e ? e : pi(e, t, r);
    },
    bo = new WeakMap();
  function jo(e) {
    if (bo.has(e)) return bo.get(e);
    let t =
      'compound' === e.type
        ? (function Iu(e) {
            let t = {};
            for (let [r, o] of Object.entries(e.props)) t[r] = jo(o);
            return t;
          })(e)
        : 'enum' === e.type
          ? (function Su(e) {
              let t = {
                $case: e.defaultCase,
              };
              for (let [r, o] of Object.entries(e.cases)) t[r] = jo(o);
              return t;
            })(e)
          : e.default;
    return (bo.set(e, t), t);
  }
  var ci = Gt(fi());
  function _o(e, t, r) {
    return g(() => {
      let o = j(t);
      return g
        .memo(
          'driver',
          () =>
            o
              ? 'BasicKeyframedTrack' === o.type
                ? (function Ou(e, t, r) {
                    return g(() => {
                      let o = g.ref('state', {
                          started: false,
                        }),
                        n = o.current,
                        i = r.getValue();
                      return (
                        (!n.started || i < n.validFrom || n.validTo <= i) &&
                          (o.current = n =
                            (function wu(e, t, r) {
                              let o = t.getValue();
                              if (0 === r.keyframes.length)
                                return {
                                  started: true,
                                  validFrom: -1 / 0,
                                  validTo: 1 / 0,
                                  der: di,
                                };
                              let n = 0;
                              for (;;) {
                                let i = r.keyframes[n];
                                if (!i) return qe.error;
                                let a = n === r.keyframes.length - 1;
                                if (o < i.position)
                                  return 0 === n ? qe.beforeFirstKeyframe(i) : qe.error;
                                if (i.position === o)
                                  return a
                                    ? qe.lastKeyframe(i)
                                    : qe.between(i, r.keyframes[n + 1], t);
                                if (n === r.keyframes.length - 1) return qe.lastKeyframe(i);
                                {
                                  let s = n + 1;
                                  if (r.keyframes[s].position <= o) {
                                    n = s;
                                    continue;
                                  }
                                  return qe.between(i, r.keyframes[n + 1], t);
                                }
                              }
                            })(0, r, t)),
                        n.der.getValue()
                      );
                    });
                  })(0, o, r)
                : (e.logger.error('Track type not yet supported.'), g(() => {}))
              : g(() => {}),
          [o],
        )
        .getValue();
    });
  }
  var di = g(() => {});
  var qe = {
    beforeFirstKeyframe: (e) => ({
      started: true,
      validFrom: -1 / 0,
      validTo: e.position,
      der: g(() => ({
        left: e.value,
        progression: 0,
      })),
    }),
    lastKeyframe: (e) => ({
      started: true,
      validFrom: e.position,
      validTo: 1 / 0,
      der: g(() => ({
        left: e.value,
        progression: 0,
      })),
    }),
    between(e, t, r) {
      if (!e.connectedRight)
        return {
          started: true,
          validFrom: e.position,
          validTo: t.position,
          der: g(() => ({
            left: e.value,
            progression: 0,
          })),
        };
      let o = (i) => (i - e.position) / (t.position - e.position);
      if (!e.type || 'bezier' === e.type) {
        let i = new ci.default(e.handles[2], e.handles[3], t.handles[0], t.handles[1]),
          a = g(() => {
            let s = o(r.getValue()),
              l = i.solveSimple(s);
            return {
              left: e.value,
              right: t.value,
              progression: l,
            };
          });
        return {
          started: true,
          validFrom: e.position,
          validTo: t.position,
          der: a,
        };
      }
      let n = g(() => {
        let i = o(r.getValue()),
          a = Math.floor(i);
        return {
          left: e.value,
          right: t.value,
          progression: a,
        };
      });
      return {
        started: true,
        validFrom: e.position,
        validTo: t.position,
        der: n,
      };
    },
    error: {
      started: true,
      validFrom: -1 / 0,
      validTo: 1 / 0,
      der: di,
    },
  };
  function gt(e, t, r) {
    let n = r.get(e);
    if (n && n.override === t) return n.merged;
    let i = _({}, e);
    for (let a of Object.keys(t)) {
      let s = t[a],
        l = e[a];
      i[a] = 'object' == typeof s && 'object' == typeof l ? gt(l, s, r) : undefined === s ? l : s;
    }
    return (
      r.set(e, {
        override: t,
        merged: i,
      }),
      i
    );
  }
  function ze(e, t) {
    let r = e;
    for (let o of t) r = r[o];
    return r;
  }
  var Cu = /\s/;
  var hi = function ku(e) {
      for (var t = e.length; t-- && Cu.test(e.charAt(t)); );
      return t;
    },
    Du = /^\s+/;
  var gi = function Eu(e) {
      return e && e.slice(0, hi(e) + 1).replace(Du, '');
    },
    Ru = /^[-+]0x[0-9a-f]+$/i,
    Vu = /^0b[01]+$/i,
    Nu = /^0o[0-7]+$/i,
    Lu = parseInt;
  var ye = function Mu(e) {
    if ('number' == typeof e) return e;
    if (Te(e)) return NaN;
    if (M(e)) {
      var t = 'function' == typeof e.valueOf ? e.valueOf() : e;
      e = M(t) ? t + '' : t;
    }
    if ('string' != typeof e) return 0 === e ? e : +e;
    e = gi(e);
    var r = Vu.test(e);
    return r || Nu.test(e) ? Lu(e.slice(2), r ? 2 : 8) : Ru.test(e) ? NaN : +e;
  };
  var Pi = function Bu(e) {
    return e
      ? Infinity === (e = ye(e)) || -Infinity === e
        ? 17976931348623157e292 * (e < 0 ? -1 : 1)
        : e == e
          ? e
          : 0
      : 0 === e
        ? e
        : 0;
  };
  var pr = function Fu(e) {
    var t = Pi(e),
      r = t % 1;
    return t == t ? (r ? t - r : t) : 0;
  };
  var ji = function Uu(e) {
      return e;
    },
    lr = K(N, 'WeakMap'),
    _i = Object.create,
    zu = (function () {
      function e() {}
      return function (t) {
        if (!M(t)) return {};
        if (_i) return _i(t);
        e.prototype = t;
        var r = new e();
        return ((e.prototype = undefined), r);
      };
    })(),
    vi = zu;
  var Ti = function Wu(e, t) {
    var r = -1,
      o = e.length;
    for (t || (t = Array(o)); ++r < o; ) t[r] = e[r];
    return t;
  };
  var xi = function Ku(e, t) {
    for (var r = -1, o = null == e ? 0 : e.length; ++r < o && false !== t(e[r], r, e); );
    return e;
  };
  var Ee = function Gu(e, t, r, o) {
    var n = !r;
    r || (r = {});
    for (var i = -1, a = t.length; ++i < a; ) {
      var s = t[i],
        l = o ? o(r[s], e[s], s, r, e) : undefined;
      undefined === l && (l = e[s]);
      n ? dt(r, s, l) : mt(r, s, l);
    }
    return r;
  };
  var yt = function Ju(e) {
    return 'number' == typeof e && e > -1 && e % 1 == 0 && e <= 9007199254740991;
  };
  var ur = function Yu(e) {
      return null != e && yt(e.length) && !Jt(e);
    },
    Xu = Object.prototype;
  var bt = function Zu(e) {
    var t = e && e.constructor;
    return e === (('function' == typeof t && t.prototype) || Xu);
  };
  var Si = function Qu(e, t) {
    for (var r = -1, o = Array(e); ++r < e; ) o[r] = t(r);
    return o;
  };
  var vo = function tf(e) {
      return B(e) && '[object Arguments]' == X(e);
    },
    Ii = Object.prototype,
    rf = Ii.hasOwnProperty,
    of = Ii.propertyIsEnumerable,
    nf = vo(
      (function () {
        return arguments;
      })(),
    )
      ? vo
      : function (e) {
          return B(e) && rf.call(e, 'callee') && !of.call(e, 'callee');
        },
    fr = nf;
  var Ai = function af() {
      return false;
    },
    Oi = 'object' == typeof exports && exports && !exports.nodeType && exports,
    wi = Oi && 'object' == typeof module && module && !module.nodeType && module,
    Ci = wi && wi.exports === Oi ? N.Buffer : undefined,
    We = (Ci ? Ci.isBuffer : undefined) || Ai,
    E = {};
  E['[object Float32Array]'] =
    E['[object Float64Array]'] =
    E['[object Int8Array]'] =
    E['[object Int16Array]'] =
    E['[object Int32Array]'] =
    E['[object Uint8Array]'] =
    E['[object Uint8ClampedArray]'] =
    E['[object Uint16Array]'] =
    E['[object Uint32Array]'] =
      true;
  E['[object Arguments]'] =
    E['[object Array]'] =
    E['[object ArrayBuffer]'] =
    E['[object Boolean]'] =
    E['[object DataView]'] =
    E['[object Date]'] =
    E['[object Error]'] =
    E['[object Function]'] =
    E['[object Map]'] =
    E['[object Number]'] =
    E['[object Object]'] =
    E['[object RegExp]'] =
    E['[object Set]'] =
    E['[object String]'] =
    E['[object WeakMap]'] =
      false;
  var ki = function Rf(e) {
    return B(e) && yt(e.length) && !!E[X(e)];
  };
  var Pt = function Vf(e) {
      return function (t) {
        return e(t);
      };
    },
    Di = 'object' == typeof exports && exports && !exports.nodeType && exports,
    Nt = Di && 'object' == typeof module && module && !module.nodeType && module,
    To = Nt && Nt.exports === Di && Ht.process,
    be = (function () {
      try {
        return (
          (Nt && Nt.require && Nt.require('util').types) || (To && To.binding && To.binding('util'))
        );
      } catch (t) {}
    })(),
    Ei = be && be.isTypedArray,
    cr = Ei ? Pt(Ei) : ki,
    Bf = Object.prototype.hasOwnProperty;
  var dr = function Ff(e, t) {
      var r = $(e),
        o = !r && fr(e),
        n = !r && !o && We(e),
        i = !r && !o && !n && cr(e),
        a = r || o || n || i,
        s = a ? Si(e.length, String) : [],
        l = s.length;
      for (var p in e)
        (t || Bf.call(e, p)) &&
          (!a ||
            !(
              'length' == p ||
              (n && ('offset' == p || 'parent' == p)) ||
              (i && ('buffer' == p || 'byteLength' == p || 'byteOffset' == p)) ||
              ht(p, l)
            )) &&
          s.push(p);
      return s;
    },
    Ri = Qt(Object.keys, Object),
    zf = Object.prototype.hasOwnProperty;
  var Vi = function Wf(e) {
    if (!bt(e)) return Ri(e);
    var t = [];
    for (var r in Object(e)) zf.call(e, r) && 'constructor' != r && t.push(r);
    return t;
  };
  var fe = function Kf(e) {
    return ur(e) ? dr(e) : Vi(e);
  };
  var Ni = function Gf(e) {
      var t = [];
      if (null != e) for (var r in Object(e)) t.push(r);
      return t;
    },
    Jf = Object.prototype.hasOwnProperty;
  var Li = function Yf(e) {
    if (!M(e)) return Ni(e);
    var t = bt(e),
      r = [];
    for (var o in e) ('constructor' == o && (t || !Jf.call(e, o))) || r.push(o);
    return r;
  };
  var jt = function Xf(e) {
    return ur(e) ? dr(e, true) : Li(e);
  };
  var mr = function Zf(e, t) {
    for (var r = -1, o = t.length, n = e.length; ++r < o; ) e[n + r] = t[r];
    return e;
  };
  var hr = function Qf(e, t, r) {
    var o = -1,
      n = e.length;
    t < 0 && (t = -t > n ? 0 : n + t);
    (r = r > n ? n : r) < 0 && (r += n);
    n = t > r ? 0 : (r - t) >>> 0;
    t >>>= 0;
    for (var i = Array(n); ++o < n; ) i[o] = e[o + t];
    return i;
  };
  var Mi = function ec(e, t, r) {
      var o = e.length;
      return ((r = undefined === r ? o : r), !t && r >= o ? e : hr(e, t, r));
    },
    pc = RegExp(
      '[\\u200d\\ud800-\\udfff\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff\\ufe0e\\ufe0f]',
    );
  var _t = function lc(e) {
    return pc.test(e);
  };
  var $i = function uc(e) {
      return e.split('');
    },
    Bi = '\\ud800-\\udfff',
    gc = '[' + Bi + ']',
    xo = '[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]',
    So = '\\ud83c[\\udffb-\\udfff]',
    Fi = '[^' + Bi + ']',
    Ui = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    qi = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    zi = '(?:' + xo + '|' + So + ')' + '?',
    Wi = '[\\ufe0e\\ufe0f]?',
    jc = Wi + zi + ('(?:\\u200d(?:' + [Fi, Ui, qi].join('|') + ')' + Wi + zi + ')*'),
    _c = '(?:' + [Fi + xo + '?', xo, Ui, qi, gc].join('|') + ')',
    vc = RegExp(So + '(?=' + So + ')|' + _c + jc, 'g');
  var Ki = function Tc(e) {
    return e.match(vc) || [];
  };
  var Gi = function xc(e) {
    return _t(e) ? Ki(e) : $i(e);
  };
  var Hi = function Sc(e, t, r) {
    return (
      e == e && (undefined !== r && (e = e <= r ? e : r), undefined !== t && (e = e >= t ? e : t)),
      e
    );
  };
  var Lt = function Ic(e, t, r) {
    return (
      undefined === r && ((r = t), (t = undefined)),
      undefined !== r && (r = (r = ye(r)) == r ? r : 0),
      undefined !== t && (t = (t = ye(t)) == t ? t : 0),
      Hi(ye(e), t, r)
    );
  };
  var Ji = function Ac() {
    this.__data__ = new Se();
    this.size = 0;
  };
  var Yi = function Oc(e) {
    var t = this.__data__,
      r = t.delete(e);
    return ((this.size = t.size), r);
  };
  var Xi = function wc(e) {
    return this.__data__.get(e);
  };
  var Zi = function Cc(e) {
    return this.__data__.has(e);
  };
  var Qi = function Dc(e, t) {
    var r = this.__data__;
    if (r instanceof Se) {
      var o = r.__data__;
      if (!Ie || o.length < 199) return (o.push([e, t]), (this.size = ++r.size), this);
      r = this.__data__ = new Be(o);
    }
    return (r.set(e, t), (this.size = r.size), this);
  };
  function vt(e) {
    var t = (this.__data__ = new Se(e));
    this.size = t.size;
  }
  vt.prototype.clear = Ji;
  vt.prototype.delete = Yi;
  vt.prototype.get = Xi;
  vt.prototype.has = Zi;
  vt.prototype.set = Qi;
  var Re = vt;
  var ea = function Ec(e, t) {
    return e && Ee(t, fe(t), e);
  };
  var ta = function Rc(e, t) {
      return e && Ee(t, jt(t), e);
    },
    ra = 'object' == typeof exports && exports && !exports.nodeType && exports,
    oa = ra && 'object' == typeof module && module && !module.nodeType && module,
    na = oa && oa.exports === ra ? N.Buffer : undefined,
    ia = na ? na.allocUnsafe : undefined;
  var aa = function Nc(e, t) {
    if (t) return e.slice();
    var r = e.length,
      o = ia ? ia(r) : new e.constructor(r);
    return (e.copy(o), o);
  };
  var sa = function Lc(e, t) {
    for (var r = -1, o = null == e ? 0 : e.length, n = 0, i = []; ++r < o; ) {
      var a = e[r];
      t(a, r, e) && (i[n++] = a);
    }
    return i;
  };
  var gr = function Mc() {
      return [];
    },
    Bc = Object.prototype.propertyIsEnumerable,
    pa = Object.getOwnPropertySymbols,
    Fc = pa
      ? function (e) {
          return null == e
            ? []
            : ((e = Object(e)),
              sa(pa(e), function (t) {
                return Bc.call(e, t);
              }));
        }
      : gr,
    Tt = Fc;
  var la = function Uc(e, t) {
      return Ee(e, Tt(e), t);
    },
    zc = Object.getOwnPropertySymbols
      ? function (e) {
          for (var t = []; e; ) {
            mr(t, Tt(e));
            e = st(e);
          }
          return t;
        }
      : gr,
    yr = zc;
  var ua = function Wc(e, t) {
    return Ee(e, yr(e), t);
  };
  var br = function Kc(e, t, r) {
    var o = t(e);
    return $(e) ? o : mr(o, r(e));
  };
  var Mt = function Gc(e) {
    return br(e, fe, Tt);
  };
  var fa = function Hc(e) {
      return br(e, jt, yr);
    },
    Pr = K(N, 'DataView'),
    jr = K(N, 'Promise'),
    _r = K(N, 'Set'),
    ca = '[object Map]',
    da = '[object Promise]',
    ma = '[object Set]',
    ha = '[object WeakMap]',
    ga = '[object DataView]',
    Qc = me(Pr),
    ed = me(Ie),
    td = me(jr),
    rd = me(_r),
    od = me(lr),
    Ke = X;
  ((Pr && Ke(new Pr(new ArrayBuffer(1))) != ga) ||
    (Ie && Ke(new Ie()) != ca) ||
    (jr && Ke(jr.resolve()) != da) ||
    (_r && Ke(new _r()) != ma) ||
    (lr && Ke(new lr()) != ha)) &&
    (Ke = function (e) {
      var t = X(e),
        r = '[object Object]' == t ? e.constructor : undefined,
        o = r ? me(r) : '';
      if (o)
        switch (o) {
          case Qc:
            return ga;
          case ed:
            return ca;
          case td:
            return da;
          case rd:
            return ma;
          case od:
            return ha;
        }
      return t;
    });
  var Pe = Ke,
    id = Object.prototype.hasOwnProperty;
  var ya = function ad(e) {
      var t = e.length,
        r = new e.constructor(t);
      return (
        t &&
          'string' == typeof e[0] &&
          id.call(e, 'index') &&
          ((r.index = e.index), (r.input = e.input)),
        r
      );
    },
    xt = N.Uint8Array;
  var St = function pd(e) {
    var t = new e.constructor(e.byteLength);
    return (new xt(t).set(new xt(e)), t);
  };
  var ba = function ld(e, t) {
      var r = t ? St(e.buffer) : e.buffer;
      return new e.constructor(r, e.byteOffset, e.byteLength);
    },
    ud = /\w*$/;
  var Pa = function fd(e) {
      var t = new e.constructor(e.source, ud.exec(e));
      return ((t.lastIndex = e.lastIndex), t);
    },
    ja = W ? W.prototype : undefined,
    _a = ja ? ja.valueOf : undefined;
  var va = function cd(e) {
    return _a ? Object(_a.call(e)) : {};
  };
  var Ta = function dd(e, t) {
    var r = t ? St(e.buffer) : e.buffer;
    return new e.constructor(r, e.byteOffset, e.length);
  };
  var xa = function Ed(e, t, r) {
    var o = e.constructor;
    switch (t) {
      case '[object ArrayBuffer]':
        return St(e);
      case '[object Boolean]':
      case '[object Date]':
        return new o(+e);
      case '[object DataView]':
        return ba(e, r);
      case '[object Float32Array]':
      case '[object Float64Array]':
      case '[object Int8Array]':
      case '[object Int16Array]':
      case '[object Int32Array]':
      case '[object Uint8Array]':
      case '[object Uint8ClampedArray]':
      case '[object Uint16Array]':
      case '[object Uint32Array]':
        return Ta(e, r);
      case '[object Map]':
      case '[object Set]':
        return new o();
      case '[object Number]':
      case '[object String]':
        return new o(e);
      case '[object RegExp]':
        return Pa(e);
      case '[object Symbol]':
        return va(e);
    }
  };
  var Sa = function Rd(e) {
    return 'function' != typeof e.constructor || bt(e) ? {} : vi(st(e));
  };
  var Ia = function Nd(e) {
      return B(e) && '[object Map]' == Pe(e);
    },
    Aa = be && be.isMap,
    Oa = Aa ? Pt(Aa) : Ia;
  var wa = function $d(e) {
      return B(e) && '[object Set]' == Pe(e);
    },
    Ca = be && be.isSet,
    ka = Ca ? Pt(Ca) : wa,
    Da = '[object Arguments]',
    Ea = '[object Function]',
    Ra = '[object Object]',
    C = {};
  C[Da] =
    C['[object Array]'] =
    C['[object ArrayBuffer]'] =
    C['[object DataView]'] =
    C['[object Boolean]'] =
    C['[object Date]'] =
    C['[object Float32Array]'] =
    C['[object Float64Array]'] =
    C['[object Int8Array]'] =
    C['[object Int16Array]'] =
    C['[object Int32Array]'] =
    C['[object Map]'] =
    C['[object Number]'] =
    C[Ra] =
    C['[object RegExp]'] =
    C['[object Set]'] =
    C['[object String]'] =
    C['[object Symbol]'] =
    C['[object Uint8Array]'] =
    C['[object Uint8ClampedArray]'] =
    C['[object Uint16Array]'] =
    C['[object Uint32Array]'] =
      true;
  C['[object Error]'] = C[Ea] = C['[object WeakMap]'] = false;
  var Va = function vr(e, t, r, o, n, i) {
    var a,
      s = 1 & t,
      l = 2 & t,
      p = 4 & t;
    if ((r && (a = n ? r(e, o, n, i) : r(e)), undefined !== a)) return a;
    if (!M(e)) return e;
    var u = $(e);
    if (u) {
      if (((a = ya(e)), !s)) return Ti(e, a);
    } else {
      var c = Pe(e),
        m = c == Ea || '[object GeneratorFunction]' == c;
      if (We(e)) return aa(e, s);
      if (c == Ra || c == Da || (m && !n)) {
        if (((a = l || m ? {} : Sa(e)), !s)) return l ? ua(e, ta(a, e)) : la(e, ea(a, e));
      } else {
        if (!C[c]) return n ? e : {};
        a = xa(e, c, s);
      }
    }
    i || (i = new Re());
    var f = i.get(e);
    if (f) return f;
    i.set(e, a);
    ka(e)
      ? e.forEach(function (b) {
          a.add(vr(b, t, r, b, e, i));
        })
      : Oa(e) &&
        e.forEach(function (b, P) {
          a.set(P, vr(b, t, r, P, e, i));
        });
    var v = u ? undefined : (p ? (l ? fa : Mt) : l ? jt : fe)(e);
    return (
      xi(v || e, function (b, P) {
        v && (b = e[(P = b)]);
        mt(a, P, vr(b, t, r, P, e, i));
      }),
      a
    );
  };
  var Io = function hm(e) {
    return Va(e, 5);
  };
  var Na = function ym(e) {
    return (this.__data__.set(e, '__lodash_hash_undefined__'), this);
  };
  var La = function bm(e) {
    return this.__data__.has(e);
  };
  function Tr(e) {
    var t = -1,
      r = null == e ? 0 : e.length;
    for (this.__data__ = new Be(); ++t < r; ) this.add(e[t]);
  }
  Tr.prototype.add = Tr.prototype.push = Na;
  Tr.prototype.has = La;
  var Ma = Tr;
  var $a = function Pm(e, t) {
    for (var r = -1, o = null == e ? 0 : e.length; ++r < o; ) if (t(e[r], r, e)) return true;
    return false;
  };
  var Ba = function jm(e, t) {
    return e.has(t);
  };
  var xr = function Tm(e, t, r, o, n, i) {
    var a = 1 & r,
      s = e.length,
      l = t.length;
    if (s != l && !(a && l > s)) return false;
    var p = i.get(e),
      u = i.get(t);
    if (p && u) return p == t && u == e;
    var c = -1,
      m = true,
      f = 2 & r ? new Ma() : undefined;
    for (i.set(e, t), i.set(t, e); ++c < s; ) {
      var y = e[c],
        v = t[c];
      if (o) var b = a ? o(v, y, c, t, e, i) : o(y, v, c, e, t, i);
      if (undefined !== b) {
        if (b) continue;
        m = false;
        break;
      }
      if (f) {
        if (
          !$a(t, function (P, x) {
            if (!Ba(f, x) && (y === P || n(y, P, r, o, i))) return f.push(x);
          })
        ) {
          m = false;
          break;
        }
      } else if (y !== v && !n(y, v, r, o, i)) {
        m = false;
        break;
      }
    }
    return (i.delete(e), i.delete(t), m);
  };
  var Fa = function xm(e) {
    var t = -1,
      r = Array(e.size);
    return (
      e.forEach(function (o, n) {
        r[++t] = [n, o];
      }),
      r
    );
  };
  var Ua = function Sm(e) {
      var t = -1,
        r = Array(e.size);
      return (
        e.forEach(function (o) {
          r[++t] = o;
        }),
        r
      );
    },
    qa = W ? W.prototype : undefined,
    Ao = qa ? qa.valueOf : undefined;
  var za = function $m(e, t, r, o, n, i, a) {
      switch (r) {
        case '[object DataView]':
          if (e.byteLength != t.byteLength || e.byteOffset != t.byteOffset) return false;
          e = e.buffer;
          t = t.buffer;
        case '[object ArrayBuffer]':
          return !(e.byteLength != t.byteLength || !i(new xt(e), new xt(t)));
        case '[object Boolean]':
        case '[object Date]':
        case '[object Number]':
          return rt(+e, +t);
        case '[object Error]':
          return e.name == t.name && e.message == t.message;
        case '[object RegExp]':
        case '[object String]':
          return e == t + '';
        case '[object Map]':
          var s = Fa;
        case '[object Set]':
          var l = 1 & o;
          if ((s || (s = Ua), e.size != t.size && !l)) return false;
          var p = a.get(e);
          if (p) return p == t;
          o |= 2;
          a.set(e, t);
          var u = xr(s(e), s(t), o, n, i, a);
          return (a.delete(e), u);
        case '[object Symbol]':
          if (Ao) return Ao.call(e) == Ao.call(t);
      }
      return false;
    },
    Um = Object.prototype.hasOwnProperty;
  var Wa = function qm(e, t, r, o, n, i) {
      var a = 1 & r,
        s = Mt(e),
        l = s.length;
      if (l != Mt(t).length && !a) return false;
      for (var c = l; c--; ) {
        var m = s[c];
        if (!(a ? m in t : Um.call(t, m))) return false;
      }
      var f = i.get(e),
        y = i.get(t);
      if (f && y) return f == t && y == e;
      var v = true;
      i.set(e, t);
      i.set(t, e);
      for (var b = a; ++c < l; ) {
        var P = e[(m = s[c])],
          x = t[m];
        if (o) var O = a ? o(x, P, m, t, e, i) : o(P, x, m, e, t, i);
        if (!(undefined === O ? P === x || n(P, x, r, o, i) : O)) {
          v = false;
          break;
        }
        b || (b = 'constructor' == m);
      }
      if (v && !b) {
        var U = e.constructor,
          q = t.constructor;
        U != q &&
          'constructor' in e &&
          'constructor' in t &&
          !('function' == typeof U && U instanceof U && 'function' == typeof q && q instanceof q) &&
          (v = false);
      }
      return (i.delete(e), i.delete(t), v);
    },
    Ka = '[object Arguments]',
    Ga = '[object Array]',
    Sr = '[object Object]',
    Ha = Object.prototype.hasOwnProperty;
  var Ja = function Km(e, t, r, o, n, i) {
    var a = $(e),
      s = $(t),
      l = a ? Ga : Pe(e),
      p = s ? Ga : Pe(t),
      u = (l = l == Ka ? Sr : l) == Sr,
      c = (p = p == Ka ? Sr : p) == Sr,
      m = l == p;
    if (m && We(e)) {
      if (!We(t)) return false;
      a = true;
      u = false;
    }
    if (m && !u)
      return (i || (i = new Re()), a || cr(e) ? xr(e, t, r, o, n, i) : za(e, t, l, r, o, n, i));
    if (!(1 & r)) {
      var f = u && Ha.call(e, '__wrapped__'),
        y = c && Ha.call(t, '__wrapped__');
      if (f || y) {
        var v = f ? e.value() : e,
          b = y ? t.value() : t;
        return (i || (i = new Re()), n(v, b, r, o, i));
      }
    }
    return !!m && (i || (i = new Re()), Wa(e, t, r, o, n, i));
  };
  var Ir = function Ya(e, t, r, o, n) {
    return (
      e === t ||
      (null == e || null == t || (!B(e) && !B(t)) ? e != e && t != t : Ja(e, t, r, o, Ya, n))
    );
  };
  var Xa = function Jm(e, t, r, o) {
    var n = r.length,
      i = n,
      a = !o;
    if (null == e) return !i;
    for (e = Object(e); n--; ) {
      var s = r[n];
      if (a && s[2] ? s[1] !== e[s[0]] : !(s[0] in e)) return false;
    }
    for (; ++n < i; ) {
      var l = (s = r[n])[0],
        p = e[l],
        u = s[1];
      if (a && s[2]) {
        if (undefined === p && !(l in e)) return false;
      } else {
        var c = new Re();
        if (o) var m = o(p, u, l, e, t, c);
        if (!(undefined === m ? Ir(u, p, 3, o, c) : m)) return false;
      }
    }
    return true;
  };
  var Ar = function Ym(e) {
    return e == e && !M(e);
  };
  var Za = function Xm(e) {
    for (var t = fe(e), r = t.length; r--; ) {
      var o = t[r],
        n = e[o];
      t[r] = [o, n, Ar(n)];
    }
    return t;
  };
  var Or = function Zm(e, t) {
    return function (r) {
      return null != r && r[e] === t && (undefined !== t || e in Object(r));
    };
  };
  var Qa = function Qm(e) {
    var t = Za(e);
    return 1 == t.length && t[0][2]
      ? Or(t[0][0], t[0][1])
      : function (r) {
          return r === e || Xa(r, e, t);
        };
  };
  var es = function eh(e, t) {
    return null != e && t in Object(e);
  };
  var ts = function th(e, t, r) {
    for (var o = -1, n = (t = Oe(t, e)).length, i = false; ++o < n; ) {
      var a = re(t[o]);
      if (!(i = null != e && r(e, a))) break;
      e = e[a];
    }
    return i || ++o != n
      ? i
      : !!(n = null == e ? 0 : e.length) && yt(n) && ht(a, n) && ($(e) || fr(e));
  };
  var rs = function rh(e, t) {
    return null != e && ts(e, t, es);
  };
  var os = function ih(e, t) {
    return et(e) && Ar(t)
      ? Or(re(e), t)
      : function (r) {
          var o = at(r, e);
          return undefined === o && o === t ? rs(r, e) : Ir(t, o, 3);
        };
  };
  var wr = function ah(e) {
    return function (t) {
      return null == t ? undefined : t[e];
    };
  };
  var ns = function sh(e) {
    return function (t) {
      return it(t, e);
    };
  };
  var is = function ph(e) {
    return et(e) ? wr(re(e)) : ns(e);
  };
  var as = function lh(e) {
    return 'function' == typeof e
      ? e
      : null == e
        ? ji
        : 'object' == typeof e
          ? $(e)
            ? os(e[0], e[1])
            : Qa(e)
          : is(e);
  };
  var ss = function uh(e) {
      return function (t, r, o) {
        for (var n = -1, i = Object(t), a = o(t), s = a.length; s--; ) {
          var l = a[e ? s : ++n];
          if (false === r(i[l], l, i)) break;
        }
        return t;
      };
    },
    ps = ss();
  var ls = function ch(e, t) {
      return e && ps(e, t, fe);
    },
    Cr = function () {
      return N.Date.now();
    },
    hh = Math.max,
    gh = Math.min;
  var Oo = function yh(e, t, r) {
    var o,
      n,
      i,
      a,
      s,
      l,
      p = 0,
      u = false,
      c = false,
      m = true;
    if ('function' != typeof e) throw new TypeError('Expected a function');
    function f(A) {
      var z = o,
        J = n;
      return ((o = n = undefined), (p = A), (a = e.apply(J, z)));
    }
    function b(A) {
      var z = A - l;
      return undefined === l || z >= t || z < 0 || (c && A - p >= i);
    }
    function P() {
      var A = Cr();
      if (b(A)) return x(A);
      s = setTimeout(
        P,
        (function v(A) {
          var le = t - (A - l);
          return c ? gh(le, i - (A - p)) : le;
        })(A),
      );
    }
    function x(A) {
      return ((s = undefined), m && o ? f(A) : ((o = n = undefined), a));
    }
    function q() {
      var A = Cr(),
        z = b(A);
      if (((o = arguments), (n = this), (l = A), z)) {
        if (undefined === s)
          return (function y(A) {
            return ((p = A), (s = setTimeout(P, t)), u ? f(A) : a);
          })(l);
        if (c) return (clearTimeout(s), (s = setTimeout(P, t)), f(l));
      }
      return (undefined === s && (s = setTimeout(P, t)), a);
    }
    return (
      (t = ye(t) || 0),
      M(r) &&
        ((u = !!r.leading),
        (i = (c = 'maxWait' in r) ? hh(ye(r.maxWait) || 0, t) : i),
        (m = 'trailing' in r ? !!r.trailing : m)),
      (q.cancel = function O() {
        undefined !== s && clearTimeout(s);
        p = 0;
        o = l = n = s = undefined;
      }),
      (q.flush = function U() {
        return undefined === s ? a : x(Cr());
      }),
      q
    );
  };
  var us = function bh(e, t) {
    return t.length < 2 ? e : it(e, hr(t, 0, -1));
  };
  var wo = function Ph(e) {
    return 'number' == typeof e && e == pr(e);
  };
  var Co = function jh(e, t) {
    var r = {};
    return (
      (t = as(t, 3)),
      ls(e, function (o, n, i) {
        dt(r, n, t(o, n, i));
      }),
      r
    );
  };
  var fs = function _h(e, t) {
      return ((t = Oe(t, e)), null == (e = us(e, t)) || delete e[re(er(t))]);
    },
    Th = Math.floor;
  var ko = function xh(e, t) {
      var r = '';
      if (!e || t < 1 || t > 9007199254740991) return r;
      do {
        t % 2 && (r += e);
        (t = Th(t / 2)) && (e += e);
      } while (t);
      return r;
    },
    cs = wr('length'),
    ds = '\\ud800-\\udfff',
    kh = '[' + ds + ']',
    Do = '[\\u0300-\\u036f\\ufe20-\\ufe2f\\u20d0-\\u20ff]',
    Eo = '\\ud83c[\\udffb-\\udfff]',
    ms = '[^' + ds + ']',
    hs = '(?:\\ud83c[\\udde6-\\uddff]){2}',
    gs = '[\\ud800-\\udbff][\\udc00-\\udfff]',
    ys = '(?:' + Do + '|' + Eo + ')' + '?',
    bs = '[\\ufe0e\\ufe0f]?',
    Vh = bs + ys + ('(?:\\u200d(?:' + [ms, hs, gs].join('|') + ')' + bs + ys + ')*'),
    Nh = '(?:' + [ms + Do + '?', Do, hs, gs, kh].join('|') + ')',
    Ps = RegExp(Eo + '(?=' + Eo + ')|' + Nh + Vh, 'g');
  var js = function Lh(e) {
    for (var t = (Ps.lastIndex = 0); Ps.test(e); ) ++t;
    return t;
  };
  var kr = function Mh(e) {
      return _t(e) ? js(e) : cs(e);
    },
    $h = Math.ceil;
  var _s = function Bh(e, t) {
    var r = (t = undefined === t ? ' ' : Xt(t)).length;
    if (r < 2) return r ? ko(t, e) : t;
    var o = ko(t, $h(e / kr(t)));
    return _t(t) ? Mi(Gi(o), 0, e).join('') : o.slice(0, e);
  };
  var Ge = function Fh(e, t, r) {
    e = Zt(e);
    var o = (t = pr(t)) ? kr(e) : 0;
    return t && o < t ? _s(t - o, r) + e : e;
  };
  var Dr = function Uh(e, t) {
      return null == e || fs(e, t);
    },
    Er = class {
      constructor(t) {
        d(this, '_cache', new De());
        d(this, '_keepHotUntapDebounce');
        ue(this, t);
      }
      get type() {
        return 'Theatre_SheetObject_PublicAPI';
      }
      get props() {
        return T(this).propsP;
      }
      get sheet() {
        return T(this).sheet.publicApi;
      }
      get project() {
        return T(this).sheet.project.publicApi;
      }
      get address() {
        return _({}, T(this).address);
      }
      _valuesPrism() {
        return this._cache.get('_valuesPrism', () => {
          let t = T(this);
          return g(() => j(t.getValues().getValue()));
        });
      }
      onValuesChange(t, r) {
        return Rr(this._valuesPrism(), t, r);
      }
      get value() {
        let t = this._valuesPrism();
        if (!t.isHot) {
          null != this._keepHotUntapDebounce && this._keepHotUntapDebounce.flush();
          let r = t.keepHot();
          this._keepHotUntapDebounce = Oo(() => {
            r();
            this._keepHotUntapDebounce = undefined;
          }, 5e3);
        }
        return (this._keepHotUntapDebounce && this._keepHotUntapDebounce(), t.getValue());
      }
      set initialValue(t) {
        T(this).setInitialValue(t);
      }
    };
  function It(e) {
    return 'compound' === e.type || 'enum' === e.type;
  }
  function $t(e, t) {
    if (!e) return;
    let [r, ...o] = t;
    return undefined === r
      ? e
      : It(e)
        ? $t('enum' === e.type ? e.cases[r] : e.props[r], o)
        : undefined;
  }
  function Ts(e) {
    return !It(e);
  }
  var F,
    R,
    S,
    n,
    h,
    f,
    qh = (function Ro(e) {
      let t = new WeakMap();
      return (r) => (t.has(r) || t.set(r, e(r)), t.get(r));
    })((e) => {
      if ('enum' === e.type) throw new Error('Not implemented yet for enums');
      for (let t in e.props) {
        let r = e.props[t];
        if (!It(r)) return true;
        if (qh(r)) return true;
      }
      return false;
    }),
    Vr = class {
      constructor(t, r, o) {
        this.sheet = t;
        this.template = r;
        this.nativeObject = o;
        d(this, '$$isPointerToPrismProvider', true);
        d(this, 'address');
        d(this, 'publicApi');
        d(this, '_initialValue', new I({}));
        d(this, '_cache', new De());
        d(this, '_logger');
        d(this, '_internalUtilCtx');
        this._logger = t._logger.named('SheetObject', r.address.objectKey);
        this._logger._trace('creating object');
        this._internalUtilCtx = {
          logger: this._logger.utilFor.internal(),
        };
        this.address = V(_({}, r.address), {
          sheetInstanceId: t.address.sheetInstanceId,
        });
        this.publicApi = new Er(this);
      }
      get type() {
        return 'Theatre_SheetObject';
      }
      getValues() {
        return this._cache.get('getValues()', () =>
          g(() => {
            let p,
              n = gt(
                j(this.template.getDefaultValues()),
                j(this._initialValue.pointer),
                g.memo('withInitialCache', () => new WeakMap(), []),
              ),
              l = gt(
                n,
                j(this.template.getStaticValues()),
                g.memo('withStatics', () => new WeakMap(), []),
              );
            {
              let c = g.memo('seq', () => this.getSequencedValues(), []),
                m = g.memo('withSeqsCache', () => new WeakMap(), []);
              p = j(j(c));
              l = gt(l, p, m);
            }
            return ((e, t) => {
              let r = g.memo(e, () => new I(t), []);
              return (r.set(t), r);
            })('finalAtom', l).pointer;
          }),
        );
      }
      getValueByPointer(t) {
        let r = j(this.getValues()),
          { path: o } = Z(t);
        return j(ze(r, o));
      }
      pointerToPrism(t) {
        let { path: r } = Z(t);
        return g(() => {
          let o = j(this.getValues());
          return j(ze(o, r));
        });
      }
      getSequencedValues() {
        return g(() => {
          let t = g.memo(
              'tracksToProcess',
              () => this.template.getArrayOfValidSequenceTracks(),
              [],
            ),
            r = j(t),
            o = new I({}),
            n = j(this.template.configPointer);
          return (
            g.effect(
              'processTracks',
              () => {
                let i = [];
                for (let { trackId: a, pathToProp: s } of r) {
                  let l = this._trackIdToPrism(a),
                    p = $t(n, s),
                    u = p.deserializeAndSanitize,
                    c = p.interpolate,
                    m = () => {
                      let y = l.getValue();
                      if (!y) return o.setByPointer((O) => ze(O, s), undefined);
                      let v = u(y.left),
                        b = undefined === v ? p.default : v;
                      if (undefined === y.right) return o.setByPointer((O) => ze(O, s), b);
                      let P = u(y.right),
                        x = undefined === P ? p.default : P;
                      return o.setByPointer((O) => ze(O, s), c(b, x, y.progression));
                    },
                    f = l.onStale(m);
                  m();
                  i.push(f);
                }
                return () => {
                  for (let a of i) a();
                };
              },
              [n, ...r],
            ),
            o.pointer
          );
        });
      }
      _trackIdToPrism(t) {
        let r =
            this.template.project.pointers.historic.sheetsById[this.address.sheetId].sequence
              .tracksByObject[this.address.objectKey].trackData[t],
          o = this.sheet.getSequence().positionPrism;
        return _o(this._internalUtilCtx, r, o);
      }
      get propsP() {
        return this._cache.get('propsP', () =>
          ge({
            root: this,
            path: [],
          }),
        );
      }
      validateValue(t, r) {}
      setInitialValue(t) {
        this.validateValue(this.propsP, t);
        this._initialValue.set(t);
      }
    };
  function k(e) {
    return function (r, o) {
      return e(r, o());
    };
  }
  !(function (o) {
    o[(o.GENERAL = 1)] = 'GENERAL';
    o[(o.TODO = 2)] = 'TODO';
    o[(o.TROUBLESHOOTING = 4)] = 'TROUBLESHOOTING';
  })(F || (F = {}));
  (function (o) {
    o[(o.INTERNAL = 8)] = 'INTERNAL';
    o[(o.DEV = 16)] = 'DEV';
    o[(o.PUBLIC = 32)] = 'PUBLIC';
  })(R || (R = {}));
  (n = S || (S = {}))[(n.TRACE = 64)] = 'TRACE';
  n[(n.DEBUG = 128)] = 'DEBUG';
  n[(n.WARN = 256)] = 'WARN';
  n[(n.ERROR = 512)] = 'ERROR';
  (f = h || (h = {}))[(f.ERROR_PUBLIC = 545)] = 'ERROR_PUBLIC';
  f[(f.ERROR_DEV = 529)] = 'ERROR_DEV';
  f[(f._HMM = 524)] = '_HMM';
  f[(f._TODO = 522)] = '_TODO';
  f[(f._ERROR = 521)] = '_ERROR';
  f[(f.WARN_PUBLIC = 289)] = 'WARN_PUBLIC';
  f[(f.WARN_DEV = 273)] = 'WARN_DEV';
  f[(f._KAPOW = 268)] = '_KAPOW';
  f[(f._WARN = 265)] = '_WARN';
  f[(f.DEBUG_DEV = 145)] = 'DEBUG_DEV';
  f[(f._DEBUG = 137)] = '_DEBUG';
  f[(f.TRACE_DEV = 81)] = 'TRACE_DEV';
  f[(f._TRACE = 73)] = '_TRACE';
  var Q = {
    _hmm: ee(524),
    _todo: ee(522),
    _error: ee(521),
    errorDev: ee(529),
    errorPublic: ee(545),
    _kapow: ee(268),
    _warn: ee(265),
    warnDev: ee(273),
    warnPublic: ee(289),
    _debug: ee(137),
    debugDev: ee(145),
    _trace: ee(73),
    traceDev: ee(81),
  };
  function ee(e) {
    return Object.freeze({
      audience: He(e, 8) ? 'internal' : He(e, 16) ? 'dev' : 'public',
      category: He(e, 4) ? 'troubleshooting' : He(e, 2) ? 'todo' : 'general',
      level: He(e, 512) ? 512 : He(e, 256) ? 256 : He(e, 128) ? 128 : 64,
    });
  }
  function He(e, t) {
    return (e & t) === t;
  }
  function D(e, t) {
    return (32 == (32 & t) || (16 == (16 & t) ? e.dev : 8 == (8 & t) && e.internal)) && e.min <= t;
  }
  var je = {
    loggingConsoleStyle: true,
    loggerConsoleStyle: true,
    includes: Object.freeze({
      internal: false,
      dev: false,
      min: 256,
    }),
    filtered: function () {},
    include: function () {
      return {};
    },
    create: null,
    creatExt: null,
    named(e, t, r) {
      return this.create({
        names: [
          ...e.names,
          {
            name: t,
            key: r,
          },
        ],
      });
    },
    style: {
      bold: undefined,
      italic: undefined,
      cssMemo: new Map([['', '']]),
      collapseOnRE: /[a-z- ]+/g,
      color: undefined,
      collapsed(e) {
        if (e.length < 5) return e;
        let t = e.replace(this.collapseOnRE, '');
        return (this.cssMemo.has(t) || this.cssMemo.set(t, this.css(e)), t);
      },
      css(e) {
        var o, n, i, a;
        let t = this.cssMemo.get(e);
        if (t) return t;
        let r = `color:${null != (n = null == (o = this.color) ? undefined : o.call(this, e)) ? n : `hsl(${(e.charCodeAt(0) + e.charCodeAt(e.length - 1)) % 360}, 100%, 60%)`}`;
        return (
          (null == (i = this.bold) ? undefined : i.test(e)) && (r += ';font-weight:600'),
          (null == (a = this.italic) ? undefined : a.test(e)) && (r += ';font-style:italic'),
          this.cssMemo.set(e, r),
          r
        );
      },
    },
  };
  function Bt(e = console, t = {}) {
    let r = V(_({}, je), {
        includes: _({}, je.includes),
      }),
      o = {
        styled: Kh.bind(r, e),
        noStyle: Hh.bind(r, e),
      },
      n = Wh.bind(r);
    function i() {
      return r.loggingConsoleStyle && r.loggerConsoleStyle ? o.styled : o.noStyle;
    }
    return (
      (r.create = i()),
      {
        configureLogger(a) {
          var s;
          'console' === a
            ? ((r.loggerConsoleStyle = je.loggerConsoleStyle), (r.create = i()))
            : 'console' === a.type
              ? ((r.loggerConsoleStyle = null != (s = a.style) ? s : je.loggerConsoleStyle),
                (r.create = i()))
              : 'keyed' === a.type
                ? ((r.creatExt = (l) => a.keyed(l.names)), (r.create = n))
                : 'named' === a.type && ((r.creatExt = zh.bind(null, a.named)), (r.create = n));
        },
        configureLogging(a) {
          var s, l, p, u, c;
          r.includes.dev = null != (s = a.dev) ? s : je.includes.dev;
          r.includes.internal = null != (l = a.internal) ? l : je.includes.internal;
          r.includes.min = null != (p = a.min) ? p : je.includes.min;
          r.include = null != (u = a.include) ? u : je.include;
          r.loggingConsoleStyle = null != (c = a.consoleStyle) ? c : je.loggingConsoleStyle;
          r.create = i();
        },
        getLogger: () =>
          r.create({
            names: [],
          }),
      }
    );
  }
  function zh(e, t) {
    let r = [];
    for (let { name: o, key: n } of t.names) r.push(null == n ? o : `${o} (${n})`);
    return e(r);
  }
  function Wh(e) {
    let t = _(_({}, this.includes), this.include(e)),
      r = this.filtered,
      o = this.named.bind(this, e),
      n = this.creatExt(e),
      i = D(t, 524),
      a = D(t, 522),
      s = D(t, 521),
      l = D(t, 529),
      p = D(t, 545),
      u = D(t, 265),
      c = D(t, 268),
      m = D(t, 273),
      f = D(t, 289),
      y = D(t, 137),
      v = D(t, 145),
      b = D(t, 73),
      P = D(t, 81),
      x = i ? n.error.bind(n, Q._hmm) : r.bind(e, 524),
      O = a ? n.error.bind(n, Q._todo) : r.bind(e, 522),
      U = s ? n.error.bind(n, Q._error) : r.bind(e, 521),
      q = l ? n.error.bind(n, Q.errorDev) : r.bind(e, 529),
      A = p ? n.error.bind(n, Q.errorPublic) : r.bind(e, 545),
      z = c ? n.warn.bind(n, Q._kapow) : r.bind(e, 268),
      J = u ? n.warn.bind(n, Q._warn) : r.bind(e, 265),
      le = m ? n.warn.bind(n, Q.warnDev) : r.bind(e, 273),
      Ve = f ? n.warn.bind(n, Q.warnPublic) : r.bind(e, 273),
      Ne = y ? n.debug.bind(n, Q._debug) : r.bind(e, 137),
      Le = v ? n.debug.bind(n, Q.debugDev) : r.bind(e, 145),
      Me = b ? n.trace.bind(n, Q._trace) : r.bind(e, 73),
      $e = P ? n.trace.bind(n, Q.traceDev) : r.bind(e, 81),
      L = {
        _hmm: x,
        _todo: O,
        _error: U,
        errorDev: q,
        errorPublic: A,
        _kapow: z,
        _warn: J,
        warnDev: le,
        warnPublic: Ve,
        _debug: Ne,
        debugDev: Le,
        _trace: Me,
        traceDev: $e,
        lazy: {
          _hmm: i ? k(x) : x,
          _todo: a ? k(O) : O,
          _error: s ? k(U) : U,
          errorDev: l ? k(q) : q,
          errorPublic: p ? k(A) : A,
          _kapow: c ? k(z) : z,
          _warn: u ? k(J) : J,
          warnDev: m ? k(le) : le,
          warnPublic: f ? k(Ve) : Ve,
          _debug: y ? k(Ne) : Ne,
          debugDev: v ? k(Le) : Le,
          _trace: b ? k(Me) : Me,
          traceDev: P ? k($e) : $e,
        },
        named: o,
        utilFor: {
          internal: () => ({
            debug: L._debug,
            error: L._error,
            warn: L._warn,
            trace: L._trace,
            named: (Y, w) => L.named(Y, w).utilFor.internal(),
          }),
          dev: () => ({
            debug: L.debugDev,
            error: L.errorDev,
            warn: L.warnDev,
            trace: L.traceDev,
            named: (Y, w) => L.named(Y, w).utilFor.dev(),
          }),
          public: () => ({
            error: L.errorPublic,
            warn: L.warnPublic,
            debug(Y, w) {
              L._warn(`(public "debug" filtered out) ${Y}`, w);
            },
            trace(Y, w) {
              L._warn(`(public "trace" filtered out) ${Y}`, w);
            },
            named: (Y, w) => L.named(Y, w).utilFor.public(),
          }),
        },
      };
    return L;
  }
  function Kh(e, t) {
    let r = _(_({}, this.includes), this.include(t)),
      o = [],
      n = '';
    for (let l = 0; l < t.names.length; l++) {
      let { name: p, key: u } = t.names[l];
      if (((n += ` %c${p}`), o.push(this.style.css(p)), null != u)) {
        let c = `%c#${u}`;
        n += c;
        o.push(this.style.css(c));
      }
    }
    let i = this.filtered,
      a = this.named.bind(this, t),
      s = [n, ...o];
    return xs(
      i,
      t,
      r,
      e,
      s,
      (function Gh(e) {
        let t = e.slice(0);
        for (let r = 1; r < t.length; r++)
          t[r] += ';background-color:#e0005a;padding:2px;color:white';
        return t;
      })(s),
      a,
    );
  }
  function Hh(e, t) {
    let r = _(_({}, this.includes), this.include(t)),
      o = '';
    for (let s = 0; s < t.names.length; s++) {
      let { name: l, key: p } = t.names[s];
      o += ` ${l}`;
      null != p && (o += `#${p}`);
    }
    let a = [o];
    return xs(this.filtered, t, r, e, a, a, this.named.bind(this, t));
  }
  function xs(e, t, r, o, n, i, a) {
    let s = D(r, 524),
      l = D(r, 522),
      p = D(r, 521),
      u = D(r, 529),
      c = D(r, 545),
      m = D(r, 265),
      f = D(r, 268),
      y = D(r, 273),
      v = D(r, 289),
      b = D(r, 137),
      P = D(r, 145),
      x = D(r, 73),
      O = D(r, 81),
      U = s ? o.error.bind(o, ...n) : e.bind(t, 524),
      q = l ? o.error.bind(o, ...n) : e.bind(t, 522),
      A = p ? o.error.bind(o, ...n) : e.bind(t, 521),
      z = u ? o.error.bind(o, ...n) : e.bind(t, 529),
      J = c ? o.error.bind(o, ...n) : e.bind(t, 545),
      le = f ? o.warn.bind(o, ...i) : e.bind(t, 268),
      Ve = m ? o.warn.bind(o, ...n) : e.bind(t, 265),
      Ne = y ? o.warn.bind(o, ...n) : e.bind(t, 273),
      Le = v ? o.warn.bind(o, ...n) : e.bind(t, 273),
      Me = b ? o.info.bind(o, ...n) : e.bind(t, 137),
      $e = P ? o.info.bind(o, ...n) : e.bind(t, 145),
      L = x ? o.debug.bind(o, ...n) : e.bind(t, 73),
      Y = O ? o.debug.bind(o, ...n) : e.bind(t, 81),
      w = {
        _hmm: U,
        _todo: q,
        _error: A,
        errorDev: z,
        errorPublic: J,
        _kapow: le,
        _warn: Ve,
        warnDev: Ne,
        warnPublic: Le,
        _debug: Me,
        debugDev: $e,
        _trace: L,
        traceDev: Y,
        lazy: {
          _hmm: s ? k(U) : U,
          _todo: l ? k(q) : q,
          _error: p ? k(A) : A,
          errorDev: u ? k(z) : z,
          errorPublic: c ? k(J) : J,
          _kapow: f ? k(le) : le,
          _warn: m ? k(Ve) : Ve,
          warnDev: y ? k(Ne) : Ne,
          warnPublic: v ? k(Le) : Le,
          _debug: b ? k(Me) : Me,
          debugDev: P ? k($e) : $e,
          _trace: x ? k(L) : L,
          traceDev: O ? k(Y) : Y,
        },
        named: a,
        utilFor: {
          internal: () => ({
            debug: w._debug,
            error: w._error,
            warn: w._warn,
            trace: w._trace,
            named: (ce, de) => w.named(ce, de).utilFor.internal(),
          }),
          dev: () => ({
            debug: w.debugDev,
            error: w.errorDev,
            warn: w.warnDev,
            trace: w.traceDev,
            named: (ce, de) => w.named(ce, de).utilFor.dev(),
          }),
          public: () => ({
            error: w.errorPublic,
            warn: w.warnPublic,
            debug(ce, de) {
              w._warn(`(public "debug" filtered out) ${ce}`, de);
            },
            trace(ce, de) {
              w._warn(`(public "trace" filtered out) ${ce}`, de);
            },
            named: (ce, de) => w.named(ce, de).utilFor.public(),
          }),
        },
      };
    return w;
  }
  var Ss = Bt(console, {
    _debug: function () {},
    _error: function () {},
  });
  Ss.configureLogging({
    dev: true,
    min: S.TRACE,
  });
  var At = Ss.getLogger().named('Theatre.js (default logger)').utilFor.dev(),
    Is = new WeakMap();
  function As(e, t, r) {
    for (let [o, n] of Object.entries(t.props))
      if (!It(n)) {
        let i = [...e, o];
        r.set(JSON.stringify(i), r.size);
        Os(i, n, r);
      }
    for (let [o, n] of Object.entries(t.props))
      if (It(n)) {
        let i = [...e, o];
        r.set(JSON.stringify(i), r.size);
        Os(i, n, r);
      }
  }
  function Os(e, t, r) {
    if ('compound' === t.type) As(e, t, r);
    else {
      if ('enum' === t.type) throw new Error("Enums aren't supported yet");
      r.set(JSON.stringify(e), r.size);
    }
  }
  function ws(e) {
    return 'object' == typeof e && null !== e && 0 === Object.keys(e).length;
  }
  var Nr = class {
    constructor(t, r, o, n, i) {
      this.sheetTemplate = t;
      d(this, 'address');
      d(this, 'type', 'Theatre_SheetObjectTemplate');
      d(this, '_config');
      d(this, '_temp_actions_atom');
      d(this, '_cache', new De());
      d(this, 'project');
      d(this, 'pointerToSheetState');
      d(this, 'pointerToStaticOverrides');
      this.address = V(_({}, t.address), {
        objectKey: r,
      });
      this._config = new I(n);
      this._temp_actions_atom = new I(i);
      this.project = t.project;
      this.pointerToSheetState =
        this.sheetTemplate.project.pointers.historic.sheetsById[this.address.sheetId];
      this.pointerToStaticOverrides =
        this.pointerToSheetState.staticOverrides.byObject[this.address.objectKey];
    }
    get staticConfig() {
      return this._config.get();
    }
    get configPointer() {
      return this._config.pointer;
    }
    get _temp_actions() {
      return this._temp_actions_atom.get();
    }
    get _temp_actionsPointer() {
      return this._temp_actions_atom.pointer;
    }
    createInstance(t, r, o) {
      return (this._config.set(o), new Vr(t, this, r));
    }
    reconfigure(t) {
      this._config.set(t);
    }
    _temp_setActions(t) {
      this._temp_actions_atom.set(t);
    }
    getDefaultValues() {
      return this._cache.get('getDefaultValues()', () =>
        g(() =>
          (function Po(e) {
            return jo(e);
          })(j(this.configPointer)),
        ),
      );
    }
    getStaticValues() {
      return this._cache.get('getStaticValues', () =>
        g(() => {
          var n;
          let t = null != (n = j(this.pointerToStaticOverrides)) ? n : {};
          return j(this.configPointer).deserializeAndSanitize(t) || {};
        }),
      );
    }
    getArrayOfValidSequenceTracks() {
      return this._cache.get('getArrayOfValidSequenceTracks', () =>
        g(() => {
          let t = this.project.pointers.historic.sheetsById[this.address.sheetId],
            r = j(t.sequence.tracksByObject[this.address.objectKey].trackIdByPropPath);
          if (!r) return ar;
          let o = [];
          if (!r) return ar;
          let n = j(this.configPointer),
            i = Object.entries(r);
          for (let [s, l] of i) {
            let p = Jh(s);
            if (!p) continue;
            let u = $t(n, p);
            !u ||
              !Ts(u) ||
              o.push({
                pathToProp: p,
                trackId: l,
              });
          }
          let a = (function Vo(e) {
            let t = Is.get(e);
            if (t) return t;
            let r = new Map();
            return (Is.set(e, r), As([], e, r), r);
          })(n);
          return (
            o.sort((s, l) => {
              let p = s.pathToProp,
                u = l.pathToProp;
              return a.get(JSON.stringify(p)) > a.get(JSON.stringify(u)) ? 1 : -1;
            }),
            0 === o.length ? ar : o
          );
        }),
      );
    }
    getMapOfValidSequenceTracks_forStudio() {
      return this._cache.get('getMapOfValidSequenceTracks_forStudio', () =>
        g(() => {
          let t = j(this.getArrayOfValidSequenceTracks()),
            r = {};
          for (let { pathToProp: o, trackId: n } of t) li(r, o, n);
          return r;
        }),
      );
    }
    getStaticButNotSequencedOverrides() {
      return this._cache.get('getStaticButNotSequencedOverrides', () =>
        g(() => {
          let t = j(this.getStaticValues()),
            r = j(this.getArrayOfValidSequenceTracks()),
            o = Io(t);
          for (let { pathToProp: n } of r) {
            Dr(o, n);
            let i = n.slice(0, -1);
            for (; i.length > 0; ) {
              if (!ws(sr(o, i))) break;
              Dr(o, i);
              i = i.slice(0, -1);
            }
          }
          if (!ws(o)) return o;
        }),
      );
    }
    getDefaultsAtPointer(t) {
      let { path: r } = Z(t);
      return sr(this.getDefaultValues().getValue(), r);
    }
  };
  function Jh(e) {
    try {
      return JSON.parse(e);
    } catch (t) {
      return void At.warn(`property ${JSON.stringify(e)} cannot be parsed. Skipping.`);
    }
  }
  Gt(Rs());
  var Vs = class extends Error {},
    oe = class extends Vs {};
  function ne() {
    let e,
      t,
      r = new Promise((n, i) => {
        e = (a) => {
          n(a);
          o.status = 'resolved';
        };
        t = (a) => {
          i(a);
          o.status = 'rejected';
        };
      }),
      o = {
        resolve: e,
        reject: t,
        promise: r,
        status: 'pending',
      };
    return o;
  }
  var Ot = () => {},
    Mr = class {
      constructor() {
        d(this, '_stopPlayCallback', Ot);
        d(
          this,
          '_state',
          new I({
            position: 0,
            playing: false,
          }),
        );
        d(this, 'statePointer');
        this.statePointer = this._state.pointer;
      }
      destroy() {}
      pause() {
        this._stopPlayCallback();
        this.playing = false;
        this._stopPlayCallback = Ot;
      }
      gotoPosition(t) {
        this._updatePositionInState(t);
      }
      _updatePositionInState(t) {
        this._state.setByPointer((r) => r.position, t);
      }
      getCurrentPosition() {
        return this._state.get().position;
      }
      get playing() {
        return this._state.get().playing;
      }
      set playing(t) {
        this._state.setByPointer((r) => r.playing, t);
      }
      play(t, r, o, n, i) {
        this.playing && this.pause();
        this.playing = true;
        let a = r[1] - r[0];
        {
          let f = this.getCurrentPosition();
          f < r[0] || f > r[1]
            ? 'normal' === n || 'alternate' === n
              ? this._updatePositionInState(r[0])
              : ('reverse' === n || 'alternateReverse' === n) && this._updatePositionInState(r[1])
            : 'normal' === n || 'alternate' === n
              ? f === r[1] && this._updatePositionInState(r[0])
              : f === r[0] && this._updatePositionInState(r[1]);
        }
        let s = ne(),
          l = i.time,
          p = a * t,
          u = this.getCurrentPosition() - r[0];
        ('reverse' === n || 'alternateReverse' === n) && (u = r[1] - this.getCurrentPosition());
        let c = (f) => {
          let v = Math.max(f - l, 0) / 1e3,
            b = Math.min(v * o + u, p);
          if (b !== p) {
            let P = Math.floor(b / a),
              x = ((b / a) % 1) * a;
            if ('normal' !== n)
              if ('reverse' === n) x = a - x;
              else {
                let O = P % 2 == 0;
                'alternate' === n ? O || (x = a - x) : O && (x = a - x);
              }
            this._updatePositionInState(x + r[0]);
            m();
          } else {
            if ('normal' === n) this._updatePositionInState(r[1]);
            else if ('reverse' === n) this._updatePositionInState(r[0]);
            else {
              let P = (t - 1) % 2 == 0;
              'alternate' === n
                ? P
                  ? this._updatePositionInState(r[1])
                  : this._updatePositionInState(r[0])
                : P
                  ? this._updatePositionInState(r[0])
                  : this._updatePositionInState(r[1]);
            }
            this.playing = false;
            s.resolve(true);
          }
        };
        this._stopPlayCallback = () => {
          i.offThisOrNextTick(c);
          i.offNextTick(c);
          this.playing && s.resolve(false);
        };
        let m = () => i.onNextTick(c);
        return (i.onThisOrNextTick(c), s.promise);
      }
      playDynamicRange(t, r) {
        this.playing && this.pause();
        this.playing = true;
        let o = ne(),
          n = t.keepHot();
        o.promise.then(n, n);
        let i = r.time,
          a = (l) => {
            let p = Math.max(l - i, 0);
            i = l;
            let u = p / 1e3,
              c = this.getCurrentPosition(),
              m = t.getValue();
            if (c < m[0] || c > m[1]) this.gotoPosition(m[0]);
            else {
              let f = c + u;
              f > m[1] && (f = m[0] + (f - m[1]));
              this.gotoPosition(f);
            }
            s();
          };
        this._stopPlayCallback = () => {
          r.offThisOrNextTick(a);
          r.offNextTick(a);
          o.resolve(false);
        };
        let s = () => r.onNextTick(a);
        return (r.onThisOrNextTick(a), o.promise);
      }
    },
    $r = '__TheatreJS_CoreBundle',
    Br =
      (e) =>
      (...t) => {
        var r;
        switch (e) {
          case 'success':
          case 'info':
            At.debug(t.slice(0, 2).join('\n'));
            break;
          case 'warning':
            At.warn(t.slice(0, 2).join('\n'));
        }
        return 'undefined' != typeof window
          ? null == (r = window.__TheatreJS_Notifications)
            ? undefined
            : r.notify[e](...t)
          : undefined;
      },
    pe = {
      warning: Br('warning'),
      success: Br('success'),
      info: Br('info'),
      error: Br('error'),
    };
  'undefined' != typeof window &&
    (window.addEventListener('error', (e) => {
      pe.error('An error occurred', `<pre>${e.message}</pre>\n\nSee **console** for details.`);
    }),
    window.addEventListener('unhandledrejection', (e) => {
      pe.error('An error occurred', `<pre>${e.reason}</pre>\n\nSee **console** for details.`);
    }));
  var Ur,
    Fr = class {
      constructor(t, r, o) {
        this._decodedBuffer = t;
        this._audioContext = r;
        this._nodeDestination = o;
        d(this, '_mainGain');
        d(
          this,
          '_state',
          new I({
            position: 0,
            playing: false,
          }),
        );
        d(this, 'statePointer');
        d(this, '_stopPlayCallback', Ot);
        this.statePointer = this._state.pointer;
        this._mainGain = this._audioContext.createGain();
        this._mainGain.connect(this._nodeDestination);
      }
      playDynamicRange(t, r) {
        let o = ne();
        this._playing && this.pause();
        this._playing = true;
        let n,
          i = () => {
            null == n || n();
            n = this._loopInRange(t.getValue(), r).stop;
          },
          a = t.onStale(i);
        return (
          i(),
          (this._stopPlayCallback = () => {
            null == n || n();
            a();
            o.resolve(false);
          }),
          o.promise
        );
      }
      _loopInRange(t, r) {
        let n = this.getCurrentPosition(),
          i = t[1] - t[0];
        (n < t[0] || n > t[1] || n === t[1]) && this._updatePositionInState(t[0]);
        n = this.getCurrentPosition();
        let a = this._audioContext.createBufferSource();
        a.buffer = this._decodedBuffer;
        a.connect(this._mainGain);
        a.playbackRate.value = 1;
        a.loop = true;
        a.loopStart = t[0];
        a.loopEnd = t[1];
        let s = r.time,
          l = n - t[0];
        a.start(0, n);
        let p = (m) => {
            let b = ((((Math.max(m - s, 0) / 1e3) * 1 + l) / i) % 1) * i;
            this._updatePositionInState(b + t[0]);
            u();
          },
          u = () => r.onNextTick(p);
        return (
          r.onThisOrNextTick(p),
          {
            stop: () => {
              a.stop();
              a.disconnect();
              r.offThisOrNextTick(p);
              r.offNextTick(p);
            },
          }
        );
      }
      get _playing() {
        return this._state.get().playing;
      }
      set _playing(t) {
        this._state.setByPointer((r) => r.playing, t);
      }
      destroy() {}
      pause() {
        this._stopPlayCallback();
        this._playing = false;
        this._stopPlayCallback = Ot;
      }
      gotoPosition(t) {
        this._updatePositionInState(t);
      }
      _updatePositionInState(t) {
        this._state.reduce((r) =>
          V(_({}, r), {
            position: t,
          }),
        );
      }
      getCurrentPosition() {
        return this._state.get().position;
      }
      play(t, r, o, n, i) {
        this._playing && this.pause();
        this._playing = true;
        let a = this.getCurrentPosition(),
          s = r[1] - r[0];
        if ('normal' !== n)
          throw new oe(
            `Audio-controlled sequences can only be played in the "normal" direction. '${n}' given.`,
          );
        (a < r[0] || a > r[1] || a === r[1]) && this._updatePositionInState(r[0]);
        a = this.getCurrentPosition();
        let l = ne(),
          p = this._audioContext.createBufferSource();
        p.buffer = this._decodedBuffer;
        p.connect(this._mainGain);
        p.playbackRate.value = o;
        t > 1e3 &&
          (pe.warning(
            "Can't play sequences with audio more than 1000 times",
            `The sequence will still play, but only 1000 times. The \`iterationCount: ${t}\` provided to \`sequence.play()\`\nis too high for a sequence with audio.\n\nTo fix this, either set \`iterationCount\` to a lower value, or remove the audio from the sequence.`,
            [
              {
                url: 'https://www.theatrejs.com/docs/latest/manual/audio',
                title: 'Using Audio',
              },
              {
                url: 'https://www.theatrejs.com/docs/latest/api/core#sequence.attachaudio',
                title: 'Audio API',
              },
            ],
          ),
          (t = 1e3));
        t > 1 && ((p.loop = true), (p.loopStart = r[0]), (p.loopEnd = r[1]));
        let u = i.time,
          c = a - r[0],
          m = s * t;
        p.start(0, a, m - c);
        let f = (b) => {
            let x = Math.max(b - u, 0) / 1e3,
              O = Math.min(x * o + c, m);
            if (O !== m) {
              let U = ((O / s) % 1) * s;
              this._updatePositionInState(U + r[0]);
              v();
            } else {
              this._updatePositionInState(r[1]);
              this._playing = false;
              y();
              l.resolve(true);
            }
          },
          y = () => {
            p.stop();
            p.disconnect();
          };
        this._stopPlayCallback = () => {
          y();
          i.offThisOrNextTick(f);
          i.offNextTick(f);
          this._playing && l.resolve(false);
        };
        let v = () => i.onNextTick(f);
        return (i.onThisOrNextTick(f), l.promise);
      }
    },
    Ms = 0;
  function Ft(e) {
    var i;
    let r = new ct({
        onActive() {
          var a;
          null == (a = null == e ? undefined : e.start) || a.call(e);
        },
        onDormant() {
          var a;
          null == (a = null == e ? undefined : e.stop) || a.call(e);
        },
      }),
      o = {
        tick: (a) => {
          r.tick(a);
        },
        id: Ms++,
        name: null != (i = null == e ? undefined : e.name) ? i : `CustomRafDriver-${Ms}`,
        type: 'Theatre_RafDriver_PublicAPI',
      };
    return (
      ue(o, {
        type: 'Theatre_RafDriver_PrivateAPI',
        publicApi: o,
        ticker: r,
        start: null == e ? undefined : e.start,
        stop: null == e ? undefined : e.stop,
      }),
      o
    );
  }
  function Lo() {
    return (
      Ur ||
        zr(
          (function eg() {
            let e = null,
              o = Ft({
                name: 'DefaultCoreRafDriver',
                start: () => {
                  if ('undefined' != typeof window) {
                    let n = (i) => {
                      o.tick(i);
                      e = window.requestAnimationFrame(n);
                    };
                    e = window.requestAnimationFrame(n);
                  } else {
                    o.tick(0);
                    setTimeout(() => o.tick(1), 0);
                  }
                },
                stop: () => {
                  'undefined' != typeof window && null !== e && window.cancelAnimationFrame(e);
                },
              });
            return o;
          })(),
        ),
      Ur
    );
  }
  function qr() {
    return Lo().ticker;
  }
  function zr(e) {
    if (Ur) throw new Error('`setCoreRafDriver()` is already called.');
    Ur = T(e);
  }
  var Wr = class {
    get type() {
      return 'Theatre_Sequence_PublicAPI';
    }
    constructor(t) {
      ue(this, t);
    }
    play(t) {
      let r = T(this);
      if (r._project.isReady()) {
        let o = (null == t ? undefined : t.rafDriver) ? T(t.rafDriver).ticker : qr();
        return r.play(null != t ? t : {}, o);
      }
      {
        let o = ne();
        return (o.resolve(true), o.promise);
      }
    }
    pause() {
      T(this).pause();
    }
    get position() {
      return T(this).position;
    }
    set position(t) {
      T(this).position = t;
    }
    async attachAudio(t) {
      let {
          audioContext: r,
          destinationNode: o,
          decodedBuffer: n,
          gainNode: i,
        } = await (async function tg(e) {
          function t() {
            if (e.audioContext) return Promise.resolve(e.audioContext);
            let p = new AudioContext();
            return 'running' === p.state || 'undefined' == typeof window
              ? Promise.resolve(p)
              : new Promise((u) => {
                  let c = () => {
                      p.resume();
                    },
                    m = ['mousedown', 'keydown', 'touchstart'],
                    f = {
                      capture: true,
                      passive: false,
                    };
                  m.forEach((y) => {
                    window.addEventListener(y, c, f);
                  });
                  p.addEventListener('statechange', () => {
                    'running' === p.state &&
                      (m.forEach((y) => {
                        window.removeEventListener(y, c, f);
                      }),
                      u(p));
                  });
                });
          }
          async function r() {
            if (e.source instanceof AudioBuffer) return e.source;
            let u,
              c,
              f,
              p = ne();
            if ('string' != typeof e.source)
              throw new Error(
                'Error validating arguments to sequence.attachAudio(). args.source must either be a string or an instance of AudioBuffer.',
              );
            try {
              u = await fetch(e.source);
            } catch (y) {
              throw (
                console.error(y),
                new Error(`Could not fetch '${e.source}'. Network error logged above.`)
              );
            }
            try {
              c = await u.arrayBuffer();
            } catch (y) {
              throw (
                console.error(y),
                new Error(`Could not read '${e.source}' as an arrayBuffer.`)
              );
            }
            (await o).decodeAudioData(c, p.resolve, p.reject);
            try {
              f = await p.promise;
            } catch (y) {
              throw (console.error(y), new Error(`Could not decode ${e.source} as an audio file.`));
            }
            return f;
          }
          let o = t(),
            n = r(),
            [i, a] = await Promise.all([o, n]),
            s = e.destinationNode || i.destination,
            l = i.createGain();
          return (
            l.connect(s),
            {
              audioContext: i,
              decodedBuffer: a,
              gainNode: l,
              destinationNode: s,
            }
          );
        })(t),
        a = new Fr(n, r, i);
      return (
        T(this).replacePlaybackController(a),
        {
          audioContext: r,
          destinationNode: o,
          decodedBuffer: n,
          gainNode: i,
        }
      );
    }
    get pointer() {
      return T(this).pointer;
    }
  };
  var Kr = class {
      constructor(t, r, o, n, i) {
        this._project = t;
        this._sheet = r;
        this._lengthD = o;
        this._subUnitsPerUnitD = n;
        d(this, 'address');
        d(this, 'publicApi');
        d(this, '_playbackControllerBox');
        d(this, '_prismOfStatePointer');
        d(this, '_positionD');
        d(this, '_positionFormatterD');
        d(this, '_playableRangeD');
        d(
          this,
          'pointer',
          ge({
            root: this,
            path: [],
          }),
        );
        d(this, '$$isPointerToPrismProvider', true);
        d(this, '_logger');
        d(this, 'closestGridPosition', (t) => {
          let o = 1 / this.subUnitsPerUnit;
          return parseFloat((Math.round(t / o) * o).toFixed(3));
        });
        this._logger = t._logger
          .named('Sheet', r.address.sheetId)
          .named('Instance', r.address.sheetInstanceId);
        this.address = V(_({}, this._sheet.address), {
          sequenceName: 'default',
        });
        this.publicApi = new Wr(this);
        this._playbackControllerBox = new I(null != i ? i : new Mr());
        this._prismOfStatePointer = g(
          () => this._playbackControllerBox.prism.getValue().statePointer,
        );
        this._positionD = g(() => {
          let a = this._prismOfStatePointer.getValue();
          return j(a.position);
        });
        this._positionFormatterD = g(() => {
          let a = j(this._subUnitsPerUnitD);
          return new $s(a);
        });
      }
      pointerToPrism(t) {
        let { path: r } = Z(t);
        if (0 === r.length)
          return g(() => ({
            length: j(this.pointer.length),
            playing: j(this.pointer.playing),
            position: j(this.pointer.position),
          }));
        if (r.length > 1) return g(() => {});
        let [o] = r;
        return 'length' === o
          ? this._lengthD
          : 'position' === o
            ? this._positionD
            : g('playing' === o ? () => j(this._prismOfStatePointer.getValue().playing) : () => {});
      }
      get positionFormatter() {
        return this._positionFormatterD.getValue();
      }
      get prismOfStatePointer() {
        return this._prismOfStatePointer;
      }
      get length() {
        return this._lengthD.getValue();
      }
      get positionPrism() {
        return this._positionD;
      }
      get position() {
        return this._playbackControllerBox.get().getCurrentPosition();
      }
      get subUnitsPerUnit() {
        return this._subUnitsPerUnitD.getValue();
      }
      get positionSnappedToGrid() {
        return this.closestGridPosition(this.position);
      }
      set position(t) {
        let r = t;
        this.pause();
        r > this.length && (r = this.length);
        let o = this.length;
        this._playbackControllerBox.get().gotoPosition(r > o ? o : r);
      }
      getDurationCold() {
        return this._lengthD.getValue();
      }
      get playing() {
        return j(this._playbackControllerBox.get().statePointer.playing);
      }
      _makeRangeFromSequenceTemplate() {
        return g(() => [0, j(this._lengthD)]);
      }
      playDynamicRange(t, r) {
        return this._playbackControllerBox.get().playDynamicRange(t, r);
      }
      async play(t, r) {
        let o = this.length,
          n = t && t.range ? t.range : [0, o],
          i = t && 'number' == typeof t.iterationCount ? t.iterationCount : 1,
          a = t && undefined !== t.rate ? t.rate : 1,
          s = t && t.direction ? t.direction : 'normal';
        return await this._play(i, [n[0], n[1]], a, s, r);
      }
      _play(t, r, o, n, i) {
        return this._playbackControllerBox.get().play(t, r, o, n, i);
      }
      pause() {
        this._playbackControllerBox.get().pause();
      }
      replacePlaybackController(t) {
        this.pause();
        let r = this._playbackControllerBox.get();
        this._playbackControllerBox.set(t);
        let o = r.getCurrentPosition();
        r.destroy();
        t.gotoPosition(o);
      }
    },
    $s = class {
      constructor(t) {
        this._fps = t;
      }
      formatSubUnitForGrid(t) {
        let r = t % 1,
          o = 1 / this._fps;
        return Math.round(r / o) + 'f';
      }
      formatFullUnitForGrid(t) {
        let r = t,
          o = '';
        r >= wt && ((o += Math.floor(r / wt) + 'h'), (r %= wt));
        r >= Ye && ((o += Math.floor(r / Ye) + 'm'), (r %= Ye));
        r >= Je && ((o += Math.floor(r / Je) + 's'), (r %= Je));
        let n = 1 / this._fps;
        return (r >= n && ((o += Math.floor(r / n) + 'f'), (r %= n)), 0 === o.length ? '0s' : o);
      }
      formatForPlayhead(t) {
        let r = t,
          o = '';
        if (r >= wt) {
          let i = Math.floor(r / wt);
          o += Ge(i.toString(), 2, '0') + 'h';
          r %= wt;
        }
        if (r >= Ye) {
          let i = Math.floor(r / Ye);
          o += Ge(i.toString(), 2, '0') + 'm';
          r %= Ye;
        } else o.length > 0 && (o += '00m');
        if (r >= Je) {
          let i = Math.floor(r / Je);
          o += Ge(i.toString(), 2, '0') + 's';
          r %= Je;
        } else o += '00s';
        let n = 1 / this._fps;
        if (r >= n) {
          let i = Math.round(r / n);
          o += Ge(i.toString(), 2, '0') + 'f';
          r %= n;
        } else r / n > 0.98 ? ((o += Ge((1).toString(), 2, '0') + 'f'), (r %= n)) : (o += '00f');
        return 0 === o.length ? '00s00f' : o;
      }
      formatBasic(t) {
        return t.toFixed(2) + 's';
      }
    },
    Je = 1,
    Ye = 60 * Je,
    wt = 60 * Ye,
    Yr = {};
  function Gr(e, t) {
    return e.length <= t ? e : e.substr(0, t - 3) + '...';
  }
  uo(Yr, {
    boolean: () => Fo,
    compound: () => Ut,
    image: () => sg,
    number: () => Bo,
    rgba: () => cg,
    string: () => Uo,
    stringLiteral: () => yg,
  });
  var Ct = (e) =>
    'string' == typeof e
      ? `string("${Gr(e, 10)}")`
      : 'number' == typeof e
        ? `number(${Gr(String(e), 10)})`
        : null === e
          ? 'null'
          : undefined === e
            ? 'undefined'
            : 'boolean' == typeof e
              ? String(e)
              : Array.isArray(e)
                ? 'array'
                : 'object' == typeof e
                  ? 'object'
                  : 'unknown';
  function Hr(e) {
    return V(_({}, e), {
      toString() {
        return (function og(e, { removeAlphaIfOpaque: t = false } = {}) {
          let r = ((255 * e.a) | 256).toString(16).slice(1);
          return `#${((255 * e.r) | 256).toString(16).slice(1) + ((255 * e.g) | 256).toString(16).slice(1) + ((255 * e.b) | 256).toString(16).slice(1) + (t && 'ff' === r ? '' : r)}`;
        })(this, {
          removeAlphaIfOpaque: true,
        });
      },
    });
  }
  function Bs(e) {
    function t(r) {
      return r >= 0.0031308 ? 1.055 * r ** (1 / 2.4) - 0.055 : 12.92 * r;
    }
    return (function ng(e) {
      return Object.fromEntries(Object.entries(e).map(([t, r]) => [t, Lt(r, 0, 1)]));
    })({
      r: t(e.r),
      g: t(e.g),
      b: t(e.b),
      a: e.a,
    });
  }
  function Mo(e) {
    function t(r) {
      return r >= 0.04045 ? ((r + 0.055) / 1.055) ** 2.4 : r / 12.92;
    }
    return {
      r: t(e.r),
      g: t(e.g),
      b: t(e.b),
      a: e.a,
    };
  }
  function $o(e) {
    let t = 0.4122214708 * e.r + 0.5363325363 * e.g + 0.0514459929 * e.b,
      r = 0.2119034982 * e.r + 0.6806995451 * e.g + 0.1073969566 * e.b,
      o = 0.0883024619 * e.r + 0.2817188376 * e.g + 0.6299787005 * e.b,
      n = Math.cbrt(t),
      i = Math.cbrt(r),
      a = Math.cbrt(o);
    return {
      L: 0.2104542553 * n + 0.793617785 * i - 0.0040720468 * a,
      a: 1.9779984951 * n - 2.428592205 * i + 0.4505937099 * a,
      b: 0.0259040371 * n + 0.7827717662 * i - 0.808675766 * a,
      alpha: e.a,
    };
  }
  var _e = Symbol('TheatrePropType_Basic');
  function Us(e) {
    return 'object' == typeof e && !!e && 'TheatrePropType' === e[_e];
  }
  function ig(e) {
    if ('number' == typeof e) return Bo(e);
    if ('boolean' == typeof e) return Fo(e);
    if ('string' == typeof e) return Uo(e);
    if ('object' == typeof e && e) {
      if (Us(e)) return e;
      if (Vt(e)) return Ut(e);
      throw new oe(`This value is not a valid prop type: ${Ct(e)}`);
    }
    throw new oe(`This value is not a valid prop type: ${Ct(e)}`);
  }
  var Ut = (e, t = {}) => {
      let r = (function qs(e) {
          let t = {};
          for (let r of Object.keys(e)) {
            let o = e[r];
            Us(o) ? (t[r] = o) : (t[r] = ig(o));
          }
          return t;
        })(e),
        o = new WeakMap();
      return {
        type: 'compound',
        props: r,
        valueType: null,
        [_e]: 'TheatrePropType',
        label: t.label,
        default: Co(r, (i) => i.default),
        deserializeAndSanitize: (i) => {
          if ('object' != typeof i || !i) return;
          if (o.has(i)) return o.get(i);
          let a = {},
            s = false;
          for (let [l, p] of Object.entries(r))
            if (Object.prototype.hasOwnProperty.call(i, l)) {
              let u = p.deserializeAndSanitize(i[l]);
              null != u && ((s = true), (a[l] = u));
            }
          return (o.set(i, a), s ? a : undefined);
        },
      };
    },
    sg = (e, t = {}) => ({
      type: 'image',
      default: {
        type: 'image',
        id: e,
      },
      valueType: null,
      [_e]: 'TheatrePropType',
      label: t.label,
      interpolate: (o, n, i) => {
        var s;
        return {
          type: 'image',
          id: (null != (s = t.interpolate) ? s : Jr)(o.id, n.id, i),
        };
      },
      deserializeAndSanitize: pg,
    }),
    pg = (e) => {
      if (!e) return;
      let t = true;
      return (
        'string' != typeof e.id && ![null, undefined].includes(e.id) && (t = false),
        'image' !== e.type && (t = false),
        t ? e : undefined
      );
    },
    Bo = (e, t = {}) => {
      var r;
      return V(
        _(
          {
            type: 'number',
            valueType: 0,
            default: e,
            [_e]: 'TheatrePropType',
          },
          t || {},
        ),
        {
          label: t.label,
          nudgeFn: null != (r = t.nudgeFn) ? r : bg,
          nudgeMultiplier: 'number' == typeof t.nudgeMultiplier ? t.nudgeMultiplier : undefined,
          interpolate: fg,
          deserializeAndSanitize: lg(t.range),
        },
      );
    },
    lg = (e) =>
      e
        ? (t) => {
            if ('number' == typeof t && isFinite(t)) return Lt(t, e[0], e[1]);
          }
        : ug,
    ug = (e) => ('number' == typeof e && isFinite(e) ? e : undefined),
    fg = (e, t, r) => e + r * (t - e),
    cg = (
      e = {
        r: 0,
        g: 0,
        b: 0,
        a: 1,
      },
      t = {},
    ) => {
      let r = {};
      for (let o of ['r', 'g', 'b', 'a']) r[o] = Math.min(Math.max(e[o], 0), 1);
      return {
        type: 'rgba',
        valueType: null,
        default: Hr(r),
        [_e]: 'TheatrePropType',
        label: t.label,
        interpolate: mg,
        deserializeAndSanitize: dg,
      };
    },
    dg = (e) => {
      if (!e) return;
      let t = true;
      for (let o of ['r', 'g', 'b', 'a'])
        (!Object.prototype.hasOwnProperty.call(e, o) || 'number' != typeof e[o]) && (t = false);
      if (!t) return;
      let r = {};
      for (let o of ['r', 'g', 'b', 'a']) r[o] = Math.min(Math.max(e[o], 0), 1);
      return Hr(r);
    },
    mg = (e, t, r) => {
      let o = $o(Mo(e)),
        n = $o(Mo(t)),
        a = Bs(
          (function Fs(e) {
            let t = e.L + 0.3963377774 * e.a + 0.2158037573 * e.b,
              r = e.L - 0.1055613458 * e.a - 0.0638541728 * e.b,
              o = e.L - 0.0894841775 * e.a - 1.291485548 * e.b,
              n = t * t * t,
              i = r * r * r,
              a = o * o * o;
            return {
              r: 4.0767416621 * n - 3.3077115913 * i + 0.2309699292 * a,
              g: -1.2684380046 * n + 2.6097574011 * i - 0.3413193965 * a,
              b: -0.0041960863 * n - 0.7034186147 * i + 1.707614701 * a,
              a: e.alpha,
            };
          })({
            L: (1 - r) * o.L + r * n.L,
            a: (1 - r) * o.a + r * n.a,
            b: (1 - r) * o.b + r * n.b,
            alpha: (1 - r) * o.alpha + r * n.alpha,
          }),
        );
      return Hr(a);
    },
    Fo = (e, t = {}) => {
      var r;
      return {
        type: 'boolean',
        default: e,
        valueType: null,
        [_e]: 'TheatrePropType',
        label: t.label,
        interpolate: null != (r = t.interpolate) ? r : Jr,
        deserializeAndSanitize: hg,
      };
    },
    hg = (e) => ('boolean' == typeof e ? e : undefined);
  function Jr(e) {
    return e;
  }
  var Uo = (e, t = {}) => {
    var r;
    return {
      type: 'string',
      default: e,
      valueType: null,
      [_e]: 'TheatrePropType',
      label: t.label,
      interpolate: null != (r = t.interpolate) ? r : Jr,
      deserializeAndSanitize: gg,
    };
  };
  function gg(e) {
    return 'string' == typeof e ? e : undefined;
  }
  function yg(e, t, r = {}) {
    var o, n;
    return {
      type: 'stringLiteral',
      default: e,
      valuesAndLabels: _({}, t),
      [_e]: 'TheatrePropType',
      valueType: null,
      as: null != (o = r.as) ? o : 'menu',
      label: r.label,
      interpolate: null != (n = r.interpolate) ? n : Jr,
      deserializeAndSanitize(i) {
        if ('string' == typeof i && Object.prototype.hasOwnProperty.call(t, i)) return i;
      },
    };
  }
  var bg = ({ config: e, deltaX: t, deltaFraction: r, magnitude: o }) => {
    var i;
    let { range: n } = e;
    return e.nudgeMultiplier || !n || n.includes(1 / 0) || n.includes(-1 / 0)
      ? t * o * (null != (i = e.nudgeMultiplier) ? i : 1)
      : r * (n[1] - n[0]) * o;
  };
  function qt(e, t) {
    let r = ((e) =>
      e
        .replace(/^[\s\/]*/, '')
        .replace(/[\s\/]*$/, '')
        .replace(/\s*\/\s*/g, ' / '))(e);
    return r;
  }
  Gt(qo());
  new WeakMap();
  var Xr = class {
      get type() {
        return 'Theatre_Sheet_PublicAPI';
      }
      constructor(t) {
        ue(this, t);
      }
      object(t, r, o) {
        let n = T(this),
          i = qt(t),
          a = n.getObject(i),
          l =
            null == o
              ? undefined
              : o.__actions__THIS_API_IS_UNSTABLE_AND_WILL_CHANGE_IN_THE_NEXT_VERSION;
        if (a) return (l && a.template._temp_setActions(l), a.publicApi);
        {
          let p = Ut(r);
          return n.createObject(i, null, p, l).publicApi;
        }
      }
      get sequence() {
        return T(this).getSequence().publicApi;
      }
      get project() {
        return T(this).project.publicApi;
      }
      get address() {
        return _({}, T(this).address);
      }
      detachObject(t) {
        let r = T(this),
          o = qt(t);
        if (!r.getObject(o))
          return (
            pe.warning(
              `Couldn't delete object "${o}"`,
              `There is no object with key "${o}".\n\nTo fix this, make sure you are calling \`sheet.deleteObject("${o}")\` with the correct key.`,
            ),
            void console.warn(`Object key "${o}" does not exist.`)
          );
        r.deleteObject(o);
      }
    },
    Zr = class {
      constructor(t, r) {
        this.template = t;
        this.instanceId = r;
        d(this, '_objects', new I({}));
        d(this, '_sequence');
        d(this, 'address');
        d(this, 'publicApi');
        d(this, 'project');
        d(this, 'objectsP', this._objects.pointer);
        d(this, 'type', 'Theatre_Sheet');
        d(this, '_logger');
        this._logger = t.project._logger.named('Sheet', r);
        this._logger._trace('creating sheet');
        this.project = t.project;
        this.address = V(_({}, t.address), {
          sheetInstanceId: this.instanceId,
        });
        this.publicApi = new Xr(this);
      }
      createObject(t, r, o, n = {}) {
        let a = this.template.getObjectTemplate(t, r, o, n).createInstance(this, r, o);
        return (this._objects.setByPointer((s) => s[t], a), a);
      }
      getObject(t) {
        return this._objects.get()[t];
      }
      deleteObject(t) {
        this._objects.reduce((r) => {
          let o = _({}, r);
          return (delete o[t], o);
        });
      }
      getSequence() {
        if (!this._sequence) {
          let t = g(() => {
              let o = j(
                this.project.pointers.historic.sheetsById[this.address.sheetId].sequence.length,
              );
              return _g(o);
            }),
            r = g(() => {
              let o = j(
                this.project.pointers.historic.sheetsById[this.address.sheetId].sequence
                  .subUnitsPerUnit,
              );
              return vg(o);
            });
          this._sequence = new Kr(this.template.project, this, t, r);
        }
        return this._sequence;
      }
    },
    _g = (e) => ('number' == typeof e && isFinite(e) && e > 0 ? e : 10),
    vg = (e) => ('number' == typeof e && wo(e) && e >= 1 && e <= 1e3 ? e : 30),
    Qr = class {
      constructor(t, r) {
        this.project = t;
        d(this, 'type', 'Theatre_SheetTemplate');
        d(this, 'address');
        d(this, '_instances', new I({}));
        d(this, 'instancesP', this._instances.pointer);
        d(this, '_objectTemplates', new I({}));
        d(this, 'objectTemplatesP', this._objectTemplates.pointer);
        this.address = V(_({}, t.address), {
          sheetId: r,
        });
      }
      getInstance(t) {
        let r = this._instances.get()[t];
        return (r || ((r = new Zr(this, t)), this._instances.setByPointer((o) => o[t], r)), r);
      }
      getObjectTemplate(t, r, o, n) {
        let i = this._objectTemplates.get()[t];
        return (
          i || ((i = new Nr(this, t, r, o, n)), this._objectTemplates.setByPointer((a) => a[t], i)),
          i
        );
      }
    },
    Ws = (e) => new Promise((t) => setTimeout(t, e));
  function ie(e) {
    for (var t = arguments.length, r = Array(t > 1 ? t - 1 : 0), o = 1; o < t; o++)
      r[o - 1] = arguments[o];
    throw Error(
      '[Immer] minified error nr: ' +
        e +
        (r.length
          ? ' ' +
            r
              .map(function (a) {
                return "'" + a + "'";
              })
              .join(',')
          : '') +
        '. Find the full error at: https://bit.ly/3cXEKWf',
    );
  }
  function Xe(e) {
    return !!e && !!e[H];
  }
  function Ze(e) {
    return (
      !!e &&
      ((function (t) {
        if (!t || 'object' != typeof t) return false;
        var r = Object.getPrototypeOf(t);
        if (null === r) return true;
        var o = Object.hasOwnProperty.call(r, 'constructor') && r.constructor;
        return o === Object || ('function' == typeof o && Function.toString.call(o) === kg);
      })(e) ||
        Array.isArray(e) ||
        !!e[rp] ||
        !!e.constructor[rp] ||
        Wo(e) ||
        Ko(e))
    );
  }
  function zt(e, t, r) {
    undefined === r && (r = false);
    0 === kt(e)
      ? (r ? Object.keys : nn)(e).forEach(function (o) {
          (r && 'symbol' == typeof o) || t(o, e[o], e);
        })
      : e.forEach(function (o, n) {
          return t(n, o, e);
        });
  }
  function kt(e) {
    var t = e[H];
    return t ? (t.i > 3 ? t.i - 4 : t.i) : Array.isArray(e) ? 1 : Wo(e) ? 2 : Ko(e) ? 3 : 0;
  }
  function zo(e, t) {
    return 2 === kt(e) ? e.has(t) : Object.prototype.hasOwnProperty.call(e, t);
  }
  function Gs(e, t, r) {
    var o = kt(e);
    2 === o ? e.set(t, r) : 3 === o ? (e.delete(t), e.add(r)) : (e[t] = r);
  }
  function Wo(e) {
    return wg && e instanceof Map;
  }
  function Ko(e) {
    return Cg && e instanceof Set;
  }
  function Qe(e) {
    return e.o || e.t;
  }
  function Go(e) {
    if (Array.isArray(e)) return Array.prototype.slice.call(e);
    var t = Dg(e);
    delete t[H];
    for (var r = nn(t), o = 0; o < r.length; o++) {
      var n = r[o],
        i = t[n];
      false === i.writable && ((i.writable = true), (i.configurable = true));
      (i.get || i.set) &&
        (t[n] = {
          configurable: true,
          writable: true,
          enumerable: i.enumerable,
          value: e[n],
        });
    }
    return Object.create(Object.getPrototypeOf(e), t);
  }
  function Ho(e, t) {
    return (
      undefined === t && (t = false),
      Jo(e) ||
        Xe(e) ||
        !Ze(e) ||
        (kt(e) > 1 && (e.set = e.add = e.clear = e.delete = Ig),
        Object.freeze(e),
        t &&
          zt(
            e,
            function (r, o) {
              return Ho(o, true);
            },
            true,
          )),
      e
    );
  }
  function Ig() {
    ie(2);
  }
  function Jo(e) {
    return null == e || 'object' != typeof e || Object.isFrozen(e);
  }
  function ve(e) {
    var t = Eg[e];
    return (t || ie(18, e), t);
  }
  function Hs() {
    return Wt;
  }
  function Yo(e, t) {
    t && (ve('Patches'), (e.u = []), (e.s = []), (e.v = t));
  }
  function eo(e) {
    Xo(e);
    e.p.forEach(Ag);
    e.p = null;
  }
  function Xo(e) {
    e === Wt && (Wt = e.l);
  }
  function Js(e) {
    return (Wt = {
      p: [],
      l: Wt,
      h: e,
      m: true,
      _: 0,
    });
  }
  function Ag(e) {
    var t = e[H];
    0 === t.i || 1 === t.i ? t.j() : (t.O = true);
  }
  function Zo(e, t) {
    t._ = t.p.length;
    var r = t.p[0],
      o = undefined !== e && e !== r;
    return (
      t.h.g || ve('ES5').S(t, e, o),
      o
        ? (r[H].P && (eo(t), ie(4)),
          Ze(e) && ((e = to(t, e)), t.l || ro(t, e)),
          t.u && ve('Patches').M(r[H], e, t.u, t.s))
        : (e = to(t, r, [])),
      eo(t),
      t.u && t.v(t.u, t.s),
      e !== tp ? e : undefined
    );
  }
  function to(e, t, r) {
    if (Jo(t)) return t;
    var o = t[H];
    if (!o)
      return (
        zt(
          t,
          function (i, a) {
            return Ys(e, o, t, i, a, r);
          },
          true,
        ),
        t
      );
    if (o.A !== e) return t;
    if (!o.P) return (ro(e, o.t, true), o.t);
    if (!o.I) {
      o.I = true;
      o.A._--;
      var n = 4 === o.i || 5 === o.i ? (o.o = Go(o.k)) : o.o;
      zt(3 === o.i ? new Set(n) : n, function (i, a) {
        return Ys(e, o, n, i, a, r);
      });
      ro(e, n, false);
      r && e.u && ve('Patches').R(o, r, e.u, e.s);
    }
    return o.o;
  }
  function Ys(e, t, r, o, n, i) {
    if (Xe(n)) {
      var a = to(e, n, i && t && 3 !== t.i && !zo(t.D, o) ? i.concat(o) : undefined);
      if ((Gs(r, o, a), !Xe(a))) return;
      e.m = false;
    }
    if (Ze(n) && !Jo(n)) {
      if (!e.h.F && e._ < 1) return;
      to(e, n);
      (t && t.A.l) || ro(e, n);
    }
  }
  function ro(e, t, r) {
    undefined === r && (r = false);
    e.h.F && e.m && Ho(t, r);
  }
  function Qo(e, t) {
    var r = e[H];
    return (r ? Qe(r) : e)[t];
  }
  function Xs(e, t) {
    if (t in e)
      for (var r = Object.getPrototypeOf(e); r; ) {
        var o = Object.getOwnPropertyDescriptor(r, t);
        if (o) return o;
        r = Object.getPrototypeOf(r);
      }
  }
  function en(e) {
    e.P || ((e.P = true), e.l && en(e.l));
  }
  function tn(e) {
    e.o || (e.o = Go(e.t));
  }
  function rn(e, t, r) {
    var o = Wo(t)
      ? ve('MapSet').N(t, r)
      : Ko(t)
        ? ve('MapSet').T(t, r)
        : e.g
          ? (function (n, i) {
              var a = Array.isArray(n),
                s = {
                  i: a ? 1 : 0,
                  A: i ? i.A : Hs(),
                  P: false,
                  I: false,
                  D: {},
                  l: i,
                  t: n,
                  k: null,
                  o: null,
                  j: null,
                  C: false,
                },
                l = s,
                p = oo;
              a && ((l = [s]), (p = no));
              var u = Proxy.revocable(l, p),
                c = u.revoke,
                m = u.proxy;
              return ((s.k = m), (s.j = c), m);
            })(t, r)
          : ve('ES5').J(t, r);
    return ((r ? r.A : Hs()).p.push(o), o);
  }
  function Og(e) {
    return (
      Xe(e) || ie(22, e),
      (function t(r) {
        if (!Ze(r)) return r;
        var o,
          n = r[H],
          i = kt(r);
        if (n) {
          if (!n.P && (n.i < 4 || !ve('ES5').K(n))) return n.t;
          n.I = true;
          o = Zs(r, i);
          n.I = false;
        } else o = Zs(r, i);
        return (
          zt(o, function (a, s) {
            (n &&
              (function xg(e, t) {
                return 2 === kt(e) ? e.get(t) : e[t];
              })(n.t, a) === s) ||
              Gs(o, a, t(s));
          }),
          3 === i ? new Set(o) : o
        );
      })(e)
    );
  }
  function Zs(e, t) {
    switch (t) {
      case 2:
        return new Map(e);
      case 3:
        return Array.from(e);
    }
    return Go(e);
  }
  var Qs,
    Wt,
    on = 'undefined' != typeof Symbol && 'symbol' == typeof Symbol('x'),
    wg = 'undefined' != typeof Map,
    Cg = 'undefined' != typeof Set,
    ep =
      'undefined' != typeof Proxy && undefined !== Proxy.revocable && 'undefined' != typeof Reflect,
    tp = on ? Symbol.for('immer-nothing') : (((Qs = {})['immer-nothing'] = true), Qs),
    rp = on ? Symbol.for('immer-draftable') : '__$immer_draftable',
    H = on ? Symbol.for('immer-state') : '__$immer_state',
    kg = ('undefined' != typeof Symbol && Symbol.iterator, '' + Object.prototype.constructor),
    nn =
      'undefined' != typeof Reflect && Reflect.ownKeys
        ? Reflect.ownKeys
        : undefined !== Object.getOwnPropertySymbols
          ? function (e) {
              return Object.getOwnPropertyNames(e).concat(Object.getOwnPropertySymbols(e));
            }
          : Object.getOwnPropertyNames,
    Dg =
      Object.getOwnPropertyDescriptors ||
      function (e) {
        var t = {};
        return (
          nn(e).forEach(function (r) {
            t[r] = Object.getOwnPropertyDescriptor(e, r);
          }),
          t
        );
      },
    Eg = {},
    oo = {
      get: function (e, t) {
        if (t === H) return e;
        var r = Qe(e);
        if (!zo(r, t))
          return (function (n, i, a) {
            var s,
              l = Xs(i, a);
            return l
              ? 'value' in l
                ? l.value
                : null === (s = l.get) || undefined === s
                  ? undefined
                  : s.call(n.k)
              : undefined;
          })(e, r, t);
        var o = r[t];
        return e.I || !Ze(o) ? o : o === Qo(e.t, t) ? (tn(e), (e.o[t] = rn(e.A.h, o, e))) : o;
      },
      has: function (e, t) {
        return t in Qe(e);
      },
      ownKeys: function (e) {
        return Reflect.ownKeys(Qe(e));
      },
      set: function (e, t, r) {
        var o = Xs(Qe(e), t);
        if (null == o ? undefined : o.set) return (o.set.call(e.k, r), true);
        if (!e.P) {
          var n = Qo(Qe(e), t),
            i = null == n ? undefined : n[H];
          if (i && i.t === r) return ((e.o[t] = r), (e.D[t] = false), true);
          if (
            (function Sg(e, t) {
              return e === t ? 0 !== e || 1 / e == 1 / t : e != e && t != t;
            })(r, n) &&
            (undefined !== r || zo(e.t, t))
          )
            return true;
          tn(e);
          en(e);
        }
        return (
          (e.o[t] === r && 'number' != typeof r && (undefined !== r || t in e.o)) ||
          ((e.o[t] = r), (e.D[t] = true), true)
        );
      },
      deleteProperty: function (e, t) {
        return (
          undefined !== Qo(e.t, t) || t in e.t ? ((e.D[t] = false), tn(e), en(e)) : delete e.D[t],
          e.o && delete e.o[t],
          true
        );
      },
      getOwnPropertyDescriptor: function (e, t) {
        var r = Qe(e),
          o = Reflect.getOwnPropertyDescriptor(r, t);
        return (
          o && {
            writable: true,
            configurable: 1 !== e.i || 'length' !== t,
            enumerable: o.enumerable,
            value: r[t],
          }
        );
      },
      defineProperty: function () {
        ie(11);
      },
      getPrototypeOf: function (e) {
        return Object.getPrototypeOf(e.t);
      },
      setPrototypeOf: function () {
        ie(12);
      },
    },
    no = {};
  zt(oo, function (e, t) {
    no[e] = function () {
      return ((arguments[0] = arguments[0][0]), t.apply(this, arguments));
    };
  });
  no.deleteProperty = function (e, t) {
    return oo.deleteProperty.call(this, e[0], t);
  };
  no.set = function (e, t, r) {
    return oo.set.call(this, e[0], t, r, e[0]);
  };
  var Rg = (function () {
      function e(r) {
        var o = this;
        this.g = ep;
        this.F = true;
        this.produce = function (n, i, a) {
          if ('function' == typeof n && 'function' != typeof i) {
            var s = i;
            i = n;
            var l = o;
            return function (f) {
              var y = this;
              undefined === f && (f = s);
              for (var v = arguments.length, b = Array(v > 1 ? v - 1 : 0), P = 1; P < v; P++)
                b[P - 1] = arguments[P];
              return l.produce(f, function (x) {
                var O;
                return (O = i).call.apply(O, [y, x].concat(b));
              });
            };
          }
          var p;
          if (
            ('function' != typeof i && ie(6),
            undefined !== a && 'function' != typeof a && ie(7),
            Ze(n))
          ) {
            var u = Js(o),
              c = rn(o, n, undefined),
              m = true;
            try {
              p = i(c);
              m = false;
            } finally {
              m ? eo(u) : Xo(u);
            }
            return 'undefined' != typeof Promise && p instanceof Promise
              ? p.then(
                  function (f) {
                    return (Yo(u, a), Zo(f, u));
                  },
                  function (f) {
                    throw (eo(u), f);
                  },
                )
              : (Yo(u, a), Zo(p, u));
          }
          if (!n || 'object' != typeof n)
            return (p = i(n)) === tp
              ? undefined
              : (undefined === p && (p = n), o.F && Ho(p, true), p);
          ie(21, n);
        };
        this.produceWithPatches = function (n, i) {
          return 'function' == typeof n
            ? function (l) {
                for (var p = arguments.length, u = Array(p > 1 ? p - 1 : 0), c = 1; c < p; c++)
                  u[c - 1] = arguments[c];
                return o.produceWithPatches(l, function (m) {
                  return n.apply(undefined, [m].concat(u));
                });
              }
            : [
                o.produce(n, i, function (l, p) {
                  a = l;
                  s = p;
                }),
                a,
                s,
              ];
          var a, s;
        };
        'boolean' == typeof (null == r ? undefined : r.useProxies) &&
          this.setUseProxies(r.useProxies);
        'boolean' == typeof (null == r ? undefined : r.autoFreeze) &&
          this.setAutoFreeze(r.autoFreeze);
      }
      var t = e.prototype;
      return (
        (t.createDraft = function (r) {
          Ze(r) || ie(8);
          Xe(r) && (r = Og(r));
          var o = Js(this),
            n = rn(this, r, undefined);
          return ((n[H].C = true), Xo(o), n);
        }),
        (t.finishDraft = function (r, o) {
          var i = (r && r[H]).A;
          return (Yo(i, o), Zo(undefined, i));
        }),
        (t.setAutoFreeze = function (r) {
          this.F = r;
        }),
        (t.setUseProxies = function (r) {
          r && !ep && ie(20);
          this.g = r;
        }),
        (t.applyPatches = function (r, o) {
          var n;
          for (n = o.length - 1; n >= 0; n--) {
            var i = o[n];
            if (0 === i.path.length && 'replace' === i.op) {
              r = i.value;
              break;
            }
          }
          var a = ve('Patches').$;
          return Xe(r)
            ? a(r, o)
            : this.produce(r, function (s) {
                return a(s, o.slice(n + 1));
              });
        }),
        e
      );
    })(),
    te = new Rg(),
    Dt =
      (te.produce,
      te.produceWithPatches.bind(te),
      te.setAutoFreeze.bind(te),
      te.setUseProxies.bind(te),
      te.applyPatches.bind(te),
      te.createDraft.bind(te),
      te.finishDraft.bind(te),
      {
        currentProjectStateDefinitionVersion: '0.4.0',
      });
  async function an(e, t, r) {
    await Ws(0);
    e.transaction(({ drafts: o }) => {
      var u;
      let n = t.address.projectId;
      o.ephemeral.coreByProject[n] = {
        lastExportedObject: null,
        loadingState: {
          type: 'loading',
        },
      };
      o.ahistoric.coreByProject[n] = {
        ahistoricStuff: '',
      };
      let p =
        null ==
        (u = (function Ks(e) {
          return (Xe(e) || ie(23, e), e[H].t);
        })(o.historic))
          ? undefined
          : u.coreByProject[t.address.projectId];
      p
        ? r && -1 == p.revisionHistory.indexOf(r.revisionHistory[0])
          ? (function l(c) {
              o.ephemeral.coreByProject[n].loadingState = {
                type: 'browserStateIsNotBasedOnDiskState',
                onDiskState: c,
              };
            })(r)
          : (function s() {
              o.ephemeral.coreByProject[n].loadingState = {
                type: 'loaded',
              };
            })()
        : r
          ? (function a(c) {
              o.ephemeral.coreByProject[n].loadingState = {
                type: 'loaded',
              };
              o.historic.coreByProject[n] = c;
            })(r)
          : (function i() {
              o.ephemeral.coreByProject[n].loadingState = {
                type: 'loaded',
              };
              o.historic.coreByProject[n] = {
                sheetsById: {},
                definitionVersion: Dt.currentProjectStateDefinitionVersion,
                revisionHistory: [],
              };
            })();
    });
  }
  function op() {}
  function io(e) {
    var i, a;
    let t = (null == (i = null == e ? undefined : e.logging) ? undefined : i.internal)
        ? null != (a = e.logging.min)
          ? a
          : S.WARN
        : 1 / 0,
      r = t <= S.DEBUG,
      o = t <= S.ERROR,
      n = Bt(undefined, {
        _debug: r ? console.debug.bind(console, '_coreLogger(TheatreInternalLogger) debug') : op,
        _error: o ? console.error.bind(console, '_coreLogger(TheatreInternalLogger) error') : op,
      });
    if (e) {
      let { logger: s, logging: l } = e;
      s && n.configureLogger(s);
      l
        ? n.configureLogging(l)
        : n.configureLogging({
            dev: false,
          });
    }
    return n.getLogger().named('Theatre');
  }
  var ao = class {
      constructor(t, r = {}, o) {
        var i;
        this.config = r;
        this.publicApi = o;
        d(this, 'pointers');
        d(this, '_pointerProxies');
        d(this, 'address');
        d(this, '_studioReadyDeferred');
        d(this, '_assetStorageReadyDeferred');
        d(this, '_readyPromise');
        d(this, '_sheetTemplates', new I({}));
        d(this, 'sheetTemplatesP', this._sheetTemplates.pointer);
        d(this, '_studio');
        d(this, 'assetStorage');
        d(this, 'type', 'Theatre_Project');
        d(this, '_logger');
        this._logger = io({
          logging: {
            dev: true,
          },
        }).named('Project', t);
        this._logger.traceDev('creating project');
        this.address = {
          projectId: t,
        };
        let n = new I({
          ahistoric: {
            ahistoricStuff: '',
          },
          historic:
            null != (i = r.state)
              ? i
              : {
                  sheetsById: {},
                  definitionVersion: Dt.currentProjectStateDefinitionVersion,
                  revisionHistory: [],
                },
          ephemeral: {
            loadingState: {
              type: 'loaded',
            },
            lastExportedObject: null,
          },
        });
        this._assetStorageReadyDeferred = ne();
        this.assetStorage = {
          getAssetUrl: (a) => {
            var s;
            return `${null == (s = r.assets) ? undefined : s.baseUrl}/${a}`;
          },
          createAsset: () => {
            throw new Error('Please wait for Project.ready to use assets.');
          },
        };
        this._pointerProxies = {
          historic: new Fe(n.pointer.historic),
          ahistoric: new Fe(n.pointer.ahistoric),
          ephemeral: new Fe(n.pointer.ephemeral),
        };
        this.pointers = {
          historic: this._pointerProxies.historic.pointer,
          ahistoric: this._pointerProxies.ahistoric.pointer,
          ephemeral: this._pointerProxies.ephemeral.pointer,
        };
        Ue.add(t, this);
        this._studioReadyDeferred = ne();
        this._readyPromise = Promise.all([
          this._studioReadyDeferred.promise,
          this._assetStorageReadyDeferred.promise,
        ]).then(() => {});
        r.state
          ? setTimeout(() => {
              this._studio ||
                (this._studioReadyDeferred.resolve(undefined),
                this._assetStorageReadyDeferred.resolve(undefined),
                this._logger._trace('ready deferred resolved with no state'));
            }, 0)
          : 'undefined' == typeof window
            ? console.error(
                `Argument config.state in Theatre.getProject("${t}", config) is empty. You can safely ignore this message if you're developing a Next.js/Remix project in development mode. But if you are shipping to your end-users, then you need to set config.state, otherwise your project's state will be empty and nothing will animate. Learn more at https://www.theatrejs.com/docs/latest/manual/projects#state`,
              )
            : setTimeout(() => {
                if (!this._studio)
                  throw new Error(
                    `Argument config.state in Theatre.getProject("${t}", config) is empty. This is fine while you are using @theatre/core along with @theatre/studio. But since @theatre/studio is not loaded, the state of project "${t}" will be empty.\n\nTo fix this, you need to add @theatre/studio into the bundle and export the project's state. Learn how to do that at https://www.theatrejs.com/docs/latest/manual/projects#state\n`,
                  );
              }, 1e3);
      }
      attachToStudio(t) {
        if (this._studio) {
          if (this._studio !== t)
            throw new Error(
              `Project ${this.address.projectId} is already attached to studio ${this._studio.address.studioId}`,
            );
          console.warn(
            `Project ${this.address.projectId} is already attached to studio ${this._studio.address.studioId}`,
          );
        } else {
          this._studio = t;
          t.initialized.then(async () => {
            var r;
            await an(t, this, this.config.state);
            this._pointerProxies.historic.setPointer(
              t.atomP.historic.coreByProject[this.address.projectId],
            );
            this._pointerProxies.ahistoric.setPointer(
              t.atomP.ahistoric.coreByProject[this.address.projectId],
            );
            this._pointerProxies.ephemeral.setPointer(
              t.atomP.ephemeral.coreByProject[this.address.projectId],
            );
            t.createAssetStorage(
              this,
              null == (r = this.config.assets) ? undefined : r.baseUrl,
            ).then((o) => {
              this.assetStorage = o;
              this._assetStorageReadyDeferred.resolve(undefined);
            });
            this._studioReadyDeferred.resolve(undefined);
          });
        }
      }
      get isAttachedToStudio() {
        return !!this._studio;
      }
      get ready() {
        return this._readyPromise;
      }
      isReady() {
        return (
          'resolved' === this._studioReadyDeferred.status &&
          'resolved' === this._assetStorageReadyDeferred.status
        );
      }
      getOrCreateSheet(t, r = 'default') {
        let o = this._sheetTemplates.get()[t];
        return (
          o ||
            ((o = new Qr(this, t)),
            this._sheetTemplates.reduce((n) =>
              V(_({}, n), {
                [t]: o,
              }),
            )),
          o.getInstance(r)
        );
      }
      destroy() {
        this._studio
          ? console.warn(
              `Project ${this.address.projectId} is attached to studio ${this._studio.address.studioId} so will not be destroyed`,
            )
          : Ue.remove(this.address.projectId);
      }
    },
    so = class {
      get type() {
        return 'Theatre_Project_PublicAPI';
      }
      constructor(t, r = {}) {
        ue(this, new ao(t, r, this));
      }
      get ready() {
        return T(this).ready;
      }
      get isReady() {
        return T(this).isReady();
      }
      get address() {
        return _({}, T(this).address);
      }
      getAssetUrl(t) {
        if (this.isReady) return t.id ? T(this).assetStorage.getAssetUrl(t.id) : undefined;
        console.error(
          'Calling `project.getAssetUrl()` before `project.ready` is resolved, will always return `undefined`. Either use `project.ready.then(() => project.getAssetUrl())` or `await project.ready` before calling `project.getAssetUrl()`.',
        );
      }
      sheet(t, r = 'default') {
        let o = qt(t);
        return T(this).getOrCreateSheet(o, r).publicApi;
      }
      destroy() {
        T(this).destroy();
      }
    };
  Gt(qo());
  function np(e, t = {}) {
    let r = Ue.get(e);
    if (r) return r.publicApi;
    let n = io().named('Project', e);
    return (
      t.state
        ? (Lg(e, t.state), n._debug('deep validated config.state on disk'))
        : n._debug('no config.state'),
      new so(e, t)
    );
  }
  var Lg = (e, t) => {
    ((e, t) => {
      if (
        Array.isArray(t) ||
        null == t ||
        t.definitionVersion !== Dt.currentProjectStateDefinitionVersion
      )
        throw new oe(
          `Error validating conf.state in Theatre.getProject(${JSON.stringify(e)}, conf). The state seems to be formatted in a way that is unreadable to Theatre.js. Read more at https://www.theatrejs.com/docs/latest/manual/projects#state`,
        );
    })(e, t);
  };
  function Rr(e, t, r) {
    let o = r ? T(r).ticker : qr();
    if (ae(e)) return ke(e).onChange(o, t, true);
    if (we(e)) return e.onChange(o, t, true);
    throw new Error('Called onChange(p) where p is neither a pointer nor a prism.');
  }
  function ip(e) {
    if (ae(e)) return ke(e).getValue();
    throw new Error('Called val(p) where p is not a pointer.');
  }
  var po = class {
    constructor() {
      d(this, '_studio');
    }
    get type() {
      return 'Theatre_CoreBundle';
    }
    get version() {
      return '0.6.1-dev.5';
    }
    getBitsForStudio(t, r) {
      if (this._studio) throw new Error('@theatre/core is already attached to @theatre/studio');
      this._studio = t;
      r({
        projectsP: Ue.atom.pointer.projects,
        privateAPI: T,
        coreExports: sn,
        getCoreRafDriver: Lo,
      });
    }
  };
  !(function Mg() {
    if ('undefined' == typeof window) return;
    let e = window[$r];
    if (undefined !== e)
      throw 'object' == typeof e && e && 'string' == typeof e.version
        ? new Error(
            "It seems that the module '@theatre/core' is loaded more than once. This could have two possible causes:\n1. You might have two separate versions of Theatre.js in node_modules.\n2. Or this might be a bundling misconfiguration, in case you're using a bundler like Webpack/ESBuild/Rollup.\n\nNote that it **is okay** to import '@theatre/core' multiple times. But those imports should point to the same module.",
          )
        : new Error(
            `The variable window.${$r} seems to be already set by a module other than @theatre/core.`,
          );
    let t = new po();
    window[$r] = t;
    let r = window.__TheatreJS_StudioBundle;
    r && null !== r && 'Theatre_StudioBundle' === r.type && r.registerCoreBundle(t);
  })();
  window.Theatre = {
    core: pn,
    get studio() {
      alert(
        "Theatre.studio is only available in the core-and-studio.js bundle. You're using the core-only.min.js bundle.",
      );
    },
  };
})();
Hydra.ready(() => {
  TweenManager.Transforms = [
    'scale',
    'scaleX',
    'scaleY',
    'x',
    'y',
    'z',
    'rotation',
    'rotationX',
    'rotationY',
    'rotationZ',
    'skewX',
    'skewY',
    'perspective',
  ];
  TweenManager.CubicEases = [
    {
      name: 'easeOutCubic',
      curve: 'cubic-bezier(0.215, 0.610, 0.355, 1.000)',
    },
    {
      name: 'easeOutQuad',
      curve: 'cubic-bezier(0.250, 0.460, 0.450, 0.940)',
    },
    {
      name: 'easeOutQuart',
      curve: 'cubic-bezier(0.165, 0.840, 0.440, 1.000)',
    },
    {
      name: 'easeOutQuint',
      curve: 'cubic-bezier(0.230, 1.000, 0.320, 1.000)',
    },
    {
      name: 'easeOutSine',
      curve: 'cubic-bezier(0.390, 0.575, 0.565, 1.000)',
    },
    {
      name: 'easeOutExpo',
      curve: 'cubic-bezier(0.190, 1.000, 0.220, 1.000)',
    },
    {
      name: 'easeOutCirc',
      curve: 'cubic-bezier(0.075, 0.820, 0.165, 1.000)',
    },
    {
      name: 'easeOutBack',
      curve: 'cubic-bezier(0.175, 0.885, 0.320, 1.275)',
    },
    {
      name: 'easeInCubic',
      curve: 'cubic-bezier(0.550, 0.055, 0.675, 0.190)',
    },
    {
      name: 'easeInQuad',
      curve: 'cubic-bezier(0.550, 0.085, 0.680, 0.530)',
    },
    {
      name: 'easeInQuart',
      curve: 'cubic-bezier(0.895, 0.030, 0.685, 0.220)',
    },
    {
      name: 'easeInQuint',
      curve: 'cubic-bezier(0.755, 0.050, 0.855, 0.060)',
    },
    {
      name: 'easeInSine',
      curve: 'cubic-bezier(0.470, 0.000, 0.745, 0.715)',
    },
    {
      name: 'easeInCirc',
      curve: 'cubic-bezier(0.600, 0.040, 0.980, 0.335)',
    },
    {
      name: 'easeInBack',
      curve: 'cubic-bezier(0.600, -0.280, 0.735, 0.045)',
    },
    {
      name: 'easeInOutCubic',
      curve: 'cubic-bezier(0.645, 0.045, 0.355, 1.000)',
    },
    {
      name: 'easeInOutQuad',
      curve: 'cubic-bezier(0.455, 0.030, 0.515, 0.955)',
    },
    {
      name: 'easeInOutQuart',
      curve: 'cubic-bezier(0.770, 0.000, 0.175, 1.000)',
    },
    {
      name: 'easeInOutQuint',
      curve: 'cubic-bezier(0.860, 0.000, 0.070, 1.000)',
    },
    {
      name: 'easeInOutSine',
      curve: 'cubic-bezier(0.445, 0.050, 0.550, 0.950)',
    },
    {
      name: 'easeInOutExpo',
      curve: 'cubic-bezier(1.000, 0.000, 0.000, 1.000)',
    },
    {
      name: 'easeInOutCirc',
      curve: 'cubic-bezier(0.785, 0.135, 0.150, 0.860)',
    },
    {
      name: 'easeInOutBack',
      curve: 'cubic-bezier(0.680, -0.550, 0.265, 1.550)',
    },
    {
      name: 'easeInOut',
      curve: 'cubic-bezier(.42,0,.58,1)',
    },
    {
      name: 'linear',
      curve: 'linear',
    },
  ];
  TweenManager.useCSSTrans = function (props, ease, object) {
    return !(
      props.math ||
      ('string' == typeof ease && ease.includes(['Elastic', 'Bounce'])) ||
      object.multiTween ||
      TweenManager._inspectEase(ease).path ||
      !Device.tween.transition
    );
  };
  TweenManager._detectTween = function (object, props, time, ease, delay, callback) {
    return TweenManager.useCSSTrans(props, ease, object)
      ? new CSSTransition(object, props, time, ease, delay, callback)
      : new FrameTween(object, props, time, ease, delay, callback);
  };
  TweenManager._parseTransform = function (props) {
    var unitRequiresCSSTween = ['%', 'vw', 'vh', 'em'],
      transforms = '',
      translate = '';
    if (
      (props.perspective > 0 && (transforms += 'perspective(' + props.perspective + 'px)'),
      undefined !== props.x || undefined !== props.y || undefined !== props.z)
    ) {
      var x = props.x || 0,
        y = props.y || 0,
        z = props.z || 0;
      translate +=
        x +
        ('string' == typeof props.x && props.x.includes(unitRequiresCSSTween) ? '' : 'px') +
        ', ';
      translate +=
        y + ('string' == typeof props.y && props.y.includes(unitRequiresCSSTween) ? '' : 'px');
      Device.tween.css3d
        ? (transforms += 'translate3d(' + (translate += ', ' + z + 'px') + ')')
        : (transforms += 'translate(' + translate + ')');
    }
    return (
      undefined !== props.scale
        ? (transforms += 'scale(' + props.scale + ')')
        : (undefined !== props.scaleX && (transforms += 'scaleX(' + props.scaleX + ')'),
          undefined !== props.scaleY && (transforms += 'scaleY(' + props.scaleY + ')')),
      undefined !== props.rotation && (transforms += 'rotate(' + props.rotation + 'deg)'),
      undefined !== props.rotationX && (transforms += 'rotateX(' + props.rotationX + 'deg)'),
      undefined !== props.rotationY && (transforms += 'rotateY(' + props.rotationY + 'deg)'),
      undefined !== props.rotationZ && (transforms += 'rotateZ(' + props.rotationZ + 'deg)'),
      undefined !== props.skewX && (transforms += 'skewX(' + props.skewX + 'deg)'),
      undefined !== props.skewY && (transforms += 'skewY(' + props.skewY + 'deg)'),
      transforms
    );
  };
  TweenManager._clearCSSTween = function (obj) {
    obj &&
      !obj._cssTween &&
      obj.div._transition &&
      !obj.persistTween &&
      ((obj.div.style[HydraCSS.styles.vendorTransition] = ''),
      (obj.div._transition = false),
      (obj._cssTween = null));
  };
  TweenManager._isTransform = function (key) {
    return TweenManager.Transforms.indexOf(key) > -1;
  };
  TweenManager._getAllTransforms = function (object) {
    for (var obj = {}, i = TweenManager.Transforms.length - 1; i > -1; i--) {
      var tf = TweenManager.Transforms[i],
        val = object[tf];
      0 === val || ('number' != typeof val && 'string' != typeof val) || (obj[tf] = val);
    }
    return obj;
  };
  const prefix = (function () {
    let pre = '',
      dom = '';
    try {
      var styles = window.getComputedStyle(document.documentElement, '');
      return (
        (pre = (Array.prototype.slice
          .call(styles)
          .join('')
          .match(/-(moz|webkit|ms)-/) ||
          ('' === styles.OLink && ['', 'o']))[1]),
        (dom = 'WebKit|Moz|MS|O'.match(new RegExp('(' + pre + ')', 'i'))[1]),
        {
          unprefixed: 'ie' == Device.system.browser && !Device.detect('msie 9'),
          dom: dom,
          lowercase: pre,
          css: '-' + pre + '-',
          js: ('ie' == Device.system.browser ? pre[0] : pre[0].toUpperCase()) + pre.substr(1),
        }
      );
    } catch (e) {
      return {
        unprefixed: true,
        dom: '',
        lowercase: '',
        css: '',
        js: '',
      };
    }
  })();
  HydraCSS.styles = {};
  HydraCSS.styles.vendor = prefix.unprefixed ? '' : prefix.js;
  HydraCSS.styles.vendorTransition = HydraCSS.styles.vendor.length
    ? HydraCSS.styles.vendor + 'Transition'
    : 'transition';
  HydraCSS.styles.vendorTransform = HydraCSS.styles.vendor.length
    ? HydraCSS.styles.vendor + 'Transform'
    : 'transform';
  HydraCSS.vendor = prefix.css;
  HydraCSS.transformProperty = (function () {
    switch (prefix.lowercase) {
      case 'moz':
        return '-moz-transform';
      case 'webkit':
        return '-webkit-transform';
      case 'o':
        return '-o-transform';
      case 'ms':
        return '-ms-transform';
      default:
        return 'transform';
    }
  })();
  HydraCSS.tween = {};
  HydraCSS.tween.complete = prefix.unprefixed
    ? 'transitionend'
    : prefix.lowercase + 'TransitionEnd';
});
