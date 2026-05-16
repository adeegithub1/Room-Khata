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
// MOTION ANIMATIONS
// ─────────────────────────────────────────────────────────────
const ease = [0.22, 1, 0.36, 1];
const V = {
  stagger: (staggerAmt = 0.07) => ({
    hidden: {},
    visible: { transition: { staggerChildren: staggerAmt, delayChildren: 0 } },
  }),
  fadeUp: {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.42, ease } },
  },
  scaleUp: {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.38, ease } },
  }
};

function AnimatedNumber({ value, prefix = "₹" }) {
  const ref = useRef(null);
  const mv = useMotionValue(0);
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.8,
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
            key={t.id} layout initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="pointer-events-auto px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-lg shadow-indigo-950/20"
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
// COMPACT RESPONSIVE HEADER WITH SCROLL ANIMATION
// ─────────────────────────────────────────────────────────────
function FinanceHeader({ ownerName, rooms, loading, isScrolled, onBellClick, hasNotifications }) {
  const totalRevenue = useMemo(() => rooms.reduce((s, r) => s + (r.amountPaid || 0), 0), [rooms]);
  const pendingDues = useMemo(() => rooms.reduce((s, r) => s + (r.balanceDue || 0), 0), [rooms]);
  const totalExpected = useMemo(() => rooms.filter((r) => r.tenantName?.trim()).reduce((s, r) => s + (r.rent || 0), 0), [rooms]);
  const collectionPct = totalExpected > 0 ? Math.round((totalRevenue / totalExpected) * 100) : 0;
  const [greet, greetEmoji] = greeting();

  return (
    <motion.header
      animate={{ paddingBottom: isScrolled ? 12 : 20 }}
      transition={{ duration: 0.3, ease }}
      className="sticky top-0 z-30 shrink-0 w-full overflow-hidden shadow-md"
      style={{
        background: "linear-gradient(155deg, #0A0818 0%, #160F35 40%, #2D1B69 100%)",
        paddingTop: "max(16px, env(safe-area-inset-top))",
      }}
    >
      <div className="relative z-10 px-5">
        {/* Top bar: Brand + Bell */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
            <div className="w-4 h-4 rounded bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-[9px] font-black text-white">₹</div>
            <span className="text-[9px] font-black text-amber-500 tracking-wider">ROOMKHATA PRO</span>
          </div>
          
          <button onClick={onBellClick} className="relative flex items-center justify-center rounded-full bg-white/5 border border-white/10 transition-all active:scale-90 w-9 h-9 text-white/80">
            <i className="fa-solid fa-bell text-sm animate-none" />
            {hasNotifications && (
              <span className="absolute rounded-full w-2 h-2 bg-orange-500" style={{ top: 10, right: 10 }} />
            )}
          </button>
        </div>
        
        {/* Animated Collapse Section */}
        <AnimatePresence>
          {!isScrolled && (
            <motion.div
              initial={{ opacity: 1, height: "auto" }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.25, ease }}
              className="mb-4 overflow-hidden"
            >
              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-0.5">{greet} {greetEmoji}</p>
              <h2 className="text-2xl font-black text-white tracking-tight truncate">{ownerName || "Dashboard"}</h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Fintech Finance Widget */}
        <motion.div 
          layout
          className="bg-white/5 border border-white/10 overflow-hidden relative" 
          style={{ borderRadius: isScrolled ? 16 : 20 }}
        >
          <div className="flex">
            <div className="flex-1 px-4 py-3 border-r border-white/5">
              <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest block mb-0.5">Total Revenue</span>
              <div className="text-lg font-black text-amber-500">
                {loading ? <div className="h-5 w-20 bg-white/10 rounded animate-pulse" /> : <AnimatedNumber value={totalRevenue} />}
              </div>
            </div>
            <div className="flex-1 px-4 py-3">
              <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest block mb-0.5">Pending Dues</span>
              <div className="text-lg font-black text-rose-400">
                {loading ? <div className="h-5 w-20 bg-white/10 rounded animate-pulse" /> : <AnimatedNumber value={pendingDues} />}
              </div>
            </div>
          </div>
          
          {/* Progress fill bar */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
            <motion.div initial={{ width: 0 }} animate={{ width: `${collectionPct}%` }} transition={{ duration: 0.8, delay: 0.2 }} className="h-full bg-gradient-to-r from-orange-500 to-amber-500" />
          </div>
        </motion.div>
      </div>
    </motion.header>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOM CARD
// ─────────────────────────────────────────────────────────────
function RoomCard({ room, onToggle }) {
  const { roomNo, tenantName, rent = 0, electricityBill = 0, status = "pending", balanceDue = 0, securityDeposit = 0, connectionCode } = room;
  const isVacant = !tenantName?.trim();
  const cfg = STATUS_CONFIG[isVacant ? "vacant" : status] || STATUS_CONFIG.pending;
  const totalDue = rent + (electricityBill || 0);

  return (
    <motion.div variants={V.fadeUp} layout className="bg-white border rounded-2xl p-3 shadow-sm flex flex-col relative overflow-hidden" style={{ borderColor: cfg.border }}>
      <div className={`w-9 h-9 rounded-xl mb-2.5 flex items-center justify-center font-black text-white text-sm ${isVacant ? 'bg-gray-100' : 'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>
        {isVacant ? <i className="fa-solid fa-door-open text-gray-400 text-xs" /> : initials(tenantName)}
      </div>
      
      <p className="font-black text-xs text-gray-800">Room {roomNo}</p>
      <p className="text-[10px] font-bold text-gray-400 mb-2 truncate">{isVacant ? "Vacant" : tenantName}</p>

      <div className="text-[10px] text-gray-600 border-t border-gray-100 pt-1.5 mt-auto mb-2.5">
        <div className="flex justify-between"><span>Rent:</span><span className="font-bold">{fmt(rent)}</span></div>
        {electricityBill > 0 && <div className="flex justify-between text-yellow-600"><span>Elec:</span><span className="font-bold">+{fmt(electricityBill)}</span></div>}
      </div>

      <div className="mt-auto">
        {isVacant ? (
          <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Namaste! Room No ${roomNo} ka connection code: ${connectionCode}`)}`, "_blank")} className="w-full py-1.5 bg-orange-500 text-white rounded-xl text-[10px] font-black active:scale-95 transition-all">🔗 Invite</button>
        ) : (
          <button onClick={() => onToggle(room.id, status)} className={`w-full py-1.5 rounded-xl text-[10px] font-black active:scale-95 transition-all ${status === 'paid' ? 'bg-gray-100 text-gray-500' : 'bg-green-500 text-white'}`}>
            {status === 'paid' ? '✓ Paid' : '₹ Receive'}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// BUILDING COMPONENT
// ─────────────────────────────────────────────────────────────
function BuildingGroup({ buildingId, buildingName, rooms, onToggle, onAddRoom }) {
  return (
    <div className="mb-6 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <div className="flex justify-between items-center mb-4 border-b border-gray-50 pb-3">
        <h3 className="font-black text-sm text-gray-800 flex items-center gap-2">
          <i className="fa-solid fa-building text-indigo-600 text-xs" /> {buildingName}
        </h3>
        {buildingId !== "no-building" && (
          <button onClick={() => onAddRoom(buildingId)} className="px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black active:scale-95 transition-all">+ Add Room</button>
        )}
      </div>
      
      {rooms.length === 0 ? (
        <p className="text-[11px] text-gray-400 text-center py-4 font-medium">Is building me koi room nahi h. Naya room add karein!</p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {rooms.map((room) => <RoomCard key={room.id} room={room} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
}

const STATUS_CONFIG = {
  paid: { border: "#E2FBEB" },
  pending: { border: "#FFEAD4" },
  vacant: { border: "#F3F4F6" },
};

// ─────────────────────────────────────────────────────────────
// MAIN OWNER DASHBOARD
// ─────────────────────────────────────────────────────────────
export default function OwnerDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  // App States
  const [rooms, setRooms] = useState([]);
  const [buildings, setBuildings] = useState({});
  const [ownerName, setOwnerName] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeNav, setActiveNav] = useState("home");
  const [toasts, setToasts] = useState([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const [hasNotifications, setHasNotifications] = useState(true);

  // Modal Popups State
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  
  // Forms Memory State
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newRoomData, setNewRoomData] = useState({ roomNo: "", rent: "", deposit: "" });

  const toast = useCallback((msg, type = "success") => {
    const id = Date.now();
    setToasts((p) => [...p, { id, msg, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);
  const dismissToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  // Detect internal scrolling to trigger compact animation
  const handleScroll = (e) => {
    setIsScrolled(e.target.scrollTop > 24);
  };

  const handleBell = () => {
    setHasNotifications(false);
    toast("🔔 Sabhi kirayedaron ke khate up-to-date hain!");
  };

  // Profile data fetch
  useEffect(() => {
    if (!authUser) return;
    getDocs(query(collection(db, "ownerProfiles"), where("uid", "==", authUser.uid))).then((s) => {
      if (!s.empty) setOwnerName(s.docs[0].data().name || "");
    }).catch(() => {});
  }, [authUser]);

  // Real-time listener for live screen syncing
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    
    const unsubRooms = onSnapshot(query(collection(db, "rooms"), where("ownerId", "==", authUser.uid)), (snap) => {
      setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    const unsubBuildings = onSnapshot(query(collection(db, "buildings"), where("ownerId", "==", authUser.uid)), (snap) => {
      const m = {}; snap.docs.forEach(d => m[d.id] = { id: d.id, ...d.data() });
      setBuildings(m);
    });

    return () => { unsubRooms(); unsubBuildings(); };
  }, [authUser]);

  // Handle building form logic
  const handleAddBuilding = async (e) => {
    e.preventDefault();
    if (!newBuildingName.trim()) return;
    try {
      await addDoc(collection(db, "buildings"), { name: newBuildingName.trim(), ownerId: authUser.uid, createdAt: new Date().toISOString() });
      setShowAddBuilding(false); setNewBuildingName(""); toast("✓ Nayi building jud gayi!");
    } catch (err) { toast(err.message, "error"); }
  };

  // Handle room form logic
  const handleAddRoom = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "rooms"), {
        roomNo: newRoomData.roomNo.trim(),
        rent: Number(newRoomData.rent),
        securityDeposit: Number(newRoomData.deposit || 0),
        buildingId: selectedBuildingId,
        ownerId: authUser.uid,
        connectionCode: generateCode(),
        status: "vacant",
        amountPaid: 0,
        balanceDue: Number(newRoomData.rent),
        electricityBill: 0
      });
      setShowAddRoom(false); setNewRoomData({ roomNo: "", rent: "", deposit: "" }); toast("✓ Naya room add ho gaya!");
    } catch (err) { toast(err.message, "error"); }
  };

  // Handle payment status switch
  const handleToggle = useCallback(async (roomId, currentStatus) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    try {
      const isPaid = currentStatus === "paid";
      const total = (room.rent || 0) + (room.electricityBill || 0);
      await updateDoc(doc(db, "rooms", roomId), {
        status: isPaid ? "pending" : "paid",
        amountPaid: isPaid ? 0 : total,
        balanceDue: isPaid ? total : 0,
        paidDate: isPaid ? null : new Date().toISOString()
      });
      toast(isPaid ? "⏳ Rent Pending mark ho gaya" : "✓ Rent Receive ho gaya!");
    } catch (err) { toast(err.message, "error"); }
  }, [rooms, toast]);

  const handleLogout = async () => {
    if (window.confirm("Kya aap log out karna chahte hain?")) {
      await signOut(auth);
      setUserRole(null);
      navigate("/login");
    }
  };

  // Advanced query filters
  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const mF = filter === "all" ? true : filter === "paid" ? r.status === "paid" : ["pending", "partial"].includes(r.status);
      const mS = !q || r.roomNo?.toString().includes(q) || r.tenantName?.toLowerCase().includes(q);
      return mF && mS;
    });
  }, [rooms, filter, search]);

  // Dynamic mapper ensuring empty buildings display perfectly
  const grouped = useMemo(() => {
    const g = {};
    Object.keys(buildings).forEach(bid => { g[bid] = []; });
    filteredRooms.forEach((r) => {
      const bid = r.buildingId || "no-building";
      if (!g[bid]) g[bid] = [];
      g[bid].push(r);
    });
    return Object.entries(g);
  }, [filteredRooms, buildings]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden relative max-w-[550px] mx-auto bg-[#F4F6FB] shadow-xl">
      
      {/* HEADER BAR */}
      <FinanceHeader ownerName={ownerName} rooms={rooms} loading={loading} isScrolled={isScrolled} onBellClick={handleBell} hasNotifications={hasNotifications} />

      {/* DASHBOARD CONTAINER SCOLLEFFECT */}
      <div onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 pt-5 pb-32">
        <AnimatePresence mode="wait">
          {activeNav === "home" ? (
            <motion.div key="home" initial="hidden" animate="visible" exit={{ opacity: 0 }} variants={V.stagger(0.05)}>
              {/* Filter bar + Add building header trigger line */}
              <div className="flex justify-between items-center mb-4">
                <FilterChips active={filter} onChange={setFilter} />
                <button onClick={() => setShowAddBuilding(true)} className="px-3.5 py-2 text-white font-black text-[11px] rounded-xl active:scale-95 transition-all shadow-md shadow-orange-500/20" style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}>
                  + Add Building
                </button>
              </div>

              {/* Instant dynamic search field item input */}
              <div className="relative mb-5">
                <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                <input type="text" placeholder="Room number ya naam se search karein..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-gray-100 text-xs font-bold outline-none shadow-sm focus:border-orange-500 transition-all" />
              </div>

              {/* Loading skeletons layout mapping view */}
              {loading && <div className="grid grid-cols-2 gap-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>}

              {/* Fallback layout interface configuration template empty panel screen layout */}
              {!loading && grouped.length === 0 && <EmptyState hasFilter={filter !== "all" || search !== ""} onAddBuilding={() => setShowAddBuilding(true)} />}

              {/* Main loop logic grouping block rendering list map workflow arrays mapping container */}
              {!loading && grouped.map(([buildingId, buildingRooms]) => (
                <BuildingGroup key={buildingId} buildingId={buildingId} buildingName={buildingId === "no-building" ? "Uncategorized Rooms" : buildings[buildingId]?.name || "Building"} rooms={buildingRooms} onToggle={handleToggle} onAddRoom={(id) => { setSelectedBuildingId(id); setShowAddRoom(true); }} />
              ))}
            </motion.div>
          ) : (
            /* SPECIAL YOU PREMIUM COMPONENT HUB CONTAINER VIEW INTERFACE SCREENPORT PAGE */
            <motion.div key="you" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="bg-white rounded-3xl p-6 text-center border border-gray-100 shadow-sm mb-2">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center font-black text-white text-xl mx-auto mb-3 shadow-md">
                  {initials(ownerName)}
                </div>
                <h3 className="font-black text-lg text-gray-800">{ownerName || "Makan Maalik"}</h3>
                <p className="text-[10px] font-bold text-gray-400 mt-0.5">Premium Landlord Account</p>
              </div>

              <div className="bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm divide-y divide-gray-50">
                {[
                  { icon: "fa-user-gear", text: "Account Settings", desc: "Manage profile, name & settings" },
                  { icon: "fa-chart-pie", text: "Analytics Dashboard", desc: "View detailed cash flow charts" },
                  { icon: "fa-receipt", text: "Expense Tracker", desc: "Record maintenance & electricity bills" },
                  { icon: "fa-file-invoice-dollar", text: "Detailed Reports", desc: "Download PDF/Excel khata sheets" },
                ].map((opt, i) => (
                  <button key={i} onClick={() => toast(`⚡ ${opt.text} feature jald hi chalu hoga!`)} className="w-full text-left px-5 py-4 flex items-center gap-4 active:bg-gray-50 transition-all">
                    <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 text-xs shrink-0"><i className={`fa-solid ${opt.icon}`} /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xs text-gray-800">{opt.text}</p>
                      <p className="text-[10px] font-medium text-gray-400 truncate mt-0.5">{opt.desc}</p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-gray-300 text-[10px]" />
                  </button>
                ))}
              </div>

              <button onClick={handleLogout} className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black text-xs active:scale-95 transition-all shadow-sm">
                🚪 Log Out Account
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FIXED FOOTER NAV BAR STICKY WRAPPER CONFIG CONTROLLER DOCK SCREEN */}
      <nav className="absolute bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-gray-100 px-6 py-3 flex justify-around items-center pb-safe">
        {[
          { key: "home", icon: "fa-house", label: "Home" },
          { key: "you", icon: "fa-user", label: "You" },
        ].map((item) => {
          const isActive = activeNav === item.key;
          return (
            <button key={item.key} onClick={() => setActiveNav(item.key)} className="flex flex-col items-center gap-1 py-1 px-4 text-center transition-all cursor-pointer" style={{ color: isActive ? "#FF6600" : "#9CA3AF", transform: isActive ? "scale(1.08)" : "scale(1)" }}>
              <i className={`fa-solid ${item.icon} text-lg`} />
              <span className="font-black text-[9px] tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── INTERACTIVE POPUPS MODALS STACK CONTAINER ARCHITECTURE ── */}
      <AnimatePresence>
        {/* POPUP: ADD BUILDING MODAL TRIGGER VIEW */}
        {showAddBuilding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddBuilding(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-10 border border-gray-100">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-orange-500 to-amber-500 text-white text-xl shadow-md shadow-orange-500/10">
                <i className="fa-solid fa-building" />
              </div>
              <h3 className="font-black text-lg text-gray-800 mb-1">New Building</h3>
              <p className="text-[11px] font-bold text-gray-400 mb-5">Nayi property ya block jodne ke liye naam dalein.</p>
              <form onSubmit={handleAddBuilding}>
                <input type="text" placeholder="e.g. Dream Villa, B-Block..." value={newBuildingName} onChange={(e) => setNewBuildingName(e.target.value)} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs outline-none focus:border-orange-500 mb-5 transition-all" autoFocus required />
                <div className="flex gap-2.5">
                  <button type="button" onClick={() => setShowAddBuilding(false)} className="flex-1 py-3 bg-gray-50 rounded-xl font-bold text-gray-500 text-xs active:scale-95 transition-all">Cancel</button>
                  <button type="submit" disabled={!newBuildingName.trim()} className="flex-1 py-3 text-white font-black rounded-xl text-xs active:scale-95 transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg,#FF6600,#F59E0B)" }}>Save Property</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* POPUP: ADD ROOM MODAL CONTAINER WORKFLOW LINK TRIGGER VIEW */}
        {showAddRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddRoom(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.95, opacity: 0, y: 15 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }} className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl z-10 border border-gray-100">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-xl shadow-md shadow-indigo-500/10">
                <i className="fa-solid fa-door-open" />
              </div>
              <h3 className="font-black text-lg text-gray-800 mb-4">Add New Room</h3>
              <form onSubmit={handleAddRoom} className="space-y-3.5">
                <input type="text" placeholder="Room Number (e.g. Room 102)" required value={newRoomData.roomNo} onChange={e => setNewRoomData({...newRoomData, roomNo: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500 transition-all" autoFocus />
                <input type="number" placeholder="Monthly Rent Amount (₹)" required value={newRoomData.rent} onChange={e => setNewRoomData({...newRoomData, rent: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500 transition-all" />
                <input type="number" placeholder="Advance Security Deposit (Optional)" value={newRoomData.deposit} onChange={e => setNewRoomData({...newRoomData, deposit: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs outline-none focus:border-indigo-500 transition-all mb-2" />
                <div className="flex gap-2.5 pt-2">
                  <button type="button" onClick={() => setShowAddRoom(false)} className="flex-1 py-3 bg-gray-50 rounded-xl font-bold text-gray-500 text-xs active:scale-95 transition-all">Cancel</button>
                  <button type="submit" disabled={!newRoomData.roomNo || !newRoomData.rent} className="flex-1 py-3 text-white font-black rounded-xl text-xs active:scale-95 transition-all disabled:opacity-40" style={{ background: "linear-gradient(135deg,#2D1B69,#6D28D9)" }}>Create Room</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TOAST NOTIFICATION FLOATER CONTROLLER HUB PORT STACK */}
      <Toast toasts={toasts} dismiss={dismissToast} />
    </div>
  );
}
