# Maharashtra Auto Battery (महाराष्ट्र ऑटो बॅटरी)
### High-Speed Counter Billing & Inventory PWA Web App

A clean, fast, mobile-friendly billing web app installable as a Progressive Web App (PWA) on low-end Android phones and counter computers. Built specifically for automotive and inverter battery counter operations at **Maharashtra Auto Battery**.

---

## ⚡ Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons
- **Backend**: Node.js + Express
- **Database**: Supabase PostgreSQL (managed, persistent) via the `pg` driver
- **Auth**: JWT with `bcryptjs`-hashed passwords & inactivity auto-logout
- **Messaging**: Meta WhatsApp Cloud API (primary), Twilio / Fast2SMS (SMS fallback), and automatic pre-filled `wa.me` link (zero-cost free fallback)
- **PWA**: Installable on Android & iOS (`manifest.json` + `sw.js` offline caching)

---

## 🔑 Login & Password Security

The database seeds an owner, manager, and worker account on first run. Default credentials are **not shown on the login page**. If an account is still using a default password, the app automatically prompts for a new password after login.

| Role | Permissions |
| :--- | :--- |
| **Owner (Admin)** | Full access: bills, users, prices, customer dues, dealer khata, inventory valuation, stock adjustments, database backup download |
| **Manager (Father)** | Can create bills, view all records, edit bills, edit battery prices, add inward stock, view dashboard |
| **Worker (Counter)** | Counter billing: can create bills and view/edit **only bills generated on current day**. Cannot delete bills or manage accounts |

Change your password any time from the header menu. Owners can also reset staff passwords from the Settings screen.

---

## 🚀 Quick Start (Running Locally)

### 1. Prerequisites
- Node.js 22 or newer
- npm
- A Supabase project (Free plan is sufficient for a single shop)

### 2. Installation
Clone or navigate to the project directory and install dependencies:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

### 3. Configure Supabase
Create a project at https://supabase.com, then copy the **Session pooler** connection string from Project Settings > Database.

Create a local `.env` file:
```bash
PORT=5001
JWT_SECRET=change-this-to-a-long-random-secret
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
DATABASE_SSL=true
```

The server creates all tables and seeds the starter catalog/accounts automatically on first boot.

### 4. Build & Run
```bash
# Build the React frontend
npm run build

# Start the unified production server
npm start
```

Open your browser and navigate to:
```
http://localhost:5001
```

> **For Development with Hot Reloading:**
> In one terminal: `npm run dev:server` (API on port 5001)
> In another terminal: `npm run dev:client` (Vite dev server on port 3000 with auto-proxy to 5001)

---

## 📱 PWA Mobile Installation

1. Open `http://<your-server-ip>:5001` or your HTTPS domain on Chrome (Android) or Safari (iPhone).
2. Tap the browser menu (or share icon on iOS) and select **"Add to Home Screen"** or **"Install App"**.
3. The app will install with the **MAB Battery** icon and open in full-screen standalone counter mode without browser address bars!

---

## 💬 WhatsApp & SMS Configuration

Configuration can be set either in `.env` or dynamically by the Owner under **Settings > WhatsApp & SMS Keys**.

### 1. Free Zero-Cost WhatsApp (Works Out of the Box!)
If API keys are left blank, the app **automatically generates pre-filled WhatsApp links (`https://wa.me/91...`)**. When saving a bill or recording a payment, counter staff can tap **"Open in WhatsApp (wa.me)"** to instantly open WhatsApp on the counter phone with the exact invoice summary pre-filled!

