(function (e, t) {
  'object' == typeof exports && 'undefined' != typeof module
    ? t(exports)
    : 'function' == typeof define && define.amd
      ? define(['exports'], t)
      : t(((e = e || self).goober = {}));
})(this, function (e) {
  let t = {
      data: '',
    },
    n = (e) =>
      'undefined' != typeof window
        ? (
            (e ? e.querySelector('#_goober') : window._goober) ||
            Object.assign((e || document.head).appendChild(document.createElement('style')), {
              innerHTML: ' ',
              id: '_goober',
            })
          ).firstChild
        : e || t,
    o = /(?:([A-Z0-9-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(})/gi,
    r = /\/\*[^]*?\*\/|\s\s+|\n/g,
    l = (e, t) => {
      let n,
        o = '',
        r = '',
        a = '';
      for (let s in e) {
        let c = e[s];
        'object' == typeof c
          ? ((n = t
              ? t.replace(/([^,])+/g, (e) =>
                  s.replace(/([^,])+/g, (t) =>
                    /&/.test(t) ? t.replace(/&/g, e) : e ? e + ' ' + t : t,
                  ),
                )
              : s),
            (r +=
              '@' == s[0]
                ? 'f' == s[1]
                  ? l(c, s)
                  : s + '{' + l(c, 'k' == s[1] ? '' : t) + '}'
                : l(c, n)))
          : '@' == s[0] && 'i' == s[1]
            ? (o = s + ' ' + c + ';')
            : ((s = s.replace(/[A-Z]/g, '-$&').toLowerCase()),
              (a += l.p ? l.p(s, c) : s + ':' + c + ';'));
      }
      return a[0] ? ((n = t ? t + '{' + a + '}' : a), o + n + r) : o + r;
    },
    a = {},
    s = (e) => {
      let t = '';
      for (let n in e) t += n + ('object' == typeof e[n] ? s(e[n]) : e[n]);
      return t;
    },
    c = (e, t, n, c, i) => {
      let f = 'object' == typeof e ? s(e) : e,
        p =
          a[f] ||
          (a[f] = ((e) => {
            let t = 0,
              n = 11;
            for (; t < e.length; ) n = (101 * n + e.charCodeAt(t++)) >>> 0;
            return 'go' + n;
          })(f));
      if (!a[p]) {
        let t =
          'object' == typeof e
            ? e
            : ((e) => {
                let t,
                  n = [{}];
                for (; (t = o.exec(e.replace(r, ''))); ) {
                  t[4] && n.shift();
                  t[3] ? n.unshift((n[0][t[3]] = n[0][t[3]] || {})) : t[4] || (n[0][t[1]] = t[2]);
                }
                return n[0];
              })(e);
        a[p] = l(
          i
            ? {
                ['@keyframes ' + p]: t,
              }
            : t,
          n ? '' : '.' + p,
        );
      }
      return (
        ((e, t, n) => {
          -1 == t.data.indexOf(e) && (t.data = n ? e + t.data : t.data + e);
        })(a[p], t, c),
        p
      );
    };
  function f(e) {
    let t = this || {},
      o = e.call ? e(t.p) : e;
    return c(
      o.unshift
        ? o.raw
          ? ((e, t, n) =>
              e.reduce((e, o, r) => {
                let a = t[r];
                if (a && a.call) {
                  let e = a(n),
                    t = (e && e.props && e.props.className) || (/^go/.test(e) && e);
                  a = t ? '.' + t : e && 'object' == typeof e ? (e.props ? '' : l(e, '')) : e;
                }
                return e + o + (null == a ? '' : a);
              }, ''))(o, [].slice.call(arguments, 1), t.p)
          : o.reduce((e, n) => (n ? Object.assign(e, n.call ? n(t.p) : n) : e), {})
        : o,
      n(t.target),
      t.g,
      t.o,
      t.k,
    );
  }
  let p,
    d,
    u,
    g = f.bind({
      g: 1,
    }),
    b = f.bind({
      k: 1,
    });
  e.css = f;
  e.extractCss = (e) => {
    let t = n(e),
      o = t.data;
    return ((t.data = ''), o);
  };
  e.glob = g;
  e.keyframes = b;
  e.setup = function (e, t, n, o) {
    l.p = t;
    p = e;
    d = n;
    u = o;
  };
  e.styled = function (e, t) {
    let n = this || {};
    return function () {
      let o = arguments;
      function r(l, a) {
        let s = Object.assign({}, l),
          c = s.className || r.className;
        n.p = Object.assign(
          {
            theme: d && d(),
          },
          s,
        );
        n.o = / *go\d+/.test(c);
        s.className = f.apply(n, o) + (c ? ' ' + c : '');
        t && (s.ref = a);
        let i = s.as || e;
        return (u && i[0] && u(s), p(i, s));
      }
      return t ? t(r) : r;
    };
  };
});
(function (i, n) {
  'object' == typeof exports && 'undefined' != typeof module
    ? n(exports)
    : 'function' == typeof define && define.amd
      ? define(['exports'], n)
      : n(((i = i || self).gooberPrefixer = {}));
})(this, function (i) {
  var n = new Map([
    ['align-self', '-ms-grid-row-align'],
    ['color-adjust', '-webkit-print-color-adjust'],
    ['column-gap', 'grid-column-gap'],
    ['gap', 'grid-gap'],
    ['grid-template-columns', '-ms-grid-columns'],
    ['grid-template-rows', '-ms-grid-rows'],
    ['justify-self', '-ms-grid-column-align'],
    ['margin-inline-end', '-webkit-margin-end'],
    ['margin-inline-start', '-webkit-margin-start'],
    ['overflow-wrap', 'word-wrap'],
    ['padding-inline-end', '-webkit-padding-end'],
    ['padding-inline-start', '-webkit-padding-start'],
    ['row-gap', 'grid-row-gap'],
    ['scroll-margin-bottom', 'scroll-snap-margin-bottom'],
    ['scroll-margin-left', 'scroll-snap-margin-left'],
    ['scroll-margin-right', 'scroll-snap-margin-right'],
    ['scroll-margin-top', 'scroll-snap-margin-top'],
    ['scroll-margin', 'scroll-snap-margin'],
    ['text-combine-upright', '-ms-text-combine-horizontal'],
  ]);
  i.prefix = function (i, r) {
    let t = '';
    const e = n.get(i);
    e && (t += `${e}:${r};`);
    const o = (function (i) {
      var n =
        /^(?:(text-(?:decoration$|e|or|si)|back(?:ground-cl|d|f)|box-d|(?:mask(?:$|-[ispro]|-cl)))|(tab-|column(?!-s)|text-align-l)|(ap)|(u|hy))/i.exec(
          i,
        );
      return n ? (n[1] ? 1 : n[2] ? 2 : n[3] ? 3 : 5) : 0;
    })(i);
    1 & o && (t += `-webkit-${i}:${r};`);
    2 & o && (t += `-moz-${i}:${r};`);
    4 & o && (t += `-ms-${i}:${r};`);
    const a = (function (i, n) {
      var r = /^(?:(pos)|(background-i)|((?:max-|min-)?(?:block-s|inl|he|widt))|(dis))/i.exec(i);
      return r
        ? r[1]
          ? /^sti/i.test(n)
            ? 1
            : 0
          : r[2]
            ? /^image-/i.test(n)
              ? 1
              : 0
            : r[3]
              ? '-' === n[3]
                ? 2
                : 0
              : /^(inline-)?grid$/i.test(n)
                ? 4
                : 0
        : 0;
    })(i, r);
    return (
      1 & a
        ? (t += `${i}:-webkit-${r};`)
        : 2 & a
          ? (t += `${i}:-moz-${r};`)
          : 4 & a && (t += `${i}:-ms-${r};`),
      (t += `${i}:${r};`),
      t
    );
  };
});
(function (e, o) {
  'object' == typeof exports && 'undefined' != typeof module
    ? o(exports, require('goober'))
    : 'function' == typeof define && define.amd
      ? define(['exports', 'goober'], o)
      : o(((e = e || self).gooberGlobal = {}), e.goober);
})(this, function (e, o) {
  let n = o.css.bind({
    g: 1,
  });
  e.createGlobalStyles = function () {
    const e = o.styled
      .call(
        {
          g: 1,
        },
        'div',
      )
      .apply(null, arguments);
    return function (o) {
      return (e(o), null);
    };
  };
  e.glob = n;
});
Hydra.ready(function () {
  if (
    ((window.__window = $(window)),
    (window.__document = $(document)),
    (window.__body = $(document.getElementsByTagName('body')[0])),
    (window.Stage = window.Stage && window.Stage.style ? $(window.Stage) : __body.create('#Stage')),
    window.HYDRA_MOBILE_SCROLL && Device.mobile)
  ) {
    Stage.isNormalMobileScroll = true;
    Stage.size('100%', '100vh');
    const resizeObserver = new ResizeObserver((entries) => {
      let size = entries[0].contentRect || entries[0].contentBoxSize;
      Stage.width = size.width;
      Stage.height = size.height;
      resizeObserver.unobserve(Stage.div);
    });
    resizeObserver.observe(Stage.div);
  } else Stage.size('100%');
  Stage.__useFragment = true;
  Stage.width =
    window.innerWidth || document.body.clientWidth || document.documentElement.offsetWidth;
  Stage.height =
    (Stage.isNormalMobileScroll && Stage.div.offsetHeight) ||
    window.innerHeight ||
    document.body.clientHeight ||
    document.documentElement.offsetHeight;
});
