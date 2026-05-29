import jsPDF from 'jspdf';
import { currency, formatDate } from './format.js';

export function generateRentReceipt({ room, ownerName = 'RoomKhata Pro', paymentDate = new Date() }) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const receiptNo = `RK-${room.id?.slice(0, 6) || Date.now()}`;

  pdf.setFillColor(45, 27, 105);
  pdf.rect(0, 0, 595, 160, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(26);
  pdf.text('RoomKhata Pro', 48, 70);
  pdf.setFontSize(12);
  pdf.text('Digital Rent Receipt', 48, 96);

  pdf.setTextColor(16, 12, 35);
  pdf.setFontSize(13);
  pdf.text(`Receipt No: ${receiptNo}`, 48, 210);
  pdf.text(`Date: ${formatDate(paymentDate)}`, 48, 236);
  pdf.text(`Owner: ${ownerName}`, 48, 262);
  pdf.text(`Tenant: ${room.tenantName || 'Tenant'}`, 48, 306);
  pdf.text(`Room: ${room.roomNo}`, 48, 332);
  pdf.text(`Amount Paid: ${currency(room.amountPaid || room.rent)}`, 48, 376);
  pdf.text('Status: Paid', 48, 402);
  pdf.setFont('helvetica', 'normal');
  pdf.text('This is a computer generated receipt.', 48, 500);

  pdf.save(`${receiptNo}-rent-receipt.pdf`);
}
