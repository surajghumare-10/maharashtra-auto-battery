# Maharashtra Auto Battery (महाराष्ट्र ऑटो बॅटरी)
### High-Speed Counter Billing & Inventory PWA Web App

A clean, fast, mobile-friendly billing web app installable as a Progressive Web App (PWA) on low-end Android phones and counter computers. Built specifically for automotive and inverter battery counter operations at **Maharashtra Auto Battery**.

---

## ⚡ Tech Stack
- **Frontend**: React (Vite) + Tailwind CSS + Lucide Icons
- **Backend**: Node.js + Express
- **Database**: SQLite with `better-sqlite3` in WAL mode (synchronous, blazing fast, zero configuration required)
- **Auth**: JWT with `bcryptjs`-hashed passwords & inactivity auto-logout
- **Messaging**: Meta WhatsApp Cloud API (primary), Twilio / Fast2SMS (SMS fallback), and automatic pre-filled `wa.me` link (zero-cost free fallback)
- **PWA**: Installable on Android & iOS (`manifest.json` + `sw.js` offline caching)

---

## 🔑 Login Credentials (Pre-Seeded)

The database automatically seeds 3 ready-to-test accounts:

| Role | Username | Password | Permissions |
| :--- | :--- | :--- | :--- |
| **Owner (Admin)** | `owner` | `owner123` | Full access: bills, users, prices, customer dues, inventory valuation, stock adjustments, database backup download |
| **Manager (Father)** | `manager` | `manager123` | Can create bills, view all records, edit bills, edit battery prices, add inward stock, view dashboard |
| **Worker (Counter)** | `worker` | `worker123` | Counter billing: can create bills and view/edit **only bills generated on current day**. Cannot delete bills or manage accounts |

*Tip: The login page includes convenient **1-tap test buttons** to quickly fill any account credentials.*

---

## 🚀 Quick Start (Running Locally)

### 1. Prerequisites
- Node.js (v18 or higher recommended; v20/v22/v26 tested)
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
- **10-Digit Mobile Auto-Recognition**: Typing a customer's 10-digit number instantly recognizes repeat customers, auto-fills their name, and displays previous purchase counts and outstanding dues!
- **Battery Selector**: Filter pills (`Car`, `Bike`, `Inverter`, `Tractor`, `Truck`, `E-rickshaw`) and instant search across catalog models.
- **Editable Unit Price**: Auto-fills default price, but counter staff can adjust price on the fly with instant subtotal recalculation.
- **Old Battery Exchange**: One-tap toggle automatically applies exchange discounts and logs old scrap battery stock.
- **Payment Modes**: Cash, UPI, Card, or Credit (Pay Later). Credit mode calculates balance due live.
- **Double-Tap Protection**: Button locks during saving to prevent duplicate bill creation.
- **Thermal & A4 Invoices**: Instant printable receipts with shop GSTIN, terms, warranty periods, and serial numbers.

### 2. Customer Dues (Owner / Authorized Manager)
- Real-time ledger of all customer dues calculated from `total_purchases - total_paid`.
- Summary strip showing total pending dues across the entire business and count of debtors.
- **"Record Payment"**: Enter amount and mode (Cash/UPI/Card). The payment is automatically allocated to the customer's **oldest unpaid bill first**, balance updates live, and customer receives a WhatsApp payment receipt!
- **"Send Reminder"**: 1-click friendly WhatsApp reminder with shop UPI ID and phone number.
- Full purchase and receipt ledger expandable right on the page.
- Export to Excel/CSV and print-friendly sheet.

### 3. Stock & Inventory Report (Owner / Authorized Manager)
- Complete stock valuation: opening stock, stock in, quantity sold, current stock, cost valuation, and potential retail sales value.
- Color highlights: **Orange** for low stock ($current \le alert$), **Red** for zero/out of stock.
- **Stock Inward**: Add supplier stock with cost price, supplier name, and invoice reference.
- **Manual Stock Adjustment**: Adjust counts with mandatory reason logging for audits.
- **Old Battery Scrap Stock**: Tracks scrap batteries returned by customers. Record scrap sales to dealers, track scrap revenue, and decrease scrap counts.
- Top selling models and slow-moving models (no sales in 60+ days).

### 4. Database Backups
- Automatic daily backup to `backups/backup-YYYY-MM-DD.sqlite`.
- Owner can click **"Download Backup (.sqlite)"** from the Settings screen to download a copy directly to their device at any time.

### 5. Multilingual Support
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

### Option B: Render.com / Railway
1. Push repo to GitHub.
2. Connect repo to Render / Railway.
3. Build command:
   ```bash
   npm install && cd client && npm install && npm run build && cd ..
   ```
4. Start command:
   ```bash
   node server/server.js
   ```
5. Attach a Persistent Disk mounted at `/data` so SQLite files persist across deploys.
