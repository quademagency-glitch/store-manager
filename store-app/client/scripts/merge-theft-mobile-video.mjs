import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio-theft-mobile');

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
  { file: '01_t_m_intro.mp3', padding: 1.5 },
  { file: '02_t_m_double.mp3', padding: 1.5 },
  { file: '03_t_m_alerts.mp3', padding: 2.0 },
];

let filterComplex = '';
let inputs = '';
let i = 0;

console.log('Calculating audio timings for mobile theft explainer...');
for (const scene of scenes) {
  const duration = getAudioDuration(scene.file);
  const totalSceneDuration = duration + scene.padding;
  
  filterComplex += `[${i}:a]apad,atrim=0:${totalSceneDuration}[a${i}];`;
  inputs += `-i "walkthrough-recordings/audio-theft-mobile/${scene.file}" `;
  i++;
}

let concatInputs = '';
for (let j = 0; j < scenes.length; j++) {
  concatInputs += `[a${j}]`;
}
filterComplex += `${concatInputs}concat=n=${scenes.length}:v=0:a=1[outa]`;

// Mobile merge requires rotating the WebM sometimes, but the previous script just concats it directly with standard output
const cmd = `ffmpeg -y ${inputs} -i "walkthrough-recordings/mobile-raw-theft.webm" -filter_complex "${filterComplex}" -map ${scenes.length}:v -map "[outa]" -c:v libx264 -preset slow -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "walkthrough-recordings/QuadERP_TheftPrevention_Mobile.mp4"`;

console.log('Merging mobile video and audio...');
fs.writeFileSync('scripts/run-theft-mobile-merge.sh', cmd);
execSync('chmod +x scripts/run-theft-mobile-merge.sh');
console.log('Run ./scripts/run-theft-mobile-merge.sh to merge.');
