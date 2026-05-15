// src/views/OwnerDashboardView.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import {
  collection, query, where,
  onSnapshot, getDocs,
  updateDoc, doc, addDoc, deleteDoc
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function initials(name) {
  if (!name?.trim()) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return ["Good Night", "🌙"];
  if (h < 12) return ["Good Morning", "🌅"];
  if (h < 17) return ["Good Afternoon","☀️"];
  if (h < 21) return ["Good Evening", "🌆"];
  return ["Good Night", "✨"];
}

const generateCode = () => "RK-" + Math.random().toString(36).substring(2, 8).toUpperCase();

// ─────────────────────────────────────────────────────────────
// COMPONENTS
// ─────────────────────────────────────────────────────────────
function AnimatedNumber({ value, prefix = "₹" }) {
  const ref = useRef(null);
  const mv = useMotionValue(0);
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) ref.current.textContent = prefix + Math.round(v).toLocaleString("en-IN");
      },
    });
    return controls.stop;
  }, [value, prefix]);
  return <span ref={ref} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{prefix}0</span>;
}

function Toast({ toasts, dismiss }) {
  return (
    <div className="fixed inset-x-0 bottom-24 flex flex-col items-center gap-2 z-[100] pointer-events-none px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id} layout
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="pointer-events-auto px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-lg"
            style={{ background: t.type === "error" ? "linear-gradient(135deg,#E11D48,#BE123C)" : "linear-gradient(135deg,#059669,#047857)" }}
            onClick={() => dismiss(t.id)}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT COMPONENT
// ─────────────────────────────────────────────────────────────
export default function OwnerDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  // States
  const [rooms, setRooms] = useState([]);
  const [buildings, setBuildings] = useState({});
  const [ownerName, setOwnerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("home");
  const [toasts, setToasts] = useState([]);

  // Modal States
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showEditRoom, setShowEditRoom] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);

  // Form States
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newRoomData, setNewRoomData] = useState({ roomNo: "", rent: "", deposit: "" });
  const [editRoomData, setEditRoomData] = useState({ rent: "", elec: "", status: "" });

  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);

  // Fetch Logic
  useEffect(() => {
    if (!authUser) return;
    const unsubRooms = onSnapshot(query(collection(db, "rooms"), where("ownerId", "==", authUser.uid)), (snap) => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubBuildings = onSnapshot(query(collection(db, "buildings"), where("ownerId", "==", authUser.uid)), (snap) => {
      const m = {}; snap.docs.forEach(d => m[d.id] = { id: d.id, ...d.data() });
      setBuildings(m);
    });
    return () => { unsubRooms(); unsubBuildings(); };
  }, [authUser]);

  // Actions
  const handleAddBuilding = async (e) => {
    e.preventDefault();
    if (!newBuildingName.trim()) return;
    try {
      await addDoc(collection(db, "buildings"), { name: newBuildingName.trim(), ownerId: authUser.uid, createdAt: new Date().toISOString() });
      setShowAddBuilding(false); setNewBuildingName(""); toast("✓ Building added!");
    } catch (err) { toast(err.message, "error"); }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "rooms"), {
        ...newRoomData,
        roomNo: newRoomData.roomNo,
        rent: Number(newRoomData.rent),
        securityDeposit: Number(newRoomData.deposit),
        buildingId: selectedBuildingId,
        ownerId: authUser.uid,
        connectionCode: generateCode(),
        status: "vacant",
        amountPaid: 0,
        balanceDue: Number(newRoomData.rent)
      });
      setShowAddRoom(false); toast("✓ Room added!");
    } catch (err) { toast(err.message, "error"); }
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "rooms", selectedRoom.id), {
        rent: Number(editRoomData.rent),
        electricityBill: Number(editRoomData.elec),
        status: editRoomData.status
      });
      setShowEditRoom(false); toast("✓ Room updated!");
    } catch (err) { toast(err.message, "error"); }
  };

  const handleToggleStatus = async (roomId, currentStatus) => {
    const room = rooms.find(r => r.id === roomId);
    const newStatus = currentStatus === "paid" ? "pending" : "paid";
    const total = (room.rent || 0) + (room.electricityBill || 0);
    await updateDoc(doc(db, "rooms", roomId), {
      status: newStatus,
      amountPaid: newStatus === "paid" ? total : 0,
      balanceDue: newStatus === "paid" ? 0 : total,
      paidDate: newStatus === "paid" ? new Date().toISOString() : null
    });
    toast(newStatus === "paid" ? "✓ Payment received!" : "⏳ Marked as pending");
  };

  const handleInvite = (room) => {
    const msg = `Namaste! Room No ${room.roomNo} ka connection code ye hai: ${room.connectionCode}. RoomKhata app download karein aur join karein!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // Stats
  const totalRev = rooms.reduce((s, r) => s + (r.amountPaid || 0), 0);
  const pendingDues = rooms.reduce((s, r) => s + (r.balanceDue || 0), 0);

  const filtered = rooms.filter(r => {
    const matchF = filter === "all" ? true : filter === "paid" ? r.status === "paid" : ["pending", "partial"].includes(r.status);
    const matchS = !search || r.roomNo?.toString().includes(search) || r.tenantName?.toLowerCase().includes(search.toLowerCase());
    return matchF && matchS;
  });

  const grouped = {};
  filtered.forEach(r => { const bid = r.buildingId || "no-bid"; (grouped[bid] = grouped[bid] || []).push(r); });

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-[#F4F6FB]">
      
      {/* HEADER */}
      <header className="relative overflow-hidden shrink-0 pt-12 pb-6 px-5" style={{ background: "linear-gradient(155deg, #0A0818 0%, #2D1B69 100%)" }}>
        <div className="relative z-10">
          <div className="flex justify-between items-center mb-6">
            <div className="px-3 py-1.5 rounded-2xl bg-white/10 border border-white/10 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-[10px] text-white">₹</div>
              <span className="text-[10px] font-black text-amber-500 tracking-wider">ROOMKHATA PRO</span>
            </div>
            <button className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/70">
              <i className="fa-regular fa-bell" />
            </button>
          </div>
          
          <div className="mb-6">
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1">{greeting()[0]} {greeting()[1]}</p>
            <h2 className="text-3xl font-black text-white tracking-tight">Owner Dashboard</h2>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[22px] flex overflow-hidden">
            <div className="flex-1 p-5 border-r border-white/5">
              <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                <i className="fa-solid fa-arrow-trend-up text-orange-400" /> Revenue
              </div>
              <div className="text-2xl font-black text-amber-500"><AnimatedNumber value={totalRev} /></div>
            </div>
            <div className="flex-1 p-5">
              <div className="flex items-center gap-2 mb-2 text-white/40 text-[9px] font-bold uppercase tracking-widest">
                <i className="fa-solid fa-clock text-rose-400" /> Pending
              </div>
              <div className="text-2xl font-black text-rose-400"><AnimatedNumber value={pendingDues} /></div>
            </div>
          </div>
        </div>
      </header>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-32">
        
        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {[
            { icon: "fa-plus", label: "Building", color: "#FF6600", bg: "from-orange-500 to-amber-500", onClick: () => setShowAddBuilding(true) },
            { icon: "fa-chart-line", label: "Stats", color: "#7C3AED", bg: "from-violet-500 to-purple-600", onClick: () => alert("Coming soon!") },
            { icon: "fa-receipt", label: "Expenses", color: "#E11D48", bg: "from-rose-500 to-red-600", onClick: () => alert("Coming soon!") },
            { icon: "fa-gear", label: "Setup", color: "#059669", bg: "from-emerald-500 to-green-600", onClick: () => navigate("/settings") },
          ].map(btn => (
            <button key={btn.label} onClick={btn.onClick} className="bg-white border border-gray-100 rounded-2xl p-3 flex flex-col items-center active:scale-90 transition-all shadow-sm">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${btn.bg} flex items-center justify-center text-white mb-2 shadow-md`}>
                <i className={`fa-solid ${btn.icon}`} />
              </div>
              <span className="text-[10px] font-bold text-gray-500">{btn.label}</span>
            </button>
          ))}
        </div>

        {/* SEARCH & FILTERS */}
        <div className="relative mb-4">
          <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
          <input 
            type="text" placeholder="Search room or tenant..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-gray-200 text-sm font-medium outline-none"
          />
        </div>

        {/* BUILDINGS & ROOMS */}
        {Object.entries(grouped).map(([bid, bRooms]) => (
          <div key={bid} className="mb-8">
            <div className="flex justify-between items-center mb-4 px-1">
              <h3 className="font-black text-gray-800 flex items-center gap-2">
                <i className="fa-solid fa-building text-violet-600" /> {buildings[bid]?.name || "Uncategorized"}
              </h3>
              <button onClick={() => { setSelectedBuildingId(bid); setShowAddRoom(true); }} className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded-xl text-[10px] font-black active:scale-95 transition-all">+ Add Room</button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {bRooms.map(r => (
                <div key={r.id} className="bg-white border border-gray-100 rounded-[20px] p-3 shadow-sm relative overflow-hidden">
                  <div className={`w-10 h-10 rounded-xl mb-3 flex items-center justify-center font-black text-white ${r.status === 'vacant' ? 'bg-gray-200' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
                    {r.status === 'vacant' ? <i className="fa-solid fa-door-open text-gray-400" /> : initials(r.tenantName)}
                  </div>
                  <button onClick={() => { setSelectedRoom(r); setEditRoomData({ rent: r.rent, elec: r.electricityBill || 0, status: r.status }); setShowEditRoom(true); }} className="absolute top-3 right-3 w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 text-[10px]"><i className="fa-solid fa-pen" /></button>
                  
                  <p className="font-black text-sm text-gray-800">Room {r.roomNo}</p>
                  <p className="text-[10px] font-bold text-gray-400 mb-3 truncate">{r.tenantName || "Vacant"}</p>
                  
                  <div className="flex flex-col gap-1.5 mt-auto">
                    {r.status === 'vacant' ? (
                      <button onClick={() => handleInvite(r)} className="w-full py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black shadow-lg shadow-orange-500/20 active:scale-95 transition-all">🔗 Invite</button>
                    ) : (
                      <button onClick={() => handleToggleStatus(r.id, r.status)} className={`w-full py-2 rounded-xl text-[10px] font-black active:scale-95 transition-all ${r.status === 'paid' ? 'bg-gray-100 text-gray-500' : 'bg-green-500 text-white shadow-lg shadow-green-500/20'}`}>
                        {r.status === 'paid' ? '✓ Paid' : '₹ Receive'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* BOTTOM NAV */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 px-6 py-4 flex justify-around items-center z-40 pb-safe">
        {[
          { key: "home", icon: "fa-house", label: "Home" },
          { key: "tenants", icon: "fa-users", label: "Tenants" },
          { key: "payments", icon: "fa-wallet", label: "Money" },
          { key: "settings", icon: "fa-gear", label: "Settings" },
        ].map(n => (
          <button key={n.key} onClick={() => setActiveNav(n.key)} className={`flex flex-col items-center gap-1 ${activeNav === n.key ? 'text-orange-600 scale-110' : 'text-gray-400'} transition-all`}>
            <i className={`fa-solid ${n.icon} text-lg`} />
            <span className="text-[9px] font-bold">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* MODALS */}
      <AnimatePresence>
        {/* ADD BUILDING MODAL */}
        {showAddBuilding && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddBuilding(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[32px] p-8 relative shadow-2xl">
              <h3 className="text-xl font-black mb-1">New Building</h3>
              <p className="text-xs font-bold text-gray-400 mb-6">Enter name for your property.</p>
              <form onSubmit={handleAddBuilding}>
                <input autoFocus type="text" placeholder="e.g. Dream Residency" value={newBuildingName} onChange={e => setNewBuildingName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl mb-6 font-bold outline-none focus:border-orange-500" />
                <div className="flex gap-3">
                  <button type="button" onClick={() => setShowAddBuilding(false)} className="flex-1 py-4 font-bold text-gray-400">Cancel</button>
                  <button type="submit" className="flex-1 py-4 bg-orange-500 text-white rounded-2xl font-black shadow-lg shadow-orange-500/20">Save</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* ADD ROOM MODAL */}
        {showAddRoom && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddRoom(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[32px] p-8 relative shadow-2xl">
              <h3 className="text-xl font-black mb-1">Add New Room</h3>
              <form onSubmit={handleAddRoom} className="space-y-4 mt-6">
                <input type="text" placeholder="Room No (e.g. 101)" required value={newRoomData.roomNo} onChange={e => setNewRoomData({...newRoomData, roomNo: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold outline-none" />
                <input type="number" placeholder="Monthly Rent" required value={newRoomData.rent} onChange={e => setNewRoomData({...newRoomData, rent: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold outline-none" />
                <input type="number" placeholder="Security Deposit" value={newRoomData.deposit} onChange={e => setNewRoomData({...newRoomData, deposit: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold outline-none" />
                <button type="submit" className="w-full py-4 bg-violet-600 text-white rounded-2xl font-black shadow-lg shadow-violet-600/20">Add Room</button>
              </form>
            </motion.div>
          </div>
        )}

        {/* EDIT ROOM / BILL MODAL */}
        {showEditRoom && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEditRoom(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className="bg-white w-full max-w-sm rounded-[32px] p-8 relative shadow-2xl">
              <h3 className="text-xl font-black mb-6">Manage Room {selectedRoom?.roomNo}</h3>
              <form onSubmit={handleUpdateRoom} className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Monthly Rent</label>
                  <input type="number" value={editRoomData.rent} onChange={e => setEditRoomData({...editRoomData, rent: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold outline-none" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase ml-1">Current Elec Bill</label>
                  <input type="number" value={editRoomData.elec} onChange={e => setEditRoomData({...editRoomData, elec: e.target.value})} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold outline-none text-rose-500" />
                </div>
                <button type="submit" className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black shadow-xl">Update Details</button>
                <button type="button" onClick={async () => { if(window.confirm("Delete room?")) { await deleteDoc(doc(db, "rooms", selectedRoom.id)); setShowEditRoom(false); toast("Room deleted", "error"); } }} className="w-full py-2 text-rose-500 font-bold text-xs mt-2">Delete Room</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Toast toasts={toasts} dismiss={id => setToasts(p => p.filter(t => t.id !== id))} />
    </div>
  );
}
