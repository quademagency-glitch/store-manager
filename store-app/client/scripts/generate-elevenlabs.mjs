import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'walkthrough-recordings', 'audio');

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
  console.error("Error: ELEVENLABS_API_KEY environment variable is missing.");
  process.exit(1);
}

const scenes = [
  { file: '01_dashboard.mp3', text: "Welcome to Quad E.R.P. The all-in-one store management platform built specifically for modern retail. Right from the moment you log in, the dashboard gives you a comprehensive, bird's-eye view of your entire business operation. You don't have to dig through menus to find what matters. Here, we can immediately analyze your daily revenue trends, identify your top-selling products at a glance, and monitor a real-time activity feed. Whether a new sale is made or stock drops below critical levels, you always know exactly what's happening on the shop floor, the second it happens." },
  { file: '02_sales.mp3', text: "Moving over to the Point of Sale, you'll see that completing a transaction is lightning fast, designed to keep your queues moving during rush hour. You can seamlessly scan barcodes, tap product categories, and adjust quantities in mere seconds. Notice how intuitive the interface is. We can easily assign a specific customer to this sale, which instantly syncs with your CRM data. Apply discounts, handle multiple payment methods, and hit complete. The receipt is ready to print or email instantly, leaving your customer happy and your records perfectly balanced." },
  { file: '03_products.mp3', text: "Managing your catalog has never been easier or more powerful. In the Products module, you have total control over your inventory catalog. You can quickly filter by category, check current retail and wholesale prices, and spot exactly how much stock is sitting on your shelves. Adding new items is a breeze, with support for variations, SKUs, and custom tax brackets. Everything is cleanly organized, making it simple to run promotions or adjust pricing across hundreds of items with just a few clicks." },
  { file: '04_inventory.mp3', text: "Now, let's dive deeper into Inventory Management, which is the heart of any retail business. Quad E.R.P. automatically calculates your inventory health, so you don't have to rely on manual spreadsheets. Notice the proactive low stock alerts? Our system has flagged that Gino Tomato Paste is running critically low. By catching this early, the system ensures you never miss a sale due to stockouts. You can also perform stock transfers between different store locations and track every single adjustment for complete accountability." },
  { file: '05_sales_record.mp3', text: "Accountability is key, which is why every single transaction is permanently logged in the Sales Record. You have full transparency over who sold what, and when. If a customer needs a return, a refund, or an exchange, authorized staff can handle these reversals right here from the central log. The system automatically updates the inventory count and adjusts the daily financials, keeping your till completely balanced and fully audited at all times without any manual reconciliation." },
  { file: '06_alerts.mp3', text: "Security and margin protection are critical for retail success. The Alerts and Loss Prevention module acts as your digital security guard, working around the clock. It actively monitors for and flags suspicious activities—such as unexpected voided items, unusual manual discounts, or missing inventory during stock takes. By highlighting these anomalies instantly, you can investigate potential shrinkage before it impacts your bottom line, protecting your margins effortlessly." },
  { file: '07_crm.mp3', text: "Your customers are the lifeblood of your business, and our CRM module ensures you treat them like royalty. The system automatically builds rich customer profiles directly from your Point of Sale transactions. You can track individual purchase histories, run tiered loyalty programs, and identify your most valuable shoppers. With this data, you can send targeted marketing campaigns, offer birthday discounts, and build lasting relationships that drive repeat business directly from this screen." },
  { file: '08_suppliers.mp3', text: "When it's time to restock, the Suppliers and Purchase Orders module dramatically streamlines your procurement process. You can manage your entire vendor database, compare historical pricing, and generate a new Purchase Order with just a few clicks. Once the P.O. is sent to your vendor, receiving the goods is just as easy. The system accurately receives the new stock into your inventory and automatically links the invoice to your accounts payable, ensuring you only pay for what you actually received." },
  { file: '09_accounting.mp3', text: "Speaking of accounts, let's look at the robust financial reporting tools. The automated Profit and Loss report gives you real-time insight into your true bottom line, factoring in cost of goods sold and operating expenses. You can also track accounts receivable to see exactly who owes you money and when it's due. With visual charts and exportable ledger data, ensuring your cash flow remains healthy has never been this transparent or accessible for business owners." },
  { file: '10_hr.mp3', text: "Quad E.R.P. isn't just about managing products; it's about empowering your people. In the Team and HR settings, you can manage your entire workforce. Assign highly specific employee roles and permissions, ensuring staff only see what they need to. You can seamlessly plan shift schedules, monitor employee attendance, and even calculate complex sales commissions effortlessly. It takes the headache out of payroll and keeps your team aligned and accountable." },
  { file: '11_admin.mp3', text: "For the owners and operators, the Business Administration panel puts you in total, uncompromising control. This is your centralized command center. From here, you can manage multiple store locations, configure tax rates, customize your receipt branding, and oversee your entire organization's data backups. As your business grows from one store to a nationwide chain, the system scales effortlessly right alongside you, adapting to your specific operational needs." },
  { file: '12_closing.mp3', text: "Powerful, deeply intuitive, and explicitly built for ambitious growth. That is the Quad E.R.P. difference. We've replaced chaos with clarity, giving you the tools to run your retail business smarter, faster, and more profitably. Thank you for taking this deep dive walkthrough with us, and we absolutely can't wait to see how we can help your business thrive and scale to new heights." },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("Fetching available voices from ElevenLabs...");
  const voicesRes = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": API_KEY }
  });
  
  if (!voicesRes.ok) {
    console.error("Failed to fetch voices:", await voicesRes.text());
    process.exit(1);
  }
  
  const voiceId = "dInDfi2rwzYkrgMV18kn"; // Richard
  console.log(`Using Voice ID: ${voiceId}. Generating audio...`);

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

  console.log("All audio generated successfully!");
}

main().catch(console.error);
