function dateParts(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function addMonthsClamped(value, months) {
  const parts = dateParts(value);
  if (!parts) return null;
  const target = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  target.setUTCMonth(target.getUTCMonth() + (Number(months) || 0));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(parts.day, lastDay));
  return target.toISOString().slice(0, 10);
}

function warrantyExpiry(startDate, months) {
  return addMonthsClamped(startDate, months);
}

function expiryEnd(expiryDate) {
  return new Date(`${expiryDate}T23:59:59+05:30`);
}

function isWarrantyExpired(expiryDate, now = new Date()) {
  if (!expiryDate) return true;
  return now > expiryEnd(expiryDate);
}

function daysRemaining(expiryDate, now = new Date()) {
  if (!expiryDate) return 0;
  return Math.ceil((expiryEnd(expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

module.exports = {
  addMonthsClamped,
  warrantyExpiry,
  isWarrantyExpired,
  daysRemaining
};
