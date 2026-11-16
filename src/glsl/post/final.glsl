// To the screen: enlarge the plate, add the glow, and give it the tooth of paper.
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uSrc, uGlow, uNoise;
uniform vec2 uOut;            // canvas size in pixels
uniform vec4 uK;              // glow strength, tooth strength, fade 0..1, debug
uniform vec3 uFadeInk;        // what the plate fades from
uniform vec2 uSrcSize;        // size of the world pass in pixels
out vec4 O;
// Catmull-Rom enlargement in five taps: keeps printed edges crisp without ringing much
vec3 enlarge(vec2 uv) {
  vec2 p = uv * uSrcSize, c = floor(p - 0.5) + 0.5, f = p - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2, t0 = (c - 1.0) / uSrcSize, t3 = (c + 2.0) / uSrcSize, t12 = (c + w2 / w12) / uSrcSize;
  vec3 a = texture(uSrc, vec2(t12.x, t0.y)).rgb * (w12.x * w0.y) + texture(uSrc, vec2(t0.x, t12.y)).rgb * (w0.x * w12.y)
         + texture(uSrc, vec2(t12.x, t12.y)).rgb * (w12.x * w12.y) + texture(uSrc, vec2(t3.x, t12.y)).rgb * (w3.x * w12.y)
         + texture(uSrc, vec2(t12.x, t3.y)).rgb * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return clamp(a / wsum, 0.0, 1.0);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = uSrcSize.x < uOut.x - 1.0 ? enlarge(uv) : texture(uSrc, uv).rgb; c *= c;
  vec3 g = texture(uGlow, uv).rgb; g *= g;
  c += g * uK.x;
  // paper: a coarse fibre and a fine grain, both fixed to the screen
  vec2 px = gl_FragCoord.xy;
  float fibre = texture(uNoise, px * vec2(0.0021, 0.011)).r - 0.5;
  float grain = texture(uNoise, px / 256.0).g - 0.5;
  float tooth = fibre * 0.6 + grain * 0.8;
  c *= 1.0 + tooth * uK.y;
  c += tooth * uK.y * 0.012;
  c = mix(uFadeInk, c, uK.z);
  if (uK.w > 0.5) { O = vec4(clamp(texture(uSrc, uv).rgb, 0.0, 1.0), 1.0); O.rgb *= O.rgb; return; }   // debug views stay linear
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  O = vec4(c + (grain) / 255.0, 1.0);
}
