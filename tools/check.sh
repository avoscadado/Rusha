#!/bin/sh
# Runs every automated check and leaves the pictures in the folder given (default: ./check-out).
#   sh tools/check.sh [outdir]
# Exits non-zero if any step reports an error. Slow: everything is drawn by a software renderer.
set -u
cd "$(dirname "$0")/.."
OUT="${1:-check-out}"; mkdir -p "$OUT"
FAIL=0
step() { echo "== $1"; shift; "$@" || { echo "   FAILED: $*"; FAIL=1; }; }

step "build" node build.mjs
step "census" sh -c "node tools/census.mjs 3000 > '$OUT/census.log'"
FORMS=$(ls src/glsl/forms | sed 's/\.glsl$//')
for f in $FORMS; do
  step "sheet $f" sh -c "node tools/shot.mjs '$OUT/sheet-$f.jpg' 'seed={}&form=$f' --t 18 --sheet K1,K2,K3,K4,K5,K6 --cols 3 --w 480 --h 270 > '$OUT/sheet-$f.log'"
  step "kin $f"   sh -c "node tools/shot.mjs '$OUT/kin-$f.jpg' 'seed=K2&form=$f&change={}' --t 14 --sheet 11,22,33,44,55,66 --cols 3 --w 480 --h 270 > '$OUT/kin-$f.log'"
  step "doors $f" sh -c "node tools/shot.mjs '$OUT/doors-$f.jpg' 'seed=K3&form=$f' --t 40,47,51,52.8,53.4,60 --cols 3 --w 480 --h 270 > '$OUT/doors-$f.log'"
  step "crossing $f" sh -c "node tools/cross.mjs 'seed=K3&form=$f' > '$OUT/cross-$f.log'"
  step "cost $f"  sh -c "node tools/shot.mjs '$OUT/cost-$f.png' 'seed=K1&form=$f' --t 16 --cost | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s.trim().split('\\n').pop()).px;console.log('   mean march cost',(p.r*200/255).toFixed(1),'evaluations a pixel; over budget in',(p.over*100).toFixed(2)+'% of pixels');process.exit(p.r>115||p.over>0.03?1:0)})\""
done
step "journey" sh -c "node tools/shot.mjs '$OUT/journey.jpg' 'seed={}' --t 20,53.2,60,106.5,115 --sheet J1,J2,J3 --cols 5 --w 384 --h 216 > '$OUT/journey.log'"
step "interface, desktop" sh -c "node tools/ui.mjs '$OUT/ui-desktop' > '$OUT/ui-desktop.log'"
step "interface, phone"   sh -c "node tools/ui.mjs '$OUT/ui-phone' --w 390 --h 844 > '$OUT/ui-phone.log'"
step "failure paths" node tools/fail.mjs "$OUT/restored.png"
step "score" sh -c "node tools/audio-test.mjs > '$OUT/audio.log'"
[ "$FAIL" = 0 ] && echo "all checks passed" || echo "some checks FAILED"
exit $FAIL
