import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';

export function useDocData(collectionName, id) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, collectionName, id),
      (snapshot) => {
        setState({
          data: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
          loading: false,
          error: null
        });
      },
      (error) => setState({ data: null, loading: false, error })
    );

    return unsubscribe;
  }, [collectionName, id]);

  return state;
}
