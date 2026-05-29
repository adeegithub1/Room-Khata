import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CirclePlus, Copy } from 'lucide-react';
import MobileFrame from '../../components/MobileFrame.jsx';
import BottomSheet from '../../components/BottomSheet.jsx';
import ActionButton from '../../components/ActionButton.jsx';
import OwnerBottomNav from '../../components/OwnerBottomNav.jsx';
import { Field } from '../../components/FormFields.jsx';
import { currency } from '../../lib/format.js';
import { buildingRoomsQuery, createRoom } from '../../services/firestoreService.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useDocData } from '../../hooks/useDocData.js';

const filters = ['all', 'paid', 'pending', 'vacant'];

export default function BuildingRooms({ user }) {
  const { id } = useParams();
  const building = useDocData('buildings', id);
  const rooms = useCollection(() => id && buildingRoomsQuery(id), [id]);
  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [activeVacantRoom, setActiveVacantRoom] = useState(null);
  const [form, setForm] = useState({ roomNo: '', rent: '', electricityBill: '', securityDeposit: '' });

  const filteredRooms = useMemo(() => {
    return rooms.data.filter((room) => {
      const vacant = !room.tenantUid && !room.tenantName;
      if (filter === 'vacant') return vacant;
      if (filter === 'all') return true;
      return room.status === filter;
    });
  }, [filter, rooms.data]);

  async function addRoom(event) {
    event.preventDefault();
    await createRoom(user.uid, { ...form, buildingId: id });
    setForm({ roomNo: '', rent: '', electricityBill: '', securityDeposit: '' });
    setSheet(null);
  }

  return (
    <MobileFrame>
      <div className="pb-28 pt-6">
        <Link to="/owner-home" className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-white">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gold">Building</p>
            <h1 className="mt-1 text-3xl font-extrabold text-white">{building.data?.name || 'Rooms'}</h1>
            <p className="mt-2 text-sm text-white/55">{building.data?.address}</p>
          </div>
          <button onClick={() => setSheet('room')} className="flex h-11 items-center gap-2 rounded-2xl bg-white px-3 text-sm font-bold text-royal">
            <CirclePlus size={16} />
            Room
          </button>
        </div>

        <div className="no-scrollbar mt-6 flex gap-2 overflow-x-auto">
          {filters.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`h-10 shrink-0 rounded-2xl px-4 text-sm font-bold capitalize ${filter === item ? 'bg-gold text-royal' : 'bg-white/10 text-white'}`}
            >
              {item}
            </button>
          ))}
        </div>

        <section className="mt-6 grid grid-cols-1 gap-3">
          {filteredRooms.map((room) => {
            const vacant = !room.tenantUid && !room.tenantName;
            const card = (
              <div className="glass rounded-3xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-white">Room {room.roomNo}</p>
                    <p className="mt-1 text-sm text-white/55">{vacant ? 'Vacant' : room.tenantName}</p>
                  </div>
                  <p className="money text-sm font-bold text-gold">{currency(room.balanceDue)}</p>
                </div>
                <p className="mt-4 inline-flex rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                  {vacant ? 'connection ready' : room.status?.replaceAll('_', ' ')}
                </p>
              </div>
            );

            return vacant ? (
              <button key={room.id} className="text-left" onClick={() => setActiveVacantRoom(room)}>
                {card}
              </button>
            ) : (
              <Link key={room.id} to={`/room/${room.id}`}>
                {card}
              </Link>
            );
          })}
        </section>
      </div>

      <OwnerBottomNav />

      <BottomSheet open={sheet === 'room'} title="Add Room" onClose={() => setSheet(null)}>
        <form className="space-y-4" onSubmit={addRoom}>
          <Field label="Room No" value={form.roomNo} onChange={(e) => setForm({ ...form, roomNo: e.target.value })} />
          <Field label="Rent" type="number" value={form.rent} onChange={(e) => setForm({ ...form, rent: e.target.value })} />
          <Field label="Electricity Bill" type="number" value={form.electricityBill} onChange={(e) => setForm({ ...form, electricityBill: e.target.value })} />
          <Field label="Security Deposit" type="number" value={form.securityDeposit} onChange={(e) => setForm({ ...form, securityDeposit: e.target.value })} />
          <ActionButton className="w-full" type="submit">Save Room</ActionButton>
        </form>
      </BottomSheet>

      <BottomSheet open={Boolean(activeVacantRoom)} title="Tenant Connection Code" onClose={() => setActiveVacantRoom(null)}>
        {activeVacantRoom && (
          <div className="space-y-4">
            <div className="rounded-3xl bg-white/10 p-5 text-center">
              <p className="text-sm text-white/55">Share this with tenant</p>
              <p className="money mt-3 text-4xl font-bold text-gold">{activeVacantRoom.connectionCode}</p>
            </div>
            <ActionButton
              className="w-full"
              onClick={() => navigator.clipboard?.writeText(activeVacantRoom.connectionCode)}
            >
              <Copy size={18} />
              Copy Code
            </ActionButton>
          </div>
        )}
      </BottomSheet>
    </MobileFrame>
  );
}
