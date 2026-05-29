# RoomKhata Pro

Premium tenant and rent management PWA for property owners.

## Stack

- React + Vite
- Tailwind CSS
- Framer Motion
- Firebase Auth, Firestore, Storage
- Recharts
- jsPDF
- vite-plugin-pwa

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Firebase project credentials and `VITE_OWNER_UPI_ID`.
3. Install dependencies with `npm install`.
4. Start locally with `npm run dev`.

## Screen Flow

- `/login`: Firebase phone auth with OTP. After login, reads `users/{uid}.role`.
- `/owner-home`: owner home with collapsing KPI header, buildings list, analytics, settings, and bottom navigation.
- `/building/:id`: building room list with `All`, `Paid`, `Pending`, and `Vacant` filters.
- `/room/:id`: owner room detail view with balance, WhatsApp reminders, payment verification, tenant removal, document vault, and bill/expense entry.
- `/tenant-home`: tenant dashboard. First-time users enter a six-digit connection code; linked tenants can trigger UPI and mark payment for owner verification.

## Firestore Collections

- `buildings`: `{ id, ownerId, name, address, createdAt }`
- `rooms`: `{ id, buildingId, ownerId, roomNo, tenantName, tenantPhone, rent, electricityBill, securityDeposit, status, connectionCode, balanceDue, amountPaid, createdAt, assignedAt }`
- `expenses`: `{ id, ownerId, description, amount, category, date }`
- `users`: `{ uid, role, name, phone }`

The app also stores `tenantUid` and `documents` on rooms to support tenant linking and KYC vault uploads.
