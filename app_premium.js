import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where, getDoc, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
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

// ==========================================
// GLOBAL STATE
// ==========================================
let roomsData = [];
let buildingsData = {};
let currentUser = null;
let ownerProfile = {};
let tenantRoomData = null;
let tenantUnsubscribe = null;
let selectedComplaintType = '';
let selectedPriority = 'medium';
let tenantRoomId = null;
let ownerComplaintsUnsubscribe = null;
let ownerVerificationsUnsubscribe = null;

// ==========================================
// TRANSLATIONS (Complete Hindi/English)
// ==========================================
const TRANSLATIONS = {
  en: {
    // Navigation
    settings: 'Settings',
    editProfile: 'Edit Profile',
    logout: 'Logout',
    notifications: 'Notifications',
    noNotifications: 'No new notifications',
    
    // Owner Dashboard
    welcomeBack: 'Welcome back',
    dashboardSubtitle: 'Manage your properties with ease',
    totalRevenue: 'Total Revenue',
    pendingDues: 'Pending Dues',
    thisMonth: 'This month',
    quickActions: 'Quick Actions',
    addBuilding: 'Add Building',
    remindAllPending: 'Remind All Pending',
    yourBuildings: 'Your Buildings',
    tenantComplaints: 'Tenant Complaints',
    
    // Tenant Dashboard
    tenancyDetails: 'Your Tenancy Details',
    room: 'Room',
    building: 'Building',
    moveInDate: 'Move-in Date',
    securityDeposit: 'Security Deposit',
    amountDue: 'Amount Due',
    payRent: 'Pay Rent',
    raiseComplaint: 'Raise Complaint',
    paymentHistory: 'Payment History',
    
    // UPI Modal
    scanWithUpi: 'Scan with any UPI app',
    orPayWith: 'Or pay with',
    afterPaymentNote: 'After payment, your landlord will confirm & update your status.',
    
    // Complaint Modal
    typeOfIssue: 'Type of Issue',
    describeIssue: 'Describe the Issue',
    priority: 'Priority',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    
    // Buttons
    cancel: 'Cancel',
    submit: 'Submit',
    save: 'Save'
  },
  hi: {
    // Navigation
    settings: 'सेटिंग्स',
    editProfile: 'प्रोफाइल बदलें',
    logout: 'बाहर जाएं',
    notifications: 'सूचनाएं',
    noNotifications: 'कोई सूचना नहीं',
    
    // Owner Dashboard
    welcomeBack: 'वापसी पर स्वागत',
    dashboardSubtitle: 'अपनी सभी प्रॉपर्टीज़ को आसानी से संभालें',
    totalRevenue: 'कुल कमाई',
    pendingDues: 'बाकी पैसे',
    thisMonth: 'इस महीने',
    quickActions: 'जरूरी काम',
    addBuilding: 'बिल्डिंग जोड़ें',
    remindAllPending: 'सभी बकाया को याद दिलाएं',
    yourBuildings: 'आपकी बिल्डिंग्स',
    tenantComplaints: 'शिकायतें',
    
    // Tenant Dashboard
    tenancyDetails: 'आपकी किरायेदारी की जानकारी',
    room: 'कमरा',
    building: 'बिल्डिंग',
    moveInDate: 'आने की तारीख',
    securityDeposit: 'सिक्योरिटी जमा',
    amountDue: 'बकाया',
    payRent: 'किराया दें',
    raiseComplaint: 'शिकायत करें',
    paymentHistory: 'पेमेंट हिस्ट्री',
    
    // UPI Modal
    scanWithUpi: 'किसी भी UPI ऐप से स्कैन करें',
    orPayWith: 'या इससे दें',
    afterPaymentNote: 'पेमेंट के बाद मकान मालिक चेक करके आपका स्टेटस अपडेट करेगा।',
    
    // Complaint Modal
    typeOfIssue: 'समस्या का प्रकार',
    describeIssue: 'समस्या बताएं',
    priority: 'कितना जरूरी',
    low: 'कम',
    medium: 'ठीक-ठाक',
    high: 'बहुत जरूरी',
    
    // Buttons
    cancel: 'रद्द करें',
    submit: 'भेजें',
    save: 'सेव करें'
  }
};

