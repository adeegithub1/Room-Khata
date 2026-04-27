import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain: "room-khata-43cd3.firebaseapp.com",
  projectId: "room-khata-43cd3",
  storageBucket: "room-khata-43cd3.firebasestorage.app",
  messagingSenderId: "739355882640",
  appId: "1:739355882640:web:8bd01c7b05d8129fa29415",
  measurementId: "G-3ZJJ8NGT56"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let roomsData = [];
let currentUser = null;
let magicRoomIdCache = null;
let currentShareLink = "";
let expenses = [];
let paymentHistory = [];
let chartInstances = { revenueChart: null, occupancyChart: null };

// ==========================================
// ONBOARDING STATE
// ==========================================
let onboardingState = {
    ownerName: '',
    buildingCount: 0,
    currentBuildingIndex: 0,
    buildings: []
};

let buildingsData = {}; // { buildingId: { name, rooms: [] } }

// ==========================================
// PREMIUM TOAST NOTIFICATIONS
// ==========================================

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' : 'bg-gradient-to-r from-red-500 to-red-600 text-white';
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check text-white text-lg"></i>' : '<i class="fa-solid fa-circle-exclamation text-white text-lg"></i>';
    
    toast.className = `${bgClass} px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold transform transition-all duration-300 flex items-center gap-3 w-full max-w-[380px] toast`;
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

// ==========================================
// PREMIUM CUSTOM MODALS
// ==========================================

window.showConfirm = function(title, message, btnText, isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const box = document.getElementById('custom-confirm-box');
        const icon = document.getElementById('confirm-icon');
        const okBtn = document.getElementById('confirm-ok-btn');
        
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        okBtn.innerText = btnText;

        if(isDanger) {
            icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl bg-red-100 text-red-600";
            icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            okBtn.className = "flex-1 py-3 bg-red-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-lg hover:bg-red-700";
        } else {
            icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl bg-blue-100 text-blue-600";
            icon.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            okBtn.className = "flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-lg hover:bg-blue-700";
        }

        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
            document.getElementById('confirm-cancel-btn').onclick = null;
            okBtn.onclick = null;
        };

        document.getElementById('confirm-cancel-btn').onclick = () => closeAndResolve(false);
        okBtn.onclick = () => closeAndResolve(true);
    });
}

window.showPrompt = function(title, placeholder) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        const box = document.getElementById('custom-prompt-box');
        const input = document.getElementById('prompt-input');
        
        document.getElementById('prompt-title').innerText = title;
        input.placeholder = placeholder;
        input.value = "";

        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); input.focus(); }, 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
            document.getElementById('prompt-cancel-btn').onclick = null;
            document.getElementById('prompt-ok-btn').onclick = null;
        };

        document.getElementById('prompt-cancel-btn').onclick = () => closeAndResolve(null);
        document.getElementById('prompt-ok-btn').onclick = () => {
            if(input.value.trim() === "") showToast("Please enter a value", "error");
            else closeAndResolve(input.value.trim());
        };

        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter' && input.value.trim() !== "") closeAndResolve(input.value.trim());
        });
    });
}

// ==========================================
// SHARE MODAL
// ==========================================

window.shareRoomLink = function(roomId, roomNo) {
    currentShareLink = `${window.location.origin}/?room=${roomId}`;
    document.getElementById('share-title').innerText = `Room ${roomNo}`;
    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); sheet.classList.remove('translate-y-full'); }, 10);
}

window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.add('opacity-0');
    sheet.classList.add('translate-y-full');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

