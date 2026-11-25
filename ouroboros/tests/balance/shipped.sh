#!/bin/sh
# Verifies the numbers for the build as shipped (no CFG overrides; the 24-tick echo preview is emulated by the bot option).
#   sh ouroboros/tests/balance/shipped.sh      (about 12 minutes on 4 cores)
cd "$(dirname "$0")/../.." || exit 1
R=tests/balance/run.mjs; O=tests/balance/out; mkdir -p $O
node $R --bot strong      --seeds 200 --label SHIPPED                                    > $O/shipped-strong.txt
node $R --bot human       --seeds 300 --label SHIPPED --opts '{"preview":24}'            > $O/shipped-human.txt
node $R --bot human-harsh --seeds 300 --label SHIPPED --opts '{"preview":24}'            > $O/shipped-human-harsh.txt
