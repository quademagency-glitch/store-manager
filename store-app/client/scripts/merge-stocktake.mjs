import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getDuration(file) {
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "../walkthrough-recordings/${file}"`);
    return parseFloat(out.toString().trim());
  } catch (e) {
    console.error("Error reading duration for", file);
    return 0;
  }
}

const d1 = getDuration('stocktake_1.mp3');
const d2 = getDuration('stocktake_2.mp3');
const d3 = getDuration('stocktake_3.mp3');

// Give a tiny buffer for scene transitions
const start2 = d1 + 2.0;
const start3 = start2 + d2 + 1.5;

const script = `#!/bin/bash
ffmpeg -y -i ../walkthrough-recordings/raw-stocktake.webm \\
-i ../walkthrough-recordings/stocktake_1.mp3 \\
-i ../walkthrough-recordings/stocktake_2.mp3 \\
-i ../walkthrough-recordings/stocktake_3.mp3 \\
-filter_complex "
[1:a]adelay=500|500[a1];
[2:a]adelay=\${Math.round(start2 * 1000)}|\${Math.round(start2 * 1000)}[a2];
[3:a]adelay=\${Math.round(start3 * 1000)}|\${Math.round(start3 * 1000)}[a3];
[a1][a2][a3]amix=inputs=3:dropout_transition=0:weights=1 1 1[outa]
" \\
-map 0:v -map "[outa]" \\
-c:v libx264 -preset fast -crf 22 \\
-c:a aac -b:a 128k \\
-shortest \\
../walkthrough-recordings/QuadERP_Stocktake_Explainer.mp4
`;

// Fix the template literal escaping
const actualScript = `#!/bin/bash
ffmpeg -y -i ../walkthrough-recordings/raw-stocktake.webm \\
-i ../walkthrough-recordings/stocktake_1.mp3 \\
-i ../walkthrough-recordings/stocktake_2.mp3 \\
-i ../walkthrough-recordings/stocktake_3.mp3 \\
-filter_complex "\\
[1:a]adelay=500|500[a1];\\
[2:a]adelay=${Math.round(start2 * 1000)}|${Math.round(start2 * 1000)}[a2];\\
[3:a]adelay=${Math.round(start3 * 1000)}|${Math.round(start3 * 1000)}[a3];\\
[a1][a2][a3]amix=inputs=3:dropout_transition=0:weights=1 1 1[outa]\\
" \\
-map 0:v -map "[outa]" \\
-c:v libx264 -preset fast -crf 22 \\
-c:a aac -b:a 128k \\
-shortest \\
../walkthrough-recordings/QuadERP_Stocktake_Explainer.mp4
`;

fs.writeFileSync('run-stocktake.sh', actualScript);
fs.chmodSync('run-stocktake.sh', '755');
console.log('Generated run-stocktake.sh');
