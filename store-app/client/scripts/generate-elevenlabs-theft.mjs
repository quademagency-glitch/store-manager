import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio-theft');

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Error: ELEVENLABS_API_KEY environment variable is missing.");
  process.exit(1);
}

const elevenlabs = new ElevenLabsClient({ apiKey: API_KEY });

const scenes = [
  { file: '01_t_intro.mp3', text: "Retail shrinkage is a massive problem, but Quad E.R.P. treats your inventory like high-security assets. Instead of just counting generic stock quantities, our system uses Unit-Level Tracking. Every single physical item gets a unique, generated QR code the moment it enters your store, allowing you to trace its exact lifecycle from arrival to the customer's hands." },
  { file: '02_t_double_layer.mp3', text: "The biggest threat to your business isn't shoplifting—it's internal theft. Storekeepers selling products and pocketing the cash, knowing that stock-taking is so difficult you won't find out until it's too late. To stop this, we built Double Layer Tracking. It requires two data points for high-value items: a QR code on the packaging, and the manufacturer's unique serial number on the product itself." },
  { file: '03_t_pos_validation.mp3', text: "This security extends seamlessly to the Point of Sale. When checking out a customer, the cashier scans the outer barcode, and the system prompts for the internal serial number. It instantly cross-references the database to ensure that exactly the right unit is leaving the store. It also checks if the item was already sold, preventing fraudulent returns or off-the-books reselling." },
  { file: '04_t_alerts.mp3', text: "Security doesn't stop at the register. The Alerts and Loss Prevention module is always watching. If staff conduct a stock take and an item is missing, or if they scan an item that's in the wrong location, the system triggers an immediate alert. It even detects suspicious patterns like excessive manual discounts, helping you identify internal shrinkage before it gets out of hand." },
  { file: '05_t_admin.mp3', text: "Finally, we protect your cash flow with strict managerial controls. High-risk actions, such as voiding a completed sale, are automatically placed into a void pending status. These actions require an authorized manager's PIN to approve, ensuring complete accountability. With Quad E.R.P., you're not just managing a store—you're securing your margins." }
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // Voice ID chosen by user
  const voiceId = "8yEvKxGuMUiKNjA9LWGz"; 
  console.log(`Using Voice ID: ${voiceId}. Generating audio via SDK...`);

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

  console.log("All audio generated successfully!");
}

main().catch(console.error);
