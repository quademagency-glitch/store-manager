# 11. SMS Campaign Templates (5 Templates)

### Context
These SMS messages are sent via Arkesel using the sender ID "QUADERP." Each message must be 160 characters or fewer (standard SMS limit). Messages are transactional or promotional and should comply with Ghana's NCA (National Communications Authority) guidelines on unsolicited messaging. Include opt-out instructions on promotional messages where required.

**Sender ID:** QUADERP
**Character limit:** 160 characters per message
**Provider:** Arkesel (arkesel.com)

---

## Template 1: New Feature Announcement

**Purpose:** Alert existing users about a new product feature to drive engagement and reduce churn.

**Message:**

```
NEW: QuadERP now tracks stock expiry dates! Get alerts before products expire. Update your app to see it. Questions? WhatsApp us: [Number]
```

**Character count:** 148

**Alternative version:**

```
QuadERP update: Barcode scanning is here! Use your phone camera to add products instantly. Open the app to try it now. Need help? WhatsApp [Number]
```

**Character count:** 152

---

## Template 2: Trial Expiration Reminder

**Purpose:** Alert trial users that their free trial is ending soon. Create urgency to convert.

**Message:**

```
Hi [Name], your QuadERP free trial ends in 2 days. Subscribe now to keep your data & reports. GHS250/mo. Visit app.quaderp.app or reply YES for help.
```

**Character count:** 153

**Alternative version:**

```
Your QuadERP trial expires tomorrow! Don't lose your sales data. Subscribe from GHS250/mo - less than GHS9/day. app.quaderp.app or call [Number]
```

**Character count:** 148

---

## Template 3: Payment Reminder (Overdue Invoice)

**Purpose:** Remind subscribers whose payment is overdue to avoid service interruption.

**Message:**

```
Hi [Name], your QuadERP subscription payment is overdue. To avoid service interruption, please pay now at app.quaderp.app/billing. Need help? Call [Number]
```

**Character count:** 155

**Alternative version:**

```
QUADERP: Your invoice of GHS[Amount] is overdue. Pay now to keep your account active: app.quaderp.app/billing. Questions? WhatsApp [Number]
```

**Character count:** 143

---

## Template 4: Seasonal Promotion (Back-to-School)

**Purpose:** Engage shop owners during a high-sales season with a timely promotion.

**Message:**

```
Back-to-school rush coming! Track every sale & restock fast with QuadERP. Start your FREE 30-day trial today: quaderp.app. No card needed!
```

**Character count:** 141

**Alternative version (Christmas season):**

```
December sales are coming! Don't lose track of your busiest month. QuadERP tracks every sale, every cedi. Try FREE for 30 days: quaderp.app
```

**Character count:** 143

**Alternative version (Easter/holiday):**

```
Holiday sales season is here! Know your real profit this time. QuadERP tracks sales, stock & cash automatically. Free trial: quaderp.app
```

**Character count:** 140

---

## Template 5: Referral Program Nudge

**Purpose:** Remind existing customers about the referral program to drive word-of-mouth growth.

**Message:**

```
Know a shop owner who needs QuadERP? Refer them & get 1 MONTH FREE when they subscribe! Share your link: app.quaderp.app/refer. No limit!
```

**Character count:** 141

**Alternative version:**

```
Your friend gets a free trial + free setup. You get a FREE month. Refer shop owners to QuadERP today: app.quaderp.app/refer. Win-win!
```

**Character count:** 137

---

## Usage Notes

- **Personalization:** Use Arkesel's merge fields to insert `[Name]` and `[Amount]` dynamically. Personalized SMS has 29% higher open rates.
- **Timing:**
  - **Feature announcements:** Tuesday or Wednesday, 10:00 AM
  - **Trial expiration:** 48 hours and 24 hours before expiry, at 9:00 AM
  - **Payment reminders:** Day 1 overdue (morning), Day 3 overdue (afternoon), Day 7 overdue (morning. Final notice)
  - **Seasonal promotions:** 2-3 weeks before the season peak
  - **Referral nudges:** Monthly, on the 15th, at 11:00 AM
- **Compliance:** For promotional messages (Templates 1, 4, 5), include opt-out instructions if required by NCA regulations. Add "Reply STOP to opt out" at the end if needed. This will push some messages over 160 characters, requiring a split into 2 SMS segments.
- **A/B testing:** Send each alternative version to 50% of the audience. Measure click-through rate (for messages with links) and conversion rate (for trial/payment messages). Roll out the winner to the full list.
- **Avoid SMS fatigue:** Never send more than 4 SMS per month to any single user. Prioritize transactional messages (payment, trial expiry) over promotional ones.
- **WhatsApp follow-up:** For trial expiration and payment reminders, follow up with a WhatsApp message 24 hours after the SMS if there's no action. WhatsApp has higher engagement rates in Ghana.
- **Cost consideration:** Arkesel charges approximately GHS 0.03-0.05 per SMS. Budget accordingly for campaign sizes. A 500-person campaign costs about GHS 15-25.