let currentLanguage = localStorage.getItem('rkp_lang') || 'en';

// ==========================================
// LANGUAGE & TRANSLATION FUNCTIONS
// ==========================================

function applyLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('rkp_lang', lang);
  const t = TRANSLATIONS[lang];

  // Update all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) {
      // Only update if it's the direct text (not containing child elements with important content)
      if (el.children.length === 0) {
        el.textContent = t[key];
      } else if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
        // Text node only
        el.textContent = t[key];
      }
    }
  });
}

window.toggleLanguage = function() {
  const newLang = currentLanguage === 'en' ? 'hi' : 'en';
  applyLanguage(newLang);
  showToast(newLang === 'hi' ? '🇮🇳 हिंदी में बदला गया' : '🌐 Switched to English', 'success');
};

// ==========================================
// FIREBASE INITIALIZATION & AUTH
// ==========================================

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await loadOwnerProfile(user.uid);
    await checkTenantAccess();
    if (!tenantRoomId) {
      switchView('view-owner');
      subscribeToOwnerInbox();
      await fetchRoomsFromCloud();
    } else {
      switchView('view-tenant');
      subscribeTenantRoom();
    }
  } else {
    switchView('view-login');
  }
});

async function loadOwnerProfile(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'ownerProfiles', uid));
    ownerProfile = docSnap.exists() ? docSnap.data() : { name: 'Owner', address: '', upiId: '' };
    
    // Update UI immediately
    const greetingEl = document.getElementById('owner-greeting-name');
    if (greetingEl) {
      greetingEl.textContent = (ownerProfile.name || 'Owner').split(' ')[0];
    }
  } catch (err) {
    console.error('Error loading profile:', err);
    ownerProfile = { name: 'Owner', address: '', upiId: '' };
  }
}

async function checkTenantAccess() {
  if (!currentUser) return;
  try {
    const q = query(collection(db, 'rooms'), where('tenantUid', '==', currentUser.uid), limit(1));
    const snap = await getDocs(q);
    if (snap.size > 0) {
      tenantRoomId = snap.docs[0].id;
      tenantRoomData = { id: tenantRoomId, ...snap.docs[0].data() };
    }
  } catch (err) {
    console.error('Error checking tenant access:', err);
  }
}

// ==========================================
// ANTI-FLICKERING ROOM RENDERING (FIXED)
// ==========================================

window.fetchRoomsFromCloud = async function() {
  if (!currentUser) return;
  
  try {
    // Fetch buildings
    const buildingsQ = query(collection(db, 'buildings'), where('ownerId', '==', currentUser.uid));
    const buildingsSnap = await getDocs(buildingsQ);
    buildingsData = {};
    buildingsSnap.docs.forEach(doc => {
      buildingsData[doc.id] = { id: doc.id, ...doc.data() };
    });

    // Fetch rooms
    const roomsQ = query(collection(db, 'rooms'), where('ownerId', '==', currentUser.uid));
    const roomsSnap = await getDocs(roomsQ);
    roomsData = roomsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    window.renderRoomsList();
  } catch (err) {
    console.error('Error fetching rooms:', err);
  }
};

