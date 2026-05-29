import { useState } from 'react';
import { KeyRound, Landmark, ReceiptText, Wallet } from 'lucide-react';
import MobileFrame from '../../components/MobileFrame.jsx';
import ActionButton from '../../components/ActionButton.jsx';
import { Field } from '../../components/FormFields.jsx';
import { currency } from '../../lib/format.js';
import { openUpiPayment } from '../../lib/upi.js';
import { generateRentReceipt } from '../../lib/receipts.js';
import { linkTenantByCode, markTenantPaid } from '../../services/firestoreService.js';
import { useAuthUser } from '../../hooks/useAuthUser.js';
import { useTenantRoom } from '../../hooks/useTenantRoom.js';

export default function TenantDashboard({ user: routedUser }) {
  const authState = useAuthUser();
  const user = routedUser || authState.user;
  const { room } = useTenantRoom(user?.uid);
  const [profile, setProfile] = useState({ name: user?.name || '', phone: user?.phone || '', code: '' });
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  async function connectRoom(event) {
    event.preventDefault();
    setError('');
    try {
      await linkTenantByCode({ uid: user.uid, ...profile });
    } catch (err) {
      setError(err.message);
    }
  }

  async function payNow() {
    const payable = amount || room.balanceDue || room.rent;
    openUpiPayment({
      pa: import.meta.env.VITE_OWNER_UPI_ID || 'owner@upi',
      am: payable,
      tn: `Rent for Room ${room.roomNo}`,
      tr: `RK-${room.id}`
    });
  }

  if (!room) {
    return (
      <MobileFrame>
        <section className="flex min-h-[calc(100svh-40px)] flex-col justify-center py-8">
          <div className="glass rounded-[32px] p-6">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold text-royal">
              <KeyRound size={26} />
            </div>
            <h1 className="text-3xl font-extrabold text-white">Connect your room</h1>
            <p className="mt-3 text-sm leading-6 text-white/62">
              Enter the 6-digit RoomKhata code shared by your property owner.
            </p>

            <form className="mt-6 space-y-4" onSubmit={connectRoom}>
              <Field label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              <Field label="Phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Field label="Connection Code" placeholder="123456" inputMode="numeric" value={profile.code} onChange={(e) => setProfile({ ...profile, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
              {error && <p className="text-sm text-coral">{error}</p>}
              <ActionButton className="w-full" type="submit">
                Link Room
              </ActionButton>
            </form>
          </div>
        </section>
      </MobileFrame>
    );
  }

  const payable = Number(amount || room.balanceDue || room.rent || 0);

  return (
    <MobileFrame>
      <section className="py-7">
        <p className="text-sm font-semibold text-gold">Tenant wallet</p>
        <h1 className="mt-2 text-4xl font-extrabold text-white">Room {room.roomNo}</h1>

        <div className="glass mt-6 rounded-[32px] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/55">Amount due</p>
              <p className="money mt-2 text-4xl font-bold text-white">{currency(room.balanceDue || room.rent)}</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/20 text-gold">
              <Wallet size={26} />
            </div>
          </div>
          <p className="mt-5 rounded-2xl bg-white/10 p-3 text-sm text-white/62">Status: {room.status?.replaceAll('_', ' ')}</p>
        </div>

        <div className="glass mt-4 rounded-3xl p-4">
          <p className="text-sm font-bold text-white">Breakdown</p>
          <div className="mt-3 space-y-2 text-sm text-white/62">
            <div className="flex justify-between"><span>Rent</span><span className="money">{currency(room.rent)}</span></div>
            <div className="flex justify-between"><span>Electricity</span><span className="money">{currency(room.electricityBill)}</span></div>
            <div className="flex justify-between"><span>Owner</span><span>{room.ownerName || 'Property Owner'}</span></div>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <Field label="Pay Amount" type="number" value={amount} placeholder={String(room.balanceDue || room.rent || 0)} onChange={(e) => setAmount(e.target.value)} />
          <ActionButton onClick={payNow} className="w-full">
            <Landmark size={18} />
            Pay Now via UPI
          </ActionButton>
          <ActionButton onClick={() => markTenantPaid(room.id, payable)} variant="secondary" className="w-full">
            I Have Paid
          </ActionButton>
          <ActionButton onClick={() => generateRentReceipt({ room })} variant="secondary" className="w-full">
            <ReceiptText size={18} />
            Download Receipt
          </ActionButton>
        </div>
      </section>
    </MobileFrame>
  );
}
