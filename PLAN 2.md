# Store Manager App - QR Code Tracking & POS Integration
## Build Order & Implementation Plan

**Note:** Multi-tenant architecture and location switching are already implemented and not included in this plan.

---

## PHASE 1: FOUNDATION - SCANNER SETUP & LINKING
*Dependencies: None - Start here*
*Priority: CRITICAL*

### 1.1 User Profile Enhancement

#### Scanner Setup Interface
- **Access Point:** User Profile → "Setup Scanner" option
- **Functionality:**
  - Display dynamic QR code (regenerate on each page access)
  - Serve as linking mechanism between Store Manager App and Scanner App
  - Clear visual indication of setup status

#### Implementation Checklist
- [ ] Add "Setup Scanner" option to User Profile menu
- [ ] Create dynamic QR code generation service
- [ ] Build Scanner Setup page layout
- [ ] Implement QR code display with refresh mechanism
- [ ] Add user messaging/instructions

---

### 1.2 Scanner Linking & Session Management

#### Linking Rules & Security
- **One Scanner Per User:** Enforce restriction - users cannot have multiple scanners
- **Permanent Login:** Scanner maintains session until manual logout
- **Security:** Dynamic QR codes prevent unauthorized linking

#### Implementation Checklist
- [ ] Create scanner linking endpoint
- [ ] Implement user-to-scanner relationship (1:1 enforcement)
- [ ] Build scanner session management
- [ ] Add logout functionality for scanners
- [ ] Implement validation to prevent multiple scanner linking
- [ ] Set up error handling for linking failures

---

## PHASE 2: INVENTORY MANAGEMENT - QR CODE TRACKING
*Dependencies: Phase 1 (Scanner Setup)*
*Priority: HIGH*

### 2.1 Inventory Navigation & Entry Point

#### Workflow Path
1. Navigate to **Inventory** section
2. Select item from inventory list (using available filters: branch, category, etc.)
3. Click on **"Quantity available"** in the item row

#### Implementation Checklist
- [ ] Verify Inventory section exists with filters
- [ ] Add clickable "Quantity available" field
- [ ] Implement item selection mechanism
- [ ] Build filter functionality (branch, category, etc.)

---

### 2.2 Quantity Interface & Display

#### Quantity View Components
- **Total Quantity** - Overall count of selected item
- **Old Items** - Items already tracked with QR codes (read-only)
- **New Items** - Items without QR codes (require tracking)

#### Visual Status Indicators
- Pending items (visually distinct)
- Tracked items vs. untracked items
- Save status feedback

#### Implementation Checklist
- [ ] Create Quantity interface layout
- [ ] Display total quantity
- [ ] Implement old/new items separation
- [ ] Add visual status indicators
- [ ] Build responsive design for different item counts

---

### 2.3 QR Code Tracking Workflow

#### Step 1: Initiate Tracking
- **Button:** "Assign Tracking Codes" at top of interface
- **Filter:** Automatically display only items WITHOUT QR codes
- **Function:** Prepare for scanning process

#### Step 2: Untracked Item Display
Each untracked item shows:
- **"Scan QR" icon** (clickable)
- **Empty box** (for scanned QR code data)
- **Individual "Save" button** (for single-item saves)

#### Step 3: Scanner Integration & Scan Process
1. User clicks "Scan QR" icon on untracked item
2. System sends command to Scanner App
3. Scanner App displays **"Tracking Codes"** interface
4. User clicks **"Tracking Codes"** button in Scanner
5. Device camera opens automatically
6. User scans physical QR code on item
7. **Beep sound** confirms successful scan
8. Camera closes automatically
9. Scanner displays QR code value under **"Tracking Code"**
10. User clicks **"Save"** in Scanner App
11. Scanner command closes
12. QR code value automatically populates in Store Manager App box

#### Implementation Checklist
- [ ] Create "Assign Tracking Codes" button and logic
- [ ] Build item filtering (show only untracked)
- [ ] Implement scan command mechanism
- [ ] Create Scanner App integration hooks
- [ ] Build QR value display/population
- [ ] Implement beep sound notification
- [ ] Add camera auto-close functionality
- [ ] Create individual item "Save" buttons
- [ ] Build success/error feedback messaging

