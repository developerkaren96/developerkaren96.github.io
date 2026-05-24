(() => {
  'use strict';

  var t = /[$_\p{ID_Start}]/u,
    e = /[$_\u200C\u200D\p{ID_Continue}]/u;
  function n(t, e) {
    return (e ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(t);
  }
  function s(s, r = false) {
    const i = [];
    let a = 0;
    for (; a < s.length; ) {
      const o = s[a],
        h = function (t) {
          if (!r) throw new TypeError(t);
          i.push({
            type: 'INVALID_CHAR',
            index: a,
            value: s[a++],
          });
        };
      if ('*' !== o) {
        if ('+' !== o && '?' !== o) {
          if ('\\' !== o) {
            if ('{' !== o) {
              if ('}' !== o) {
                if (':' !== o) {
                  if ('(' !== o)
                    i.push({
                      type: 'CHAR',
                      index: a,
                      value: s[a++],
                    });
                  else {
                    let t = 1,
                      e = '',
                      r = a + 1,
                      o = false;
                    if ('?' === s[r]) {
                      h(`Pattern cannot start with "?" at ${r}`);
                      continue;
                    }
                    for (; r < s.length; ) {
                      if (!n(s[r], false)) {
                        h(`Invalid character '${s[r]}' at ${r}.`);
                        o = true;
                        break;
                      }
                      if ('\\' !== s[r]) {
                        if (')' === s[r]) {
                          if ((t--, 0 === t)) {
                            r++;
                            break;
                          }
                        } else if ('(' === s[r] && (t++, '?' !== s[r + 1])) {
                          h(`Capturing groups are not allowed at ${r}`);
                          o = true;
                          break;
                        }
                        e += s[r++];
                      } else e += s[r++] + s[r++];
                    }
                    if (o) continue;
                    if (t) {
                      h(`Unbalanced pattern at ${a}`);
                      continue;
                    }
                    if (!e) {
                      h(`Missing pattern at ${a}`);
                      continue;
                    }
                    i.push({
                      type: 'PATTERN',
                      index: a,
                      value: e,
                    });
                    a = r;
                  }
                } else {
                  let n = '',
                    r = a + 1;
                  for (; r < s.length; ) {
                    const i = s.substr(r, 1);
                    if (!((r === a + 1 && t.test(i)) || (r !== a + 1 && e.test(i)))) break;
                    n += s[r++];
                  }
                  if (!n) {
                    h(`Missing parameter name at ${a}`);
                    continue;
                  }
                  i.push({
                    type: 'NAME',
                    index: a,
                    value: n,
                  });
                  a = r;
                }
              } else
                i.push({
                  type: 'CLOSE',
                  index: a,
                  value: s[a++],
                });
            } else
              i.push({
                type: 'OPEN',
                index: a,
                value: s[a++],
              });
          } else
            i.push({
              type: 'ESCAPED_CHAR',
              index: a++,
              value: s[a++],
            });
        } else
          i.push({
            type: 'MODIFIER',
            index: a,
            value: s[a++],
          });
      } else
        i.push({
          type: 'ASTERISK',
          index: a,
          value: s[a++],
        });
    }
    return (
      i.push({
        type: 'END',
        index: a,
        value: '',
      }),
      i
    );
  }
  function r(t, e = {}) {
    const n = s(t),
      { prefixes: r = './' } = e,
      a = `[^${i(e.delimiter || '/#?')}]+?`,
      o = [];
    let h = 0,
      p = 0,
      c = '',
      u = new Set();
    const f = (t) => {
        if (p < n.length && n[p].type === t) return n[p++].value;
      },
      l = () => f('MODIFIER') || f('ASTERISK'),
      m = (t) => {
        const e = f(t);
        if (undefined !== e) return e;
        const { type: s, index: r } = n[p];
        throw new TypeError(`Unexpected ${s} at ${r}, expected ${t}`);
      },
      d = () => {
        let t,
          e = '';
        for (; (t = f('CHAR') || f('ESCAPED_CHAR')); ) e += t;
        return e;
      },
      g = e.encodePart || ((t) => t);
    for (; p < n.length; ) {
      const t = f('CHAR'),
        e = f('NAME');
      let n = f('PATTERN');
      if ((e || n || !f('ASTERISK') || (n = '.*'), e || n)) {
        let s = t || '';
        -1 === r.indexOf(s) && ((c += s), (s = ''));
        c && (o.push(g(c)), (c = ''));
        const i = e || h++;
        if (u.has(i)) throw new TypeError(`Duplicate name '${i}'.`);
        u.add(i);
        o.push({
          name: i,
          prefix: g(s),
          suffix: '',
          pattern: n || a,
          modifier: l() || '',
        });
        continue;
      }
      const s = t || f('ESCAPED_CHAR');
      if (s) c += s;
      else if (f('OPEN')) {
        const t = d(),
          e = f('NAME') || '';
        let n = f('PATTERN') || '';
        e || n || !f('ASTERISK') || (n = '.*');
        const s = d();
        m('CLOSE');
        const r = l() || '';
        if (!e && !n && !r) {
          c += t;
          continue;
        }
        if (!e && !n && !t) continue;
        c && (o.push(g(c)), (c = ''));
        o.push({
          name: e || (n ? h++ : ''),
          pattern: e && !n ? a : n,
          prefix: g(t),
          suffix: g(s),
          modifier: r,
        });
      } else {
        c && (o.push(g(c)), (c = ''));
        m('END');
      }
    }
    return o;
  }
  function i(t) {
    return t.replace(/([.+*?^${}()[\]|/\\])/g, '\\$1');
  }
  function a(t) {
    return t && t.sensitive ? 'u' : 'ui';
  }
  function o(t, e, n = {}) {
    const { strict: s = false, start: r = true, end: o = true, encode: h = (t) => t } = n,
      p = `[${i(n.endsWith || '')}]|$`,
      c = `[${i(n.delimiter || '/#?')}]`;
    let u = r ? '^' : '';
    for (const n of t)
      if ('string' == typeof n) u += i(h(n));
      else {
        const t = i(h(n.prefix)),
          s = i(h(n.suffix));
        if (n.pattern) {
          if ((e && e.push(n), t || s)) {
            if ('+' === n.modifier || '*' === n.modifier) {
              const e = '*' === n.modifier ? '?' : '';
              u += `(?:${t}((?:${n.pattern})(?:${s}${t}(?:${n.pattern}))*)${s})${e}`;
            } else u += `(?:${t}(${n.pattern})${s})${n.modifier}`;
          } else
            '+' === n.modifier || '*' === n.modifier
              ? (u += `((?:${n.pattern})${n.modifier})`)
              : (u += `(${n.pattern})${n.modifier}`);
        } else u += `(?:${t}${s})${n.modifier}`;
      }
    if (o) {
      s || (u += `${c}?`);
      u += n.endsWith ? `(?=${p})` : '$';
    } else {
      const e = t[t.length - 1],
        n = 'string' == typeof e ? c.indexOf(e[e.length - 1]) > -1 : undefined === e;
      s || (u += `(?:${c}(?=${p}))?`);
      n || (u += `(?=${c}|${p})`);
    }
    return new RegExp(u, a(n));
  }
  function h(t, e, n) {
    return t instanceof RegExp
      ? (function (t, e) {
          if (!e) return t;
          const n = /\((?:\?<(.*?)>)?(?!\?)/g;
          let s = 0,
            r = n.exec(t.source);
          for (; r; ) {
            e.push({
              name: r[1] || s++,
              prefix: '',
              suffix: '',
              modifier: '',
              pattern: '',
            });
            r = n.exec(t.source);
          }
          return t;
        })(t, e)
      : Array.isArray(t)
        ? (function (t, e, n) {
            const s = t.map((t) => h(t, e, n).source);
            return new RegExp(`(?:${s.join('|')})`, a(n));
          })(t, e, n)
        : (function (t, e, n) {
            return o(r(t, n), e, n);
          })(t, e, n);
  }
  var p = {
      delimiter: '',
      prefixes: '',
      sensitive: true,
      strict: true,
    },
    c = {
      delimiter: '.',
      prefixes: '',
      sensitive: true,
      strict: true,
    },
    u = {
      delimiter: '/',
      prefixes: '/',
      sensitive: true,
      strict: true,
    };
  function f(t, e) {
    return t.startsWith(e) ? t.substring(e.length, t.length) : t;
  }
  function l(t) {
    return !(
      !t ||
      t.length < 2 ||
      ('[' !== t[0] && (('\\' !== t[0] && '{' !== t[0]) || '[' !== t[1]))
    );
  }
  var m = ['ftp', 'file', 'http', 'https', 'ws', 'wss'];
  function d(t) {
    if (!t) return true;
    for (const e of m) if (t.test(e)) return true;
    return false;
  }
  function g(t) {
    switch (t) {
      case 'ws':
      case 'http':
        return '80';
      case 'wws':
      case 'https':
        return '443';
      case 'ftp':
        return '21';
      default:
        return '';
    }
  }
  function x(t) {
    if ('' === t) return t;
    if (/^[-+.A-Za-z0-9]*$/.test(t)) return t.toLowerCase();
    throw new TypeError(`Invalid protocol '${t}'.`);
  }
  function S(t) {
    if ('' === t) return t;
    const e = new URL('https://example.com');
    return ((e.username = t), e.username);
  }
  function w(t) {
    if ('' === t) return t;
    const e = new URL('https://example.com');
    return ((e.password = t), e.password);
  }
  function k(t) {
    if ('' === t) return t;
    if (/[\t\n\r #%/:<>?@[\]^\\|]/g.test(t)) throw new TypeError(`Invalid hostname '${t}'`);
    const e = new URL('https://example.com');
    return ((e.hostname = t), e.hostname);
  }
  function y(t) {
    if ('' === t) return t;
    if (/[^0-9a-fA-F[\]:]/g.test(t)) throw new TypeError(`Invalid IPv6 hostname '${t}'`);
    return t.toLowerCase();
  }
  function P(t) {
    if ('' === t) return t;
    if (/^[0-9]*$/.test(t) && parseInt(t) <= 65535) return t;
    throw new TypeError(`Invalid port '${t}'.`);
  }
  function R(t) {
    if ('' === t) return t;
    const e = new URL('https://example.com');
    return (
      (e.pathname = '/' !== t[0] ? '/-' + t : t),
      '/' !== t[0] ? e.pathname.substring(2, e.pathname.length) : e.pathname
    );
  }
  function b(t) {
    return '' === t ? t : new URL(`data:${t}`).pathname;
  }
  function $(t) {
    if ('' === t) return t;
    const e = new URL('https://example.com');
    return ((e.search = t), e.search.substring(1, e.search.length));
  }
  function I(t) {
    if ('' === t) return t;
    const e = new URL('https://example.com');
    return ((e.hash = t), e.hash.substring(1, e.hash.length));
  }
  var C = ['protocol', 'username', 'password', 'hostname', 'port', 'pathname', 'search', 'hash'],
    E = '*';
  function L(t, e) {
    if ('string' != typeof t) throw new TypeError("parameter 1 is not of type 'string'.");
    const n = new URL(t, e);
    return {
      protocol: n.protocol.substring(0, n.protocol.length - 1),
      username: n.username,
      password: n.password,
      hostname: n.hostname,
      port: n.port,
      pathname: n.pathname,
      search: '' != n.search ? n.search.substring(1, n.search.length) : undefined,
      hash: '' != n.hash ? n.hash.substring(1, n.hash.length) : undefined,
    };
  }
  function v(t, e, n) {
    let s;
    if ('string' == typeof e.baseURL)
      try {
        s = new URL(e.baseURL);
        t.protocol = s.protocol ? s.protocol.substring(0, s.protocol.length - 1) : '';
        t.username = s.username;
        t.password = s.password;
        t.hostname = s.hostname;
        t.port = s.port;
        t.pathname = s.pathname;
        t.search = s.search ? s.search.substring(1, s.search.length) : '';
        t.hash = s.hash ? s.hash.substring(1, s.hash.length) : '';
      } catch {
        throw new TypeError(`invalid baseURL '${e.baseURL}'.`);
      }
    if (
      ('string' == typeof e.protocol &&
        (t.protocol = (function (t, e) {
          var n;
          return (
            (t = (n = t).endsWith(':') ? n.substr(0, n.length - 1) : n),
            e || '' === t ? t : x(t)
          );
        })(e.protocol, n)),
      'string' == typeof e.username &&
        (t.username = (function (t, e) {
          if (e || '' === t) return t;
          const n = new URL('https://example.com');
          return ((n.username = t), n.username);
        })(e.username, n)),
      'string' == typeof e.password &&
        (t.password = (function (t, e) {
          if (e || '' === t) return t;
          const n = new URL('https://example.com');
          return ((n.password = t), n.password);
        })(e.password, n)),
      'string' == typeof e.hostname &&
        (t.hostname = (function (t, e) {
          return e || '' === t ? t : l(t) ? y(t) : k(t);
        })(e.hostname, n)),
      'string' == typeof e.port &&
        (t.port = (function (t, e, n) {
          return (g(e) === t && (t = ''), n || '' === t ? t : P(t));
        })(e.port, t.protocol, n)),
      'string' == typeof e.pathname)
    ) {
      if (
        ((t.pathname = e.pathname),
        s &&
          !(function (t, e) {
            return !(
              !t.length ||
              ('/' !== t[0] && (!e || t.length < 2 || ('\\' != t[0] && '{' != t[0]) || '/' != t[1]))
            );
          })(t.pathname, n))
      ) {
        const e = s.pathname.lastIndexOf('/');
        e >= 0 && (t.pathname = s.pathname.substring(0, e + 1) + t.pathname);
      }
      t.pathname = (function (t, e, n) {
        if (n || '' === t) return t;
        if (e && !m.includes(e)) return new URL(`${e}:${t}`).pathname;
        const s = '/' == t[0];
        return (
          (t = new URL(s ? t : '/-' + t, 'https://example.com').pathname),
          s || (t = t.substring(2, t.length)),
          t
        );
      })(t.pathname, t.protocol, n);
    }
    return (
      'string' == typeof e.search &&
        (t.search = (function (t, e) {
          if (((t = f(t, '?')), e || '' === t)) return t;
          const n = new URL('https://example.com');
          return ((n.search = t), n.search ? n.search.substring(1, n.search.length) : '');
        })(e.search, n)),
      'string' == typeof e.hash &&
        (t.hash = (function (t, e) {
          if (((t = f(t, '#')), e || '' === t)) return t;
          const n = new URL('https://example.com');
          return ((n.hash = t), n.hash ? n.hash.substring(1, n.hash.length) : '');
        })(e.hash, n)),
      t
    );
  }
  function A(t) {
    return t.replace(/([+*?:{}()\\])/g, '\\$1');
  }
  function T(t, e) {
    const n = `[^${((s = e.delimiter || '/#?'), s.replace(/([.+*?^${}()[\]|/\\])/g, '\\$1'))}]+?`;
    var s;
    const r = /[$_\u200C\u200D\p{ID_Continue}]/u;
    let i = '';
    for (let s = 0; s < t.length; ++s) {
      const a = t[s],
        o = s > 0 ? t[s - 1] : null,
        h = s < t.length - 1 ? t[s + 1] : null;
      if ('string' == typeof a) {
        i += A(a);
        continue;
      }
      if ('' === a.pattern) {
        if ('' === a.modifier) {
          i += A(a.prefix);
          continue;
        }
        i += `{${A(a.prefix)}}${a.modifier}`;
        continue;
      }
      const p = 'number' != typeof a.name,
        c = undefined !== e.prefixes ? e.prefixes : './';
      let u =
        '' !== a.suffix || ('' !== a.prefix && (1 !== a.prefix.length || !c.includes(a.prefix)));
      if (!u && p && a.pattern === n && '' === a.modifier && h && !h.prefix && !h.suffix)
        if ('string' == typeof h) {
          const t = h.length > 0 ? h[0] : '';
          u = r.test(t);
        } else u = 'number' == typeof h.name;
      if (!u && '' === a.prefix && o && 'string' == typeof o && o.length > 0) {
        const t = o[o.length - 1];
        u = c.includes(t);
      }
      u && (i += '{');
      i += A(a.prefix);
      p && (i += `:${a.name}`);
      '.*' === a.pattern
        ? p || (o && 'string' != typeof o && !o.modifier && !u && '' === a.prefix)
          ? (i += '(.*)')
          : (i += '*')
        : a.pattern === n
          ? p || (i += `(${n})`)
          : (i += `(${a.pattern})`);
      a.pattern === n && p && '' !== a.suffix && r.test(a.suffix[0]) && (i += '\\');
      i += A(a.suffix);
      u && (i += '}');
      i += a.modifier;
    }
    return i;
  }
  var U = class {
    constructor(t = {}, e) {
      this.regexp = {};
      this.keys = {};
      this.component_pattern = {};
      try {
        if ('string' == typeof t) {
          const n = new (class {
            constructor(t) {
              this.tokenList = [];
              this.internalResult = {};
              this.tokenIndex = 0;
              this.tokenIncrement = 1;
              this.componentStart = 0;
              this.state = 0;
              this.groupDepth = 0;
              this.hostnameIPv6BracketDepth = 0;
              this.shouldTreatAsStandardURL = false;
              this.input = t;
            }
            get result() {
              return this.internalResult;
            }
            parse() {
              for (
                this.tokenList = s(this.input, true);
                this.tokenIndex < this.tokenList.length;
                this.tokenIndex += this.tokenIncrement
              ) {
                if (((this.tokenIncrement = 1), 'END' === this.tokenList[this.tokenIndex].type)) {
                  if (0 === this.state) {
                    this.rewind();
                    this.isHashPrefix()
                      ? this.changeState(9, 1)
                      : this.isSearchPrefix()
                        ? (this.changeState(8, 1), (this.internalResult.hash = ''))
                        : (this.changeState(7, 0),
                          (this.internalResult.search = ''),
                          (this.internalResult.hash = ''));
                    continue;
                  }
                  if (2 === this.state) {
                    this.rewindAndSetState(5);
                    continue;
                  }
                  this.changeState(10, 0);
                  break;
                }
                if (this.groupDepth > 0) {
                  if (!this.isGroupClose()) continue;
                  this.groupDepth -= 1;
                }
                if (this.isGroupOpen()) this.groupDepth += 1;
                else
                  switch (this.state) {
                    case 0:
                      this.isProtocolSuffix() &&
                        ((this.internalResult.username = ''),
                        (this.internalResult.password = ''),
                        (this.internalResult.hostname = ''),
                        (this.internalResult.port = ''),
                        (this.internalResult.pathname = ''),
                        (this.internalResult.search = ''),
                        (this.internalResult.hash = ''),
                        this.rewindAndSetState(1));
                      break;
                    case 1:
                      if (this.isProtocolSuffix()) {
                        this.computeShouldTreatAsStandardURL();
                        let t = 7,
                          e = 1;
                        this.shouldTreatAsStandardURL && (this.internalResult.pathname = '/');
                        this.nextIsAuthoritySlashes()
                          ? ((t = 2), (e = 3))
                          : this.shouldTreatAsStandardURL && (t = 2);
                        this.changeState(t, e);
                      }
                      break;
                    case 2:
                      this.isIdentityTerminator()
                        ? this.rewindAndSetState(3)
                        : (this.isPathnameStart() ||
                            this.isSearchPrefix() ||
                            this.isHashPrefix()) &&
                          this.rewindAndSetState(5);
                      break;
                    case 3:
                      this.isPasswordPrefix()
                        ? this.changeState(4, 1)
                        : this.isIdentityTerminator() && this.changeState(5, 1);
                      break;
                    case 4:
                      this.isIdentityTerminator() && this.changeState(5, 1);
                      break;
                    case 5:
                      this.isIPv6Open()
                        ? (this.hostnameIPv6BracketDepth += 1)
                        : this.isIPv6Close() && (this.hostnameIPv6BracketDepth -= 1);
                      this.isPortPrefix() && !this.hostnameIPv6BracketDepth
                        ? this.changeState(6, 1)
                        : this.isPathnameStart()
                          ? this.changeState(7, 0)
                          : this.isSearchPrefix()
                            ? this.changeState(8, 1)
                            : this.isHashPrefix() && this.changeState(9, 1);
                      break;
                    case 6:
                      this.isPathnameStart()
                        ? this.changeState(7, 0)
                        : this.isSearchPrefix()
                          ? this.changeState(8, 1)
                          : this.isHashPrefix() && this.changeState(9, 1);
                      break;
                    case 7:
                      this.isSearchPrefix()
                        ? this.changeState(8, 1)
                        : this.isHashPrefix() && this.changeState(9, 1);
                      break;
                    case 8:
                      this.isHashPrefix() && this.changeState(9, 1);
                  }
              }
            }
            changeState(t, e) {
              switch (this.state) {
                case 0:
                case 2:
                case 10:
                  break;
                case 1:
                  this.internalResult.protocol = this.makeComponentString();
                  break;
                case 3:
                  this.internalResult.username = this.makeComponentString();
                  break;
                case 4:
                  this.internalResult.password = this.makeComponentString();
                  break;
                case 5:
                  this.internalResult.hostname = this.makeComponentString();
                  break;
                case 6:
                  this.internalResult.port = this.makeComponentString();
                  break;
                case 7:
                  this.internalResult.pathname = this.makeComponentString();
                  break;
                case 8:
                  this.internalResult.search = this.makeComponentString();
                  break;
                case 9:
                  this.internalResult.hash = this.makeComponentString();
              }
              this.changeStateWithoutSettingComponent(t, e);
            }
            changeStateWithoutSettingComponent(t, e) {
              this.state = t;
              this.componentStart = this.tokenIndex + e;
              this.tokenIndex += e;
              this.tokenIncrement = 0;
            }
            rewind() {
              this.tokenIndex = this.componentStart;
              this.tokenIncrement = 0;
            }
            rewindAndSetState(t) {
              this.rewind();
              this.state = t;
            }
            safeToken(t) {
              return (
                t < 0 && (t = this.tokenList.length - t),
                t < this.tokenList.length
                  ? this.tokenList[t]
                  : this.tokenList[this.tokenList.length - 1]
              );
            }
            isNonSpecialPatternChar(t, e) {
              const n = this.safeToken(t);
              return (
                n.value === e &&
                ('CHAR' === n.type || 'ESCAPED_CHAR' === n.type || 'INVALID_CHAR' === n.type)
              );
            }
            isProtocolSuffix() {
              return this.isNonSpecialPatternChar(this.tokenIndex, ':');
            }
            nextIsAuthoritySlashes() {
              return (
                this.isNonSpecialPatternChar(this.tokenIndex + 1, '/') &&
                this.isNonSpecialPatternChar(this.tokenIndex + 2, '/')
              );
            }
            isIdentityTerminator() {
              return this.isNonSpecialPatternChar(this.tokenIndex, '@');
            }
            isPasswordPrefix() {
              return this.isNonSpecialPatternChar(this.tokenIndex, ':');
            }
            isPortPrefix() {
              return this.isNonSpecialPatternChar(this.tokenIndex, ':');
            }
            isPathnameStart() {
              return this.isNonSpecialPatternChar(this.tokenIndex, '/');
            }
            isSearchPrefix() {
              if (this.isNonSpecialPatternChar(this.tokenIndex, '?')) return true;
              if ('?' !== this.tokenList[this.tokenIndex].value) return false;
              const t = this.safeToken(this.tokenIndex - 1);
              return (
                'NAME' !== t.type &&
                'PATTERN' !== t.type &&
                'CLOSE' !== t.type &&
                'ASTERISK' !== t.type
              );
            }
            isHashPrefix() {
              return this.isNonSpecialPatternChar(this.tokenIndex, '#');
            }
            isGroupOpen() {
              return 'OPEN' == this.tokenList[this.tokenIndex].type;
            }
            isGroupClose() {
              return 'CLOSE' == this.tokenList[this.tokenIndex].type;
            }
            isIPv6Open() {
              return this.isNonSpecialPatternChar(this.tokenIndex, '[');
            }
            isIPv6Close() {
              return this.isNonSpecialPatternChar(this.tokenIndex, ']');
            }
            makeComponentString() {
              const t = this.tokenList[this.tokenIndex],
                e = this.safeToken(this.componentStart).index;
              return this.input.substring(e, t.index);
            }
            computeShouldTreatAsStandardURL() {
              const t = {};
              Object.assign(t, p);
              t.encodePart = x;
              const e = h(this.makeComponentString(), undefined, t);
              this.shouldTreatAsStandardURL = d(e);
            }
          })(t);
          if ((n.parse(), (t = n.result), e)) {
            if ('string' != typeof e)
              throw new TypeError("'baseURL' parameter is not of type 'string'.");
            t.baseURL = e;
          } else if ('string' != typeof t.protocol)
            throw new TypeError('A base URL must be provided for a relative constructor string.');
        } else if (e) throw new TypeError("parameter 1 is not of type 'string'.");
        if (!t || 'object' != typeof t)
          throw new TypeError(
            "parameter 1 is not of type 'string' and cannot convert to dictionary.",
          );
        const n = {
          pathname: E,
          protocol: E,
          username: E,
          password: E,
          hostname: E,
          port: E,
          search: E,
          hash: E,
        };
        let i;
        for (i of ((this.pattern = v(n, t, true)),
        g(this.pattern.protocol) === this.pattern.port && (this.pattern.port = ''),
        C)) {
          if (!(i in this.pattern)) continue;
          const t = {},
            e = this.pattern[i];
          switch (((this.keys[i] = []), i)) {
            case 'protocol':
              Object.assign(t, p);
              t.encodePart = x;
              break;
            case 'username':
              Object.assign(t, p);
              t.encodePart = S;
              break;
            case 'password':
              Object.assign(t, p);
              t.encodePart = w;
              break;
            case 'hostname':
              Object.assign(t, c);
              l(e) ? (t.encodePart = y) : (t.encodePart = k);
              break;
            case 'port':
              Object.assign(t, p);
              t.encodePart = P;
              break;
            case 'pathname':
              d(this.regexp.protocol)
                ? (Object.assign(t, u), (t.encodePart = R))
                : (Object.assign(t, p), (t.encodePart = b));
              break;
            case 'search':
              Object.assign(t, p);
              t.encodePart = $;
              break;
            case 'hash':
              Object.assign(t, p);
              t.encodePart = I;
          }
          try {
            const n = r(e, t);
            this.regexp[i] = o(n, this.keys[i], t);
            this.component_pattern[i] = T(n, t);
          } catch {
            throw new TypeError(`invalid ${i} pattern '${this.pattern[i]}'.`);
          }
        }
      } catch (t) {
        throw new TypeError(`Failed to construct 'URLPattern': ${t.message}`);
      }
    }
    test(t = {}, e) {
      let n,
        s = {
          pathname: '',
          protocol: '',
          username: '',
          password: '',
          hostname: '',
          port: '',
          search: '',
          hash: '',
        };
      if ('string' != typeof t && e) throw new TypeError("parameter 1 is not of type 'string'.");
      if (undefined === t) return false;
      try {
        s = v(s, 'object' == typeof t ? t : L(t, e), false);
      } catch (t) {
        return false;
      }
      for (n in this.pattern) if (!this.regexp[n].exec(s[n])) return false;
      return true;
    }
    exec(t = {}, e) {
      let n = {
        pathname: '',
        protocol: '',
        username: '',
        password: '',
        hostname: '',
        port: '',
        search: '',
        hash: '',
      };
      if ('string' != typeof t && e) throw new TypeError("parameter 1 is not of type 'string'.");
      if (undefined === t) return;
      try {
        n = v(n, 'object' == typeof t ? t : L(t, e), false);
      } catch (t) {
        return null;
      }
      let s,
        r = {};
      for (s in ((r.inputs = e ? [t, e] : [t]), this.pattern)) {
        let t = this.regexp[s].exec(n[s]);
        if (!t) return null;
        let e = {};
        for (let [n, r] of this.keys[s].entries())
          if ('string' == typeof r.name || 'number' == typeof r.name) {
            let s = t[n + 1];
            e[r.name] = s;
          }
        r[s] = {
          input: n[s] || '',
          groups: e,
        };
      }
      return r;
    }
    get protocol() {
      return this.component_pattern.protocol;
    }
    get username() {
      return this.component_pattern.username;
    }
    get password() {
      return this.component_pattern.password;
    }
    get hostname() {
      return this.component_pattern.hostname;
    }
    get port() {
      return this.component_pattern.port;
    }
    get pathname() {
      return this.component_pattern.pathname;
    }
    get search() {
      return this.component_pattern.search;
    }
    get hash() {
      return this.component_pattern.hash;
    }
  };
  globalThis.URLPattern || (globalThis.URLPattern = U);
  window.URLPattern = U;
})();
{
  var iGLUI;
  Class(function AppState(_default) {
    this.map = new Map();
    this.bindings = new Map();
    _default && this.setAll(_default);
    const prototype = AppState.prototype;
    undefined === prototype.set &&
      ((prototype.set = function (key, value, force) {
        if (this.readonly) return console.warn('This AppState is locked and can not make changes');
        this.map.set(key, value);
        this.onUpdate && this.onUpdate(key, value);
        let array = this.bindings.get(key);
        if (array) {
          let len = array.length;
          for (let i = 0; i < len; i++) {
            let b = array[i];
            b && b.update
              ? b.update(key, value, force)
              : (array.splice(i, 1), (i -= 1), (len = array.length));
          }
        }
      }),
      (prototype.get = function (key) {
        return this.map.get(key);
      }),
      (prototype.getMap = function () {
        return this.map;
      }),
      (prototype.toJSON = function () {
        return Object.fromEntries(this.map);
      }),
      (prototype.bind = function (keys, ...rest) {
        const self = this;
        if (!rest.length)
          return {
            state: self,
            key: keys,
          };
        Array.isArray(keys) || (keys = [keys]);
        const obj = 1 === rest.length ? rest[0] : rest;
        let binding = new StateBinding(keys, obj, this);
        return (
          keys.forEach((key) => {
            self.bindings.has(key)
              ? self.bindings.get(key).push(binding)
              : self.bindings.set(key, [binding]);
            let value = self.map.get(key);
            undefined !== value && binding.update(key, value);
          }),
          binding
        );
      }),
      (prototype.createLocal = function (obj, fixProps) {
        if (fixProps)
          for (let key in obj) {
            let val = obj[key];
            'true' === val && (obj[key] = true);
            'false' === val && (obj[key] = false);
            isNaN(val) || (obj[key] = Number(val));
          }
        let appState = new AppState(obj);
        return new Proxy(appState, {
          set: (target, property = '', value) => (
            property.includes(['origin', 'onUpdate'])
              ? (appState[property] = value)
              : appState.set(property, value),
            true
          ),
          get: (target, property) => (target[property] ? target[property] : appState.get(property)),
        });
      }),
      (prototype.setAll = function (obj) {
        const self = this;
        for (let key in obj) self.set(key, obj[key]);
      }),
      (prototype.lock = function () {
        this.readonly = true;
      }),
      (prototype.unlock = function () {
        this.readonly = false;
      }),
      (prototype.clearKeysMatching = function (str) {
        let keys = this.map.keys();
        for (let key of keys) key.startsWith(str) && this.map.delete(key);
      }),
      (prototype.isAppState = true));
  }, 'static');
  class StateBinding {
    constructor(_keys, _obj, _ref) {
      if (
        ((this._keys = _keys),
        (this._obj = _obj),
        (this._string = ''),
        (this._oldValue = ''),
        (this._type = ''),
        (this._bindingLookup = ''),
        this._onDestroy,
        (this._ref = _ref),
        undefined === iGLUI && (iGLUI = !!window.GLUI),
        _obj instanceof HTMLElement)
      ) {
        'INPUT' == _obj.nodeName ? (this._string = _obj.value) : (this._string = _obj.innerText);
        this._type = 'HTMLElement';
      } else if (_obj instanceof DOMAttribute) {
        this._string = _obj.value;
        this._name = _obj.name;
        this._belongsTo = _obj.belongsTo;
        this._bindingLookup = _obj.bindingLookup;
        this._type = 'DOMAttribute';
      } else if ('function' == typeof Sprite && _obj instanceof Sprite) {
        this._string = _obj.id;
        this._type = 'Sprite';
      } else if (_obj instanceof HydraObject) {
        'input' == _obj._type ? (this._string = _obj.val()) : (this._string = _obj.text());
        this._type = 'HydraObject';
      } else if (iGLUI && _obj instanceof GLUIText) {
        this._string = _obj.getTextString();
        this._type = 'GLUIText';
      } else if (
        (_obj.createLocal && (this._type = 'appState'),
        _obj.onStateChange && (this._type = 'class'),
        'function' == typeof _obj && (this._type = 'function'),
        Array.isArray(_obj) && _obj.every((el) => 'function' == typeof el))
      ) {
        this._type = 'piped';
        const lastFunctionInChain = this._obj.pop();
        this._operators = this._obj;
        this._obj = lastFunctionInChain;
        this._count = 0;
      }
    }
    parse(key, value) {
      if (!this._string || !this._string.includes('@[')) return value;
      const self = this;
      let string = this._string;
      return (
        this._keys.forEach((key) => {
          string = string.replace(`@[${key}]`, self._ref.get(key));
        }),
        string
      );
    }
    async operateOnValue(value) {
      return await this._operators.reduce(async (prev, fn) => {
        const prevResolved = await prev;
        return (await fn)(prevResolved, this._count++, this);
      }, value);
    }
    update(key, value, force) {
      let newValue = this.parse(key, value);
      if (!(newValue !== this._oldValue || (value && value.push) || force)) return;
      let oldValue = this._oldValue;
      this._oldValue = newValue;
      try {
        switch (this._type) {
          case 'HTMLElement':
            'input' == this._obj._type
              ? (this._obj.value = newValue)
              : (this._obj.innerText = newValue);
            break;
          case 'DOMAttribute':
            this._obj.belongsTo.setAttribute(
              this._obj.name,
              this._obj.value.replace(this._obj.bindingLookup, newValue),
            );
            break;
          case 'Sprite':
            this._obj.id = newValue;
            break;
          case 'HydraObject':
            'input' == this._obj._type ? this._obj.val(newValue) : this._obj.text(newValue);
            break;
          case 'GLUIText':
            this._obj.setText(newValue);
            break;
          case 'function':
            this._obj(value, oldValue);
            break;
          case 'piped':
            this.operateOnValue(value).then(
              (val) => this._obj(val),
              (reject) => null,
            );
            break;
          case 'class':
            this._obj.onStateChange(value);
            break;
          case 'appState':
            this._obj.set(key, value);
        }
      } catch (err) {
        throw (
          console.error(
            'AppState binding failed to execute. You should probably be using _this.bindState instead',
          ),
          console.error(err),
          err
        );
      }
      return true;
    }
    _bindOnDestroy(cb) {
      this._onDestroy || (this._onDestroy = []);
      this._onDestroy.push(cb);
    }
    destroy() {
      this._onDestroy && this._onDestroy.forEach((cb) => cb());
      this._keys.forEach((key) => {
        let array = this._ref.bindings.get(key);
        if (array)
          for (let i = 0; i < array.length; i++) {
            array[i] === this && (array.splice(i, 1), (i -= 1));
          }
      });
      Utils.nullObject(this);
    }
  }
  window.StateBinding = StateBinding;
}
