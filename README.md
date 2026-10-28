# Maharashtra Auto Battery (महाराष्ट्र ऑटो बॅटरी)
### High-Speed Counter Billing & Inventory PWA Web App

A clean, fast, mobile-friendly billing web app installable as a Progressive Web App (PWA) on low-end Android phones and counter computers. Built specifically for automotive and inverter battery counter operations at **Maharashtra Auto Battery**.

---

## ⚡ Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons
- **Backend**: Node.js + Express
- **Database**: SQLite via the built-in `node:sqlite` module in WAL mode (no native addon build required)
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
- Node.js 22.5 or newer (`--experimental-sqlite` is used on Node 22)
- npm

### 2. Installation
Clone or navigate to the project directory and install dependencies:
```bash
# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..
```

### 3. Build & Run
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
- Automatic daily backup to `backups/backup-YYYY-MM-DD.sqlite`.
- Owner can click **"Download Backup (.sqlite)"** from the Settings screen to download a copy directly to their device at any time.

### 7. Multilingual Support
- Built-in UI dictionary supporting **English**, **मराठी (Marathi)**, and **हिंदी (Hindi)** with an instant toggle in the header.

---

## 🌐 Deployment Guide

### Option A: Small Cloud VPS (Recommended - e.g. Hetzner, DigitalOcean, Linode)
Cost: ~$4–$5/month. Permanent SQLite persistence and highest speed.
1. Create an Ubuntu droplet/server.
2. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
3. Clone project and install:
   ```bash
   git clone <your-repo> mab-battery
   cd mab-battery
   npm install
   cd client && npm install && npm run build && cd ..
   ```
4. Run continuously with PM2:
   ```bash
   sudo npm install -g pm2
   pm2 start server/server.js --name "mab-battery"
   pm2 startup
   pm2 save
   ```
5. Set up free SSL with Nginx + Certbot:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   ```
   Proxy `location / { proxy_pass http://localhost:5001; }` and run `sudo certbot --nginx -d yourshopdomain.com`.

### Option B: Render.com (Blueprint deploy)
1. Push the repo to GitHub.
2. In Render, choose **New > Blueprint** and select the repo. The included `render.yaml` creates the web service and a 1 GB persistent disk automatically.
3. The blueprint sets:
   - Build command: `npm run build`
   - Start command: `node server/server.js`
   - Health check: `/api/health`
   - Persistent disk mounted at `/var/data`
   - `DATA_DIR=/var/data`, `DB_PATH=/var/data/mab_battery.sqlite`, `BACKUP_DIR=/var/data/backups`
   - A randomly generated `JWT_SECRET`
4. Deploy, open the Render URL, log in, and change the default passwords immediately.
5. Verify persistence: after any redeploy, bills/customers/settings/dealers must still be present. Without a disk mounted at `/var/data`, SQLite data is lost on every deploy.

> **Railway/VPS alternative:** mount a persistent volume and set the same `DATA_DIR`, `DB_PATH`, and `BACKUP_DIR` environment variables.
