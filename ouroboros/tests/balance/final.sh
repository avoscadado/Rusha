#!/bin/sh
# Regenerates every number in the balance report (~20 min on 4 cores).
#   sh ouroboros/tests/balance/final.sh [base|rec|all]
# base = current CFG; rec = recommended override below (the preview24 runs also need the echo preview lengthened from 14 to 24 ticks,
# which is an app constant, so it is emulated through the bot option {"preview":24}).
cd "$(dirname "$0")/../.." || exit 1
R=tests/balance/run.mjs; O=tests/balance/out; mkdir -p $O
REC='{"cols":60,"rows":38,"waveSize":14,"life":30,"lifeJitter":4,"dayTicks":500,"days":6,"rewinds":2}'
what=${1:-all}
if [ "$what" = base ] || [ "$what" = all ]; then
node $R --bot strong       --seeds 200 --label BASE  > $O/base-strong.txt
node $R --bot human        --seeds 300 --label BASE  > $O/base-human.txt
node $R --bot human-harsh  --seeds 300 --label BASE  > $O/base-human-harsh.txt
node $R --bot classic      --seeds 400               > $O/classic.txt
node $R --bot classic      --seeds 400 --opts '{"slipOn":"all"}' > $O/classic-harsh.txt
node $R --bot strong       --seeds 60  --label BASE-depth3 --opts '{"depth":3}' > $O/base-strong-d3.txt
fi
if [ "$what" = rec ] || [ "$what" = all ]; then
node $R --bot strong       --seeds 200 --label REC --over "$REC" > $O/rec-strong.txt
node $R --bot human        --seeds 300 --label REC --over "$REC" > $O/rec-human.txt
node $R --bot human        --seeds 300 --label REC+preview24 --over "$REC" --opts '{"preview":24}' > $O/rec-human-preview24.txt
node $R --bot human-harsh  --seeds 300 --label REC --over "$REC" > $O/rec-human-harsh.txt
node $R --bot human-harsh  --seeds 300 --label REC+preview24 --over "$REC" --opts '{"preview":24}' > $O/rec-human-harsh-preview24.txt
node $R --bot strong       --seeds 60  --label REC-depth3  --over "$REC" --opts '{"depth":3}' > $O/rec-strong-d3.txt
fi
if [ "$what" = alt ] || [ "$what" = all ]; then
# CFG-only fallback (14-tick echo preview kept): more rewinds and a little less fruit
ALT='{"cols":60,"rows":38,"waveSize":11,"life":30,"lifeJitter":4,"dayTicks":500,"days":6,"rewinds":4}'
node $R --bot strong       --seeds 100 --label ALT --over "$ALT" > $O/alt-strong.txt
node $R --bot human        --seeds 300 --label ALT --over "$ALT" > $O/alt-human.txt
node $R --bot human-harsh  --seeds 300 --label ALT --over "$ALT" > $O/alt-human-harsh.txt
fi
