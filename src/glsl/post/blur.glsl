// Separable 9-tap blur. uTexel is one texel of the source; uDir picks the axis.
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform vec2 uDir;
out vec4 O;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel, d = uDir * uTexel;
  vec3 s = texture(uSrc, uv).rgb * 0.2270;
  s += (texture(uSrc, uv + d * 1.3846).rgb + texture(uSrc, uv - d * 1.3846).rgb) * 0.3162;
  s += (texture(uSrc, uv + d * 3.2308).rgb + texture(uSrc, uv - d * 3.2308).rgb) * 0.0703;
  O = vec4(s, 1.0);
}
