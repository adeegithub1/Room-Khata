import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain: "room-khata-43cd3.firebaseapp.com",
  projectId: "room-khata-43cd3",
  storageBucket: "room-khata-43cd3.firebasestorage.app",
  messagingSenderId: "739355882640",
  appId: "1:739355882640:web:8bd01c7b05d8129fa29415"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let roomsData = [];
let currentUser = null; 

// ==========================================
// CORE DATA FUNCTIONS (WITH STAGGERED ANIMATIONS)
// ==========================================
window.fetchRoomsFromCloud = async function() {
    if (!currentUser) return; 
    try {
        const q = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        roomsData = []; 
        querySnapshot.forEach((doc) => {
            let data = doc.data();
            data.id = doc.id; 
            roomsData.push(data);
        });
        window.renderRooms();
    } catch (error) { console.error("Error: ", error); }
}

window.renderRooms = function() {
    const listHome = document.getElementById('room-list-home');
    const listAll = document.getElementById('room-list-all');
    const listLedger = document.getElementById('room-list-ledger');

    if(listHome) listHome.innerHTML = ''; if(listAll) listAll.innerHTML = ''; if(listLedger) listLedger.innerHTML = '';

    let totalRev = 0, pendingRev = 0, collectedRev = 0;

    if (roomsData.length === 0) {
        const emptyMsg = '<p class="text-center text-gray-400 text-sm py-10 bg-white rounded-2xl border border-dashed border-gray-200 mt-2">No rooms found. Add a room!</p>';
        if(listHome) listHome.innerHTML = emptyMsg; if(listAll) listAll.innerHTML = emptyMsg; if(listLedger) listLedger.innerHTML = emptyMsg;
    } else {
        roomsData.forEach((room, index) => {
            const rent = Number(room.rent) || 0;
            const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant (Khali Hai)';
            const status = room.status || 'pending'; 
            
            if (tenantName !== 'Vacant (Khali Hai)') {
                totalRev += rent;
                if(status === 'pending') pendingRev += rent; else collectedRev += rent;
            }

            const badgeHtml = tenantName === 'Vacant (Khali Hai)' 
                ? '<span class="px-2.5 py-1 bg-gray-100 text-gray-500 text-[9px] font-bold rounded-md uppercase tracking-wider">Vacant</span>'
                : (status === 'pending' ? '<span class="px-2.5 py-1 bg-yellow-100 text-yellow-700 text-[9px] font-bold rounded-md uppercase tracking-wider">Pending</span>' : '<span class="px-2.5 py-1 bg-green-100 text-green-700 text-[9px] font-bold rounded-md uppercase tracking-wider">Paid</span>');

            const quickAssignBtnHtml = tenantName === 'Vacant (Khali Hai)' ? `<button onclick="quickAssignTenant('${room.id}', '${room.roomNo}')" class="w-8 h-8 rounded-full bg-green-50 text-green-600 hover:bg-green-100 active:scale-75 transition-all flex items-center justify-center mr-1"><i class="fa-solid fa-user-plus text-xs"></i></button>` : '';
            const toggleBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="togglePaymentStatus('${room.id}', '${status}')" class="text-2xl transition-all duration-200 active:scale-75 ${status === 'pending' ? 'text-gray-200 hover:text-green-400' : 'text-green-500 drop-shadow-sm'}"><i class="fa-solid fa-circle-check"></i></button>` : '';
            const vacateBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="vacateRoom('${room.id}')" class="w-8 h-8 rounded-full text-gray-400 hover:bg-orange-50 hover:text-orange-500 active:scale-75 transition-all flex items-center justify-center ml-1"><i class="fa-solid fa-person-walking-arrow-right text-xs"></i></button>` : '';

            const isVacant = tenantName === 'Vacant (Khali Hai)';
            const cardBgColor = isVacant ? 'bg-white' : 'bg-white';
            const borderCol = isVacant ? 'border-gray-100' : 'border-green-100';
            const roomNoBgColor = isVacant ? 'bg-gray-50 text-gray-500 border border-gray-100' : 'bg-green-50 text-green-600 border border-green-100';

            // Notice the inline style for animation-delay. This makes them stagger in one by one!
            const delay = index * 0.08; 
            const cardHtml = `
            <div class="${cardBgColor} p-3.5 rounded-2xl border ${borderCol} flex items-center justify-between shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md active:scale-[0.98] transition-all duration-200 room-card-animate" style="animation-delay: ${delay}s">
                <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 ${roomNoBgColor} rounded-xl flex items-center justify-center font-bold text-lg">${room.roomNo}</div>
                    <div><h4 class="font-bold text-gray-800 text-sm mb-0.5">${tenantName}</h4><p class="text-[11px] font-medium text-gray-400">Rent: ₹${rent}/mo</p></div>
                </div>
                <div class="flex items-center gap-1.5">${badgeHtml}${quickAssignBtnHtml}${toggleBtnHtml}${vacateBtnHtml}<button onclick="deleteRoom('${room.id}')" class="w-8 h-8 rounded-full text-gray-300 hover:bg-red-50 hover:text-red-500 active:scale-75 transition-all flex items-center justify-center ml-1"><i class="fa-solid fa-trash text-xs"></i></button></div>
            </div>`;
            if(listHome) listHome.innerHTML += cardHtml; if(listAll) listAll.innerHTML += cardHtml; if(listLedger) listLedger.innerHTML += cardHtml;
        });
    }

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
    if(document.getElementById('ledger-total-due')) document.getElementById('ledger-total-due').innerText = '₹' + pendingRev.toLocaleString('en-IN');
    if(document.getElementById('ledger-collected')) document.getElementById('ledger-collected').innerText = '₹' + collectedRev.toLocaleString('en-IN');
}

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('view-active');
    });
    
    // Slight delay so the DOM registers the removal before adding it back to trigger animation
    setTimeout(() => {
        document.getElementById(viewId).classList.add('view-active');
        if(['view-owner', 'view-rooms', 'view-ledger'].includes(viewId)) { window.fetchRoomsFromCloud(); }
        if (viewId === 'view-add-tenant') {
            const sel = document.getElementById('assign-room-id');
            if (sel) {
                sel.innerHTML = '<option value="" disabled selected>Select a Vacant Room</option>';
                roomsData.filter(r => !r.tenantName || r.tenantName === 'Vacant (Khali Hai)').forEach(room => {
                    sel.innerHTML += `<option value="${room.id}">Room ${room.roomNo}</option>`;
                });
            }
        }
    }, 10);
}

