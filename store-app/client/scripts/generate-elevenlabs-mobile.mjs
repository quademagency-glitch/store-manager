import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio-mobile');

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Error: ELEVENLABS_API_KEY environment variable is missing.");
  process.exit(1);
}

// 60-second punchy social media script
const scenes = [
  { file: '01_m_dashboard.mp3', text: "Running a retail business shouldn't feel chaotic. Meet Quad E.R.P., the all-in-one store management platform built to scale with you. Right from the dashboard, you instantly see your daily revenue, top-selling products, and real-time shop floor activity." },
  { file: '02_m_sales.mp3', text: "Checking out customers is lightning fast. Our intuitive Point of Sale lets you scan barcodes, tap products, and assign customer profiles in mere seconds. No more long queues during rush hour." },
  { file: '03_m_inventory.mp3', text: "And you'll never run out of your best-sellers again. Quad E.R.P.'s smart inventory system tracks every single item across multiple locations, automatically alerting you the moment stock runs low." },
  { file: '04_m_closing.mp3', text: "Turn one-time shoppers into loyal fans with built-in CRM, manage your staff schedules, and track your true profit margins in real-time. Ditch the spreadsheets and take total control of your retail business today with Quad E.R.P." },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const voiceId = "dInDfi2rwzYkrgMV18kn"; // Richard
  console.log(`Using Voice ID: ${voiceId}. Generating mobile audio...`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const outPath = path.join(OUT_DIR, scene.file);
    console.log(`Generating [${i+1}/${scenes.length}] ${scene.file}...`);
    
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: scene.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!res.ok) {
      console.error(`Failed on ${scene.file}:`, await res.text());
      continue;
    }

    const buffer = await res.arrayBuffer();
    fs.writeFileSync(outPath, Buffer.from(buffer));
  }

  console.log("All mobile audio generated successfully!");
}

main().catch(console.error);
