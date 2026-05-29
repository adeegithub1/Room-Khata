import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileImage, ReceiptText, Send, ShieldCheck, Trash2, Zap } from 'lucide-react';
import MobileFrame from '../../components/MobileFrame.jsx';
import BottomSheet from '../../components/BottomSheet.jsx';
import ActionButton from '../../components/ActionButton.jsx';
import OwnerBottomNav from '../../components/OwnerBottomNav.jsx';
import { Field } from '../../components/FormFields.jsx';
import { currency } from '../../lib/format.js';
import { generateRentReceipt } from '../../lib/receipts.js';
import { buildRentReminderUrl } from '../../lib/whatsapp.js';
import { addElectricityBill, addExpense, removeTenant, uploadTenantDocument, verifyPayment } from '../../services/firestoreService.js';
import { useDocData } from '../../hooks/useDocData.js';

export default function OwnerRoomDetails({ user }) {
  const { id } = useParams();
  const { data: room } = useDocData('rooms', id);
  const [sheet, setSheet] = useState(null);
  const [bill, setBill] = useState({ amount: '', description: 'Electricity bill' });

  async function submitBill(event) {
    event.preventDefault();
    await addElectricityBill(room, bill.amount);
    await addExpense(user.uid, {
      description: `${bill.description} - Room ${room.roomNo}`,
      amount: bill.amount,
      category: 'electricity',
      date: new Date().toISOString().slice(0, 10)
    });
    setBill({ amount: '', description: 'Electricity bill' });
    setSheet(null);
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    if (file) await uploadTenantDocument(room.id, file);
  }

  if (!room) {
    return (
      <MobileFrame>
        <div className="py-8 text-white">Loading room...</div>
      </MobileFrame>
    );
  }

  const documents = Object.values(room.documents || {});

  return (
    <MobileFrame>
      <div className="pb-28 pt-6">
        <Link to={`/building/${room.buildingId}`} className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
          <ArrowLeft size={18} />
        </Link>

        <div className="glass rounded-[32px] p-6">
          <p className="text-sm font-semibold text-gold">Room {room.roomNo}</p>
          <h1 className="mt-2 text-3xl font-extrabold text-white">{room.tenantName || 'Vacant Room'}</h1>
          <p className="mt-2 text-sm text-white/55">{room.tenantPhone || `Connection code ${room.connectionCode}`}</p>
          <div className="mt-6 rounded-3xl bg-white/10 p-5">
            <p className="text-sm text-white/55">Balance Due</p>
            <p className="money mt-2 text-4xl font-bold text-white">{currency(room.balanceDue)}</p>
            <p className="mt-3 text-sm text-white/55">
              Rent {currency(room.rent)} + Electricity {currency(room.electricityBill)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <ActionButton onClick={() => setSheet('bill')} variant="secondary" className="min-h-16 flex-col rounded-3xl px-2">
            <Zap size={18} />
            Add Bill/Expense
          </ActionButton>
          <a
            href={buildRentReminderUrl(room)}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-3xl border border-white/15 bg-white/10 px-2 text-sm font-bold text-white"
          >
            <Send size={18} />
            WhatsApp
          </a>
          {room.status === 'pending_verification' && (
            <ActionButton onClick={() => verifyPayment(room)} className="min-h-16 flex-col rounded-3xl px-2">
              <ShieldCheck size={18} />
              Verify Payment
            </ActionButton>
          )}
          <ActionButton onClick={() => generateRentReceipt({ room, ownerName: user?.name })} variant="secondary" className="min-h-16 flex-col rounded-3xl px-2">
            <ReceiptText size={18} />
            Receipt
          </ActionButton>
          <ActionButton onClick={() => removeTenant(room)} variant="secondary" className="min-h-16 flex-col rounded-3xl px-2 text-coral">
            <Trash2 size={18} />
            Remove Tenant
          </ActionButton>
        </div>

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Tenant Document Vault</h2>
            <label className="rounded-2xl bg-white px-3 py-2 text-sm font-bold text-royal">
              Upload
              <input className="hidden" type="file" accept="image/*,.pdf" onChange={upload} />
            </label>
          </div>
          <div className="space-y-3">
            {documents.map((document) => (
              <a key={document.path} href={document.url} target="_blank" rel="noreferrer" className="glass flex items-center gap-3 rounded-2xl p-3 text-sm font-semibold text-white">
                <FileImage size={18} className="text-gold" />
                {document.name}
              </a>
            ))}
            {documents.length === 0 && <p className="text-sm text-white/55">No documents uploaded yet.</p>}
          </div>
        </section>
      </div>

      <OwnerBottomNav />

      <BottomSheet open={sheet === 'bill'} title="Add Electricity Bill/Expense" onClose={() => setSheet(null)}>
        <form className="space-y-4" onSubmit={submitBill}>
          <Field label="Description" value={bill.description} onChange={(e) => setBill({ ...bill, description: e.target.value })} />
          <Field label="Amount" type="number" value={bill.amount} onChange={(e) => setBill({ ...bill, amount: e.target.value })} />
          <ActionButton className="w-full" type="submit">Add to Balance</ActionButton>
        </form>
      </BottomSheet>
    </MobileFrame>
  );
}
