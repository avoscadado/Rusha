// ---------- WebGL2 plumbing ----------
// Raw WebGL2, no library. Everything is drawn with one oversized triangle.
const GLX = {
  gl: null, caps: {}, lost: false,

  init(canvas) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    this.gl = gl;
    const caps = this.caps;
    caps.floatTarget = !!gl.getExtension('EXT_color_buffer_float');
    caps.halfTarget = caps.floatTarget || !!gl.getExtension('EXT_color_buffer_half_float');
    caps.floatLinear = !!gl.getExtension('OES_texture_float_linear');
    caps.parallel = gl.getExtension('KHR_parallel_shader_compile');
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    caps.renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    caps.software = /swiftshader|llvmpipe|software/i.test(caps.renderer);
    caps.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    // HDR path needs a renderable half-float target that can be filtered; half
    // float is always filterable in WebGL2. Otherwise fall back to 8-bit.
    caps.hdr = caps.halfTarget && this._probeTarget(gl.RGBA16F, gl.HALF_FLOAT);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return gl;
  },

  _probeTarget(internal, type) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, gl.RGBA, type, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f); gl.deleteTexture(t);
    return ok;
  },

  // A colour target. hdr=true asks for half float and quietly gets 8-bit when
  // the device cannot render to it.
  target(w, h, { hdr = true, linear = true } = {}) {
    const gl = this.gl;
    const useHdr = hdr && this.caps.hdr;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, useHdr ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA,
      useHdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h, hdr: useHdr };
  },
  freeTarget(t) { if (!t) return; this.gl.deleteFramebuffer(t.fbo); this.gl.deleteTexture(t.tex); },

  // An 8-bit data texture that repeats.
  dataTexture(size, bytes, { linear = true } = {}) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return tex;
  },

  VS: `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`,

  // Starts a compile and returns at once. Poll with ready(); the link status is
  // only read after the driver reports completion, so nothing blocks the frame
  // where KHR_parallel_shader_compile exists.
  program(fsSource, label) {
    const gl = this.gl;
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = mk(gl.VERTEX_SHADER, this.VS);
    const fs = mk(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    return { prog, vs, fs, label, src: fsSource, state: 'compiling', started: performance.now(), uniforms: new Map(), error: null };
  },

  // -> 'compiling' | 'ready' | 'failed'
  ready(p) {
    if (p.state !== 'compiling') return p.state;
    const gl = this.gl;
    if (gl.isContextLost()) return p.state;
    const ext = this.caps.parallel;
    if (ext && !gl.getProgramParameter(p.prog, ext.COMPLETION_STATUS_KHR)) return p.state;
    if (gl.getProgramParameter(p.prog, gl.LINK_STATUS)) {
      p.state = 'ready';
      p.compileMs = performance.now() - p.started;
    } else {
      p.state = 'failed';
      p.error = (gl.getShaderInfoLog(p.fs) || '') + (gl.getProgramInfoLog(p.prog) || '');
      console.error('[shader] ' + p.label + ' failed\n' + GLX.annotate(p.src, p.error));
    }
    gl.deleteShader(p.vs); gl.deleteShader(p.fs);
    return p.state;
  },
  freeProgram(p) { if (p && p.prog) { this.gl.deleteProgram(p.prog); p.prog = null; p.state = 'freed'; } },

  // Shows the offending lines of the assembled source next to a driver error.
  annotate(src, log) {
    const lines = src.split('\n'); const seen = new Set(); let out = log.trim();
    for (const m of log.matchAll(/ERROR:\s*\d+:(\d+)/g)) {
      const n = +m[1]; if (seen.has(n)) continue; seen.add(n);
      out += `\n  ${n}: ${(lines[n - 1] || '').trim()}`;
      if (seen.size > 6) break;
    }
    return out;
  },

  use(p) { this.gl.useProgram(p.prog); this.cur = p; },
  loc(name) {
    const p = this.cur; let l = p.uniforms.get(name);
    if (l === undefined) { l = this.gl.getUniformLocation(p.prog, name); p.uniforms.set(name, l); }
    return l;
  },
  // Uniform setters that silently skip uniforms the compiler optimised away.
  f(name, x) { const l = this.loc(name); if (l) this.gl.uniform1f(l, x); },
  i(name, x) { const l = this.loc(name); if (l) this.gl.uniform1i(l, x); },
  v2(name, x, y) { const l = this.loc(name); if (l) this.gl.uniform2f(l, x, y); },
  v3(name, v) { const l = this.loc(name); if (l) this.gl.uniform3f(l, v[0], v[1], v[2]); },
  v4(name, a, b, c, d) { const l = this.loc(name); if (l) this.gl.uniform4f(l, a, b, c, d); },
  fv(name, arr) { const l = this.loc(name); if (l) this.gl.uniform1fv(l, arr); },
  v3v(name, arr) { const l = this.loc(name); if (l) this.gl.uniform3fv(l, arr); },
  tex(name, unit, tex) {
    const gl = this.gl, l = this.loc(name);
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    if (l) gl.uniform1i(l, unit);
  },
  // Draw into a target (or the canvas when t is null), into the sub-rectangle w x h.
  draw(t, w, h, scissor) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
    gl.viewport(0, 0, w, h);
    if (scissor) { gl.enable(gl.SCISSOR_TEST); gl.scissor(scissor[0], scissor[1], scissor[2], scissor[3]); }
    else gl.disable(gl.SCISSOR_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (scissor) gl.disable(gl.SCISSOR_TEST);
  },
};