window.renderRoomsList = function() {
  const container = document.getElementById('buildings-container');
  if (!container) return;

  // Build entire HTML string first (anti-flickering)
  let htmlString = '';
  const groupedByBuilding = {};

  // Group rooms by building
  roomsData.forEach(room => {
    const bId = room.buildingId || 'no-building';
    if (!groupedByBuilding[bId]) groupedByBuilding[bId] = [];
    groupedByBuilding[bId].push(room);
  });

  // Calculate totals
  let totalRev = 0, pendingRev = 0;

  // Build HTML for all buildings
  Object.entries(groupedByBuilding).forEach(([buildingId, rooms]) => {
    const building = buildingsData[buildingId];
    const bName = building?.name || 'Building';
    
    let roomsHtml = '';
    rooms.forEach(room => {
      const rent = room.rent || 0;
      const tenantName = room.tenantName?.trim() || 'Vacant';
      const status = room.status || 'pending';
      const isVacant = !room.tenantName?.trim();

      if (!isVacant) {
        totalRev += rent;
        if (status === 'pending') pendingRev += rent;
      }

      // Build status badge based on status
      let statusBadgeClass = 'payment-badge-pending';
      let statusText = '⏳ Pending';
      let actionButton = '';

      if (status === 'paid') {
        statusBadgeClass = 'payment-badge-paid';
        statusText = '✓ Paid';
      } else if (status === 'pending_verification') {
        statusBadgeClass = 'payment-badge-verification';
        statusText = '👀 Verify';
        actionButton = `<button onclick="approvePaymentVerification('${room.id}', ${rent})" class="mt-2 w-full py-2 px-3 bg-purple-500 text-white font-bold text-xs rounded-lg hover:bg-purple-600 active:scale-95 transition-all">
          Verify & Approve
        </button>`;
      } else if (isVacant) {
        statusBadgeClass = 'payment-badge';
        statusText = '🏚️ Vacant';
      }

      roomsHtml += `
        <div class="room-card glass rounded-2xl p-4 stagger-item">
          <div class="flex justify-between items-start mb-3">
            <div>
              <p class="font-black text-gray-900">Room ${room.roomNo}</p>
              <p class="text-xs text-gray-500 mt-1">${tenantName}</p>
            </div>
            <span class="payment-badge ${statusBadgeClass} text-xs">${statusText}</span>
          </div>
          <p class="text-sm font-bold text-gray-900 mb-2">₹${rent}</p>
          ${actionButton}
          <div class="mt-2 flex gap-2">
            <button onclick="editRoom('${room.id}')" class="flex-1 py-2 px-2 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg hover:bg-blue-100 transition-all">
              ✏️ Edit
            </button>
            <button onclick="deleteRoom('${room.id}')" class="flex-1 py-2 px-2 bg-red-50 text-red-600 font-bold text-xs rounded-lg hover:bg-red-100 transition-all">
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
    });

    htmlString += `
      <div class="space-y-3">
        <div class="flex justify-between items-center">
          <h3 class="font-bold text-gray-900">${bName}</h3>
          <div class="flex gap-2">
            <button onclick="editBuilding('${buildingId}')" class="px-3 py-1 bg-blue-50 text-blue-600 font-bold text-xs rounded-lg">✏️</button>
            <button onclick="deleteBuilding('${buildingId}')" class="px-3 py-1 bg-red-50 text-red-600 font-bold text-xs rounded-lg">🗑️</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${roomsHtml}
        </div>
      </div>
    `;
  });

  // Set innerHTML ONCE (prevents flickering)
  container.innerHTML = htmlString || '<p class="text-center text-gray-500 py-8">No buildings yet. Add one to get started!</p>';

  // Update dashboard numbers
  const revEl = document.getElementById('total-revenue');
  const pendEl = document.getElementById('pending-dues');
  if (revEl) revEl.textContent = totalRev;
  if (pendEl) pendEl.textContent = pendingRev;

  // Trigger new animations on elements
  setTimeout(() => {
    document.querySelectorAll('.stagger-item').forEach((el, i) => {
      el.style.animationDelay = `${i * 0.05}s`;
    });
  }, 0);
};

// ==========================================
// NOTIFICATION DROPDOWN (NEW)
// ==========================================

window.toggleNotificationDropdown = function() {
  const dropdown = document.getElementById('notification-dropdown');
  if (!dropdown) return;
  
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    dropdown.classList.add('scale-in-slow');
    updateNotificationDropdown();
  } else {
    dropdown.classList.add('hidden');
    dropdown.classList.remove('scale-in-slow');
  }
};

function updateNotificationDropdown() {
  const list = document.getElementById('notification-list');
  const badge = document.getElementById('notification-badge');
  if (!list) return;

  let totalCount = 0;
  let notificationsHtml = '';

  // Add pending verifications
  const pendingVerifications = roomsData.filter(r => r.status === 'pending_verification');
  if (pendingVerifications.length > 0) {
    totalCount += pendingVerifications.length;
    pendingVerifications.forEach(room => {
      notificationsHtml += `
        <div class="p-3 hover:bg-blue-50 cursor-pointer transition-all" onclick="approvePaymentVerification('${room.id}', ${room.rent || 0})">
          <p class="font-bold text-xs text-gray-900">Room ${room.roomNo} · Payment Pending</p>
          <p class="text-xs text-gray-500 mt-1">₹${room.rent || 0} awaiting verification</p>
        </div>
      `;
    });
  }

  // Add open complaints
  // Note: This would need to be populated from ownerInboxState.openComplaints
  // For now, we'll show a placeholder

  // Update UI
  if (totalCount === 0) {
    notificationsHtml = '<p class="p-4 text-center text-gray-500 text-sm" data-i18n="noNotifications">No new notifications</p>';
  }

  list.innerHTML = notificationsHtml;

  // Update badge
  if (badge) {
    if (totalCount > 0) {
      badge.textContent = totalCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

// Subscribe to real-time updates for notifications
function subscribeToOwnerInbox() {
  if (!currentUser) return;

  // Verifications listener
  if (ownerVerificationsUnsubscribe) ownerVerificationsUnsubscribe();
  const verifyQ = query(
    collection(db, 'rooms'),
    where('ownerId', '==', currentUser.uid),
    where('status', '==', 'pending_verification')
  );
  ownerVerificationsUnsubscribe = onSnapshot(verifyQ, () => {
    updateNotificationDropdown();
    window.renderRoomsList();
  });

  // Complaints listener
  if (ownerComplaintsUnsubscribe) ownerComplaintsUnsubscribe();
  const complaintsQ = query(
    collection(db, 'complaints'),
    where('ownerId', '==', currentUser.uid),
    where('status', '==', 'open')
  );
  ownerComplaintsUnsubscribe = onSnapshot(complaintsQ, () => {
    updateNotificationDropdown();
  });
}

// ==========================================
// PAYMENT VERIFICATION FUNCTIONS
// ==========================================

window.approvePaymentVerification = async function(roomId, amount) {
  if (!currentUser) return;

  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'paid',
      paymentVerifiedAt: new Date().toISOString(),
      paymentVerifiedBy: currentUser.uid
    });

    showToast('✓ Payment verified and approved!', 'success');
    await window.fetchRoomsFromCloud();
    
    // Close dropdown
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// ROOM MANAGEMENT FUNCTIONS
// ==========================================

window.editRoom = function(roomId) {
  const room = roomsData.find(r => r.id === roomId);
  if (!room) return;
  
  // Create simple edit modal dynamically (or use prompt for MVP)
  const newRent = prompt(`Edit rent for Room ${room.roomNo}:`, room.rent || 0);
  if (newRent === null) return;

  updateDoc(doc(db, 'rooms', roomId), { rent: parseInt(newRent) || 0 })
    .then(() => {
      showToast('✓ Room updated!', 'success');
      window.fetchRoomsFromCloud();
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.deleteRoom = async function(roomId) {
  if (!confirm('Delete this room? This cannot be undone.')) return;
  
  try {
    await deleteDoc(doc(db, 'rooms', roomId));
    showToast('✓ Room deleted!', 'success');
    await window.fetchRoomsFromCloud();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

window.editBuilding = function(buildingId) {
  const building = buildingsData[buildingId];
  if (!building) return;
  
  const newName = prompt(`Edit building name:`, building.name || '');
  if (newName === null) return;

  updateDoc(doc(db, 'buildings', buildingId), { name: newName })
    .then(() => {
      showToast('✓ Building updated!', 'success');
      window.fetchRoomsFromCloud();
    })
    .catch(err => showToast('Error: ' + err.message, 'error'));
};

window.deleteBuilding = async function(buildingId) {
  const building = buildingsData[buildingId];
  const roomCount = roomsData.filter(r => r.buildingId === buildingId).length;
  
  if (!confirm(`Delete "${building?.name}" and its ${roomCount} rooms? This cannot be undone.`)) return;

  try {
    // Delete building
    await deleteDoc(doc(db, 'buildings', buildingId));
    
    // Delete all rooms in building
    const roomsToDelete = roomsData.filter(r => r.buildingId === buildingId);
    for (const room of roomsToDelete) {
      await deleteDoc(doc(db, 'rooms', room.id));
    }

    showToast('✓ Building deleted!', 'success');
    await window.fetchRoomsFromCloud();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// ADD BUILDING LOGIC
// ==========================================

window.openAddBuildingModal = function() {
  const modal = document.getElementById('add-building-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('ab-name')?.focus(), 100);
};

window.closeAddBuildingModal = function() {
  const modal = document.getElementById('add-building-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.submitAddBuilding = async function(event) {
  if (event) event.preventDefault();
  
  const name = document.getElementById('ab-name')?.value.trim();
  const roomCount = parseInt(document.getElementById('ab-rooms')?.value) || 0;
  const startNo = document.getElementById('ab-start')?.value.trim() || '101';
  const rent = parseInt(document.getElementById('ab-rent')?.value) || 0;

  if (!name) { showToast('Building name required', 'error'); return; }
  if (roomCount < 1) { showToast('At least 1 room required', 'error'); return; }
  if (!currentUser) return;

  try {
    const buildingRef = await addDoc(collection(db, 'buildings'), {
      ownerId: currentUser.uid,
      name,
      createdAt: new Date().toISOString()
    });

    // Create rooms
    const startNum = parseInt(startNo) || 101;
    for (let i = 0; i < roomCount; i++) {
      const roomNoStr = isNaN(parseInt(startNo)) ? `${startNo}${i + 1}` : (startNum + i).toString();
      await addDoc(collection(db, 'rooms'), {
        buildingId: buildingRef.id,
        ownerId: currentUser.uid,
        roomNo: roomNoStr,
        rent,
        tenantName: '',
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    }

    showToast(`✓ ${name} created with ${roomCount} rooms!`, 'success');
    closeAddBuildingModal();
    await window.fetchRoomsFromCloud();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// REMINDER FUNCTION
// ==========================================

window.generateReminder = function() {
  const pendingRooms = roomsData.filter(r => r.status === 'pending' && r.tenantName?.trim());
  
  if (pendingRooms.length === 0) {
    showToast('No pending payments to remind!', 'info');
    return;
  }

  let reminderText = '📋 PENDING PAYMENT REMINDERS\n\n';
  pendingRooms.forEach(room => {
    reminderText += `Room ${room.roomNo} - ${room.tenantName || 'Tenant'}: ₹${room.rent || 0}\n`;
  });

  // Copy to clipboard
  navigator.clipboard.writeText(reminderText).then(() => {
    showToast('✓ Reminder copied! Paste in WhatsApp', 'success');
  }).catch(() => {
    // Fallback
    alert(reminderText);
  });
};

// ==========================================
// COMPLAINT FUNCTIONS
// ==========================================

window.openComplaintModal = function() {
  const modal = document.getElementById('complaint-modal');
  if (!modal) return;
  selectedComplaintType = '';
  selectedPriority = 'medium';
  document.getElementById('complaint-desc').value = '';
  document.getElementById('complaint-char-count').textContent = '0 / 300';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeComplaintModal = function() {
  const modal = document.getElementById('complaint-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.selectComplaintType = function(type) {
  selectedComplaintType = type;
  document.querySelectorAll('.complaint-type-btn').forEach(btn => {
    btn.classList.toggle('bg-blue-200', btn.dataset.type === type);
    btn.classList.toggle('bg-gray-100', btn.dataset.type !== type);
  });
};

window.selectPriority = function(priority) {
  selectedPriority = priority;
  document.querySelectorAll('.priority-btn').forEach(btn => {
    btn.classList.toggle('bg-blue-500', btn.dataset.priority === priority);
    btn.classList.toggle('text-white', btn.dataset.priority === priority);
    btn.classList.toggle('bg-gray-100', btn.dataset.priority !== priority);
    btn.classList.toggle('text-gray-900', btn.dataset.priority !== priority);
  });
};

window.submitComplaint = async function(event) {
  event.preventDefault();
  
  if (!selectedComplaintType) { showToast('Please select issue type', 'error'); return; }
  if (!tenantRoomData) return;

  const desc = document.getElementById('complaint-desc').value.trim();
  if (!desc) { showToast('Please describe the issue', 'error'); return; }

  try {
    await addDoc(collection(db, 'complaints'), {
      ownerId: tenantRoomData.ownerId,
      tenantUid: currentUser.uid,
      roomNo: tenantRoomData.roomNo,
      tenantName: tenantRoomData.tenantName,
      type: selectedComplaintType,
      description: desc,
      priority: selectedPriority,
      status: 'open',
      createdAt: new Date().toISOString()
    });

    showToast('✓ Complaint submitted! We will look into it.', 'success');
    closeComplaintModal();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// UPI MODAL (TENANT)
// ==========================================

window.openUpiModal = function() {
  const modal = document.getElementById('upi-modal');
  if (!modal) return;
  if (tenantRoomData) {
    const amountEl = document.getElementById('upi-amount');
    const amount = tenantRoomData.balanceDue || tenantRoomData.rent || 0;
    if (amountEl) amountEl.textContent = amount;
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeUpiModal = function() {
  const modal = document.getElementById('upi-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.openUpiApp = async function(appName) {
  if (!tenantRoomData || !currentUser) return;

  const amount = tenantRoomData.balanceDue || tenantRoomData.rent || 0;

  try {
    // Update status to pending_verification
    await updateDoc(doc(db, 'rooms', tenantRoomData.id), {
      status: 'pending_verification',
      paymentInitiatedAt: new Date().toISOString(),
      paymentInitiatedBy: currentUser.uid,
      paymentApp: appName,
      paymentAmount: amount
    });

    // Log to paymentHistory
    await addDoc(collection(db, 'paymentHistory'), {
      roomId: tenantRoomData.id,
      ownerId: tenantRoomData.ownerId,
      tenantUid: currentUser.uid,
      tenantName: tenantRoomData.tenantName,
      roomNo: tenantRoomData.roomNo,
      amount,
      status: 'pending_verification',
      initiatedAt: new Date().toISOString()
    });

    showToast('✓ Payment initiated! Your landlord will verify soon.', 'success');
    closeUpiModal();

    // Try to open UPI app
    const upiUrls = {
      gpay: `tez://upi/pay?pa=${ownerProfile.upiId || 'owner@upi'}&pn=RentPayment&am=${amount}&cu=INR`,
      phonepe: `phonepe://pay?pa=${ownerProfile.upiId || 'owner@upi'}&pn=RentPayment&am=${amount}&cu=INR`,
      paytm: `paytmmp://pay?pa=${ownerProfile.upiId || 'owner@upi'}&pn=RentPayment&am=${amount}&cu=INR`
    };

    if (upiUrls[appName]) {
      window.location.href = upiUrls[appName];
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// TENANT ROOM SUBSCRIPTION
// ==========================================

function subscribeTenantRoom() {
  if (!tenantRoomId || tenantUnsubscribe) return;

  tenantUnsubscribe = onSnapshot(doc(db, 'rooms', tenantRoomId), (docSnap) => {
    if (docSnap.exists()) {
      tenantRoomData = { id: docSnap.id, ...docSnap.data() };
      renderTenantView();
    }
  });
}

function renderTenantView() {
  if (!tenantRoomData) return;

  // Update room info
  const roomNoEl = document.getElementById('tenant-room-no');
  const buildingEl = document.getElementById('tenant-building-name');
  const moveInEl = document.getElementById('tenant-move-in-date');
  const depositEl = document.getElementById('tenant-deposit');
  const dueEl = document.getElementById('tenant-amount-due');

  if (roomNoEl) roomNoEl.textContent = tenantRoomData.roomNo || '—';
  if (buildingEl) buildingEl.textContent = (buildingsData[tenantRoomData.buildingId]?.name) || 'Building';
  if (moveInEl) moveInEl.textContent = tenantRoomData.moveInDate || '—';
  if (depositEl) depositEl.textContent = tenantRoomData.securityDeposit ? `₹${tenantRoomData.securityDeposit}` : '₹—';
  if (dueEl) dueEl.textContent = tenantRoomData.balanceDue || tenantRoomData.rent || 0;
}

// ==========================================
// PROFILE MANAGEMENT
// ==========================================

window.openEditProfileModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;
  
  document.getElementById('ep-name').value = ownerProfile.name || '';
  document.getElementById('ep-address').value = ownerProfile.address || '';
  document.getElementById('ep-upi').value = ownerProfile.upiId || '';
  
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeEditProfileModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.saveOwnerProfile = async function(event) {
  event.preventDefault();
  
  const name = document.getElementById('ep-name')?.value.trim();
  const address = document.getElementById('ep-address')?.value.trim();
  const upiId = document.getElementById('ep-upi')?.value.trim();

  if (!name) { showToast('Name required', 'error'); return; }
  if (!currentUser) return;

  try {
    await setDoc(doc(db, 'ownerProfiles', currentUser.uid), {
      uid: currentUser.uid,
      name,
      address: address || '',
      upiId: upiId || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    ownerProfile = { ...ownerProfile, name, address, upiId };
    
    const greetingEl = document.getElementById('owner-greeting-name');
    if (greetingEl) greetingEl.textContent = name.split(' ')[0];

    closeEditProfileModal();
    showToast('✓ Profile updated!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// UI NAVIGATION
// ==========================================

window.switchView = function(viewId) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));
  const view = document.getElementById(viewId);
  if (view) view.classList.remove('hidden');
};

window.openMenu = function() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeSettingsModal = function() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.logout = async function() {
  try {
    if (tenantUnsubscribe) tenantUnsubscribe();
    if (ownerVerificationsUnsubscribe) ownerVerificationsUnsubscribe();
    if (ownerComplaintsUnsubscribe) ownerComplaintsUnsubscribe();
    
    await signOut(auth);
    currentUser = null;
    tenantRoomId = null;
    switchView('view-login');
    showToast('✓ Logged out!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

window.showToast = function(message, type = 'info') {
  const toast = document.createElement('div');
  const bgColor = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[type] || 'bg-gray-500';

  toast.className = `fixed bottom-6 left-4 right-4 sm:left-6 sm:right-6 ${bgColor} text-white p-4 rounded-2xl font-bold text-sm z-50 animate-slideInRight`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// ==========================================
// INITIALIZE ON LOAD
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  applyLanguage(currentLanguage);
  
  // Textarea char counter
  const textarea = document.getElementById('complaint-desc');
  if (textarea) {
    textarea.addEventListener('input', function() {
      const count = Math.min(this.value.length, 300);
      const counterEl = document.getElementById('complaint-char-count');
      if (counterEl) counterEl.textContent = `${count} / 300`;
      this.value = this.value.substring(0, 300);
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#notification-dropdown') && !e.target.closest('[onclick*="toggleNotification"]')) {
      const dropdown = document.getElementById('notification-dropdown');
      if (dropdown) dropdown.classList.add('hidden');
    }
  });
});