---

### 2.4 Batch Save Functionality

#### Individual Save
- Each item box has **"Save" button**
- Allows tracking and saving items one-by-one
- Enables pausing and resuming workflow

#### Batch Save
- **General "Save" button** at form end (themed in app color)
- Saves all scanned items simultaneously
- **Partial Save Capability:**
  - Only scanned items are saved
  - Unscanned items remain empty
  - User can return later to complete unscanned items

#### Implementation Checklist
- [ ] Create individual item "Save" endpoints
- [ ] Build batch "Save" button and logic
- [ ] Implement partial save mechanism
- [ ] Add validation (confirm scanned vs. unscanned)
- [ ] Build return-to-complete workflow
- [ ] Implement success notifications
- [ ] Add backend persistence for partial saves
- [ ] Create resume functionality

---

## PHASE 3: POINT OF SALE (POS) SYSTEM
*Dependencies: Phase 2 (QR Code Tracking)*
*Priority: HIGH*

### 3.1 POS Entry Point & Sales Types

#### Navigation
Navigate to **Sales/POS** section with two options:
- **"New Sale"** - Single item transaction
- **"Batch Sale"** - Multiple items transaction

#### Implementation Checklist
- [ ] Create Sales/POS section
- [ ] Add "New Sale" button
- [ ] Add "Batch Sale" button
- [ ] Build clear visual distinction between options

---

### 3.2 Customer Entry Form (FIRST STEP FOR BOTH SALE TYPES)

#### Customer Entry Options

##### Option A: New Customer
- Enter **customer name** (required field)
- Enter **phone number** (required field)
- System auto-generates **Customer ID**
- Display generated Customer ID to user

##### Option B: Existing Customer
- Search by **phone number**
- System displays matching customer(s)
- User selects from results
- Pre-populate all customer fields

#### Post-Entry Workflow
- Click **"Save"** or **"Confirm"** button
- Sales form opens with customer details (read-only display)
- Ready for item addition

#### Implementation Checklist
- [ ] Create Customer Entry Form
- [ ] Build New Customer input fields (name, phone)
- [ ] Build Existing Customer search functionality
- [ ] Implement phone number search logic
- [ ] Add customer matching results display
- [ ] Create auto-generated Customer ID system
- [ ] Build form validation (required fields)
- [ ] Implement "Save"/"Confirm" button
- [ ] Create read-only customer detail display
- [ ] Add error handling for duplicate/invalid entries

---

### 3.3 NEW SALE WORKFLOW (Single Item Transaction)

#### Sales Form Initialization
- Display customer details (name, phone, Customer ID) - read-only
- Show "Add Item" action
- Prepare for item selection

#### Step 1: Add Item
1. Click **"Add Item"** icon
2. Open item search interface
3. Search options:
   - Model number
   - SKU
   - Item name
4. Select desired item
5. Return to Sales Form displaying:
   - Item name
   - Model number
   - SKU

#### Step 2: Scan QR Code
1. Click **"Scan QR Code"** icon
2. Create scan command with popup notification
3. Scanner App automatically opens
4. User scans physical QR code on item
5. Upon successful scan:
   - Scanner interface displays QR code value
   - User saves in Scanner App
   - Popup automatically closes
6. QR code value appears in Sales Form QR code box

#### Step 3: Complete Sale
1. Enter **amount paid** by customer
2. Click **"Complete Sale"** button
3. Trigger inventory temporary reduction (see Phase 5)

#### Step 4: Receipt Generation
1. Automatically generate receipt
2. Trigger permanent inventory reduction (see Phase 5)

#### Step 5: Receipt & Confirmation
1. User options:
   - **Print** receipt to connected printer
   - **Save as PDF** on device
2. Confirmation screen displayed
3. Sale finalized

#### Implementation Checklist
- [ ] Create Sales Form layout
- [ ] Add "Add Item" button and search interface
- [ ] Implement item search (model, SKU, name)
- [ ] Build item selection and display
- [ ] Create "Scan QR Code" functionality
- [ ] Implement Scanner App integration
- [ ] Build QR value population
- [ ] Add amount paid input field
- [ ] Create "Complete Sale" button logic
- [ ] Build receipt generation (see Phase 4)
- [ ] Implement print functionality
- [ ] Implement PDF save functionality
- [ ] Create confirmation screen

