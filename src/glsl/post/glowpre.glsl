// Quarter-size pass that keeps only what was marked as glowing (the sun, lamps, the accent).
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uSrc; uniform vec2 uTexel;
out vec4 O;
void main() {
  vec2 uv = gl_FragCoord.xy * uTexel;
  vec3 s = vec3(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    vec4 c = texture(uSrc, uv + (vec2(float(i), float(j)) - 0.5) * uTexel * 0.5);
    s += c.rgb * c.rgb * c.a;
  }
  O = vec4(sqrt(s * 0.25), 1.0);
}
