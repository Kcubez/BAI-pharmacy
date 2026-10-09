export const notDeleted = { deletedAt: null };

export const onlyDeleted = { deletedAt: { not: null } };

export function softDeleteData(userId: string, reason?: string | null) {
  return {
    deletedAt: new Date(),
    deletedByUserId: userId,
    deletedReason: reason || null,
    restoredAt: null,
    restoredByUserId: null,
  };
}

export function restoreData(userId: string) {
  return {
    deletedAt: null,
    deletedByUserId: null,
    deletedReason: null,
    restoredAt: new Date(),
    restoredByUserId: userId,
  };
}
