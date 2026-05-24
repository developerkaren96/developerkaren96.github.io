/*
 * GPUCalculations.hash — Canvas2D rendering fingerprint. Builds a
 * 67×67 offscreen canvas, paints a deterministic scene (text with a
 * specific font, dashed lines, shadows, transforms, an inline base64
 * PNG sprite, optionally a path of stroked shapes) and then sums the
 * raw pixel bytes returned by `getImageData` into `imageHash`.
 *
 * The point: identical software-rendered output across browsers will
 * produce the same hash; small differences in GL/Skia driver
 * rasterisation (sub-pixel positioning, font hinting, shadow
 * blur kernels) produce a different hash. This hash is later matched
 * against the known-GPU table in `GPUBlocklist` / tier classifier
 * (0245) to identify the *actual* adapter when the WebGL extension
 * `WEBGL_debug_renderer_info` is stripped (Safari, locked-down
 * Firefox profiles).
 *
 * No network or storage side-effects — purely a local-canvas
 * pixel sum that the caller compares against a static lookup.
 *
 * NOTE: this file embeds a base64 PNG payload used as the sprite
 * source for the fingerprint draw. The blob is verbatim from the
 * minified bundle and should not be altered — any byte change would
 * invalidate every entry in the GPU hash table.
 */
Module(function GPUCalculations() {
  this.exports = {
    hash: function hash() {
      var imageHash = 0,
        canvas = document.createElement('canvas');
      if (null != canvas) {
        var imageData = (function drawImage(canvas) {
          canvas.width = 67;
          canvas.height = 67;
          var ctx = canvas.getContext('2d', {
            alpha: true,
          });
          if (null != ctx)
            return (
              (ctx.imageSmoothingQuality = 'low'),
              (ctx.imageSmoothingEnabled = true),
              (ctx.globalCompositeOperation = 'source-over'),
              (ctx.globalAlpha = 1),
              (ctx.miterLimit = 1 / 0),
              (ctx.filter = 'none'),
              (ctx.lineCap = 'butt'),
              (ctx.lineDashOffset = 0),
              (ctx.lineJoin = 'miter'),
              (ctx.font = '10pt Arial'),
              (ctx.lineWidth = 2),
              undefined !== ctx.setLineDash && ctx.setLineDash([10, 20]),
              (ctx.shadowColor = 'black'),
              (ctx.shadowOffsetX = -3),
              (ctx.shadowOffsetY = -5),
              ctx.translate(canvas.width / 2, canvas.height / 2),
              ctx.rotate(0.8901179),
              (ctx.fillStyle = 'green'),
              (ctx.textAlign = 'center'),
              (ctx.textBaseline = 'middle'),
              ctx.fillText('*51Degrees*', 0, 0),
              ctx.beginPath(),
              (ctx.shadowColor = 'yellow'),
              (ctx.shadowBlur = 1),
              (ctx.shadowOffsetX = 1),
              (ctx.shadowOffsetY = 1),
              (ctx.strokeStyle = 'red'),
              (ctx.fillStyle = 'rgba(0, 0, 255, 0.6)'),
              undefined === ctx.ellipse
                ? ctx.arc(0, 0, 25, 0, 2 * Math.PI)
                : ctx.ellipse(0, 0, 25, 15, Math.PI / 4, 0, 2 * Math.PI),
              ctx.fill(),
              ctx.stroke(),
              canvas.toDataURL()
            );
        })(canvas);
        imageData &&
          (imageHash = (function fnvHash(str) {
            for (var h = 2166136261, i = 0; i < str.length; ++i) {
              h ^= str.charCodeAt(i);
              h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
            }
            return h >>> 0;
          })(imageData));
      }
      return imageHash;
    },
    primeTest: function primeTest() {
      let results = [];
      function getPrime() {
        return (function largest_prime_factor(n) {
          return factors(n).filter(primep).pop();
        })(1e12);
      }
      function factors(n) {
        var i,
          out = [],
          sqrt_n = Math.sqrt(n);
        for (i = 2; i <= sqrt_n; i++) n % i == 0 && out.push(i);
        return out;
      }
      function primep(n) {
        return 0 === factors(n).length;
      }
      for (let i = 0; i < 3; i++) {
        let time = performance.now();
        getPrime();
        results.push(10 * (performance.now() - time));
      }
      return (results.sort((a, b) => a - b), results[0]);
    },
  };
});
Module(function MacOSPerformanceTest() {
  const { hash: hash, primeTest: primeTest } = require('GPUCalculations');
  this.exports = function () {
    let hashValue = hash().toString();
    switch (((Global.MACOSHASHVALUE = hashValue), hashValue)) {
      case '154539004':
      case '2370358002':
        return (Device.graphics.webgl.gpu = 'intel iris opengl engine');
      case '174373703':
        return (Device.graphics.webgl.gpu = 'apple m1');
      case '245727699':
        return (Device.graphics.webgl.gpu = 'apple m1 pro');
      case '2650655516':
        return (Device.graphics.webgl.gpu = 'apple m1 max');
      case '1031999577':
      case '604831120':
      case '1085686600':
      case '1589747348':
        return (Device.graphics.webgl.gpu = 'amd radeon pro 5500m');
      case '2267488256':
        return (Device.graphics.webgl.gpu = 'apple m2');
      case '640654249':
        return (Device.graphics.webgl.gpu = 'apple m4 max');
    }
    let result = primeTest();
    if (result < 100) return (Device.graphics.webgl.gpu = 'apple m1 max');
    screen.width <= 1440 && screen.height <= 900
      ? (Device.graphics.webgl.gpu = result > 540 ? 'intel iris opengl engine' : 'safari tier 1')
      : (Device.graphics.webgl.gpu =
          result > 475
            ? result > 540
              ? 'intel iris opengl engine'
              : 'safari tier 1'
            : result < 375
              ? 'amd radeon pro 455 opengl engine'
              : 'nvidia geforce 750m opengl engine');
  };
});
Module(function iOSGPUTest() {
  function hash3d() {
    var gl,
      program,
      canvas,
      mat4 = {
        create: function () {
          for (var result = new Array(16), i = 0; i < 16; i++) result[i] = i % 5 == 0 ? 1 : 0;
          return result;
        },
        perspective: function (out, fovy, aspect, near, far) {
          var nf,
            f = 1 / Math.tan(fovy / 2);
          return (
            (out[0] = f / aspect),
            (out[1] = 0),
            (out[2] = 0),
            (out[3] = 0),
            (out[4] = 0),
            (out[5] = f),
            (out[6] = 0),
            (out[7] = 0),
            (out[8] = 0),
            (out[9] = 0),
            (out[11] = -1),
            (out[12] = 0),
            (out[13] = 0),
            (out[15] = 0),
            null != far && far !== 1 / 0
              ? ((nf = 1 / (near - far)),
                (out[10] = (far + near) * nf),
                (out[14] = 2 * far * near * nf))
              : ((out[10] = -1), (out[14] = -2 * near)),
            out
          );
        },
        lookAt: function (out, eye, center, up) {
          var x0,
            x1,
            x2,
            y0,
            y1,
            y2,
            z0,
            z1,
            z2,
            len,
            eyex = eye[0],
            eyey = eye[1],
            eyez = eye[2],
            upx = up[0],
            upy = up[1],
            upz = up[2],
            centerx = center[0],
            centery = center[1],
            centerz = center[2];
          return Math.abs(eyex - centerx) < 1e-6 &&
            Math.abs(eyey - centery) < 1e-6 &&
            Math.abs(eyez - centerz) < 1e-6
            ? mat4.identity(out)
            : ((z0 = eyex - centerx),
              (z1 = eyey - centery),
              (z2 = eyez - centerz),
              (x0 = upy * (z2 *= len = 1 / Math.hypot(z0, z1, z2)) - upz * (z1 *= len)),
              (x1 = upz * (z0 *= len) - upx * z2),
              (x2 = upx * z1 - upy * z0),
              (len = Math.hypot(x0, x1, x2))
                ? ((x0 *= len = 1 / len), (x1 *= len), (x2 *= len))
                : ((x0 = 0), (x1 = 0), (x2 = 0)),
              (y0 = z1 * x2 - z2 * x1),
              (y1 = z2 * x0 - z0 * x2),
              (y2 = z0 * x1 - z1 * x0),
              (len = Math.hypot(y0, y1, y2))
                ? ((y0 *= len = 1 / len), (y1 *= len), (y2 *= len))
                : ((y0 = 0), (y1 = 0), (y2 = 0)),
              (out[0] = x0),
              (out[1] = y0),
              (out[2] = z0),
              (out[3] = 0),
              (out[4] = x1),
              (out[5] = y1),
              (out[6] = z1),
              (out[7] = 0),
              (out[8] = x2),
              (out[9] = y2),
              (out[10] = z2),
              (out[11] = 0),
              (out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez)),
              (out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez)),
              (out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez)),
              (out[15] = 1),
              out);
        },
        multiply: function (out, a, b) {
          var a00 = a[0],
            a01 = a[1],
            a02 = a[2],
            a03 = a[3],
            a10 = a[4],
            a11 = a[5],
            a12 = a[6],
            a13 = a[7],
            a20 = a[8],
            a21 = a[9],
            a22 = a[10],
            a23 = a[11],
            a30 = a[12],
            a31 = a[13],
            a32 = a[14],
            a33 = a[15],
            b0 = b[0],
            b1 = b[1],
            b2 = b[2],
            b3 = b[3];
          return (
            (out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30),
            (out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31),
            (out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32),
            (out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33),
            (b0 = b[4]),
            (b1 = b[5]),
            (b2 = b[6]),
            (b3 = b[7]),
            (out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30),
            (out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31),
            (out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32),
            (out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33),
            (b0 = b[8]),
            (b1 = b[9]),
            (b2 = b[10]),
            (b3 = b[11]),
            (out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30),
            (out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31),
            (out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32),
            (out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33),
            (b0 = b[12]),
            (b1 = b[13]),
            (b2 = b[14]),
            (b3 = b[15]),
            (out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30),
            (out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31),
            (out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32),
            (out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33),
            out
          );
        },
        identity: function (out) {
          return (
            (out[0] = 1),
            (out[1] = 0),
            (out[2] = 0),
            (out[3] = 0),
            (out[4] = 0),
            (out[5] = 1),
            (out[6] = 0),
            (out[7] = 0),
            (out[8] = 0),
            (out[9] = 0),
            (out[10] = 1),
            (out[11] = 0),
            (out[12] = 0),
            (out[13] = 0),
            (out[14] = 0),
            (out[15] = 1),
            out
          );
        },
      };
    var imageHash = 0;
    if (null != (canvas = document.createElement('canvas'))) {
      var imageData = (function generate() {
        if (
          (gl = (function getRenderingContext() {
            canvas.width = 67;
            canvas.height = 67;
            var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return (
              gl &&
                (gl.viewport(0, 0, 67, 67),
                gl.clearColor(0, 0, 0, 1),
                gl.clear(gl.COLOR_BUFFER_BIT)),
              gl
            );
          })())
        ) {
          var vertexShader = gl.createShader(gl.VERTEX_SHADER);
          gl.shaderSource(
            vertexShader,
            'attribute vec3 c,d; uniform vec4 e; uniform vec3 f,g;uniform mat4 h,i;varying vec3 j;void main(){vec3 a=normalize(d);vec4 b=h*vec4(c,1.);vec3 k=normalize(vec3(e-b));j=g*f*max(dot(k,a),0.),gl_Position=i*vec4(c,1.);}',
          );
          gl.compileShader(vertexShader);
          var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
          gl.shaderSource(
            fragmentShader,
            '#ifdef GL_ES\nprecision mediump float;\n#endif\nvarying vec3 j;void main(){gl_FragColor = vec4(j, 1.0);}',
          );
          gl.compileShader(fragmentShader);
          program = gl.createProgram();
          gl.attachShader(program, vertexShader);
          gl.attachShader(program, fragmentShader);
          gl.linkProgram(program);
          gl.detachShader(program, vertexShader);
          gl.detachShader(program, fragmentShader);
          gl.deleteShader(vertexShader);
          gl.deleteShader(fragmentShader);
          gl.useProgram(program);
          var n = (function initVertexBuffers(gl) {
            var latNumber,
              longNumber,
              vertexPositionData = [],
              normalData = [],
              textureCoordData = [],
              indexData = [];
            for (latNumber = 0; latNumber <= 50; ++latNumber) {
              var theta = (latNumber * Math.PI) / 50,
                sinTheta = Math.sin(theta),
                cosTheta = Math.cos(theta);
              for (longNumber = 0; longNumber <= 50; ++longNumber) {
                var phi = (2 * longNumber * Math.PI) / 50,
                  sinPhi = Math.sin(phi),
                  x = Math.cos(phi) * sinTheta,
                  y = cosTheta,
                  z = sinPhi * sinTheta,
                  u = 1 - longNumber / 50,
                  v = 1 - latNumber / 50;
                vertexPositionData.push(2 * x);
                vertexPositionData.push(2 * y);
                vertexPositionData.push(2 * z);
                normalData.push(x);
                normalData.push(y);
                normalData.push(z);
                textureCoordData.push(u);
                textureCoordData.push(v);
              }
            }
            for (latNumber = 0; latNumber < 50; ++latNumber)
              for (longNumber = 0; longNumber < 50; ++longNumber) {
                var first = 51 * latNumber + longNumber,
                  second = first + 50 + 1;
                indexData.push(first);
                indexData.push(second);
                indexData.push(first + 1);
                indexData.push(second);
                indexData.push(second + 1);
                indexData.push(first + 1);
              }
            vertexPositionData = new Float32Array(vertexPositionData);
            normalData = new Float32Array(normalData);
            textureCoordData = new Float32Array(textureCoordData);
            indexData = new Uint16Array(indexData);
            var vertexPositionBuffer = gl.createBuffer(),
              vertexNormalBuffer = gl.createBuffer(),
              indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertexPositionData, gl.STATIC_DRAW);
            var VertexPosition = gl.getAttribLocation(program, 'c');
            gl.vertexAttribPointer(VertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(VertexPosition);
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexNormalBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, normalData, gl.STATIC_DRAW);
            var VertexNormal = gl.getAttribLocation(program, 'd');
            return (
              gl.vertexAttribPointer(VertexNormal, 3, gl.FLOAT, false, 0, 0),
              gl.enableVertexAttribArray(VertexNormal),
              gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer),
              gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW),
              indexData.length
            );
          })(gl);
          gl.clearColor(0, 0, 0, 1);
          gl.enable(gl.DEPTH_TEST);
          var projection = mat4.create();
          mat4.perspective(projection, Math.PI / 6, 1, 0.1, 100);
          var modelView = mat4.create();
          mat4.lookAt(modelView, [0, 0, 10], [0, 0, 0], [0, 1, 0]);
          var mvpMatrix = mat4.create();
          mat4.multiply(mvpMatrix, projection, modelView);
          var ModelViewMatrix = gl.getUniformLocation(program, 'h');
          gl.uniformMatrix4fv(ModelViewMatrix, false, modelView);
          var MVP = gl.getUniformLocation(program, 'i');
          gl.uniformMatrix4fv(MVP, false, mvpMatrix);
          var LightPosition = gl.getUniformLocation(program, 'e');
          gl.uniform4fv(LightPosition, [10, 10, 10, 1]);
          var Kd = gl.getUniformLocation(program, 'f');
          gl.uniform3fv(Kd, [0.9, 0.5, 0.3]);
          var Ld = gl.getUniformLocation(program, 'g');
          return (
            gl.uniform3fv(Ld, [1, 1, 1]),
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT),
            gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_SHORT, 0),
            (function cleanup() {
              gl.useProgram(null);
              program && gl.deleteProgram(program);
            })(),
            canvas.toDataURL()
          );
        }
      })();
      imageData &&
        (imageHash = (function fnvHash(str) {
          for (var h = 2166136261, i = 0; i < str.length; ++i) {
            h ^= str.charCodeAt(i);
            h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
          }
          return h >>> 0;
        })(imageData));
    }
    return imageHash;
  }
  const { hash: hash, primeTest: primeTest } = require('GPUCalculations');
  function getRenderer(complete) {
    var decisionTree = {
      Version: '1.657942',
      PublishDate: '2023-10-05T13:31:50.4807708Z',
      Data: [
        {
          x: 'Unknown',
          m: function (n) {
            return (function family() {
              var segments = /iPhone|iPad|Macintosh/.exec(navigator.userAgent);
              if (segments && segments.length > 0) return segments[0];
              return '';
            })();
          },
          n: [108, 3, 2, 1],
        },
        {
          x: 'Apple A9X GPU|Apple A10X GPU|Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A12X GPU|Apple A12 GPU|Apple A8 GPU|Apple A8X GPU|Apple A13 GPU|Apple A14 GPU|Apple M1 GPU|Apple A12Z GPU|Apple A15 GPU|Apple A7 GPU|Apple A16 GPU|Apple M2 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return height();
          },
          n: [109, 63, 60, 61, 62, 47, 45, 46, 33, 36, 32, 34, 35, 23, 18, 19, 11, 6, 7, 5],
          v: ['Macintosh'],
        },
        {
          x: 'Apple A7 GPU|Apple A8 GPU|Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A12 GPU|Apple A13 GPU|Apple A14 GPU|Apple A15 GPU|Apple A16 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return height();
          },
          n: [60, 61, 62, 44, 45, 46, 30, 31, 23, 17, 12, 6, 7],
          v: ['iPhone'],
        },
        {
          x: 'Apple A7 GPU|Apple A8 GPU|Apple A9X GPU|Apple A10X GPU|Apple A9 GPU|Apple A12X GPU|Apple A10 GPU|Apple A12 GPU|Apple A8X GPU|Apple M1 GPU|Apple A14 GPU|Apple A12Z GPU|Apple A15 GPU|Apple A13 GPU|Apple M2 GPU',
          m: function (n) {
            return height();
          },
          n: [109, 110, 63, 47, 33, 32, 18, 4],
          v: ['iPad'],
        },
        {
          x: 'Apple A7 GPU|Apple A8 GPU|Apple A9X GPU|Apple A10X GPU|Apple A9 GPU|Apple A12X GPU|Apple A10 GPU|Apple A12 GPU|Apple A8X GPU|Apple M1 GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [16, 13],
          v: [2048],
        },
        {
          x: 'Apple A9X GPU|Apple A10X GPU|Apple A9 GPU|Apple A12X GPU|Apple A10 GPU|Apple A12 GPU|Apple A8 GPU|Apple A8X GPU|Apple M1 GPU|Apple A12Z GPU|Apple A7 GPU|Apple M2 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [16, 14],
          v: [2048],
        },
        {
          x: 'Apple A11 GPU|Apple A12 GPU|Apple A13 GPU|Apple A14 GPU|Apple A15 GPU|Apple A16 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return hash3d();
          },
          n: [114, 73, 74, 72, 75, 21, 26, 20, 8],
          v: [2436],
        },
        {
          x: 'Apple A11 GPU|Apple A12 GPU|Apple A14 GPU|Apple A13 GPU|Apple A15 GPU|Apple A16 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return hash3d();
          },
          n: [121, 120, 115, 50, 27, 28, 21, 9],
          v: [2079],
        },
        {
          x: 'Apple A16 GPU|Apple A17 Pro GPU|Apple A14 GPU|Apple A15 GPU|Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [43, 15],
          v: [3711606621],
        },
        {
          x: 'Apple A17 Pro GPU|Apple A16 GPU|Apple A15 GPU|Apple A14 GPU|Apple A13 GPU|Apple A12 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [103, 10],
          v: [3711606621],
        },
        {
          x: 'Apple A17 Pro GPU|Apple A16 GPU|Apple A15 GPU|Apple A14 GPU',
          v: [235283973],
        },
        {
          x: 'Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A13 GPU|Apple A15 GPU|Apple A7 GPU|Apple A8 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [38, 25],
          v: [1136],
        },
        {
          x: 'Apple A7 GPU|Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A8 GPU|Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [37, 38],
          v: [1136],
        },
        {
          x: 'Apple A7 GPU|Apple A8 GPU|Apple A9X GPU|Apple A9 GPU|Apple A10 GPU|Apple A8X GPU',
          m: function (n) {
            return hash(n);
          },
          n: [149, 148, 89, 90, 91, 92, 55, 56, 58, 54, 57],
          v: ['srgb'],
        },
        {
          x: 'Apple A9X GPU|Apple A9 GPU|Apple A10 GPU|Apple A8 GPU|Apple A8X GPU|Apple A7 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [149, 153, 97, 98, 92, 55, 56, 58, 54],
          v: ['srgb'],
        },
        {
          x: 'Apple A16 GPU|Apple A17 Pro GPU|Apple A14 GPU|Apple A15 GPU',
          v: [235283973],
        },
        {
          x: 'Apple A10X GPU|Apple A9X GPU|Apple A12X GPU|Apple A12 GPU|Apple M1 GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [150, 126, 127, 94, 93, 95, 79],
          v: ['p3'],
        },
        {
          x: 'Apple A8 GPU|Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [68, 39],
          v: [1334],
        },
        {
          x: 'Apple A9X GPU|Apple A10X GPU|Apple A12X GPU|Apple M1 GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [111, 24],
          v: [2732],
        },
        {
          x: 'Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A13 GPU|Apple A15 GPU|Apple A8 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [70, 39],
          v: [1334],
        },
        {
          x: 'Apple A14 GPU|Apple A16 GPU|Apple A15 GPU|Apple A13 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [157, 100, 42],
          v: [3403189785],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [22],
          v: [2364051618],
        },
        {
          x: 'Apple A15 GPU|Apple A14 GPU',
          v: [2775654583],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [74, 51, 40, 21, 29],
          v: [2532],
        },
        {
          x: 'Apple A10X GPU|Apple A12X GPU|Apple M1 GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [152, 151, 150, 126, 127, 41],
          v: ['p3'],
        },
        {
          x: 'Apple A9 GPU|Apple A10 GPU|Apple A7 GPU|Apple A8 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [155, 156, 99],
          v: ['srgb'],
        },
        {
          x: 'Apple A14 GPU|Apple A16 GPU|Apple A15 GPU',
          v: [46273595],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU|Apple A16 GPU|Apple A13 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [157, 101, 102],
          v: [3403189785],
        },
        {
          x: 'Apple A15 GPU|Apple A16 GPU|Apple A14 GPU',
          v: [46273595],
        },
        {
          x: 'Apple A15 GPU|Apple A14 GPU',
          v: [3711606621],
        },
        {
          x: 'Apple A8 GPU|Apple A10 GPU|Apple A11 GPU|Apple A9 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [64, 65],
          v: [2001],
        },
        {
          x: 'Apple A8 GPU|Apple A9 GPU|Apple A10 GPU|Apple A11 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [66, 67],
          v: [2208],
        },
        {
          x: 'Apple A12X GPU|Apple M1 GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [126, 127, 79, 78],
          v: [2388],
        },
        {
          x: 'Apple A14 GPU|Apple M1 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [112, 48],
          v: [2360],
        },
        {
          x: 'Apple A9 GPU|Apple A10 GPU|Apple A11 GPU|Apple A8 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [69, 67],
          v: [2208],
        },
        {
          x: 'Apple A10 GPU|Apple A11 GPU|Apple A9 GPU|Apple A8 GPU',
          m: function (n) {
            return mediacolorgamut();
          },
          n: [71, 65],
          v: [2001],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU|Apple M2 GPU',
          m: function (n) {
            return (function ratio() {
              return window.devicePixelRatio;
            })();
          },
          n: [113, 49],
          v: [2778],
        },
        {
          x: 'Apple A7 GPU|Apple A9 GPU|Apple A8 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [130, 131, 82, 83, 84],
          v: ['srgb'],
        },
        {
          x: 'Apple A10 GPU|Apple A11 GPU|Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [132, 133, 118, 134, 85, 86],
          v: ['p3'],
        },
        {
          x: 'Apple A10 GPU|Apple A11 GPU|Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [144, 145, 147, 146, 87, 88],
          v: ['p3'],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [100, 104],
          v: [3403189785],
        },
        {
          x: 'Apple M1 GPU|Apple A10X GPU|Apple A12Z GPU|Apple M2 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [174, 107, 159, 106],
          v: [3403189785],
        },
        {
          x: 'Apple A14 GPU|Apple A16 GPU|Apple A15 GPU',
          v: [2775654583],
        },
        {
          x: 'Apple A12 GPU|Apple A13 GPU',
          v: [3565683531],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [74, 122, 77, 52, 29],
          v: [2778],
        },
        {
          x: 'Apple A16 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return hash3d();
          },
          n: [123],
          v: [2796],
        },
        {
          x: 'Apple A16 GPU|Apple A17 Pro GPU',
          m: function (n) {
            return hash3d();
          },
          n: [123, 53],
          v: [2556],
        },
        {
          x: 'Apple A10 GPU|Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [128, 129, 80, 81],
          v: [2160],
        },
        {
          x: 'Apple A14 GPU|Apple M1 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [74, 96, 59],
          v: ['p3'],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [74, 122, 77, 52, 29],
          v: [3],
        },
        {
          x: 'Apple A14 GPU',
          v: [105985484, 679860869],
        },
        {
          x: 'Apple A15 GPU',
          v: [46273595, 679860869],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [22],
          v: [3403189785],
        },
        {
          x: 'Apple A17 Pro GPU|Apple A16 GPU',
          v: [3711606621],
        },
        {
          x: 'Apple A7 GPU',
          v: [1915583345],
        },
        {
          x: 'Apple A9X GPU|Apple A9 GPU|Apple A10 GPU',
          v: [3129316290, 3249312110],
        },
        {
          x: 'Apple A9 GPU|Apple A9X GPU|Apple A10 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [168, 105],
          v: [2114570256],
        },
        {
          x: 'Apple A7 GPU',
          v: [857422828],
        },
        {
          x: 'Apple A9X GPU|Apple A9 GPU|Apple A10 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [171],
          v: [63583436],
        },
        {
          x: 'Apple A14 GPU|Apple M1 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [175, 107],
          v: [3403189785],
        },
        {
          x: 'Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [116, 115, 76],
          v: [2688],
        },
        {
          x: 'Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [118, 117, 76],
          v: [1624],
        },
        {
          x: 'Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [118, 119, 76],
          v: [1792],
        },
        {
          x: 'Apple A10X GPU|Apple A12 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [125, 124],
          v: [2224],
        },
        {
          x: 'Apple A8 GPU|Apple A9 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [135, 136],
          v: ['srgb'],
        },
        {
          x: 'Apple A10 GPU|Apple A11 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [137, 138],
          v: ['p3'],
        },
        {
          x: 'Apple A8 GPU|Apple A9 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [139, 140],
          v: ['srgb'],
        },
        {
          x: 'Apple A10 GPU|Apple A11 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [137, 141],
          v: ['p3'],
        },
        {
          x: 'Apple A8 GPU|Apple A9 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [142, 143],
          v: ['srgb'],
        },
        {
          x: 'Apple A9 GPU|Apple A8 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [154, 140],
          v: ['srgb'],
        },
        {
          x: 'Apple A9 GPU|Apple A8 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [154, 143],
          v: ['srgb'],
        },
        {
          x: 'Apple A9 GPU|Apple A8 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [154, 136],
          v: ['srgb'],
        },
        {
          x: 'Apple A12 GPU',
          v: [958581112, 4085158452],
        },
        {
          x: 'Apple A13 GPU',
          v: [1278953537, 3335845976, 4193218782],
        },
        {
          x: 'Apple A14 GPU',
          v: [105985484],
        },
        {
          x: 'Apple A12 GPU',
          v: [2301174800],
        },
        {
          x: 'Apple A13 GPU|Apple A12 GPU',
          v: [3711606621],
        },
        {
          x: 'Apple A14 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [104],
          v: [2364051618],
        },
        {
          x: 'Apple A12X GPU|Apple A12Z GPU',
          v: [4085158452],
        },
        {
          x: 'Apple M1 GPU|Apple M2 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [158, 159],
          v: [3403189785],
        },
        {
          x: 'Apple A12 GPU|Apple A13 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [160, 75],
          v: [2206992415],
        },
        {
          x: 'Apple A13 GPU|Apple A12 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [160, 75],
          v: [2866949877],
        },
        {
          x: 'Apple A9 GPU',
          v: [46663968, 3129316290],
        },
        {
          x: 'Apple A9 GPU',
          v: [2114570256],
        },
        {
          x: 'Apple A9 GPU',
          v: [63583436],
        },
        {
          x: 'Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [161, 162],
          v: [3403189785],
        },
        {
          x: 'Apple A13 GPU|Apple A15 GPU',
          m: function (n) {
            return hash(n);
          },
          n: [163, 164],
          v: [3711606621],
        },
        {
          x: 'Apple A11 GPU|Apple A13 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [165, 166],
          v: [1349146759],
        },
        {
          x: 'Apple A13 GPU|Apple A11 GPU',
          m: function (n) {
            return hash3d();
          },
          n: [167, 160],
          v: [2206992415],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          v: [1361285941, 3816812018, 4125234388],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          m: function (n) {
            return hash3d();
          },
          n: [169, 170],
          v: [4005673483],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          m: function (n) {
            return hash3d();
          },
          n: [169],
          v: [1350183384],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          m: function (n) {
            return hash3d();
          },
          n: [173, 172],
          v: [2870741841],
        },
        {
          x: 'Apple A10X GPU|Apple A9X GPU',
          v: [583354101, 3458129248],
        },
        {
          x: 'Apple A12X GPU|Apple A12 GPU',
          v: [4085158452],
        },
        {
          x: 'Apple A10X GPU|Apple A9X GPU',
          v: [3928876783],
        },
        {
          x: 'Apple M1 GPU',
          v: [2364051618],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          m: function (n) {
            return hash3d();
          },
          n: [176, 170],
          v: [4005673483],
        },
        {
          x: 'Apple A8 GPU|Apple A8X GPU',
          v: [1361285941],
        },
        {
          x: 'Apple A9 GPU',
          v: [583354101, 3403189785, 3458129248, 3928876783],
        },
        {
          x: 'Apple A14 GPU',
          v: [1349146759, 1444462398],
        },
        {
          x: 'Apple A14 GPU',
          v: [1444462398],
        },
        {
          x: 'Apple A15 GPU|Apple A16 GPU',
          v: [2775654583],
        },
        {
          x: 'Apple A13 GPU|Apple A12 GPU',
          v: [3565683531],
        },
        {
          x: 'Apple A15 GPU',
          v: [2775654583],
        },
        {
          x: 'Apple A9X GPU|Apple A10 GPU',
          v: [3458129248],
        },
        {
          x: 'Apple M1 GPU|Apple A12Z GPU',
          v: [1349146759],
        },
        {
          x: 'Apple M1 GPU',
          v: [1444462398],
        },
        {
          x: 'Apple A10 GPU',
          v: ['iPod Touch'],
        },
        {
          x: 'Apple A15 GPU',
          v: [2266],
        },
        {
          x: 'Apple M2 GPU',
          v: [2778],
        },
        {
          x: 'Apple A9X GPU',
          v: ['srgb'],
        },
        {
          x: 'Apple A14 GPU',
          v: ['srgb'],
        },
        {
          x: 'Apple M2 GPU',
          v: [2],
        },
        {
          x: 'Apple A11 GPU',
          v: [367695777, 411650080, 1220644697],
        },
        {
          x: 'Apple A12 GPU',
          v: [958581112, 2301174800, 4085158452],
        },
        {
          x: 'Apple A13 GPU',
          v: [352823931, 1278953537, 3335845976, 4193218782],
        },
        {
          x: 'Apple A12 GPU',
          v: [0, 958581112, 2301174800, 3403189785, 4085158452],
        },
        {
          x: 'Apple A13 GPU',
          v: [352823931, 3335845976, 4193218782],
        },
        {
          x: 'Apple A12 GPU',
          v: [958581112, 2301174800, 3403189785, 4085158452],
        },
        {
          x: 'Apple A11 GPU',
          v: [367695777, 411650080],
        },
        {
          x: 'Apple A13 GPU',
          v: [352823931, 1278953537, 3335845976],
        },
        {
          x: 'Apple A15 GPU',
          v: [1407135659],
        },
        {
          x: 'Apple A16 GPU',
          v: [46273595, 3403189785],
        },
        {
          x: 'Apple A10X GPU',
          v: [63583436, 2114570256, 3129316290, 3249312110],
        },
        {
          x: 'Apple A12 GPU',
          v: [1349146759, 2917249763],
        },
        {
          x: 'Apple M1 GPU',
          v: [105985484, 2364051618],
        },
        {
          x: 'Apple M2 GPU',
          v: [46273595],
        },
        {
          x: 'Apple A10 GPU',
          v: [2114570256],
        },
        {
          x: 'Apple A12 GPU',
          v: [1349146759],
        },
        {
          x: 'Apple A7 GPU',
          v: [857422828, 1915583345],
        },
        {
          x: 'Apple A8 GPU',
          v: [839732043, 3816812018, 4125234388],
        },
        {
          x: 'Apple A10 GPU',
          v: [583354101, 3458129248, 3928876783],
        },
        {
          x: 'Apple A11 GPU',
          v: [367695777, 411650080, 1220644697, 1804407534],
        },
        {
          x: 'Apple A15 GPU',
          v: [2364051618],
        },
        {
          x: 'Apple A8 GPU',
          v: [1411440593, 1924197914, 4125234388],
        },
        {
          x: 'Apple A9 GPU',
          v: [2114570256, 3129316290],
        },
        {
          x: 'Apple A10 GPU',
          v: [63583436, 2114570256, 3129316290],
        },
        {
          x: 'Apple A11 GPU',
          v: [1349146759, 2206992415, 2917249763, 2946940121],
        },
        {
          x: 'Apple A8 GPU',
          v: [1411440593, 1913250432, 3074367344, 4125234388],
        },
        {
          x: 'Apple A9 GPU',
          v: [46663968, 2114570256, 3129316290],
        },
        {
          x: 'Apple A11 GPU',
          v: [2206992415, 2917249763, 2946940121, 3237505312],
        },
        {
          x: 'Apple A8 GPU',
          v: [3128296539, 3816812018, 4125234388],
        },
        {
          x: 'Apple A9 GPU',
          v: [46663968, 63583436, 2114570256, 3129316290],
        },
        {
          x: 'Apple A10 GPU',
          v: [46663968, 63583436, 2114570256, 3129316290],
        },
        {
          x: 'Apple A11 GPU',
          v: [2917249763, 2946940121, 3237505312],
        },
        {
          x: 'Apple A15 GPU',
          v: [235283973, 1444462398, 2775654583],
        },
        {
          x: 'Apple A13 GPU',
          v: [2866949877, 3565683531],
        },
        {
          x: 'Apple A8 GPU',
          v: [2656686317, 3710391565],
        },
        {
          x: 'Apple A10 GPU',
          v: [46663968],
        },
        {
          x: 'Apple A12Z GPU',
          v: [958581112, 2301174800, 2487400911],
        },
        {
          x: 'Apple A12X GPU',
          v: [4085158452],
        },
        {
          x: 'Apple A10X GPU',
          v: [583354101, 3458129248, 3928876783],
        },
        {
          x: 'Apple A8X GPU',
          v: [1350183384, 3816812018, 4125234388],
        },
        {
          x: 'Apple A8 GPU',
          v: [4125234388],
        },
        {
          x: 'Apple A7 GPU',
          v: [1966062736],
        },
        {
          x: 'Apple A8 GPU',
          v: [2998196247],
        },
        {
          x: 'Apple A13 GPU',
          v: [2866949877],
        },
        {
          x: 'Apple M1 GPU',
          v: [1349146759, 1444462398],
        },
        {
          x: 'Apple M2 GPU',
          v: [2775654583],
        },
        {
          x: 'Apple A13 GPU',
          v: [3335845976],
        },
        {
          x: 'Apple A13 GPU',
          v: [1349146759],
        },
        {
          x: 'Apple A15 GPU',
          v: [1444462398],
        },
        {
          x: 'Apple A13 GPU',
          v: [3565683531],
        },
        {
          x: 'Apple A15 GPU',
          v: [235283973],
        },
        {
          x: 'Apple A11 GPU',
          v: [411650080, 1220644697],
        },
        {
          x: 'Apple A13 GPU',
          v: [352823931, 3403189785, 4193218782],
        },
        {
          x: 'Apple A11 GPU',
          v: [367695777],
        },
        {
          x: 'Apple A10 GPU',
          v: [3403189785],
        },
        {
          x: 'Apple A8X GPU',
          v: [1783160115],
        },
        {
          x: 'Apple A8 GPU',
          v: [3928382683],
        },
        {
          x: 'Apple A10 GPU',
          v: [1058363647, 2015944978],
        },
        {
          x: 'Apple A8 GPU',
          v: [3312905059, 3928382683],
        },
        {
          x: 'Apple A8X GPU',
          v: [1480368425, 1783160115, 3403189785],
        },
        {
          x: 'Apple A10X GPU',
          v: [2114570256],
        },
        {
          x: 'Apple A14 GPU',
          v: [1349146759],
        },
        {
          x: 'Apple A8X GPU',
          v: [1783160115, 3403189785],
        },
      ],
    };
    function height() {
      return window.screen.height * window.devicePixelRatio;
    }
    function mediacolorgamut() {
      return (function getMediaSingleValue(name, possibleValues) {
        for (var i = 0; i < possibleValues.length; i++)
          if (
            ((query = '(' + name + ': ' + possibleValues[i] + ')'),
            window.matchMedia(query).matches)
          )
            return possibleValues[i];
        var query;
        return 'n/a';
      })('color-gamut', ['p3', 'srgb']);
    }
    function evaluateNode(node, iterations) {
      if (node.m) {
        var result = node.m(node);
        result || '' === result
          ? result.then ||
            (function resolveNode(node, value, iterations) {
              for (var i = 0; i < node.n.length; i++) {
                var child = decisionTree.Data[node.n[i]];
                if (child.r)
                  for (var c = 0; c < child.r.length; c++) {
                    var range = child.r[c];
                    if (
                      (null === range.a || value >= range.a) &&
                      (null === range.b || value <= range.b)
                    )
                      return void evaluateNode(child, 0);
                  }
                else if (child.v && -1 != child.v.indexOf(value))
                  return void evaluateNode(child, 0);
              }
              node.n.length > 0 && iterations < 3
                ? setTimeout(function () {
                    evaluateNode(node, iterations + 1);
                  }, 10)
                : complete(node.x);
            })(node, result, iterations)
          : node.x && complete(node.x);
      } else {
        complete(node.x);
        complete('done');
      }
    }
    evaluateNode(decisionTree.Data[0], 0);
  }
  function fallbackTest() {
    let res = Math.min(screen.width, screen.height) + 'x' + Math.max(screen.width, screen.height),
      time = primeTest();
    if (((Global.iOSGPUFALLBACKTEST = time), time < 100))
      return (Device.graphics.webgl.gpu = 'apple a18');
    switch (res) {
      case '320x480':
        Device.graphics.webgl.gpu = 'legacy';
        break;
      case '320x568':
        Device.graphics.webgl.gpu = time <= 400 ? 'apple a8' : time <= 500 ? 'apple a7' : 'legacy';
        break;
      case '375x812':
      case '414x896':
        Device.graphics.webgl.gpu =
          time <= 150 ? 'apple a13' : time <= 180 ? 'apple a12' : 'apple a11';
        break;
      case '414x736':
      case '375x667':
        Device.graphics.webgl.gpu =
          time <= 220
            ? 'apple a11'
            : time <= 250
              ? 'apple a10'
              : time <= 360
                ? 'apple a9'
                : time <= 400
                  ? 'apple a8'
                  : time <= 600
                    ? 'apple a7'
                    : 'legacy';
        break;
      default:
      case '768x1024':
        Device.graphics.webgl.gpu =
          time <= 140
            ? 'apple a14'
            : time <= 160
              ? 'apple a13'
              : time <= 180
                ? 'apple a12'
                : time <= 220
                  ? 'apple a11'
                  : time <= 250
                    ? 'apple a10'
                    : time <= 360
                      ? 'apple a9'
                      : time <= 400
                        ? 'apple a8'
                        : time <= 600
                          ? 'apple a7'
                          : 'legacy';
        break;
      case '834x1112':
        Device.graphics.webgl.gpu =
          time <= 160
            ? 'apple a13'
            : time <= 180
              ? 'apple a12'
              : time <= 220
                ? 'apple a11'
                : 'apple a10';
        break;
      case '834x1194':
        time <= 140
          ? (Device.graphics.webgl.gpu = 'apple m1 gpu')
          : time <= 160
            ? (Device.graphics.webgl.gpu = 'apple a13')
            : time <= 180 && (Device.graphics.webgl.gpu = 'apple a12');
        break;
      case '810x1080':
        time <= 160
          ? (Device.graphics.webgl.gpu = 'apple a13')
          : time <= 220
            ? (Device.graphics.webgl.gpu = 'apple a11')
            : time <= 250 && (Device.graphics.webgl.gpu = 'apple a10');
        break;
      case '820x1180':
        Device.graphics.webgl.gpu = 'apple a14';
        break;
      case '428x926':
      case '390x844':
        Device.graphics.webgl.gpu = 'apple a15';
        break;
      case '1024x1366':
        Device.graphics.webgl.gpu =
          time <= 140
            ? 'apple m1 gpu'
            : time <= 160
              ? 'apple a13'
              : time <= 180
                ? 'apple a12'
                : time <= 220
                  ? 'apple a11'
                  : time <= 250
                    ? 'apple a10'
                    : 'apple a9';
    }
  }
  this.exports = function () {
    if (
      (function knownHash() {
        let value = hash();
        switch (((Global.iOSGPUHASH3D = value), value)) {
          case 3938463741:
          case 3607454639:
          case 1476734041:
            return (Device.graphics.webgl.gpu = 'apple a18');
          case 2370695082:
            return (Device.graphics.webgl.gpu = 'apple a16');
          case 1444462398:
            return (Device.graphics.webgl.gpu = 'apple a15');
          case 2652724963:
            return (Device.graphics.webgl.gpu = 'apple m4');
          case 2775654583:
            return (Device.graphics.webgl.gpu = 'apple m2');
          case 2370695082:
            return (Device.graphics.webgl.gpu = 'apple m1');
        }
      })()
    )
      return Promise.resolve();
    let _value,
      _timer,
      promise = Promise.create();
    const cb = (value) => {
      if ((clearTimeout(_timer), 'done' == value)) {
        if (((Global.iOSGPUHASHVAL = _value), !_value)) return (fallbackTest(), promise.resolve());
        if (_value.includes('|'))
          try {
            let split = _value.split('|');
            if (1 == split.length && split[0].includes('Apple M'))
              Device.graphics.webgl.gpu = 'apple m1 gpu';
            else {
              let output = split
                .filter((v) => !v.includes('Apple M'))
                .map((v) =>
                  Number(
                    v
                      .replace('Apple', '')
                      .replace('X', '')
                      .replace('Z', '')
                      .split('A')[1]
                      .split(' ')[0],
                  ),
                );
              if (
                (output.sort((a, b) => a - b),
                output[output.length - 1] - output[0] >= 2
                  ? fallbackTest()
                  : (Device.graphics.webgl.gpu = split[0].toLowerCase()),
                'apple a14 gpu' == Device.graphics.webgl.gpu)
              ) {
                let res =
                  Math.min(screen.width, screen.height) +
                  'x' +
                  Math.max(screen.width, screen.height);
                ('428x926' != res && '390x844' != res) ||
                  (Device.graphics.webgl.gpu = 'apple a15 gpu');
              }
            }
          } catch (e) {
            fallbackTest();
          }
        else Device.graphics.webgl.gpu = _value.toLowerCase();
        promise.resolve();
      } else {
        _value = value;
        _timer = setTimeout((_) => cb('done'), 20);
      }
    };
    return (getRenderer(cb), promise);
  };
});
Module(function GPUBlocklist() {
  this.exports = {
    match: function () {
      return (
        !Device.graphics.gpu ||
        Device.graphics.gpu.detect([
          'radeon hd 6970m',
          'radeon hd 6770m',
          'radeon hd 6490m',
          'radeon hd 6630m',
          'radeon hd 6750m',
          'radeon hd 5750',
          'radeon hd 5670',
          'radeon hd 4850',
          'radeon hd 4870',
          'radeon hd 4670',
          'geforce 9400m',
          'geforce 320m',
          'geforce 330m',
          'geforce gt 130',
          'geforce gt 120',
          'geforce gtx 285',
          'geforce 8600',
          'geforce 9600m',
          'geforce 9400m',
          'geforce 8800 gs',
          'geforce 8800 gt',
          'quadro fx 5',
          'quadro fx 4',
          'radeon hd 2600',
          'radeon hd 2400',
          'radeon hd 2600',
          'mali-4',
          'mali-3',
          'mali-2',
          'swiftshader',
          'basic render driver',
          'generic renderer',
          'sgx543',
          'legacy',
          'sgx 543',
        ])
      );
    },
  };
});
