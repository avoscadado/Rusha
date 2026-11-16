// To the screen: enlarge the plate, add the glow, and give it the tooth of paper.
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uSrc, uGlow, uNoise;
uniform vec2 uOut;            // canvas size in pixels
uniform vec4 uK;              // glow strength, tooth strength, fade 0..1, unused
uniform vec3 uFadeInk;        // what the plate fades from
out vec4 O;
void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 c = texture(uSrc, uv).rgb; c *= c;
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
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  O = vec4(c + (grain) / 255.0, 1.0);
}
