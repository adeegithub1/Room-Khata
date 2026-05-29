import { useCollection } from './useCollection.js';
import { tenantRoomQuery } from '../services/firestoreService.js';

export function useTenantRoom(uid) {
  const result = useCollection(() => uid && tenantRoomQuery(uid), [uid]);
  return { ...result, room: result.data[0] || null };
}
