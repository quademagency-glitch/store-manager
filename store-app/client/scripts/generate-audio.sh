#!/bin/bash

# Generates the TTS audio files for the QuadERP Deep Dive Walkthrough
# Uses edge-tts with the West African (Nigerian) Male Voice (en-NG-AbeoNeural)

VOICE="en-NG-AbeoNeural"
RATE="+0%"
OUT_DIR="walkthrough-recordings/audio"

mkdir -p "$OUT_DIR"

echo "Generating TTS audio..."

# 1. Dashboard
edge-tts -v "$VOICE" --rate="$RATE" -t "Welcome to Quad E.R.P. The all-in-one store management platform built specifically for modern retail. Right from the dashboard, you get a bird's-eye view of your business. Let's look at your daily revenue, top-selling products, and a real-time activity feed, so you always know exactly what's happening on the shop floor." --write-media "$OUT_DIR/01_dashboard.mp3"

# 2. Sales POS
edge-tts -v "$VOICE" --rate="$RATE" -t "Moving over to the Point of Sale, completing a transaction is lightning fast. You can scan barcodes, tap products, and adjust quantities in seconds. Notice how we can easily assign a customer to this sale. This builds your CRM data seamlessly at checkout. We hit complete, and the receipt is ready to print." --write-media "$OUT_DIR/02_sales.mp3"

# 3. Products Catalog
edge-tts -v "$VOICE" --rate="$RATE" -t "Managing your catalog has never been easier. In the Products module, you can quickly filter by category, see current retail prices, and spot exactly how much stock is sitting on your shelves. Everything is cleanly organized." --write-media "$OUT_DIR/03_products.mp3"

# 4. Inventory Management
edge-tts -v "$VOICE" --rate="$RATE" -t "Now, let's dive deeper into Inventory. Quad E.R.P. automatically calculates inventory health. Notice the low stock alerts? Our Gino Tomato Paste is running low. The system flags this before you ever run out, ensuring you never miss a sale due to stockouts." --write-media "$OUT_DIR/04_inventory.mp3"

# 5. Sales Record & Returns
edge-tts -v "$VOICE" --rate="$RATE" -t "Every single transaction is logged in the Sales Record. You have full transparency. If a customer needs a return or an exchange, authorized staff can handle reversals right here, keeping your till completely balanced and fully audited." --write-media "$OUT_DIR/05_sales_record.mp3"

# 6. Alerts & Loss Prevention
edge-tts -v "$VOICE" --rate="$RATE" -t "Security is critical. The Alerts and Loss Prevention module flags suspicious activities—like unexpected voids, manual discounts, or missing inventory. This acts as your digital security guard, protecting your margins around the clock." --write-media "$OUT_DIR/06_alerts.mp3"

# 7. Customers (CRM)
edge-tts -v "$VOICE" --rate="$RATE" -t "Your customers are the lifeblood of your business. The CRM module automatically builds profiles from your Point of Sale transactions. You can track purchase history, run loyalty programs, and send targeted marketing directly from this screen." --write-media "$OUT_DIR/07_crm.mp3"

# 8. Suppliers & POs
edge-tts -v "$VOICE" --rate="$RATE" -t "When it's time to restock, the Suppliers and Purchase Orders module streamlines the process. You can generate a new P.O., send it to your vendor, and accurately receive the goods into inventory, all connected to your accounts payable." --write-media "$OUT_DIR/08_suppliers.mp3"

# 9. Accounting & Reports
edge-tts -v "$VOICE" --rate="$RATE" -t "Speaking of accounts, let's look at the financials. The automated Profit and Loss report gives you real-time insight into your bottom line. You can also track accounts receivable to see who owes you money, ensuring your cash flow remains healthy." --write-media "$OUT_DIR/09_accounting.mp3"

# 10. HR & Team
edge-tts -v "$VOICE" --rate="$RATE" -t "Quad E.R.P. isn't just about products; it's about people. In the Team settings, you manage employee roles, permissions, and shift schedules. You can also monitor attendance and calculate sales commissions effortlessly." --write-media "$OUT_DIR/10_hr.mp3"

# 11. Business Admin
edge-tts -v "$VOICE" --rate="$RATE" -t "For the owners and operators, the Business Administration panel puts you in total control. Manage multiple store locations, configure integrations, and oversee your entire organization from one centralized command center." --write-media "$OUT_DIR/11_admin.mp3"

# 12. Closing
edge-tts -v "$VOICE" --rate="$RATE" -t "Powerful, intuitive, and built for growth. That's Quad E.R.P. Thank you for watching, and we can't wait to see how we can help your business thrive." --write-media "$OUT_DIR/12_closing.mp3"

echo "Audio generation complete!"
