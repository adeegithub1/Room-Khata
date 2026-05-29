import { currency, phoneForWhatsApp } from './format.js';

export function buildRentReminderUrl(room) {
  const message = [
    `Namaste ${room.tenantName || 'Tenant'},`,
    `Room ${room.roomNo} ka rent due hai: ${currency(room.balanceDue || room.rent)}.`,
    'Please pay today. Thank you.',
    '',
    `Hello ${room.tenantName || 'Tenant'}, rent due for Room ${room.roomNo}: ${currency(room.balanceDue || room.rent)}.`
  ].join('\n');

  return `https://wa.me/${phoneForWhatsApp(room.tenantPhone)}?text=${encodeURIComponent(message)}`;
}
