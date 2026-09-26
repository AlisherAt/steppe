import { catalogSourceIds } from './catalog-policy';
export function parseRefreshScope(value: string | null): string[] | undefined {
  if (value === null) return undefined;
  const ids = [...new Set(value.split(',').map((id) => id.trim()))];
  if (!ids.length || value.length > 200 || ids.some((id) => !catalogSourceIds.includes(id)))
    throw Error('INVALID_REFRESH_SOURCES');
  return ids;
}
