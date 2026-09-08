import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const voiceId = '8yEvKxGuMUiKNjA9LWGz';

const scenes = [
  { id: 'stocktake_1', text: "Taking stock used to mean closing the store, printing long spreadsheets, and losing a whole weekend. With Quad E.R.P., cycle counts take minutes, and you can do them without ever pausing sales." },
  { id: 'stocktake_2', text: "Simply open the Cycle Counts tab and select your location. The system instantly generates a live ledger of what should be on the shelf. No more guessing, no more blind counting." },
  { id: 'stocktake_3', text: "Walk down the aisle and enter your physical counts right from your phone or laptop. Hit submit, and Quad E.R.P. automatically calculates the variances, logs any shrinkage, and updates your inventory in real time." }
];

async function generateAll() {
  for (const scene of scenes) {
    console.log(`Generating ${scene.id}...`);
    const audio = await client.textToSpeech.convert(voiceId, {
      text: scene.text,
      model_id: 'eleven_multilingual_v2',
      output_format: 'mp3_44100_128'
    });
    const writeStream = fs.createWriteStream(`../walkthrough-recordings/${scene.id}.mp3`);
    audio.pipe(writeStream);
    await new Promise((resolve) => writeStream.on('finish', resolve));
  }
}

generateAll().catch(console.error);
