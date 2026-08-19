/**
 * Help centre content.
 *
 * Bundled with the app rather than fetched, deliberately: the articles most
 * worth reading are the ones you need when something is not working, and a
 * knowledge base that needs a healthy network to render is unavailable in
 * exactly that moment. It also means help works offline, which matters for a
 * POS in a shop with patchy connectivity.
 *
 * `body` is a small markdown subset, see renderMarkdown in pages/HelpCenter.jsx
 * for exactly what is supported. Keep to headings, paragraphs, bullet and
 * numbered lists, bold, inline code and links; anything else renders literally.
 *
 * `id` is a permanent handle: contextual "?" buttons deep-link to
 * `/help?article=<id>`, so renaming one breaks those links.
 */

export const HELP_CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'sales-pos', label: 'Sales & POS' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'customers', label: 'Customers' },
  { id: 'accounting', label: 'Accounting' },
  { id: 'team', label: 'Team & Permissions' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];

export const HELP_ARTICLES = [
  // ── Getting Started ────────────────────────────────────────
  {
    id: 'business-profile',
    category: 'getting-started',
    title: 'Setting up your business profile',
    summary: 'Name, logo, currency and tax rate: the details that appear on every receipt and invoice.',
    body: `
Your business profile is what customers see on receipts, invoices and purchase
orders, so it is worth getting right before you make your first sale.

## Where to find it

Go to **Administration → Organization**. You need the *Manage organization*
permission; if you cannot see the page, ask whoever set up your account.

## What to fill in

- **Business name**: appears as the heading on every printed document.
- **Logo**: shown on receipts, invoices and the sign-in page for your team.
  A square image around 512×512 works best.
- **Currency**: sets the symbol and formatting used everywhere in the app.
  Multi-location businesses can override this per location, which is what you
  want if you trade across borders.
- **Country**: supplies the dialing code for phone numbers typed without one.
  A number entered as \`024 123 4567\` becomes \`+233241234567\` in Ghana.
- **Tax rate**: applied to sales by default. You can still override it on an
  individual sale.
- **Return policy**: printed at the bottom of receipts.

## Letterhead

Under **Letterhead** you can compose the header block used on invoices and
purchase orders: address lines, contact details and registration numbers. What
you build there is previewed live, so you can see exactly what will print.
`,
  },
  {
    id: 'first-location',
    category: 'getting-started',
    title: 'Adding your first location',
    summary: 'Every sale, stock movement and staff shift belongs to a location. You need at least one.',
    body: `
QuadERP tracks everything per location, stock levels, sales, till balances and
attendance. Even a single-shop business needs one location record.

## Create it

1. Go to **Administration → Locations**.
2. Click **Add Location**.
3. Give it a name your staff will recognise (\`Main Shop\`, \`Osu Branch\`).
4. Fill in the address. This is what prints on documents raised at that location.

## Per-location overrides

A location can override the business defaults for:

- **Currency**: a Nigeria branch of a Ghanaian business can price in NGN.
- **Country**: so phone numbers entered there get the right dialing code.

Leave both blank to inherit from the business profile, which is what you want
in most cases.

## Switching between locations

Once you have more than one, a branch selector appears in the sidebar. What you
see across the app, stock, sales, reports, follows whichever location is
selected. Staff only see the locations they are assigned to.

## Plan limits

Your plan caps how many locations you can create. Single Branch allows one;
Multi-Branch allows five. If you need more, upgrade under
**Administration → Billing**.
`,
  },
  {
    id: 'importing-products',
    category: 'getting-started',
    title: 'Importing products from a spreadsheet',
    summary: 'Bring your catalogue over in bulk from CSV or Excel, with a preview before anything is saved.',
    body: `
Typing in a few hundred products by hand is nobody's idea of a good time. The
import wizard takes a CSV or Excel file and brings the lot over in one pass.

## Before you start

Export what you have from your current system, or build a spreadsheet with one
row per product. The wizard will show you which columns it expects and let you
map yours onto them, so the column names in your file do not have to match.

## Run the import

1. Go to **Store Operations → Inventory** and choose **Import**.
2. Upload your \`.csv\` or \`.xlsx\` file.
3. Map your columns onto the fields QuadERP expects. Anything it recognises by
   name is mapped for you.
4. Review the **validation report**. Rows with problems are listed with the
   reason, a missing price, a duplicate product code, a category that does not
   exist. Nothing is saved yet at this point.
5. Fix anything you want to fix, or let the wizard skip the bad rows.
6. Confirm the import.

## Opening stock

If your file has a quantity column, map it to **Opening stock** and the import
will create the matching stock movements, so your inventory is correct from the
first day rather than starting at zero.

## Undoing an import

Every import is recorded as a batch. If you get it wrong, go to the import
history and choose **Undo**. That reverses every row the batch created,
including the stock movements. It only works while nothing else has touched
those records: once you have sold one of the imported products, the batch can
no longer be cleanly undone.

The same wizard handles **customers** and **suppliers**, including opening
balances for each.
`,
  },
  {
    id: 'inviting-team',
    category: 'getting-started',
    title: 'Inviting team members',
    summary: 'Create staff accounts, choose their role and decide which locations they can work at.',
    body: `
## Add someone

1. Go to **Administration → Team**.
2. Click **Add User**.
3. Enter their name and email. The email is what they sign in with.
4. Choose a **role**: this decides what they can see and do.
5. Assign one or more **locations**. Staff only see data for the locations they
   are assigned to.

They receive a branded welcome email with a link to choose their own password.
You never need to know or set it for them.

## Your team's sign-in link

Your business has its own address, shown on the welcome email and under
**Administration → Organization**. It looks like
\`your-business.app.quaderp.app\`. Staff who go there see your logo and name on
the sign-in page, and an account from another business cannot sign in through
it.

## If the welcome email does not arrive

Ask them to check spam first. Failing that, they can go to the sign-in page and
use **Forgot password**: it sends a fresh link to the same address.

## Removing someone

Set their status to **banned** under **Administration → Team**. That takes
effect on their next request and revokes access immediately, while keeping
their history. The sales they rang up stay attributed to them, which is what
you want for reporting and for any later investigation.
`,
  },

  // ── Sales & POS ────────────────────────────────────────────
  {
    id: 'processing-a-sale',
    category: 'sales-pos',
    title: 'Processing a sale',
    summary: 'Build a cart, apply discounts, take payment across multiple methods and print the receipt.',
    body: `
## Build the cart

Go to **Store Operations → Sales POS**. Add items by:

- typing a name or product code into the search box, or
- scanning a barcode with a USB scanner: it types into the search box like a
  keyboard, so it just works, or
- scanning a QR code with the QuadERP Scanner app on a phone.

Change a line's quantity in place. Remove a line with the button beside it.

## Discounts

You can discount a single line or the whole sale. Your role caps how much you
are allowed to take off. The limit is set under **Administration →
Organization** as *Max discount percent*. Anything above that needs a manager's
PIN, if manager approval is switched on for your business.

## Take payment

Choose a payment method, cash, card, mobile money, or on account. For a
**split payment**, add more than one method and enter the amount against each;
the sale completes when they add up to the total.

**On account** charges the sale to a customer's balance instead of collecting
now. It requires a customer on the sale and shows up on their statement and in
Receivables.

## Finishing up

Confirm the sale. Stock moves the instant it completes, the till balance
updates, and the receipt is ready to print or send. Loyalty points, if you run
a scheme, are awarded at the same moment.

## Offline

If the connection drops mid-shift, the POS keeps working and queues completed
sales locally. They sync as soon as you are back online. The offline indicator
at the top of the page tells you what is waiting.
`,
  },
  {
    id: 'returns-and-refunds',
    category: 'sales-pos',
    title: 'Handling returns and refunds',
    summary: 'Take back part or all of a sale, put the stock back, and refund by the original method.',
    body: `
## Start a return

Go to **Store Operations → Returns & Reversals** and find the original sale by
receipt number, customer or date. You need the *Manage returns* permission.

## Full or partial

Select the lines coming back and the quantity for each. A partial return leaves
the rest of the sale intact; the original sale is marked as *partially
returned* rather than being rewritten.

## What happens to the stock

Returned items go back into stock at the location the return is processed at.
If an item is coming back damaged, mark it as such, it is written off instead
of being put back on the shelf, and shows up in the shrinkage report rather than
quietly inflating your stock count.

## Refunding

Refunds default to the method the customer originally paid with. You can
override that, refunding a card payment as store credit, for example, if your
return policy allows it.

For a sale that was **on account**, the refund reduces the customer's
outstanding balance rather than paying out cash.

## Voiding versus returning

A **void** cancels a sale that should never have happened, a mis-key, a
duplicate. A **return** records that goods came back. Use the right one: voids
are excluded from sales figures entirely, while returns appear as negative
sales, which is what your accountant expects to see.

Voiding may require manager approval depending on how your business is
configured.
`,
  },
  {
    id: 'till-and-cash-drawer',
    category: 'sales-pos',
    title: 'Managing the till / cash drawer',
    summary: 'Open a float, record what goes in and out during the shift, and reconcile at close.',
    body: `
The till account is the running record of physical cash at a location. Getting
into the habit of opening and closing it properly is what makes shortages
visible on the day they happen rather than at month end.

## Opening

At the start of a shift, go to **Accounting → Till Account** and record the
opening float: the cash you are starting with.

## During the shift

Cash sales add to the till automatically. Record anything else that moves cash
as you go:

- **Deposits**: money taken out and banked, or moved to mobile money.
- **Expenses**: petty cash spent, using one of your accounting templates.
- **Payouts**: supplier paid in cash from the drawer.

Each entry can require supporting evidence (a photo of the slip) depending on
how your templates are configured.

## Closing

At the end of the shift, count the drawer and enter the actual figure. QuadERP
compares it against what it expected and shows the variance.

A variance is not automatically a problem, but it is always worth explaining
while the shift is fresh. Add a note. Repeated unexplained variances at the same
location or under the same person surface in the loss prevention report.

## Reconciliation

**Accounting → Reconciliation** is where you match the till record against your
bank and mobile money statements over a period. See
[Understanding your ledger](#article:understanding-ledger) for how the
underlying entries fit together.
`,
  },

  // ── Inventory ──────────────────────────────────────────────
  {
    id: 'stock-levels-and-alerts',
    category: 'inventory',
    title: 'Understanding stock levels and alerts',
    summary: 'How quantities are tracked per location, and how to get warned before you run out.',
    body: `
## Where the number comes from

Stock is never typed in directly. Every quantity you see is the sum of the
**stock movements** recorded against that product at that location: the opening
stock, every sale, every return, every transfer and every adjustment.

That is deliberate: you can always trace a quantity back to the events that
produced it. Open a product and choose **History** to see exactly that.

## Per location

Stock is held per location, not per business. A product can have twelve units at
the Main Shop and none at the Osu Branch. The figure shown across the app
follows the location selected in the sidebar.

## Low stock alerts

Set a **reorder level** on a product and QuadERP raises an alert when the
quantity at a location falls to or below it. Alerts appear:

- under **Store Operations → Alerts**,
- as a count on the dashboard,
- in the low-stock summary you can act on straight from the inventory page.

Set the reorder level to cover how long your supplier takes to deliver, not to
zero, an alert that fires when you are already out is too late to be useful.

## Adjustments

When a count does not match reality, breakage, theft, a miscount, record an
**adjustment** with a reason rather than editing the number. Adjustments are
reported separately from sales, which is what makes shrinkage measurable.
`,
  },
  {
    id: 'performing-a-stocktake',
    category: 'inventory',
    title: 'Performing a stocktake',
    summary: 'Count what is physically on the shelves and let QuadERP work out the differences.',
    body: `
## Start a count

Go to **Store Operations → Inventory** and choose **Stocktake**. Pick the
location you are counting.

You can count everything, or scope the count to a category or a supplier, a
partial count is far more likely to actually get finished, and counting the fast
movers weekly beats counting everything once a year.

## Counting

Enter the physical quantity for each product. On the shop floor, the QuadERP
Scanner app is faster: scan an item and type the count.

Sales continue as normal while a count is open. QuadERP compares your counted
figure against the expected quantity **at the moment you entered it**, so a sale
that happens mid-count does not turn into a phantom discrepancy.

## Review the variances

When you have finished counting, you get a variance report: everything where the
count differs from the expectation, with the value of the difference. Sort by
value, that is where the money is, and a handful of high-value discrepancies
matter more than a long tail of ones and twos.

Add a reason against each variance you can explain.

## Commit

Committing the stocktake writes an adjustment for every variance, bringing the
system in line with reality. Those adjustments are permanent and appear in the
shrinkage report. Nothing changes until you commit, so you can leave a count
open across a shift.
`,
  },
  {
    id: 'transferring-stock',
    category: 'inventory',
    title: 'Transferring stock between locations',
    summary: 'Move goods from one branch to another with both sides of the movement recorded.',
    body: `
A transfer is two movements, not one: stock out of the sending location and into
the receiving one. Recording it as a transfer rather than two adjustments keeps
both branches honest and leaves a trail.

## Send

1. Go to **Store Operations → Inventory** at the sending location.
2. Choose **Transfer**.
3. Pick the destination location and the products and quantities.
4. Confirm.

The stock leaves the sending location immediately and shows as **in transit**.

## Receive

At the destination, open the transfer and confirm what actually arrived. If the
received quantity differs from what was sent, record the actual figure, the
shortfall stays visible as a discrepancy against that transfer instead of
disappearing into a general adjustment.

## Serialised products

Products tracked by serial number or QR code move unit by unit. Scan each one
at both ends. That is slower, and it is the point: for high-value goods you get
a per-unit record of where each item went and who moved it.

## Why not just adjust both sides

You can, and you will regret it. Two independent adjustments have no link
between them, so nothing reconciles and nobody can tell a genuine transfer from
stock that walked out of one branch and never arrived at the other.
`,
  },

  // ── Customers ──────────────────────────────────────────────
  {
    id: 'managing-customers',
    category: 'customers',
    title: 'Managing customer profiles',
    summary: 'Build your customer list, see what each one has bought and track what they owe.',
    body: `
## Adding customers

Add a customer from **CRM → Customers**, or create one mid-sale at the POS
without leaving the cart.

Name and phone are usually enough to start. Phone numbers can be typed the way
they are written on a receipt, \`024 123 4567\`, and are normalised using your
business's country setting.

You can also bring your whole list over at once with the import wizard, opening
balances included. See
[Importing products from a spreadsheet](#article:importing-products); the
customer import works the same way.

## The customer record

Open a customer to see:

- **Purchase history**: every sale, with the ability to open the original
  receipt.
- **Balance**: what they currently owe on account.
- **Statement**: invoices, payments and credits in date order.
- **Loyalty**: points earned and redeemed, if you run a scheme.

## Selling on account

Charging a sale to a customer's account instead of collecting payment creates a
receivable. Those show up under **Accounting → Receivables & Invoices**, where
you can record payments against them and chase what is overdue.

Watch the balance. A customer account is a credit line, and it is worth agreeing
a limit with them rather than discovering the number at the end of the quarter.

## Merging duplicates

The same person entered twice, once with a phone number, once without, splits
their history. Search before adding, and where duplicates already exist, merge
them from the customer record so the history stays in one place.
`,
  },
  {
    id: 'loyalty-and-gift-cards',
    category: 'customers',
    title: 'Using loyalty points and gift cards',
    summary: 'Reward repeat custom with points, and sell and redeem gift cards.',
    body: `
## Setting up loyalty

Go to **CRM → Loyalty & Rewards**. You decide:

- **Earn rate**: how many points a customer gets per unit of currency spent.
- **Redemption value**: what a point is worth when spent.
- **Minimum balance**: how many points must be accrued before any can be used.

Keep the arithmetic simple enough to explain at the counter in one sentence. A
scheme your cashiers cannot explain is a scheme customers do not use.

## Earning

Points are awarded automatically when a sale completes with a customer attached.
No sale is retro-fitted with points, so attach the customer **before**
completing the sale.

## Redeeming

At the POS, with a customer on the sale, choose to redeem points. The available
balance and its cash value are shown, and you can redeem part of it. Redemption
is recorded against the sale, so the customer's statement shows exactly where
their points went.

## Gift cards

Gift cards are sold as a product and carry a balance. At the POS:

- **Selling** one adds its value to the card, which is not revenue until it is
  spent.
- **Redeeming** one is a payment method like any other, and can be combined with
  cash or card in a split payment when the purchase costs more than the balance.

Check a card's remaining balance from the same screen without having to start a
sale.
`,
  },

  // ── Accounting ─────────────────────────────────────────────
  {
    id: 'deposits-and-expenses',
    category: 'accounting',
    title: 'Recording deposits and expenses',
    summary: 'Log money banked and money spent using templates built for how your business actually works.',
    body: `
## Templates, not a fixed form

Deposits and expenses are recorded through **accounting templates**, which your
business defines. Every new business starts with four:

- **Mobile Money Deposit**
- **POS Machine Deposit**
- **Bank Deposit**
- **General Expense**

Each template decides which extra fields are asked for, transaction charges on
a mobile money deposit, which machine a card settlement came from, which
category an expense falls under.

## Recording one

Go to **Accounting → Till Account** and choose the template. Fill in the amount
and whatever the template asks for. If it requires evidence, attach a photo of
the slip.

## Approvals

A template can be set to require approval. Entries against it are held as
*pending* and appear under **Accounting → Approvals** for someone with the right
permission to accept or reject. Pending entries do not affect your figures until
they are approved.

This is worth switching on for anything staff can record unsupervised.

## Building your own templates

**Accounting → Templates** is where you add templates and decide which roles can
use each one. A field can be a number, a dropdown, free text or a date, and can
be made conditional on the answer to another field.

Model the templates on the paperwork your business already uses. A template that
mirrors the slip in someone's hand gets filled in correctly; an abstract one
does not.
`,
  },
  {
    id: 'creating-invoices',
    category: 'accounting',
    title: 'Creating and sending invoices',
    summary: 'Raise an invoice, send it, and record payments against it as they come in.',
    body: `
## Raise an invoice

Go to **Accounting → Receivables & Invoices** and choose **New Invoice**. Pick
the customer, add lines, set the due date and save.

Invoice numbers are issued by QuadERP in an unbroken sequence, you cannot skip
or reuse one, which is what your auditor is going to check.

## Sending

Send the invoice by email straight from the record, or download the PDF to print
or send another way. It uses the letterhead from your business profile, so it
carries your logo, address and registration details.

## Recording payments

As money arrives, record a payment against the invoice. Part payments are fine. The invoice moves to **partial** and shows the remaining balance. It settles to
**paid** when the balance reaches zero.

Payments reduce the customer's overall account balance at the same time.

## Chasing what is overdue

An invoice past its due date with a balance outstanding is marked **overdue**
automatically. The receivables page filters to those, oldest first, which is the
list to work through.

The **Accounts Receivable** report under Reports gives you the aged view, what
is owed, by whom, and how long it has been outstanding.

## Voiding

An invoice raised in error can be voided; it cannot be deleted. The number stays
in the sequence marked as void, and the reason is recorded. That is the correct
accounting treatment and it is not an oversight.
`,
  },
  {
    id: 'understanding-ledger',
    category: 'accounting',
    title: 'Understanding your ledger',
    summary: 'How sales, deposits, expenses and payments fit together, and how to reconcile them.',
    body: `
## What the ledger is

The ledger is the single ordered record of every financial event in your
business. Nothing edits it, corrections are new entries. That is what makes it
trustworthy, and why a mistake is fixed by reversing it rather than rewriting
history.

Every entry carries a reference number, so you can always get from a figure in a
report back to the event that produced it.

## What lands in it

| Source | What it records |
| --- | --- |
| Sales | Revenue, tax and the payment method used |
| Returns | Negative revenue, and the refund |
| Deposits | Cash leaving the till for the bank or mobile money |
| Expenses | Money spent, by category |
| Invoice payments | Money received against a receivable |
| Supplier payments | Money paid against a payable |

## Reconciliation

**Accounting → Reconciliation** is where you check the ledger against the
outside world. For a period, you compare:

- what QuadERP says was banked, against your bank statement,
- what it says was taken on mobile money, against the MoMo statement,
- what it says is in the drawer, against the counted cash.

Match what matches, and investigate what does not. Common causes, roughly in
order of likelihood: a deposit recorded on the wrong day, transaction charges
not entered, a sale taken on the wrong payment method, and a genuine shortage.

## Reports built on it

- **Profit & Loss**: revenue less cost of goods and expenses, over a period.
- **Accounts Receivable**: what customers owe, aged.
- **Accounts Payable**: what you owe suppliers.

All three are computed from the ledger at the moment you run them, so they never
disagree with the underlying entries.
`,
  },

  // ── Team & Permissions ─────────────────────────────────────
  {
    id: 'roles-and-permissions',
    category: 'team',
    title: 'Roles and permissions explained',
    summary: 'What each built-in role can do, and how to build your own.',
    body: `
## How access works

Everything in QuadERP is gated on a **permission**: \`create_sales\`,
\`manage_inventory\`, \`view_financial_reports\` and so on. A **role** is a named
bundle of permissions, and every user has exactly one role.

If someone cannot see a page, it is because their role lacks the permission it
needs. The page will say so rather than pretending not to exist.

## The built-in roles

- **Business Admin**: everything within your business. The owner's role.
- **Manager**: day-to-day running: sales, inventory, staff, reports.
- **Sales Executive**: the POS and their own sales history.

## Custom roles

Build your own under **Administration → Roles**. Start from an existing role,
then add or remove individual permissions.

## The rule that stops privilege escalation

**You cannot create or assign a role that grants a permission you do not have
yourself.** A Manager cannot mint a role with financial-report access and hand
it out, or give it to themselves.

This is enforced on the server, not just hidden in the interface, and it applies
to every path that assigns a role. If you get *"you cannot assign that role
because it grants permissions you do not have"*, that is this rule, and the fix
is for someone with the wider access to make the change.

## Location scoping

Permissions decide **what** someone can do; location assignment decides **where**.
A Manager assigned only to the Osu Branch manages Osu, and does not see Main
Shop's figures at all.

Change either from **Administration → Team**. Access changes take effect within
a few minutes at most, and immediately for a ban.
`,
  },

  // ── Troubleshooting ────────────────────────────────────────
  {
    id: 'clear-the-cache',
    category: 'troubleshooting',
    title: 'App not updating? Clear the cache',
    summary: 'QuadERP installs as an app and caches itself. Here is how to force it to fetch the latest version.',
    body: `
QuadERP is a progressive web app: it installs itself onto the device and serves
from a local cache, which is what lets the POS keep working when the connection
drops. The trade-off is that an out-of-date cache can keep serving you an old
version.

## First: take the update

When a new version is available, a prompt appears offering to reload. Take it.
That is the intended path and it is the fastest fix.

## Force a refresh

If no prompt appears and something still looks stale:

- **Windows / Linux**: \`Ctrl\` + \`Shift\` + \`R\`
- **Mac**: \`Cmd\` + \`Shift\` + \`R\`
- **Android Chrome**: menu → **Settings** → **Site settings** → find the site →
  **Clear & reset**
- **iOS Safari**: **Settings** → **Safari** → **Clear History and Website Data**

## Clear the app's storage

Still stuck? In a desktop browser:

1. Open developer tools (\`F12\`).
2. Go to **Application**.
3. Under **Storage**, choose **Clear site data**.
4. Reload.

That removes the cached app and any queued offline data.

## Before you clear anything

**Check the offline indicator first.** If sales are queued waiting to sync,
clearing storage throws them away. Get back online, let the queue drain, and
confirm it is empty, then clear.

## When it is not the cache

- **Data looks wrong, not old**: check which location is selected in the
  sidebar. You may be looking at another branch.
- **A page says you lack permission**: that is your role, not a cache. See
  [Roles and permissions explained](#article:roles-and-permissions).
- **Nothing loads at all**: check your connection. The app tells you when it
  cannot reach the server, and distinguishes that from an error.
`,
  },
];

/** Look an article up by its permanent id. */
export function getArticle(id) {
  return HELP_ARTICLES.find((a) => a.id === id) || null;
}