---

### 3.4 BATCH SALE WORKFLOW (Multiple Items Transaction)

#### Batch Form Initialization
- Display customer details (name, phone, Customer ID) - read-only
- **Top Action Buttons:**
  - **"Add Items"** - Add items to batch
  - **"Delete Batch"** - Cancel entire batch (clear all items)

#### Step 1: Add First Item
1. Click **"Add Items"** button
2. Open item search interface
3. Search and select by:
   - Model number
   - SKU
   - Item name
4. Prompt: **"How many items?"**
5. Enter quantity (e.g., 5, 35, etc.)
6. System automatically creates QR scanner boxes (one per item)

#### Step 2: Scan QR Codes for Each Item
- For each QR scanner box:
  - Click box → Scanner command sent
  - Scanner App opens
  - User scans individual item's QR code
  - QR code value appears in box
  - User can save individually or continue

#### Step 3: Add More Items (Optional)
- Click **"Add Items"** button again
- Repeat Steps 1-2 for additional items
- Can add:
  - Multiple quantities of same item
  - Different items in same batch

#### Step 4: Delete Batch (If Needed)
- Click **"Delete Batch"** at any time before receipt generation
- Clear entire batch
- Remove all added items
- Return to empty batch form

#### Step 5: Complete Sale
1. After all items scanned and added
2. Click **"Complete Sale"** button
3. Enter **amount paid** by customer
4. Trigger inventory temporary reduction (see Phase 5)

#### Step 6: Receipt Generation
1. Automatically generate receipt
2. Trigger permanent inventory reduction (see Phase 5)

#### Step 7: Receipt & Confirmation
1. User options:
   - **Print** receipt to connected printer
   - **Save as PDF** on device
2. Confirmation screen displayed
3. Sale finalized

#### Implementation Checklist
- [ ] Create Batch Form layout
- [ ] Add "Add Items" button
- [ ] Add "Delete Batch" button
- [ ] Build quantity input field
- [ ] Implement dynamic QR scanner box generation
- [ ] Create multiple item selection (same/different items)
- [ ] Build item-to-quantity mapping
- [ ] Implement Scanner App integration for each box
- [ ] Create batch item display
- [ ] Build batch total calculation
- [ ] Add "Complete Sale" button logic
- [ ] Build receipt generation (see Phase 4)
- [ ] Implement batch deletion logic
- [ ] Create confirmation screen

---

## PHASE 4: RECEIPT FORMAT & GENERATION
*Dependencies: Phase 3 (POS System)*
*Priority: HIGH*

### 4.1 Receipt Content & Structure

#### Receipt Elements (In Order)

1. **Custom Letterhead**
   - Business-uploaded letterhead via Store Manager settings
   - Display at top of every receipt
   - File validation (type and dimensions)

2. **Receipt Number**
   - Auto-generated unique alphanumeric identifier
   - Format examples: RCP-2024-A001, RCP-001-B
   - Increments with each sale
   - Must remain unique per system instance

3. **Customer Information**
   - Customer name
   - Phone number

4. **Item Details** (Per item sold)
   - Item name
   - SKU
   - Quantity sold
   - Unit price
   - Subtotal (Quantity × Unit Price)

5. **Total Amount Paid**
   - Grand total of sale

6. **Location Information**
   - Store/location name where sale occurred

7. **Date & Time**
   - Transaction date
   - Transaction time

#### Exclusions
- NO employee/staff name on receipt

#### Implementation Checklist
- [ ] Create receipt template builder
- [ ] Implement custom letterhead upload and validation
- [ ] Build receipt number generation system (unique, sequential)
- [ ] Create customer information population
- [ ] Build item details table/layout
- [ ] Implement price calculations (subtotal, total)
- [ ] Add location information population
- [ ] Implement date/time formatting
- [ ] Create receipt styling/theming
- [ ] Build preview functionality