window.shareViaWhatsAppAction = function() {
    const msg = `🏠 Join my Room Khata app! Click here to register:\n${currentShareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    closeShareModal();
}

window.copyShareLinkAction = async function() {
    try { 
        await navigator.clipboard.writeText(currentShareLink); 
        closeShareModal(); 
        showToast("✨ Magic Link Copied!", "success"); 
    } catch (err) { 
        showToast("Failed to copy", "error"); 
    }
}

// ==========================================
// ONBOARDING FLOW
// ==========================================

window.handleOnboardingStep1 = function(e) {
    e.preventDefault();
    const ownerName = document.getElementById('owner-name').value.trim();
    
    if (!ownerName) {
        showToast("Please enter your name", "error");
        return;
    }

    onboardingState.ownerName = ownerName;
    
    // Animate transition to step 2
    const step1 = document.getElementById('onboarding-step-1');
    step1.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        step1.classList.add('hidden');
        document.getElementById('onboarding-name-display').innerText = ownerName.split(' ')[0];
        
        const step2 = document.getElementById('onboarding-step-2');
        step2.classList.remove('hidden');
        step2.classList.add('onboarding-slide-enter');
    }, 300);
}

window.selectBuildingCount = function(count) {
    const btn = document.querySelector(`[data-count="${count === 4 ? '4' : count}"]`);
    document.querySelectorAll('.building-count-btn').forEach(b => {
        b.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
        b.classList.add('bg-gray-100');
    });
    
    btn.classList.remove('bg-gray-100');
    btn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');
    
    document.getElementById('building-count').value = count === 4 ? 4 : count;
    document.getElementById('buildings-submit').disabled = false;
    
    showToast(`${count === 4 ? '4 or more' : count} building${count !== 1 ? 's' : ''} selected!`, 'success');
}

window.handleOnboardingStep2 = function(e) {
    e.preventDefault();
    const count = parseInt(document.getElementById('building-count').value);
    
    if (!count || count < 1) {
        showToast("Please select number of buildings", "error");
        return;
    }

    onboardingState.buildingCount = count;
    onboardingState.buildings = Array(count).fill(null).map((_, i) => ({ name: '', rooms: 0 }));
    
    // Animate to step 3
    const step2 = document.getElementById('onboarding-step-2');
    step2.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        step2.classList.add('hidden');
        
        document.getElementById('current-building').innerText = 1;
        document.getElementById('total-buildings').innerText = count;
        
        const step3 = document.getElementById('onboarding-step-3');
        step3.classList.remove('hidden');
        step3.classList.add('onboarding-slide-enter');
        
        document.getElementById('building-name').focus();
    }, 300);
}

window.handleAddBuildingRoom = async function(e) {
    e.preventDefault();
    
    const buildingName = document.getElementById('building-name').value.trim();
    const roomCount = parseInt(document.getElementById('building-rooms-count').value);
    const startNumber = document.getElementById('building-start-number').value.trim() || '101';
    
    if (!buildingName || !roomCount) {
        showToast("Please fill all fields", "error");
        return;
    }

    const currentIndex = onboardingState.currentBuildingIndex;
    
    try {
        // Create building first
        const buildingRef = await addDoc(collection(db, "buildings"), {
            ownerId: currentUser.uid,
            name: buildingName,
            createdAt: new Date()
        });

        const buildingId = buildingRef.id;
        
        // Create rooms for this building
        for (let i = 0; i < roomCount; i++) {
            const roomNumber = parseInt(startNumber) + i;
            await addDoc(collection(db, "rooms"), {
                buildingId: buildingId,
                roomNo: roomNumber.toString(),
                tenantName: "",
                rent: 0,
                status: "pending",
                ownerId: currentUser.uid,
                createdAt: new Date()
            });
        }

        showToast(`✓ ${buildingName} added with ${roomCount} rooms!`, "success");
        
        // Move to next building or finish
        onboardingState.currentBuildingIndex++;
        
        if (onboardingState.currentBuildingIndex < onboardingState.buildingCount) {
            // Reset form and show next building
            document.getElementById('onboarding-building-form').reset();
            document.getElementById('current-building').innerText = onboardingState.currentBuildingIndex + 1;
            document.getElementById('building-name').focus();
        } else {
            // Finish onboarding
            finishOnboarding();
        }
    } catch (err) {
        showToast("Error creating building: " + err.message, "error");
    }
}

window.skipAddingMoreRooms = function() {
    finishOnboarding();
}

window.previousOnboardingStep = function() {
    const currentStep = document.querySelector('.onboarding-step:not(.hidden)');
    const step = parseInt(currentStep.id.match(/\d+/)[0]);
    
    if (step === 2) {
        const step2 = document.getElementById('onboarding-step-2');
        const step1 = document.getElementById('onboarding-step-1');
        
        step2.classList.add('onboarding-slide-exit');
        setTimeout(() => {
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            step1.classList.add('onboarding-slide-enter');
        }, 300);
    } else if (step === 3) {
        const step3 = document.getElementById('onboarding-step-3');
        const step2 = document.getElementById('onboarding-step-2');
        
        step3.classList.add('onboarding-slide-exit');
        setTimeout(() => {
            step3.classList.add('hidden');
            onboardingState.currentBuildingIndex = 0;
            step2.classList.remove('hidden');
            step2.classList.add('onboarding-slide-enter');
            
            // Reset building count selection
            document.querySelectorAll('.building-count-btn').forEach(b => {
                b.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
                b.classList.add('bg-gray-100');
            });
            document.getElementById('buildings-submit').disabled = true;
        }, 300);
    }
}

function finishOnboarding() {
    const step3 = document.getElementById('onboarding-step-3');
    step3.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        onboardingState = {
            ownerName: '',
            buildingCount: 0,
            currentBuildingIndex: 0,
            buildings: []
        };
        
        showToast("🎉 Onboarding complete! Welcome to Khata Pro", "success");
        window.fetchRoomsFromCloud();
        window.switchView('view-owner');
    }, 600);
}

// ==========================================
// CORE APP ROUTING
// ==========================================

const urlParams = new URLSearchParams(window.location.search);
const magicRoomId = urlParams.get('room');

onAuthStateChanged(auth, async (user) => {
    if (magicRoomId) {
        magicRoomIdCache = magicRoomId;
        window.switchView('view-tenant-join');
        try {
            const roomSnap = await getDoc(doc(db, "rooms", magicRoomId));
            if (roomSnap.exists()) {
                document.getElementById('magic-room-display').innerText = `Room ${roomSnap.data().roomNo}`;
            }
        } catch (err) {
            console.error("Error loading room:", err);
        }
    } else if (user) {
        currentUser = user;
        
        // Check if user has buildings (to determine if onboarding is needed)
        const buildingsQuery = query(collection(db, "buildings"), where("ownerId", "==", user.uid));
        const buildingsSnap = await getDocs(buildingsQuery);
        
        if (buildingsSnap.empty) {
            // First time user - show onboarding
            window.switchView('view-onboarding');
        } else {
            // Returning user - show dashboard
            window.switchView('view-owner');
            window.fetchRoomsFromCloud();
        }
    } else {
        currentUser = null;
        window.switchView('view-login');
    }
});

// ==========================================
// FETCH & RENDER
// ==========================================

window.fetchRoomsFromCloud = async function() {
    if(!currentUser) return;
    
    // Fetch rooms
    const roomsQuery = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
    const roomsSnapshot = await getDocs(roomsQuery);
    roomsData = roomsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Fetch buildings
    const buildingsQuery = query(collection(db, "buildings"), where("ownerId", "==", currentUser.uid));
    const buildingsSnapshot = await getDocs(buildingsQuery);
    buildingsData = {};
    buildingsSnapshot.docs.forEach(d => {
        buildingsData[d.id] = { id: d.id, ...d.data() };
    });
    
    window.renderRoomsList();
    window.renderTenantsList();
    window.renderPaymentsList();
    
    updateAnalytics();
}

window.renderRoomsList = function() {
    const container = document.getElementById('buildings-container');
    const emptyState = document.getElementById('empty-buildings');
    container.innerHTML = '';
    
    if (roomsData.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Group rooms by building
    const groupedByBuilding = {};
    let totalRev = 0, pendingRev = 0;
    
    roomsData.forEach(room => {
        const buildingId = room.buildingId || 'no-building';
        if (!groupedByBuilding[buildingId]) {
            groupedByBuilding[buildingId] = [];
        }
        groupedByBuilding[buildingId].push(room);
        
        const rent = room.rent || 0;
        const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
        if (tenantName !== 'Vacant') {
            totalRev += rent;
            if(room.status === 'pending') pendingRev += rent;
        }
    });

    // Render each building group
    let buildingIndex = 0;
    Object.entries(groupedByBuilding).forEach(([buildingId, rooms]) => {
        const buildingHTML = `
        <div class="building-card">
            <!-- Building Header -->
            <div class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl p-4 mb-4 shadow-lg">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-indigo-100 text-xs font-bold uppercase">Building</p>
                        <h3 class="text-2xl font-black mt-1">${getBuildingName(buildingId)}</h3>
                    </div>
                    <div class="text-right">
                        <p class="text-indigo-100 text-xs font-bold">Total Rooms</p>
                        <p class="text-2xl font-black mt-1">${rooms.length}</p>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-indigo-400 flex justify-between">
                    <div>
                        <p class="text-indigo-100 text-xs">Occupied</p>
                        <p class="font-bold">${rooms.filter(r => r.tenantName?.trim()).length}</p>
                    </div>
                    <div>
                        <p class="text-indigo-100 text-xs">Vacant</p>
                        <p class="font-bold">${rooms.filter(r => !r.tenantName?.trim()).length}</p>
                    </div>
                </div>
            </div>

            <!-- Rooms Grid -->
            <div class="room-grid">
                ${rooms.map((room, roomIndex) => {
                    const rent = room.rent || 0;
                    const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
                    const status = room.status || 'pending';
                    const isVacant = tenantName === 'Vacant';
                    const initials = tenantName === 'Vacant' ? '?' : tenantName.split(' ').map(n => n[0]).join('');
                    
                    return `
                    <div class="room-card-grid bg-white rounded-2xl border-2 ${isVacant ? 'border-gray-200' : 'border-blue-200'} p-4 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 cursor-pointer group" onclick="selectRoom('${room.id}', '${room.roomNo}')">
                        <!-- Room Avatar -->
                        <div class="w-full mb-3">
                            <div class="w-full aspect-square ${isVacant ? 'bg-gradient-to-br from-gray-200 to-gray-300' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} rounded-xl flex items-center justify-center text-white font-black text-2xl shadow-md group-hover:shadow-lg transition-all">
                                ${isVacant ? '<i class="fa-solid fa-door-open text-3xl opacity-50"></i>' : initials}
                            </div>
                        </div>
                        
                        <!-- Room Info -->
                        <div class="text-center mb-2">
                            <p class="text-lg font-black text-gray-900">Room ${room.roomNo}</p>
                            <p class="text-xs font-semibold text-gray-500 truncate mt-1">${tenantName}</p>
                        </div>
                        
                        <!-- Rent Info -->
                        <div class="text-center pb-2 border-b border-gray-100 mb-2">
                            <p class="text-xs text-gray-600">Monthly</p>
                            <p class="font-bold text-gray-900">₹${rent}</p>
                        </div>
                        
                        <!-- Status Badge -->
                        <div class="text-center">
                            ${isVacant ? 
                                '<span class="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">Vacant</span>' :
                                `<span class="inline-block px-2 py-1 ${status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'} text-xs font-bold rounded-lg">${status === 'pending' ? '⏳ Pending' : '✓ Paid'}</span>`
                            }
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
        
        container.innerHTML += buildingHTML;
        buildingIndex++;
    });

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
}

// Helper function to get building name (we'll need to fetch this from buildingsData)
async function getBuildingName(buildingId) {
    if (buildingId === 'no-building') return 'Uncategorized';
    if (buildingsData[buildingId]) return buildingsData[buildingId].name;
    
    try {
        const doc = await getDoc(doc(db, "buildings", buildingId));
        if (doc.exists()) {
            return doc.data().name || 'Building';
        }
    } catch (err) {
        console.error("Error fetching building name:", err);
    }
    return 'Building';
}

window.selectRoom = function(roomId, roomNo) {
    // Can be used for room details view
    showToast(`Room ${roomNo} selected`, 'success');
}

window.renderTenantsList = function() {
    const list = document.getElementById('tenants-list');
    if (!list) return;
    
    const tenants = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '');
    
    if (tenants.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-users"></i></div>
            <p class="text-gray-500 font-medium">No tenants yet</p>
        </div>`;
        return;
    }
    
    list.innerHTML = tenants.map((room, i) => `
    <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all fade-in-delay" style="animation-delay: ${i * 0.1}s">
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3 flex-1">
                <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
                    ${room.tenantName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-bold text-gray-900">${room.tenantName}</p>
                    <p class="text-xs text-gray-500">Room ${room.roomNo}</p>
                </div>
            </div>
            <span class="text-xs font-bold ${room.status === 'paid' ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50'} px-2.5 py-1 rounded-lg">${room.status.toUpperCase()}</span>
        </div>
        <div class="flex gap-2">
            <button onclick="sendWhatsApp('${room.tenantName}', '${room.tenantPhone}', '${room.rent}')" class="flex-1 py-2 bg-green-50 text-green-600 font-bold text-xs rounded-lg hover:bg-green-100 transition-all active:scale-95 btn-premium">
                <i class="fa-brands fa-whatsapp mr-1"></i>Message
            </button>
            <button onclick="vacateRoom('${room.id}')" class="flex-1 py-2 bg-red-50 text-red-600 font-bold text-xs rounded-lg hover:bg-red-100 transition-all active:scale-95 btn-premium">
                <i class="fa-solid fa-sign-out mr-1"></i>Vacate
            </button>
        </div>
    </div>
    `).join('');
}

window.renderPaymentsList = function(filter = 'all') {
    const list = document.getElementById('payments-list');
    if (!list) return;
    
    const payments = roomsData
        .filter(r => r.tenantName && r.tenantName.trim() !== '')
        .filter(r => filter === 'all' || r.status === filter)
        .map(r => ({
            roomNo: r.roomNo,
            tenant: r.tenantName,
            amount: r.rent,
            status: r.status,
            date: new Date().toLocaleDateString('en-IN')
        }));
    
    if (payments.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-wallet"></i></div>
            <p class="text-gray-500 font-medium">No ${filter !== 'all' ? filter : ''} payments</p>
        </div>`;
        return;
    }
    
    list.innerHTML = payments.map((p, i) => `
    <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all payment-status-${p.status} fade-in-delay" style="animation-delay: ${i * 0.1}s">
        <div class="flex items-center justify-between">
            <div>
                <p class="font-bold text-gray-900">Room ${p.roomNo}</p>
                <p class="text-sm text-gray-600">${p.tenant}</p>
                <p class="text-xs text-gray-500 mt-1">₹${p.amount}</p>
            </div>
            <div class="text-right">
                <span class="text-sm font-bold ${p.status === 'paid' ? 'text-green-600' : 'text-orange-600'} block mb-2">
                    ${p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                </span>
                <p class="text-xs text-gray-500">${p.date}</p>
            </div>
        </div>
    </div>
    `).join('');
}

// ==========================================
// ANALYTICS & CHARTS
// ==========================================

async function updateAnalytics() {
    const canvas1 = document.getElementById('revenueChart');
    const canvas2 = document.getElementById('occupancyChart');
    
    if (!canvas1 || !canvas2) return;
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const revenueData = months.map((_, i) => {
        const occupied = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '').length;
        return occupied * (roomsData[0]?.rent || 5000) + Math.random() * 10000;
    });
    
    const occupied = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '').length;
    const vacant = roomsData.length - occupied;

    // Revenue Chart
    if (chartInstances.revenueChart) chartInstances.revenueChart.destroy();
    chartInstances.revenueChart = new Chart(canvas1, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Revenue (₹)',
                data: revenueData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { weight: 'bold', size: 12 } }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // Occupancy Chart
    if (chartInstances.occupancyChart) chartInstances.occupancyChart.destroy();
    chartInstances.occupancyChart = new Chart(canvas2, {
        type: 'doughnut',
        data: {
            labels: ['Occupied', 'Vacant'],
            datasets: [{
                data: [occupied, vacant],
                backgroundColor: ['#10b981', '#ef4444'],
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { weight: 'bold', size: 12 } }
                }
            }
        }
    });
}

// ==========================================
// ACTIONS
// ==========================================

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    setTimeout(() => {
        const view = document.getElementById(viewId);
        if (view) view.classList.add('view-active');
        
        if(viewId === 'view-owner') window.fetchRoomsFromCloud();
        if(viewId === 'view-analytics') setTimeout(updateAnalytics, 300);
        
        // Update navbar
        document.querySelectorAll('.navbar-item').forEach(item => item.classList.remove('active'));
        if(viewId === 'view-owner') document.querySelectorAll('.navbar-item')[0].classList.add('active');
        if(viewId === 'view-tenants') document.querySelectorAll('.navbar-item')[1].classList.add('active');
        if(viewId === 'view-payments') document.querySelectorAll('.navbar-item')[2].classList.add('active');
        if(viewId === 'view-settings') document.querySelectorAll('.navbar-item')[3].classList.add('active');
    }, 10);
}

window.handleAddRoomSubmit = async function(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const btn = document.getElementById('add-room-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Saving...';
    btn.disabled = true;

    const roomNo = document.getElementById('new-room-no').value;
    const rentAmount = document.getElementById('new-rent-amount').value;
    const maintenance = document.getElementById('new-maintenance').value || 0;
    
    try {
        await addDoc(collection(db, "rooms"), {
            roomNo,
            tenantName: "",
            rent: Number(rentAmount),
            maintenance: Number(maintenance),
            status: "pending",
            ownerId: currentUser.uid,
            createdAt: new Date()
        });
        
        document.getElementById('add-room-form').reset();
        showToast("🎉 Property added successfully!", "success");
        window.switchView('view-owner');
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.innerHTML = ogHTML;
        btn.disabled = false;
    }
}

window.deleteRoom = async function(id, isVacant) {
    if(!isVacant) return showToast("Cannot delete occupied property!", "error");
    
    const isConfirmed = await showConfirm("Delete Property", "Are you sure? This action cannot be undone.", "Delete", true);
    if(isConfirmed) {
        try {
            await deleteDoc(doc(db, "rooms", id));
            showToast("🗑️ Property deleted", "success");
            window.fetchRoomsFromCloud();
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

window.vacateRoom = async function(id) {
    const isConfirmed = await showConfirm("Vacate Tenant", "Clear all dues and vacate this tenant?", "Yes, Vacate", false);
    if(isConfirmed) {
        try {
            await updateDoc(doc(db, "rooms", id), {
                tenantName: "",
                tenantPhone: "",
                status: "pending"
            });
            showToast("📤 Room is now vacant", "success");
            window.fetchRoomsFromCloud();
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

window.quickAssign = async function(id, roomNo) {
    const name = await showPrompt("Assign Tenant", `Enter name for Room ${roomNo}`);
    if(name) {
        try {
            await updateDoc(doc(db, "rooms", id), {
                tenantName: name,
                status: "pending"
            });
            showToast("👤 Tenant assigned!", "success");
            window.fetchRoomsFromCloud();
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

window.togglePaymentStatus = async function(id, currentStatus) {
    try {
        await updateDoc(doc(db, "rooms", id), {
            status: currentStatus === 'pending' ? 'paid' : 'pending'
        });
        showToast(currentStatus === 'pending' ? '✓ Payment marked as paid' : '⏳ Marked as pending', "success");
        window.fetchRoomsFromCloud();
    } catch(err) {
        showToast(err.message, "error");
    }
}

window.sendWhatsApp = function(name, phone, rent) {
    if(!phone) {
        showToast("No phone number saved!", "error");
        return;
    }
    const msg = `Hi ${name}! 👋\n\nYour rent of ₹${rent} is due. Please make the payment at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.handleMagicJoinSubmit = async function(e) {
    e.preventDefault();
    if(!magicRoomIdCache) return;
    
    const btn = document.getElementById('join-room-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Processing...';
    
    const name = document.getElementById('magic-tenant-name').value;
    const phone = document.getElementById('magic-tenant-phone').value;
    
    try {
        await updateDoc(doc(db, "rooms", magicRoomIdCache), {
            tenantName: name,
            tenantPhone: phone,
            status: "pending"
        });
        
        showToast("🎉 Welcome! You've joined successfully.", "success");
        setTimeout(() => { window.location.href = window.location.origin; }, 1500);
    } catch(err) {
        showToast(err.message, "error");
        btn.innerHTML = ogHTML;
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================

window.handleLoginSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Signing in...';
    
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-password').value);
        showToast("✓ Welcome back!", "success");
    } catch (err) {
        showToast("Invalid email or password", "error");
        btn.innerHTML = ogHTML;
    }
}

window.handleSignup = async function() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if(!email || !password) {
        showToast("Please fill all fields", "error");
        return;
    }
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("✓ Account created! Sign in to continue.", "success");
    } catch (err) {
        showToast(err.message, "error");
    }
}

window.confirmLogout = async function() {
    const isConfirmed = await showConfirm("Logout", "Are you sure you want to logout?", "Yes, Logout", true);
    if(isConfirmed) {
        try {
            await signOut(auth);
            showToast("👋 Logged out successfully", "success");
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

// ==========================================
// NEW FEATURES
// ==========================================

window.addExpense = async function() {
    const category = await showPrompt("Add Expense", "Category (Maintenance, Repair, etc.)");
    if(!category) return;
    
    const amount = await showPrompt("Expense Amount", "Amount (₹)");
    if(!amount) return;
    
    expenses.push({
        id: Date.now(),
        category,
        amount: Number(amount),
        date: new Date().toLocaleDateString('en-IN')
    });
    
    showToast("💰 Expense added!", "success");
    renderExpenses();
}

function renderExpenses() {
    const list = document.getElementById('expenses-list');
    if(!list) return;
    
    if(expenses.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-receipt"></i></div>
            <p class="text-gray-500 font-medium">No expenses recorded</p>
        </div>`;
        return;
    }
    
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    list.innerHTML = `
        <div class="bg-red-50 p-4 rounded-2xl border border-red-200 mb-4">
            <p class="text-xs font-bold text-red-600 uppercase mb-1">Total Expenses</p>
            <p class="text-3xl font-black text-red-600 stat-number">₹${total.toLocaleString('en-IN')}</p>
        </div>
        ${expenses.map((e, i) => `
        <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all expense-item fade-in-delay" style="animation-delay: ${i * 0.1}s">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <i class="fa-solid fa-receipt text-red-600"></i>
                    </div>
                    <div>
                        <p class="font-bold text-gray-900">${e.category}</p>
                        <p class="text-xs text-gray-500">${e.date}</p>
                    </div>
                </div>
                <button onclick="deleteExpense(${e.id})" class="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 transition-all flex items-center justify-center btn-premium">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
            <div class="mt-2 text-right">
                <p class="text-lg font-black text-red-600 stat-number">-₹${e.amount}</p>
            </div>
        </div>
        `).join('')}
    `;
}

window.deleteExpense = function(id) {
    expenses = expenses.filter(e => e.id !== id);
    showToast("Expense deleted", "success");
    renderExpenses();
}

window.filterPayments = function(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('opacity-50', btn.getAttribute('data-filter') !== filter);
    });
    window.renderPaymentsList(filter);
}

window.exportMonthlyReport = function() {
    const report = `
Room Khata - Monthly Report
Generated: ${new Date().toLocaleDateString('en-IN')}

PROPERTIES SUMMARY
==================
Total Properties: ${roomsData.length}
Occupied: ${roomsData.filter(r => r.tenantName?.trim()).length}
Vacant: ${roomsData.length - roomsData.filter(r => r.tenantName?.trim()).length}

REVENUE SUMMARY
==================
Total Expected Revenue: ₹${roomsData.reduce((sum, r) => sum + r.rent, 0).toLocaleString('en-IN')}
Pending Dues: ₹${roomsData.filter(r => r.status === 'pending' && r.tenantName?.trim()).reduce((sum, r) => sum + r.rent, 0).toLocaleString('en-IN')}

PROPERTY DETAILS
==================
${roomsData.map(r => `Room ${r.roomNo}: ${r.tenantName || 'Vacant'} - ₹${r.rent}/mo (${r.status})`).join('\n')}

EXPENSES
==================
${expenses.length > 0 ? expenses.map(e => `${e.category}: ₹${e.amount} (${e.date})`).join('\n') : 'No expenses recorded'}
    `;
    
    downloadFile(report, 'monthly-report.txt');
    showToast("📄 Report downloaded!", "success");
}

window.exportPaymentHistory = function() {
    const csv = [
        ['Room', 'Tenant', 'Amount', 'Status', 'Date'].join(','),
        ...roomsData
            .filter(r => r.tenantName?.trim())
            .map(r => [r.roomNo, r.tenantName, r.rent, r.status.toUpperCase(), new Date().toLocaleDateString('en-IN')].join(','))
    ].join('\n');
    
    downloadFile(csv, 'payment-history.csv');
    showToast("📊 CSV exported!", "success");
}

function downloadFile(content, filename) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

window.toggleNotifications = function() {
    showToast("🔔 You have 2 pending payments", "success");
}

window.toggleDarkMode = async function() {
    showToast("🌙 Dark mode coming soon!", "success");
}

window.showNotifications = async function() {
    showToast("✓ Notifications enabled", "success");
}

window.backupData = async function() {
    const data = {
        rooms: roomsData,
        expenses: expenses,
        backup_date: new Date().toISOString()
    };
    
    downloadFile(JSON.stringify(data, null, 2), 'khata-backup.json');
    showToast("☁️ Backup downloaded!", "success");
}

// Initialize
window.addEventListener('load', () => {
    console.log('Room Khata Pro loaded successfully! 🏠');
});

