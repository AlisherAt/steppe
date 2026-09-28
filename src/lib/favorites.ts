export const FAVORITES_KEY = 'steppe.favorites.v1';
export const FAVORITES_LIMIT = 50;
export function readFavorites(storage: Pick<Storage, 'getItem'>): string[] {
  try {
    const ids: unknown = JSON.parse(storage.getItem(FAVORITES_KEY) || '[]');
    if (!Array.isArray(ids)) return [];
    return [
      ...new Set(
        ids.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{64}$/.test(id)),
      ),
    ].slice(0, FAVORITES_LIMIT);
  } catch {
    return [];
  }
}