---

### 4.2 Receipt Export & Output Options

#### Print Functionality
- Direct printing to connected printer
- Printer detection and selection
- Print queue management

#### PDF Export
- Save receipt as PDF file on device
- Filename generation with timestamp
- File location options (user select)

#### Implementation Checklist
- [ ] Implement print-to-printer functionality
- [ ] Build printer detection and selection UI
- [ ] Create PDF generation library integration
- [ ] Implement PDF file naming convention
- [ ] Build file save dialog
- [ ] Add success/error notifications
- [ ] Create print preview functionality

---

## PHASE 5: INVENTORY UPDATES & DATA STRUCTURE
*Dependencies: Phase 3 & 4 (POS System & Receipts)*
*Priority: HIGH*

### 5.1 Two-Stage Inventory Update Process

#### Stage 1: TEMPORARY Update (Triggered by "Complete Sale")

**Trigger:** When **"Complete Sale"** button is clicked

**What Happens:**
- Sale is confirmed
- Inventory **temporarily reduced** by quantity sold
- Item displayed in **pending box** (visual indicator)
- Status shows as **"Pending Sale"**

**Purpose:** Grace period for user to make changes before permanent update

#### Stage 2: PERMANENT Update (Triggered by Receipt Generation)

**Trigger:** When **amount paid is entered and receipt generated**

**What Happens:**
- Inventory reduction becomes **permanent**
- Sale fully finalized
- Item status changes from "Pending Sale" to "Sold"
- Data permanently written to backend
- Timestamp recorded for audit

#### Implementation Checklist
- [ ] Create inventory reduction transaction system
- [ ] Implement temporary inventory state
- [ ] Build visual pending indicators
- [ ] Implement permanent inventory updates
- [ ] Create inventory version/audit trail
- [ ] Add timestamp recording
- [ ] Implement backend persistence
- [ ] Create status change logic
- [ ] Build validation (sufficient inventory exists)

---

### 5.2 Deletion & Cancellation: Batch Reversal (Before Receipt Generation)

**Trigger:** When user clicks **"Delete Batch"** before receipt generation

**What Happens:**
- Temporary inventory reduction is **reversed**
- Inventory quantity returns to **original level**
- Sale is **cancelled completely**
- No permanent record created
- User returns to empty batch/sale form

**Example Scenario:**
- Item quantity: 100
- User clicks "Complete Sale" → Quantity temporarily becomes 95
- User clicks "Delete Batch" → Quantity returns to 100
- If receipt generated → Quantity permanently becomes 95

#### Implementation Checklist
- [ ] Implement batch deletion endpoint
- [ ] Build inventory reversal logic
- [ ] Create cancellation check (before/after receipt)
- [ ] Implement automatic quantity restoration
- [ ] Add cancellation notifications
- [ ] Build audit trail for cancellations
- [ ] Create form reset mechanism

---

### 5.3 Customer ID Data Structure

#### Customer ID Generation
- Automatically generated when new customer created
- Unique identifier per customer in system
- Immutable (cannot be changed)

#### Customer ID Usage
- Displayed in inventory for sold items (non-admin users)
- Links to customer information (accessible to admins only)
- Used in return searches and transaction lookups
- Part of transaction audit trail

#### Implementation Checklist
- [ ] Create Customer ID generation algorithm
- [ ] Implement uniqueness validation
- [ ] Build Customer ID storage structure
- [ ] Create customer-to-ID relationship
- [ ] Implement ID retrieval endpoints
- [ ] Build ID display logic (based on user role)
- [ ] Create ID linking for returns system

---

## PHASE 6: RETURNS & REVERSALS (ADMIN ONLY)
*Dependencies: Phase 5 (Inventory Updates & Customer ID)*
*Priority: MEDIUM*

### 6.1 Access Control & Permissions

#### Admin-Only Access
- Only **Business Admins** can access returns function
- Regular employees (cashiers, managers) cannot access
- Role-based permission enforcement

#### Implementation Checklist
- [ ] Implement role-based access control
- [ ] Create permission checks in returns section
- [ ] Build error messaging for unauthorized access
- [ ] Add audit logging for access attempts

