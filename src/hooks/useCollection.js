import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';

export function useCollection(queryFactory, deps = []) {
  const [state, setState] = useState({ data: [], loading: true, error: null });

  useEffect(() => {
    const q = queryFactory?.();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return undefined;
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setState({
          data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          loading: false,
          error: null
        });
      },
      (error) => setState({ data: [], loading: false, error })
    );

    return unsubscribe;
  }, deps);

  return state;
}