### 2. WhatsApp Cloud API (Meta Graph API - Automated)
To send messages automatically in the background directly from Meta servers:
1. Go to [developers.facebook.com](https://developers.facebook.com) and create an App under **Business**.
2. Add the **WhatsApp** product.
3. In API Setup, obtain:
   - **Phone Number ID** (e.g. `109283719283123`)
   - **System User Access Token** (Permanent Token)
4. Add to `.env`:
   ```env
   WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
   WHATSAPP_ACCESS_TOKEN=your_permanent_access_token
   WHATSAPP_API_URL=https://graph.facebook.com/v19.0
   ```
   *(Or enter them in the Owner Settings screen in the app).*

### 3. SMS Fallback (Twilio or Fast2SMS)
- **Twilio**:
  ```env
  TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  TWILIO_AUTH_TOKEN=your_twilio_auth_token
  TWILIO_PHONE_NUMBER=+1234567890
  ```
- **Fast2SMS (India)**:
  ```env
  FAST2SMS_API_KEY=your_fast2sms_api_key
  ```

---

## 📋 Key Features & Modules

### 1. New Bill (Home Screen - Counter Speed Optimized)
- **Multi-Item Bills**: Add any number of batteries and units to a single bill; each line keeps its own price, serial number, warranty, and exchange discount.
- **10-Digit Mobile Auto-Recognition**: Typing a customer's 10-digit number instantly recognizes repeat customers, auto-fills their name, and displays previous purchase counts and outstanding dues!
- **Vehicle & Village**: Store the customer's bike/vehicle number and village/town on every bill for easier identification and search.
- **Battery Selector**: Filter pills (`Car`, `Bike`, `Inverter`, `Tractor`, `Truck`, `E-rickshaw`) and instant search across catalog models.
- **Editable Unit Price**: Auto-fills default price, but counter staff can adjust price on the fly with instant subtotal recalculation.
- **Old Battery Exchange**: One-tap toggle automatically applies exchange discounts and logs old scrap battery stock.
- **Flexible Payment**: Cash, UPI, Card, or Credit with any part-payment amount. Unpaid balance becomes customer due automatically.
- **UPI QR on Counter**: Generates a scannable UPI QR with the bill amount and bill number (configure UPI ID in Settings).
- **Double-Tap Protection**: Button locks during saving to prevent duplicate bill creation.
- **Thermal & A4 Invoices**: Instant printable receipts with shop logo, GSTIN, terms, warranty periods, serial numbers, UPI QR, and balance due.

### 2. Customer Dues (Owner / Authorized Manager)
- Real-time ledger of all customer dues calculated from `total_purchases - total_paid`.
- Summary strip showing total pending dues across the entire business and count of debtors.
- **"Record Payment"**: Enter amount and mode (Cash/UPI/Card). The payment is automatically allocated to the customer's **oldest unpaid bill first**, balance updates live, and customer receives a WhatsApp payment receipt!
- **"Send Reminder"**: 1-click friendly WhatsApp reminder with shop UPI ID and phone number.
- Full purchase and receipt ledger expandable right on the page.
- Export to Excel/CSV and print-friendly sheet.

### 3. Dealer / Supplier Khata (Owner / Authorized Manager)
- Track battery purchases from each dealer with total purchase value, payments made, and outstanding payable.
- Record dealer payments in Cash, UPI, Card, or Credit.
- Stock-in automatically creates a dealer if a new supplier name is entered.
- Search, pending-only filter, and full dealer ledger (purchases + payments).

### 4. Warranty Check (All Staff)
- Search by battery serial number, customer mobile, or bill number.
- Clearly shows **VALID** or **EXPIRED / NOT COVERED** with purchase date, expiry date, and days/months remaining.
- Works correctly even when a bill contains multiple batteries.

### 5. Stock & Inventory Report (Owner / Authorized Manager)
- Complete stock valuation: opening stock, stock in, quantity sold, current stock, cost valuation, and potential retail sales value.
- Color highlights: **Orange** for low stock ($current \le alert$), **Red** for zero/out of stock.
- **Stock Inward**: Add supplier stock with cost price, dealer selection, total purchase cost, amount paid, and payment mode.
- **Manual Stock Adjustment**: Adjust counts with mandatory reason logging for audits.
- **Old Battery Scrap Stock**: Tracks scrap batteries returned by customers. Record scrap sales to dealers, track scrap revenue, and decrease scrap counts.
- Top selling models and slow-moving models (no sales in 60+ days).

### 6. Database Backups
- Supabase manages PostgreSQL backups according to your Supabase plan.
- The app also creates a daily JSON snapshot in `backups/` while the instance is awake.
- Owner can click **"Download JSON Export"** from the Settings screen for an immediate full-data export.

### 7. Multilingual Support
- Built-in UI dictionary supporting **English**, **मराठी (Marathi)**, and **हिंदी (Hindi)** with an instant toggle in the header.

---

## 🌐 Deployment Guide

### Supabase + Render.com (current setup)
1. Create a Supabase project. The app creates its own tables automatically.
2. In Supabase, open **Project Settings > Database** and copy the **Session pooler** connection string.
3. Push the repo to GitHub.
4. In Render, create a **Web Service** from the repo (or deploy the included `render.yaml`).
5. Set:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Health check: `/api/health`
   - `DATABASE_URL` = your Supabase session-pooler URL
   - `DATABASE_SSL` = `true`
   - `JWT_SECRET` = a long random value
6. Deploy, open the Render URL, log in, and change the default passwords immediately.
7. Add a few inventory items, then restart/redeploy the Render service and confirm they are still present.

> **Free plan note:** Render Free sleeps after inactivity and has no persistent disk. All shop data now lives in Supabase, so it survives restarts. Supabase Free pauses inactive projects after about a week, but data is retained.

### VPS alternative
Use the same Supabase `DATABASE_URL` on a VPS with PM2/Nginx. No local database disk is required.