---

### 6.2 Return Search Functionality

#### Search Method 1: By Customer Name
- Input field for customer name
- System displays **all sales** made to that customer
- Shows complete sale history across all transactions
- Return results with clickable items

#### Search Method 2: By Receipt Number
- Input field for receipt number
- System displays **specific items** from that receipt
- Shows only items in that particular transaction
- Pinpoint search functionality

#### Search Method 3: By Phone Number
- Input field for phone number
- System displays **all items** sold to that customer
- Shows complete purchase history
- Links to customer record

#### Implementation Checklist
- [ ] Create return search interface
- [ ] Build customer name search endpoint
- [ ] Build receipt number search endpoint
- [ ] Build phone number search endpoint
- [ ] Implement search result display
- [ ] Create sales history views
- [ ] Build transaction detail popups
- [ ] Implement clickable item selection

---

### 6.3 Return Process Workflow

#### Step 1: Search for Sale
Use one of three search methods (customer name, receipt number, phone number)

#### Step 2: Display Sale Details
Sale details appear showing all items in transaction

#### Step 3: Initiate Return
Click **"Reverse Sale"** button

#### Step 4: Select Items to Return
System prompts: **"Select items to return"**
- Checkbox selection for one or multiple items from sale
- Visual indication of selected items
- Confirmation before proceeding

#### Step 5: Process Return
Confirm selection
- Inventory automatically increases by returned quantity
- Return recorded as separate transaction
- Original sale linked to return transaction

#### Return Transaction Record
- Original sale remains in system (marked as partially/fully returned)
- Return transaction created separately
- Both transactions linked for traceability
- Creates audit trail for:
  - Reporting
  - Compliance
  - Return tracking

#### Implementation Checklist
- [ ] Create "Reverse Sale" button
- [ ] Build item selection interface (checkboxes)
- [ ] Implement multi-item selection
- [ ] Create selection confirmation dialog
- [ ] Build inventory increase logic
- [ ] Implement return transaction creation
- [ ] Create transaction linking mechanism
- [ ] Build audit trail recording
- [ ] Implement success notifications
- [ ] Create return receipt generation
- [ ] Build return history view

---

## PHASE 7: SOLD STATUS VIEW & PRIVACY CONTROLS
*Dependencies: Phase 6 (Returns System)*
*Priority: MEDIUM*

### 7.1 Sold Items in Inventory List

#### For All Users (Cashiers, Managers, etc.)
**Access:** Click on **"Sold"** status in inventory list

**Can View:**
- Customer ID only

**Cannot View:**
- Customer name
- Phone number
- Full transaction details

#### For Business Admins Only
**Access:** Click on **"Sold"** status in inventory list

**Can View:**
- **Customer ID**
- **Customer name**
- **Phone number**
- **Full transaction details**
- **Receipt number**
- **All customer information**
- **Return access from this view**

#### Implementation Checklist
- [ ] Build role-based view logic
- [ ] Create Sold status display
- [ ] Implement Customer ID display (all users)
- [ ] Build admin detail view (with full information)
- [ ] Create non-admin restricted view
- [ ] Implement permission checks
- [ ] Build customer detail popups
- [ ] Add return access link (admin only)
- [ ] Create audit logging for view access

---

### 7.2 Privacy & Compliance Purpose

This privacy control ensures:
- ✓ Regular employees cannot access customer personal information
- ✓ Data security and privacy compliance
- ✓ Business Admins have full management visibility
- ✓ Audit trail maintained for all access

---

## PHASE 8: SCANNER APP INTEGRATION HOOKS
*Dependencies: All Phases*
*Priority: CRITICAL (Ongoing)*

### 8.1 Integration Points

1. **Dynamic QR Code Linking**
   - Scanner scans QR code from Setup Scanner page
   - Establishes user-to-scanner relationship
   - Validates against existing linked scanner

2. **Scan Commands (Inventory Tracking)**
   - Store Manager App sends scan command to Scanner App
   - Specifies "Tracking Codes" mode
   - Returns: QR code value

3. **Scan Commands (Sales)**
   - Store Manager App sends scan command to Scanner App
   - Specifies "Sales" mode
   - Returns: QR code value

