"use client";

import { useState } from "react";

export function useFoodPage<T>(items: T[], filterKey: string, pageSize = 50) {
  const [selection, setSelection] = useState({ filterKey, page: 0 });
  // Remember every filter transition, including clearing a search or reopening a picker.
  if (selection.filterKey !== filterKey) setSelection({ filterKey, page: 0 });
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = selection.filterKey === filterKey ? Math.min(selection.page, pages - 1) : 0;
  return {
    page, pages, total: items.length,
    items: items.slice(page * pageSize, (page + 1) * pageSize),
    onPageChange: (next: number) => setSelection({ filterKey, page: Math.max(0, Math.min(next, pages - 1)) }),
  };
}

export function FoodPagination({ page, pages, total, onPageChange }: {
  page: number; pages: number; total: number; onPageChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3 text-xs" aria-label="食物列表分页">
      <span className="text-muted" aria-live="polite">共 {total} 条 · 第 {page + 1} / {pages} 页</span>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary min-h-11" disabled={page === 0} onClick={() => onPageChange(page - 1)}>上一页</button>
        <button type="button" className="btn-secondary min-h-11" disabled={page + 1 === pages} onClick={() => onPageChange(page + 1)}>下一页</button>
      </div>
    </nav>
  );
}
