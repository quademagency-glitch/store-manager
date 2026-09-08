import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio-mobile');

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
  { file: '01_m_dashboard.mp3', padding: 1.5 },
  { file: '02_m_sales.mp3', padding: 1.5 },
  { file: '03_m_inventory.mp3', padding: 1.5 },
  { file: '04_m_closing.mp3', padding: 2.0 },
];

let filterComplex = '';
let inputs = '';
let i = 0;

console.log('Calculating mobile audio timings...');
for (const scene of scenes) {
  const duration = getAudioDuration(scene.file);
  const totalSceneDuration = duration + scene.padding;
  
  filterComplex += `[${i}:a]apad,atrim=0:${totalSceneDuration}[a${i}];`;
  inputs += `-i "walkthrough-recordings/audio-mobile/${scene.file}" `;
  i++;
}

let concatInputs = '';
for (let j = 0; j < scenes.length; j++) {
  concatInputs += `[a${j}]`;
}
filterComplex += `${concatInputs}concat=n=${scenes.length}:v=0:a=1[outa]`;

const cmd = `ffmpeg -y ${inputs} -i "walkthrough-recordings/mobile-raw.webm" -filter_complex "${filterComplex}" -map ${scenes.length}:v -map "[outa]" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "walkthrough-recordings/QuadERP_Mobile_Explainer.mp4"`;

console.log('Merging video and audio for mobile...');
fs.writeFileSync('scripts/run-mobile-merge.sh', cmd);
execSync('chmod +x scripts/run-mobile-merge.sh');
console.log('Run ./scripts/run-mobile-merge.sh to merge.');
