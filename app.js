import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain: "room-khata-43cd3.firebaseapp.com",
  projectId: "room-khata-43cd3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let roomsData = [];
let currentUser = null; 
let magicRoomIdCache = null;

// ==========================================
// MAGIC LINK & ROUTING LOGIC
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const magicRoomId = urlParams.get('room');

onAuthStateChanged(auth, async (user) => {
    if (magicRoomId) {
        // TENANT MAGIC MODE! Bypass Login
        magicRoomIdCache = magicRoomId;
        window.switchView('view-tenant-join');
        
        // Fetch Room Info to show tenant
        try {
            const roomSnap = await getDoc(doc(db, "rooms", magicRoomId));
            if(roomSnap.exists()) {
                document.getElementById('magic-room-display').innerText = `Room ${roomSnap.data().roomNo} (Rent: ₹${roomSnap.data().rent})`;
            } else {
                alert("Invalid Link!");
            }
        } catch(e) { console.error(e); }
    } else if (user) {
        // OWNER MODE
        currentUser = user; 
        window.switchView('view-owner'); 
    } else {
        // LOGGED OUT
        currentUser = null; 
        window.switchView('view-login'); 
    }
});

// ==========================================
// CORE OWNER FUNCTIONS (WITH GUARDRAILS)
// ==========================================
window.fetchRoomsFromCloud = async function() {
    if (!currentUser) return; 
    try {
        const q = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        roomsData = []; 
        querySnapshot.forEach((doc) => { let data = doc.data(); data.id = doc.id; roomsData.push(data); });
        window.renderRooms();
    } catch (error) { console.error("Error: ", error); }
}

window.renderRooms = function() {
    const listHome = document.getElementById('room-list-home');
    if(!listHome) return; listHome.innerHTML = ''; 

    let totalRev = 0, pendingRev = 0;

    if (roomsData.length === 0) {
        listHome.innerHTML = '<p class="text-center text-gray-400 text-sm py-10 border border-dashed border-gray-200 rounded-xl mt-2">No rooms found. Add a room!</p>';
    } else {
        roomsData.forEach((room, index) => {
            const rent = Number(room.rent) || 0;
            const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
            const status = room.status || 'pending'; 
            const phone = room.tenantPhone || '';
            
            if (tenantName !== 'Vacant') {
                totalRev += rent;
                if(status === 'pending') pendingRev += rent;
            }

            const isVacant = tenantName === 'Vacant';
            const delay = index * 0.08; 

            // LOGIC: Dynamic Actions based on Vacancy
            let actionButtons = '';
            
            if (isVacant) {
                // Share Link to invite
                actionButtons = `<button onclick="shareRoomLink('${room.id}', '${room.roomNo}')" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold active:scale-95 transition-all"><i class="fa-solid fa-share-nodes mr-1"></i> Invite</button>`;
                // Delete Allowed ONLY when vacant
                actionButtons += `<button onclick="deleteRoom('${room.id}', true)" class="w-8 h-8 rounded-full text-red-400 hover:bg-red-50 active:scale-75 transition-all flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>`;
            } else {
                // WhatsApp Reminder
                actionButtons = status === 'pending' ? `<button onclick="sendWhatsApp('${tenantName}', '${phone}', '${rent}')" class="w-8 h-8 rounded-full text-green-500 bg-green-50 active:scale-75 transition-all flex items-center justify-center mr-1"><i class="fa-brands fa-whatsapp text-sm"></i></button>` : '';
                // Payment Toggle
                actionButtons += `<button onclick="togglePaymentStatus('${room.id}', '${status}')" class="text-2xl active:scale-75 transition-all ${status === 'pending' ? 'text-gray-200' : 'text-green-500'}"><i class="fa-solid fa-circle-check"></i></button>`;
                // Vacate Action
                actionButtons += `<button onclick="vacateRoom('${room.id}')" class="w-8 h-8 rounded-full text-gray-400 hover:text-orange-500 active:scale-75 transition-all flex items-center justify-center ml-1"><i class="fa-solid fa-person-walking-arrow-right text-xs"></i></button>`;
                // Delete Disabled (Guardrail)
                actionButtons += `<button onclick="deleteRoom('${room.id}', false)" class="w-8 h-8 rounded-full text-gray-200 flex items-center justify-center ml-1 cursor-not-allowed"><i class="fa-solid fa-trash text-xs"></i></button>`;
            }

            const cardHtml = `
            <div class="bg-white p-3.5 rounded-2xl border ${isVacant ? 'border-gray-100' : 'border-blue-100'} flex items-center justify-between shadow-sm room-card-animate" style="animation-delay: ${delay}s">
                <div class="flex items-center gap-3.5">
                    <div class="w-11 h-11 ${isVacant ? 'bg-gray-50 text-gray-500' : 'bg-blue-50 text-blue-600'} rounded-xl flex items-center justify-center font-bold text-lg">${room.roomNo}</div>
                    <div>
                        <h4 class="font-bold text-gray-800 text-sm mb-0.5">${tenantName}</h4>
                        <p class="text-[11px] font-medium text-gray-400">₹${rent}/mo <span class="ml-1 ${isVacant ? 'hidden' : (status === 'pending' ? 'text-yellow-500' : 'text-green-500')}">• ${status.toUpperCase()}</span></p>
                    </div>
                </div>
                <div class="flex items-center">${actionButtons}</div>
            </div>`;
            listHome.innerHTML += cardHtml; 
        });
    }

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
}

