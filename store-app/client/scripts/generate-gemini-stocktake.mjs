import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

if (!process.env.GEMINI_API_KEY) {
  console.error('Please set GEMINI_API_KEY in store-app/client/.env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const scenes = [
  { id: 'stocktake_1', text: "Taking stock used to mean closing the store, printing long spreadsheets, and losing a whole weekend. With Quad E.R.P., cycle counts take minutes, and you can do them without ever pausing sales." },
  { id: 'stocktake_2', text: "Simply open the Cycle Counts tab and select your location. The system instantly generates a live ledger of what should be on the shelf. No more guessing, no more blind counting." },
  { id: 'stocktake_3', text: "Walk down the aisle and enter your physical counts right from your phone or laptop. Hit submit, and Quad E.R.P. automatically calculates the variances, logs any shrinkage, and updates your inventory in real time." }
];

async function generateAll() {
  for (const scene of scenes) {
    console.log(`Generating ${scene.id} with Gemini...`);
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: scene.text,
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: "Aoede" // Professional female voice
            }
          }
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          const buffer = Buffer.from(part.inlineData.data, 'base64');
          fs.writeFileSync(`../walkthrough-recordings/${scene.id}.mp3`, buffer);
          console.log(`Saved ${scene.id}.mp3`);
        }
      }
    }
  }
}

generateAll().catch(console.error);
