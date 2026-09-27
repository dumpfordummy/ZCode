/** A bounded Renderer view; paging never changes the selected run or canonical history. */
export function graphHistoryPage<T extends { id: string }>(
  runs: readonly T[],
  requestedPage: number,
  selectedRunId?: string,
) {
  const size = 25,
    total = runs.length,
    pages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0),
  );
  const selectedIndex = selectedRunId ? runs.findIndex((run) => run.id === selectedRunId) : -1;
  return {
    items: runs.slice(page * size, (page + 1) * size),
    page,
    pages,
    size,
    total,
    start: total ? page * size + 1 : 0,
    end: Math.min(total, (page + 1) * size),
    selectedPage: selectedIndex < 0 ? undefined : Math.floor(selectedIndex / size),
  };
}
