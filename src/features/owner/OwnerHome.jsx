import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BellRing, Building2, CirclePlus } from 'lucide-react';
import MobileFrame from '../../components/MobileFrame.jsx';
import BottomSheet from '../../components/BottomSheet.jsx';
import ActionButton from '../../components/ActionButton.jsx';
import OwnerBottomNav from '../../components/OwnerBottomNav.jsx';
import StatCard from '../../components/StatCard.jsx';
import { Field } from '../../components/FormFields.jsx';
import { currency } from '../../lib/format.js';
import { createBuilding } from '../../services/firestoreService.js';
import { useOwnerData } from '../../hooks/useOwnerData.js';
import ExpenseAnalytics from './ExpenseAnalytics.jsx';

export default function OwnerHome({ user }) {
  const { buildings, rooms, expenses } = useOwnerData(user?.uid);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [building, setBuilding] = useState({ name: '', address: '' });
  const { hash } = useLocation();
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 96], [1, 0]);
  const heroY = useTransform(scrollY, [0, 96], [0, -28]);
  const compactOpacity = useTransform(scrollY, [34, 110], [0, 1]);

  useEffect(() => {
    if (!hash) return;
    requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash]);

  const stats = useMemo(() => {
    const totalCollected = rooms.data.reduce((sum, room) => sum + Number(room.amountPaid || 0), 0);
    const pendingDues = rooms.data.reduce((sum, room) => sum + Number(room.balanceDue || 0), 0);
    const occupied = rooms.data.filter((room) => Boolean(room.tenantUid || room.tenantName)).length;
    const vacant = rooms.data.length - occupied;
    const pendingVerifications = rooms.data.filter((room) => room.status === 'pending_verification').length;
    return { totalCollected, pendingDues, occupied, vacant, pendingVerifications };
  }, [rooms.data]);

  async function submit(event) {
    event.preventDefault();
    await createBuilding(user.uid, building);
    setBuilding({ name: '', address: '' });
    setSheetOpen(false);
  }

  return (
    <MobileFrame>
      <div className="pb-28">
        <motion.div className="sticky top-0 z-20 -mx-4 px-4 pt-3" style={{ opacity: compactOpacity }}>
          <div className="glass flex h-14 items-center justify-between rounded-2xl px-4">
            <div>
              <p className="text-xs text-white/55">Owner Home</p>
              <p className="money text-sm font-bold text-white">{currency(stats.pendingDues)} pending</p>
            </div>
            <button className="rounded-full bg-gold/20 p-2 text-gold" aria-label="Alerts">
              <BellRing size={18} />
            </button>
          </div>
        </motion.div>

        <motion.header style={{ opacity: heroOpacity, y: heroY }} className="pt-6 will-change-transform">
          <p className="text-sm font-semibold text-gold">Good evening, {user?.name}</p>
          <h1 className="mt-2 text-4xl font-extrabold leading-tight text-white">Owner Dashboard</h1>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <StatCard label="Total Collected" value={currency(stats.totalCollected)} tone="mint" />
            <StatCard label="Pending Dues" value={currency(stats.pendingDues)} tone="gold" />
            <StatCard label="Occupied" value={`${stats.occupied} rooms`} tone="gold" />
            <StatCard label="Vacant" value={`${stats.vacant} rooms`} tone="coral" />
          </div>
          {stats.pendingVerifications > 0 && (
            <div className="mt-4 rounded-3xl border border-gold/30 bg-gold/15 p-4 text-sm text-white">
              {stats.pendingVerifications} tenant payment needs verification.
            </div>
          )}
        </motion.header>

        <section className="mt-7" id="tenants">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Buildings</h2>
            <button onClick={() => setSheetOpen(true)} className="flex h-10 items-center gap-2 rounded-2xl bg-white px-3 text-sm font-bold text-royal">
              <CirclePlus size={16} />
              Add
            </button>
          </div>
          <div className="space-y-3">
            {buildings.data.map((item) => {
              const count = rooms.data.filter((room) => room.buildingId === item.id).length;
              return (
                <Link key={item.id} to={`/building/${item.id}`} className="glass block rounded-3xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/20 text-gold">
                      <Building2 size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{item.name}</p>
                      <p className="truncate text-sm text-white/55">{item.address}</p>
                    </div>
                    <p className="money text-sm text-white/70">{count}</p>
                  </div>
                </Link>
              );
            })}
            {buildings.data.length === 0 && <p className="text-sm text-white/55">Add your first building to begin.</p>}
          </div>
        </section>

        <section id="analytics">
          <ExpenseAnalytics rooms={rooms.data} expenses={expenses.data} />
        </section>

        <section id="settings" className="glass mt-7 rounded-[28px] p-4">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <p className="mt-2 text-sm text-white/55">Signed in as {user?.phone || user?.uid}. Configure Firebase env values before production launch.</p>
        </section>
      </div>

      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-28 right-[calc(50%-224px)] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gold text-royal shadow-glow max-[520px]:right-6"
        aria-label="Add building"
      >
        <CirclePlus size={24} />
      </button>
      <OwnerBottomNav />

      <BottomSheet open={sheetOpen} title="Add Building" onClose={() => setSheetOpen(false)}>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Building Name" value={building.name} onChange={(e) => setBuilding({ ...building, name: e.target.value })} />
          <Field label="Address" value={building.address} onChange={(e) => setBuilding({ ...building, address: e.target.value })} />
          <ActionButton className="w-full" type="submit">Save Building</ActionButton>
        </form>
      </BottomSheet>
    </MobileFrame>
  );
}
