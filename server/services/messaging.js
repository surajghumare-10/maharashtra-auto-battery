const { db } = require('../db');

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : '';
}

function cleanIndianMobile(mobile) {
  if (!mobile) return '';
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }
  return digits;
}

function generateWaMeUrl(mobile, text) {
  const clean = cleanIndianMobile(mobile);
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value != null ? String(value) : '');
  }
  return result;
}

async function sendWhatsAppCloud(toMobile, messageText) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || getSetting('whatsapp_phone_number_id');
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || getSetting('whatsapp_access_token');
  const apiUrl = process.env.WHATSAPP_API_URL || getSetting('whatsapp_api_url') || 'https://graph.facebook.com/v19.0';

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp Cloud API keys not configured in .env or Settings');
  }

  const cleanTo = cleanIndianMobile(toMobile);
  const endpoint = `${apiUrl}/${phoneNumberId}/messages`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'text',
      text: { preview_url: false, body: messageText }
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `WhatsApp API error: ${response.statusText}`);
  }
  return { success: true, provider: 'whatsapp_cloud', data };
}

async function sendTwilioSMS(toMobile, messageText) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || getSetting('twilio_account_sid');
  const authToken = process.env.TWILIO_AUTH_TOKEN || getSetting('twilio_auth_token');
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || getSetting('twilio_phone_number');

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Twilio credentials not configured');
  }

  const cleanTo = '+' + cleanIndianMobile(toMobile);
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams();
  params.append('To', cleanTo);
  params.append('From', fromNumber);
  params.append('Body', messageText);

  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `Twilio error: ${response.statusText}`);
  }
  return { success: true, provider: 'twilio', data };
}

async function sendFast2SMS(toMobile, messageText) {
  const apiKey = process.env.FAST2SMS_API_KEY || getSetting('fast2sms_api_key');
  if (!apiKey) {
    throw new Error('Fast2SMS API key not configured');
  }

  const digits = String(toMobile).replace(/\D/g, '').slice(-10);
  const endpoint = 'https://www.fast2sms.com/dev/bulkV2';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      route: 'v3',
      sender_id: 'TXTIND',
      message: messageText,
      language: 'english',
      flash: 0,
      numbers: digits
    })
  });

  const data = await response.json();
  if (!response.ok || !data.return) {
    throw new Error(data.message || 'Fast2SMS error');
  }
  return { success: true, provider: 'fast2sms', data };
}

/**
 * Attempts automated sending via WhatsApp Cloud API -> Twilio -> Fast2SMS.
 * If all fail or no keys are configured, gracefully returns fallback wa_me_url!
 */
async function sendNotification(toMobile, messageText) {
  const waMeUrl = generateWaMeUrl(toMobile, messageText);
  let errors = [];

  // 1. Try WhatsApp Cloud API
  try {
    const res = await sendWhatsAppCloud(toMobile, messageText);
    return { success: true, status: 'sent', provider: 'whatsapp_cloud', waMeUrl, details: res };
  } catch (err) {
    errors.push(`WhatsApp Cloud: ${err.message}`);
  }

  // 2. Try Twilio
  try {
    const res = await sendTwilioSMS(toMobile, messageText);
    return { success: true, status: 'sent', provider: 'twilio', waMeUrl, details: res };
  } catch (err) {
    errors.push(`Twilio: ${err.message}`);
  }

  // 3. Try Fast2SMS
  try {
    const res = await sendFast2SMS(toMobile, messageText);
    return { success: true, status: 'sent', provider: 'fast2sms', waMeUrl, details: res };
  } catch (err) {
    errors.push(`Fast2SMS: ${err.message}`);
  }

  // Fallback: No paid API worked or keys absent; provide pre-filled WhatsApp link
  return {
    success: false,
    status: 'wa_link_ready',
    waMeUrl,
    error: errors.join('; '),
    message: 'Automated APIs not configured or failed. Pre-filled WhatsApp link is ready for 1-tap counter sending.'
  };
}

module.exports = {
  cleanIndianMobile,
  generateWaMeUrl,
  renderTemplate,
  sendNotification,
  getSetting
};
