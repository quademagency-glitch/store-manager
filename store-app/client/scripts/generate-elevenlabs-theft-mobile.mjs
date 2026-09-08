import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio-theft-mobile');

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Error: ELEVENLABS_API_KEY environment variable is missing.");
  process.exit(1);
}

const elevenlabs = new ElevenLabsClient({ apiKey: API_KEY });

// 60-second punchy social media script about theft prevention
const scenes = [
  { file: '01_t_m_intro.mp3', text: "Retail shrinkage is eating your profits. That's why Quad E.R.P. doesn't just count stock—it tracks every single physical item with a unique QR code from arrival to sale." },
  { file: '02_t_m_double.mp3', text: "The real threat is internal theft. Storekeepers selling products and pocketing the cash, while messy inventory hides the truth for years. Our Double Layer Tracking stops this cold by requiring cashiers to scan both the outer box and the internal serial number. If they don't match, the POS instantly blocks the sale." },
  { file: '03_t_m_alerts.mp3', text: "And the system never sleeps. If stock goes missing, or staff attempt excessive voids, real-time alerts notify management immediately. Stop internal theft and secure your margins today with Quad E.R.P." }
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const voiceId = "8yEvKxGuMUiKNjA9LWGz"; 
  console.log(`Using Voice ID: ${voiceId}. Generating mobile audio via SDK...`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const outPath = path.join(OUT_DIR, scene.file);
    console.log(`Generating [${i+1}/${scenes.length}] ${scene.file}...`);
    
    try {
      const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
        text: scene.text,
        modelId: 'eleven_multilingual_v2',
        outputFormat: 'mp3_44100_128',
      });

      const writeStream = fs.createWriteStream(outPath);
      for await (const chunk of audioStream) {
        writeStream.write(chunk);
      }
      writeStream.end();
    } catch (err) {
      console.error(`Failed on ${scene.file}:`, err);
    }
  }

  console.log("All mobile audio generated successfully!");
}

main().catch(console.error);
