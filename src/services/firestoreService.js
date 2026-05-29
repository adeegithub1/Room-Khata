import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase.js';
import { generateConnectionCode } from '../lib/codes.js';

export const collections = {
  buildings: 'buildings',
  rooms: 'rooms',
  expenses: 'expenses',
  users: 'users'
};

export function ownerBuildingsQuery(ownerId) {
  return query(collection(db, collections.buildings), where('ownerId', '==', ownerId), orderBy('createdAt', 'desc'));
}

export function ownerRoomsQuery(ownerId) {
  return query(collection(db, collections.rooms), where('ownerId', '==', ownerId), orderBy('createdAt', 'desc'));
}

export function buildingRoomsQuery(buildingId) {
  return query(collection(db, collections.rooms), where('buildingId', '==', buildingId), orderBy('createdAt', 'desc'));
}

export function ownerExpensesQuery(ownerId) {
  return query(collection(db, collections.expenses), where('ownerId', '==', ownerId), orderBy('date', 'desc'));
}

export function tenantRoomQuery(uid) {
  return query(collection(db, collections.rooms), where('tenantUid', '==', uid), limit(1));
}

export async function createBuilding(ownerId, payload) {
  return addDoc(collection(db, collections.buildings), {
    ownerId,
    name: payload.name,
    address: payload.address,
    createdAt: serverTimestamp()
  });
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, collections.users, uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveUserProfile({ uid, role, name, phone }) {
  const profile = { uid, role, name, phone };
  await setDoc(doc(db, collections.users, uid), profile, { merge: true });
  return profile;
}

export async function createRoom(ownerId, payload) {
  return addDoc(collection(db, collections.rooms), {
    ownerId,
    buildingId: payload.buildingId,
    roomNo: payload.roomNo,
    tenantName: '',
    tenantPhone: '',
    rent: Number(payload.rent || 0),
    electricityBill: Number(payload.electricityBill || 0),
    securityDeposit: Number(payload.securityDeposit || 0),
    status: 'pending',
    connectionCode: generateConnectionCode(),
    balanceDue: Number(payload.rent || 0) + Number(payload.electricityBill || 0),
    amountPaid: 0,
    createdAt: serverTimestamp(),
    assignedAt: null
  });
}

export async function addExpense(ownerId, payload) {
  return addDoc(collection(db, collections.expenses), {
    ownerId,
    description: payload.description,
    amount: Number(payload.amount || 0),
    category: payload.category || 'general',
    date: payload.date || new Date().toISOString().slice(0, 10)
  });
}

export async function linkTenantByCode({ uid, name, phone, code }) {
  const q = query(collection(db, collections.rooms), where('connectionCode', '==', code), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    throw new Error('Invalid connection code');
  }

  const roomRef = snapshot.docs[0].ref;
  await updateDoc(roomRef, {
    tenantUid: uid,
    tenantName: name,
    tenantPhone: phone,
    assignedAt: serverTimestamp(),
    status: 'pending'
  });
  return snapshot.docs[0].id;
}

export async function markTenantPaid(roomId, amountPaid) {
  return updateDoc(doc(db, collections.rooms, roomId), {
    status: 'pending_verification',
    amountPaid: Number(amountPaid || 0)
  });
}

export async function verifyPayment(room) {
  return updateDoc(doc(db, collections.rooms, room.id), {
    status: 'paid',
    amountPaid: Number(room.balanceDue || room.rent || 0),
    balanceDue: 0
  });
}

export async function addElectricityBill(room, electricityBill) {
  const bill = Number(electricityBill || 0);
  return updateDoc(doc(db, collections.rooms, room.id), {
    electricityBill: bill,
    balanceDue: Number(room.balanceDue || 0) + bill,
    status: room.status === 'paid' ? 'pending' : room.status
  });
}

export async function removeTenant(room) {
  return updateDoc(doc(db, collections.rooms, room.id), {
    tenantUid: null,
    tenantName: '',
    tenantPhone: '',
    assignedAt: null,
    status: 'pending',
    connectionCode: generateConnectionCode(),
    balanceDue: Number(room.rent || 0) + Number(room.electricityBill || 0),
    amountPaid: 0
  });
}

export async function resetMonthlyDue(room) {
  const nextDue = Number(room.rent || 0) + Number(room.electricityBill || 0);
  return updateDoc(doc(db, collections.rooms, room.id), {
    status: 'pending',
    balanceDue: nextDue,
    amountPaid: 0
  });
}

export async function uploadTenantDocument(roomId, file) {
  const path = `rooms/${roomId}/documents/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  const key = path.replace(/[^a-zA-Z0-9]/g, '_');
  return updateDoc(doc(db, collections.rooms, roomId), {
    [`documents.${key}`]: { name: file.name, url, path, uploadedAt: Date.now() }
  });
}
