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
// CORE DATA FUNCTIONS (SECURED)
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
        const emptyMsg = '<p class="text-center text-gray-500 text-sm py-8 bg-white rounded-2xl border border-gray-100">No rooms found. Add a room!</p>';
        if(listHome) listHome.innerHTML = emptyMsg; if(listAll) listAll.innerHTML = emptyMsg; if(listLedger) listLedger.innerHTML = emptyMsg;
    } else {
        roomsData.forEach((room) => {
            const rent = Number(room.rent) || 0;
            const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant (Khali Hai)';
            const status = room.status || 'pending'; 
            
            if (tenantName !== 'Vacant (Khali Hai)') {
                totalRev += rent;
                if(status === 'pending') pendingRev += rent; else collectedRev += rent;
            }

            const badgeHtml = tenantName === 'Vacant (Khali Hai)' 
                ? '<span class="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full">VACANT</span>'
                : (status === 'pending' ? '<span class="px-3 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full">PENDING</span>' : '<span class="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">PAID</span>');

            const quickAssignBtnHtml = tenantName === 'Vacant (Khali Hai)' ? `<button onclick="quickAssignTenant('${room.id}', '${room.roomNo}')" class="text-green-500 hover:text-green-700 p-1 mr-1"><i class="fa-solid fa-user-plus"></i></button>` : '';
            const toggleBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="togglePaymentStatus('${room.id}', '${status}')" class="text-xl p-1 ${status === 'pending' ? 'text-gray-300' : 'text-green-500'}"><i class="fa-solid fa-circle-check"></i></button>` : '';
            const vacateBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="vacateRoom('${room.id}')" class="text-gray-400 hover:text-orange-500 p-1 ml-1"><i class="fa-solid fa-person-walking-arrow-right"></i></button>` : '';

            const isVacant = tenantName === 'Vacant (Khali Hai)';
            const cardBgColor = isVacant ? 'bg-red-50/50' : 'bg-green-50/50';
            const roomNoBgColor = isVacant ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600';

            const cardHtml = `
            <div class="${cardBgColor} p-4 rounded-2xl border ${isVacant?'border-red-200':'border-green-200'} flex items-center justify-between mb-3">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 ${roomNoBgColor} rounded-xl flex items-center justify-center font-bold">${room.roomNo}</div>
                    <div><h4 class="font-semibold text-gray-800">${tenantName}</h4><p class="text-xs text-gray-500">Rent: ₹${rent}/mo</p></div>
                </div>
                <div class="flex items-center gap-3">${badgeHtml}${quickAssignBtnHtml}${toggleBtnHtml}${vacateBtnHtml}<button onclick="deleteRoom('${room.id}')" class="text-gray-400 hover:text-red-500 p-1"><i class="fa-solid fa-trash"></i></button></div>
            </div>`;
            if(listHome) listHome.innerHTML += cardHtml; if(listAll) listAll.innerHTML += cardHtml; if(listLedger) listLedger.innerHTML += cardHtml;
        });
    }

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev;
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev;
    if(document.getElementById('ledger-total-due')) document.getElementById('ledger-total-due').innerText = '₹' + pendingRev;
    if(document.getElementById('ledger-collected')) document.getElementById('ledger-collected').innerText = '₹' + collectedRev;
}

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('view-active'));
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
// AUTHENTICATION LOGIC (FIXED LOGOUT)
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) { currentUser = user; window.switchView('view-owner'); } 
    else { currentUser = null; window.switchView('view-login'); }
});

window.handleSignup = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Email aur Password daal!");
    try { await createUserWithEmailAndPassword(auth, email, password); } catch (error) { alert("Error: " + error.message); }
}

const authForm = document.getElementById('auth-form');
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        try { await signInWithEmailAndPassword(auth, email, password); authForm.reset(); } 
        catch (error) { alert("Galat detail bhai! Error: " + error.message); }
    });
}

// LOUD & CLEAR LOGOUT
window.handleLogout = async function() { 
    try {
        await signOut(auth); 
        window.switchView('view-login');
        alert("Logout successful!");
    } catch (error) {
        alert("Logout error: " + error.message);
    } 
}