// ==========================================
// ACTIONS & GUARDRAILS
// ==========================================
window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    setTimeout(() => { 
        document.getElementById(viewId).classList.add('view-active'); 
        if(viewId === 'view-owner') window.fetchRoomsFromCloud();
    }, 10);
}

window.handleAddRoomSubmit = async function(e) {
    e.preventDefault(); 
    if (!currentUser) return;
    const roomNo = document.getElementById('new-room-no').value;
    const rentAmount = document.getElementById('new-rent-amount').value;
    try {
        await addDoc(collection(db, "rooms"), { roomNo, tenantName: "", rent: Number(rentAmount), status: "pending", ownerId: currentUser.uid });
        document.getElementById('add-room-form').reset(); window.switchView('view-owner'); 
    } catch (err) { alert("Error: " + err.message); }
}

// GUARDRAIL: Prevent active room deletion
window.deleteRoom = async function(id, isVacant) { 
    if(!isVacant) {
        alert("Action Denied: You cannot delete a room while a tenant is staying there. Vacate them first!");
        return;
    }
    if(confirm("Permanently delete this empty room?")) { 
        await deleteDoc(doc(db, "rooms", id)); 
        window.fetchRoomsFromCloud(); 
    } 
}

// GUARDRAIL: Vacate Settlement Confirmation
window.vacateRoom = async function(id) { 
    if(confirm("Has the tenant cleared all their dues?\nClick OK to vacate them from the system.")) { 
        await updateDoc(doc(db, "rooms", id), { tenantName: "", tenantPhone: "", status: "pending" }); 
        window.fetchRoomsFromCloud(); 
    } 
}

window.togglePaymentStatus = async function(id, currentStatus) { 
    await updateDoc(doc(db, "rooms", id), { status: currentStatus === 'pending' ? 'paid' : 'pending' }); 
    window.fetchRoomsFromCloud(); 
}

// WhatsApp Generator
window.sendWhatsApp = function(name, phone, rent) {
    if(!phone) { alert("Phone number not saved for this tenant."); return; }
    const msg = `Hello ${name}, aapka Room Khata rent ₹${rent} baaki hai. Kripya jaldi pay karein. Thank you!`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Dynamic Share Link Generator
window.shareRoomLink = function(roomId, roomNo) {
    const link = `${window.location.origin}/?room=${roomId}`;
    alert(`Link for Room ${roomNo} generated! Copy this to send to tenant:\n\n${link}`);
}

// ==========================================
// TENANT MAGIC JOIN SUBMIT
// ==========================================
window.handleMagicJoinSubmit = async function(e) {
    e.preventDefault();
    if(!magicRoomIdCache) return;
    const name = document.getElementById('magic-tenant-name').value;
    const phone = document.getElementById('magic-tenant-phone').value;
    
    try {
        await updateDoc(doc(db, "rooms", magicRoomIdCache), { tenantName: name, tenantPhone: phone, status: "pending" });
        alert("Success! You have joined the room.");
        window.location.href = window.location.origin; // Redirect back to normal app
    } catch(err) { alert("Error joining: " + err.message); }
}

// AUTH FUNCTIONS
window.handleLoginSubmit = async function(e) {
    e.preventDefault(); 
    const em = document.getElementById('auth-email').value; const pw = document.getElementById('auth-password').value;
    try { await signInWithEmailAndPassword(auth, em, pw); } catch (err) { alert("Login Fail! " + err.message); }
};
window.handleSignup = async function() {
    const em = document.getElementById('auth-email').value; const pw = document.getElementById('auth-password').value;
    try { await createUserWithEmailAndPassword(auth, em, pw); } catch (err) { alert("Error: " + err.message); }
};
window.handleLogout = async function() { await signOut(auth); };
