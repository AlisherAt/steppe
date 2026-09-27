// Удалённые из витрины товары нужны продавцу для выкупа недавних заказов.
export function procurementArchive(previous, current, now = Date.now()) {
  const live = new Set(current.map((p) => p.id));
  const seen = new Set();
  return [...(previous.products || []), ...(previous.archivedProducts || [])]
    .filter((p) => {
      if (!p || p.demo || live.has(p.id) || seen.has(p.id)) return false;
      seen.add(p.id);
      const date = Date.parse(p.sourceUpdatedAt || p.updatedAt);
      return Number.isFinite(date) && now - date <= 90 * 86400000 && date <= now + 60000;
    })
    .sort(
      (a, b) =>
        Date.parse(b.sourceUpdatedAt || b.updatedAt) - Date.parse(a.sourceUpdatedAt || a.updatedAt),
    )
    .slice(0, 10000);
}
