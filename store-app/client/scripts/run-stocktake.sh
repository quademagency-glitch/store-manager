#!/bin/bash
ffmpeg -y -i ../walkthrough-recordings/raw-stocktake.webm \
-i ../walkthrough-recordings/stocktake_1.mp3 \
-i ../walkthrough-recordings/stocktake_2.mp3 \
-i ../walkthrough-recordings/stocktake_3.mp3 \
-filter_complex "\
[1:a]adelay=500|500[a1];\
[2:a]adelay=2000|2000[a2];\
[3:a]adelay=3500|3500[a3];\
[a1][a2][a3]amix=inputs=3:dropout_transition=0:weights=1 1 1[outa]\
" \
-map 0:v -map "[outa]" \
-c:v libx264 -preset fast -crf 22 \
-c:a aac -b:a 128k \
-shortest \
../walkthrough-recordings/QuadERP_Stocktake_Explainer.mp4
