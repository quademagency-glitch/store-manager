import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio');

function getAudioDuration(filename) {
  try {
    const filePath = path.join(AUDIO_DIR, filename);
    if (!fs.existsSync(filePath)) return 8; 
    const out = execSync(`ffprobe -i "${filePath}" -show_entries format=duration -v quiet -of csv="p=0"`);
    return parseFloat(out.toString().trim());
  } catch (e) {
    return 8;
  }
}

const scenes = [
  { file: '01_dashboard.mp3', padding: 2.0 },
  { file: '02_sales.mp3', padding: 2.0 },
  { file: '03_products.mp3', padding: 1.5 },
  { file: '04_inventory.mp3', padding: 1.5 },
  { file: '05_sales_record.mp3', padding: 1.5 },
  { file: '06_alerts.mp3', padding: 1.5 },
  { file: '07_crm.mp3', padding: 1.5 },
  { file: '08_suppliers.mp3', padding: 1.5 },
  { file: '09_accounting.mp3', padding: 1.5 },
  { file: '10_hr.mp3', padding: 1.5 },
  { file: '11_admin.mp3', padding: 1.5 },
  { file: '12_closing.mp3', padding: 2.0 },
];

let filterComplex = '';
let inputs = '';
let i = 0;

console.log('Calculating audio timings...');
for (const scene of scenes) {
  const duration = getAudioDuration(scene.file);
  const totalSceneDuration = duration + scene.padding;
  
  // Pad the audio with silence to match the exact scene duration
  // apad pads the audio, atrim cuts it to exactly totalSceneDuration
  filterComplex += `[${i}:a]apad,atrim=0:${totalSceneDuration}[a${i}];`;
  inputs += `-i "walkthrough-recordings/audio/${scene.file}" `;
  i++;
}

// Concat all the padded audio streams
let concatInputs = '';
for (let j = 0; j < scenes.length; j++) {
  concatInputs += `[a${j}]`;
}
filterComplex += `${concatInputs}concat=n=${scenes.length}:v=0:a=1[outa]`;

const cmd = `ffmpeg -y ${inputs} -i "walkthrough-recordings/deep-dive-raw.webm" -filter_complex "${filterComplex}" -map ${scenes.length}:v -map "[outa]" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "walkthrough-recordings/QuadERP_Walkthrough_Narrated.mp4"`;

console.log('Merging video and audio...');
fs.writeFileSync('scripts/run-merge.sh', cmd);
execSync('chmod +x scripts/run-merge.sh');
console.log('Run ./scripts/run-merge.sh to merge.');
