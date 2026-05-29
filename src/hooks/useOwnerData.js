import { useCollection } from './useCollection.js';
import { ownerBuildingsQuery, ownerExpensesQuery, ownerRoomsQuery } from '../services/firestoreService.js';

export function useOwnerData(ownerId) {
  const buildings = useCollection(() => ownerId && ownerBuildingsQuery(ownerId), [ownerId]);
  const rooms = useCollection(() => ownerId && ownerRoomsQuery(ownerId), [ownerId]);
  const expenses = useCollection(() => ownerId && ownerExpensesQuery(ownerId), [ownerId]);

  return { buildings, rooms, expenses };
}