// ==========================================
// CRUD ACTIONS
// ==========================================
window.handleAddRoomSubmit = async function(event) {
    event.preventDefault(); 
    if (!currentUser) return alert("Please login first");
    const roomNo = document.getElementById('new-room-no').value;
    const tenantName = document.getElementById('new-tenant-name').value || ''; 
    const rentAmount = document.getElementById('new-rent-amount').value;

    try {
        await addDoc(collection(db, "rooms"), { roomNo, tenantName, rent: Number(rentAmount), status: "pending", ownerId: currentUser.uid, timestamp: new Date() });
        document.getElementById('add-room-form').reset();
        window.switchView('view-owner'); 
    } catch (e) { alert("Error: " + e.message); }
}

window.handleAddTenantSubmit = async function(event) {
    event.preventDefault(); 
    const roomId = document.getElementById('assign-room-id').value; 
    const name = document.getElementById('assign-tenant-name').value.trim(); 
    const rent = document.getElementById('assign-tenant-rent').value;        
    if (!roomId) return alert("Select a room!");

    try {
        await updateDoc(doc(db, "rooms", roomId), { tenantName: name, rent: Number(rent), status: "pending" });
        document.getElementById('add-tenant-owner-form').reset();
        window.switchView('view-owner'); 
    } catch (e) { alert("Error: " + e.message); }
}

window.deleteRoom = async function(id) { if(confirm("Remove room?")) { await deleteDoc(doc(db, "rooms", id)); window.fetchRoomsFromCloud(); } }
window.togglePaymentStatus = async function(id, currentStatus) { await updateDoc(doc(db, "rooms", id), { status: currentStatus === 'pending' ? 'paid' : 'pending' }); window.fetchRoomsFromCloud(); }
window.vacateRoom = async function(id) { if(confirm("Vacate room?")) { await updateDoc(doc(db, "rooms", id), { tenantName: "Vacant (Khali Hai)", status: "pending" }); window.fetchRoomsFromCloud(); } }
window.quickAssignTenant = async function(id, roomNo) {
    const name = prompt(`Kirayedar ka naam (Room ${roomNo}):`);
    if (name && name.trim() !== "") { await updateDoc(doc(db, "rooms", id), { tenantName: name.trim(), status: "pending" }); window.fetchRoomsFromCloud(); }
}

window.shareLink = function() {
    const link = "https://roomkhata.app/join/x7y8z9";
    const msg = `Hello! Room Khata app par apni details bhariyen:\n${link}`;
    alert("Share Link Copied! Tenant ko bhej do.\n\n" + msg);
}

// ==========================================
// BULLETPROOF AUTHENTICATION LOGIC
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; window.switchView('view-owner'); } 
    else { currentUser = null; window.switchView('view-login'); }
});

// Exposing explicit handles to window so HTML can call them directly via onsubmit=""
window.handleLoginSubmit = async function(event) {
    event.preventDefault(); 
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    try { 
        await signInWithEmailAndPassword(auth, email, password); 
        document.getElementById('auth-form').reset(); 
    } catch (error) { 
        alert("Galat detail bhai! Error: " + error.message); 
    }
};

window.handleSignup = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Email aur Password daal!");
    try { await createUserWithEmailAndPassword(auth, email, password); } catch (error) { alert("Error: " + error.message); }
};

window.handleLogout = async function() { 
    try {
        await signOut(auth); 
        window.switchView('view-login');
    } catch (error) {
        alert("Logout error: " + error.message);
    } 
};
