import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { getUserProfile } from '../services/firestoreService.js';

export function useAuthUser() {
  const [state, setState] = useState({ user: null, loading: true });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ user: null, loading: false });
        return;
      }

      const profile = await getUserProfile(firebaseUser.uid);
      setState({
        user: {
          uid: firebaseUser.uid,
          name: profile?.name || firebaseUser.displayName || 'RoomKhata User',
          phone: firebaseUser.phoneNumber || '',
          role: profile?.role || 'tenant'
        },
        loading: false
      });
    });

    return unsubscribe;
  }, []);

  return state;
}