4. **Data Return Protocol**
   - Scanner App returns **QR code value only**
   - No additional data processing in Scanner
   - Store Manager App handles all business logic

5. **User Context**
   - Scanner maintains logged-in user context
   - Passes user ID with scan commands
   - Enables accountability and location context

6. **Session Management**
   - Scanner maintains session until manual logout
   - Session persists across app suspend/resume
   - Prevents unexpected logouts

#### Implementation Checklist
- [ ] Create scanner command protocol specification
- [ ] Build command sender mechanism
- [ ] Implement command receiver in Scanner
- [ ] Create data return handlers
- [ ] Build error/retry logic
- [ ] Implement timeout handling
- [ ] Create logging and audit trail
- [ ] Build command validation

---

## IMPLEMENTATION DEPENDENCIES SUMMARY

```
PHASE 1: Scanner Setup (Foundation)
    ↓
PHASE 2: QR Code Tracking (Depends on Phase 1)
    ↓
PHASE 3: POS System (Depends on Phase 2)
    ↓
PHASE 4: Receipt Generation (Depends on Phase 3)
    ↓
PHASE 5: Inventory Updates (Depends on Phase 3 & 4)
    ↓
PHASE 6: Returns & Reversals (Depends on Phase 5)
    ↓
PHASE 7: Sold Status Privacy (Depends on Phase 6)
    ↓
PHASE 8: Scanner Integration (Ongoing, requires completion of Phases 1-7)
```

---

## TESTING CHECKLIST BY PHASE

### Phase 1 Testing
- [ ] QR code generates dynamically on each page load
- [ ] Scanner successfully links via QR code
- [ ] One-scanner-per-user restriction enforced
- [ ] Scanner logout functions properly
- [ ] Multiple link attempts rejected appropriately

### Phase 2 Testing
- [ ] Inventory items display correctly with filters
- [ ] Quantity interface shows old/new item separation
- [ ] Scan workflow completes end-to-end
- [ ] QR code values populate correctly
- [ ] Individual saves work
- [ ] Batch saves work (all items, partial items)
- [ ] Incomplete tracking can be resumed

### Phase 3 Testing
- [ ] Customer entry works (new and existing)
- [ ] New Sale workflow completes
- [ ] Batch Sale workflow completes with single item
- [ ] Batch Sale workflow completes with multiple items
- [ ] Batch deletion reverses temporary inventory
- [ ] QR scanning during sales works

### Phase 4 Testing
- [ ] Receipt generates with all required fields
- [ ] Receipt number increments uniquely
- [ ] Custom letterhead displays
- [ ] Print functionality works
- [ ] PDF save functionality works
- [ ] Date/time formatting is correct

### Phase 5 Testing
- [ ] Temporary inventory reduction on "Complete Sale"
- [ ] Permanent inventory reduction on receipt generation
- [ ] Pending status displays correctly
- [ ] Delete batch reverses inventory
- [ ] Cancelled sales create no permanent record

### Phase 6 Testing
- [ ] Admin-only access enforced
- [ ] Search by name returns all sales
- [ ] Search by receipt number returns specific items
- [ ] Search by phone returns complete history
- [ ] Return transaction created separately
- [ ] Inventory increases for returned items
- [ ] Audit trail recorded

### Phase 7 Testing
- [ ] Non-admin users see Customer ID only
- [ ] Admin users see full details
- [ ] Permission checks function correctly
- [ ] Access logging works

### Phase 8 Testing
- [ ] All scan commands execute properly
- [ ] Data returns in expected format
- [ ] User context passed correctly
- [ ] Session persists correctly

---

## DEPLOYMENT NOTES

- Implement feature flags for phased rollout
- Run full integration tests after each phase
- Maintain backward compatibility with existing inventory system
- Document all API changes and endpoints
- Create user training materials for each phase
- Establish monitoring and logging for all new features
- Plan database migrations (Customer ID storage, return transactions)
- Coordinate with Scanner App team on integration timeline

---

**Document Status:** Ready for Development
**Build Order Version:** 1.0
**Last Updated:** [Current Date]
