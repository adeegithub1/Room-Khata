export function currency(value = 0) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function phoneForWhatsApp(phone = '') {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}

export function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
}
