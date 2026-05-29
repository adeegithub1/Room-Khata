import { auth, RecaptchaVerifier, signInWithPhoneNumber } from '../lib/firebase.js';
import { saveUserProfile } from './firestoreService.js';

export function createPhoneVerifier(containerId = 'recaptcha-container') {
  return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
}

export function sendPhoneOtp(phone, verifier) {
  return signInWithPhoneNumber(auth, phone, verifier);
}

export async function ensureUserProfile({ uid, role, name, phone }) {
  return saveUserProfile({ uid, role, name, phone });
}
