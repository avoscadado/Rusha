// ---------- inks ----------
// Every world is printed in eight inks with fixed roles. They are composed by
// hand, as a printer would mix them, and worlds move between palettes; hue is
// never spun freely.
//   top    sky at the zenith            low    sky at the horizon, and the haze
//   glow   the sky around the sun       lit    surfaces in light
//   shade  surfaces in shadow           deep   nearest silhouettes and line
//   paper  the lightest ink: snow, foam, mist, moons
//   accent the one loud ink: used on less than a twentieth of the picture
// hour: 0 night, 1 dawn or dusk, 2 day.  temp: -1 cool .. 1 warm.
const PALETTES = [
  // name,              hour,temp, top,      low,      glow,     lit,      shade,    deep,     paper,    accent
  ['Lamp Black',          0, -0.6, '#05070f','#16224a','#6f86c9','#2c3e78','#0f1838','#04050c','#e3e9f7','#f6cf6a'],
  ['Indigo Vat',          0, -0.9, '#080d24','#243a7a','#8fb0ea','#3f5aa3','#162050','#070a1a','#eef3fb','#ff6a3d'],
  ['Mulberry Night',      0,  0.1, '#0e0718','#3a1f4f','#b98bd0','#5a3a78','#231238','#0b0512','#f3e6f2','#ffd27a'],
  ['Verdigris Night',     0, -0.4, '#04100f','#12403f','#7fd1c0','#1f6460','#0a2a2c','#030a0a','#e6f5ee','#ff8a4a'],
  ['Coal and Ember',      0,  0.7, '#0a0706','#2e1711','#c96a3a','#4a2a20','#1c0f0c','#070403','#f2dfc9','#ff5a1f'],
  ['Prussian',            0, -0.8, '#030a1a','#0f3a66','#6fb3e0','#1e5f96','#0a2647','#020611','#eaf4fb','#ffe08a'],

  ['Kawase Dusk',         1,  0.5, '#1d2b5a','#f0a27a','#ffd9a3','#c9775a','#3a3358','#17172b','#f8ead2','#e23d28'],
  ['Persimmon',           1,  0.9, '#6a2c4a','#f6b06a','#fff0c2','#e58a4e','#5a2b3f','#241020','#fdf1d6','#2f7fa8'],
  ['Rose Madder',         1,  0.4, '#3b2a63','#f29aa2','#ffe1c9','#d9788a','#4a3260','#1b1430','#fbeee6','#ffc94a'],
  ['Apricot Haze',        1,  0.7, '#7c6a9a','#f7c59f','#fff3d6','#e9a57b','#6a5278','#2a2238','#fff6e6','#c8402e'],
  ['Wisteria',            1, -0.1, '#2a2f6e','#b9a3e3','#f3dcf5','#8f7fd0','#3a3478','#15163a','#f4eefb','#ffb347'],
  ['Brass and Plum',      1,  0.6, '#2b1836','#d99a4e','#ffe6a6','#b8763a','#3d2140','#160c1e','#f7ead0','#4fb3a5'],
  ['Salmon and Slate',    1,  0.2, '#3a4a66','#f2b6a0','#ffe9d6','#c98f86','#46506a','#1b2233','#f6efe8','#e0452f'],
  ['First Light',         1, -0.3, '#2f4f8a','#f4d6c4','#ffffff','#a9b9d9','#4a5f93','#1a2648','#fbfaf5','#ff7a59'],
  ['Mint Dawn',           1, -0.5, '#2c5a6a','#c9ead2','#fbffe6','#7fbfae','#2f5f68','#102a33','#f5fbf0','#ff6f61'],
  ['Cinnabar Dusk',       1,  1.0, '#3b1028','#e8553a','#ffc27a','#b83a30','#4a1430','#1c0714','#fbe3c6','#3aa6b9'],
  ['Lilac Smoke',         1,  0.0, '#4b4470','#d8c1d6','#fff0ea','#a893b5','#544b74','#211d36','#f7f1f4','#e8a13a'],
  ['Tangerine Sea',       1,  0.8, '#1f3f6b','#ff9f5a','#ffe7a8','#d9793f','#243a5e','#0e1a30','#fff1d9','#f2385a'],

  ['Celadon',             2, -0.3, '#5f9fb0','#d7ecdc','#ffffff','#9fc7a8','#4c7f84','#1f3a40','#f8fbf2','#d9482b'],
  ['Cyanotype',           2, -1.0, '#1f4f9a','#a9d0f2','#ffffff','#5f93d1','#1f4688','#0c2148','#f4f9fd','#ffb52e'],
  ['Bone and Ochre',      2,  0.6, '#7fa3b8','#f0e2c2','#fffbe8','#d9b67a','#8a6f4f','#3a2c22','#fbf5e4','#2f6f8f'],
  ['Salt Flat',           2,  0.1, '#6f9fd0','#eef0f2','#ffffff','#d9d6cf','#8f95a8','#3a4055','#ffffff','#ff5a3c'],
  ['Terracotta',          2,  0.9, '#4f8fb3','#f6d9b8','#fff6dd','#d9824f','#8a4a36','#3a1f1a','#fdf0da','#1f7f78'],
  ['Moss and Chalk',      2,  0.0, '#6fa8c9','#e3ecd6','#ffffff','#9fb56a','#4f6a44','#1f2e20','#f9faee','#e8502e'],
  ['Lapis Noon',          2, -0.7, '#1a3f8f','#8fc3ea','#ffffff','#e9d9b0','#3a5a9a','#12224f','#fffaf0','#e8402a'],
  ['Milk Glass',          2, -0.2, '#a9c9dd','#f3f1ea','#ffffff','#e6dfd2','#a3a9b8','#4a5266','#ffffff','#3f6fd9'],
  ['Saffron',             2,  1.0, '#3f7fb8','#ffe2a3','#fffbe0','#f0b33f','#9a5a2a','#3f2414','#fff6dc','#b0263a'],
  ['Jade and Rust',       2,  0.3, '#4f9aa0','#dfeedd','#ffffff','#6fae8f','#2f5f58','#12302c','#f4faf0','#c9512a'],
  ['Pewter',              2, -0.5, '#6f7f93','#d3d9df','#f5f7f9','#aab3bf','#5a6676','#252c38','#f2f4f6','#f2a03a'],
  ['Sea Glass',           2, -0.6, '#3f8fb8','#bfe6e0','#ffffff','#7fc9c0','#2f6f80','#103540','#f2fbf8','#ff7f50'],

  // strange inks: skies that are not air
  ['Absinthe',            1,  0.0, '#0f2a1a','#b7d94f','#f7ffb0','#7fa83a','#1f4a2a','#0a1a10','#f6fbdc','#e03a7a'],
  ['Oxblood Sky',         2,  0.8, '#5a0f1a','#e8a08a','#ffe2c9','#c9584f','#5a1a2a','#22080f','#fbe9de','#3ac0c9'],
  ['Negative',            2, -0.4, '#e9e4d6','#9fa9c0','#ffffff','#3a4266','#1a1f3a','#0a0c1a','#fbf8ee','#ff4a2e'],
  ['Ultraviolet',         0, -0.2, '#0a0420','#4a1fa0','#c08aff','#6a3fd0','#22104f','#070314','#efe6ff','#3affc0'],
  ['Sulphur',             2,  0.7, '#6a6a2a','#f2e27a','#fffbc0','#d9c24a','#6a5a22','#2a240c','#fffbe0','#3a5fd9'],
  ['Litmus',              1, -0.2, '#1a3a6a','#f08fb0','#ffe0f0','#c96a9a','#3a3a7a','#141a3a','#fbeef5','#7fe0a0'],
].map((p) => {
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2)); };
  const [name, hour, temp, ...inks] = p;
  const keys = ['top', 'low', 'glow', 'lit', 'shade', 'deep', 'paper', 'accent'];
  const o = { name, hour, temp };
  keys.forEach((k, i) => { o[k] = hex(inks[i]); });
  return o;
});
const INK_KEYS = ['top', 'low', 'glow', 'lit', 'shade', 'deep', 'paper', 'accent'];
const PALETTE_BY_NAME = Object.fromEntries(PALETTES.map((p) => [p.name, p]));
