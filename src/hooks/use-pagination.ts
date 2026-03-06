import { useState, useCallback } from "react";

export function usePagination(initialPage = 1, initialPageSize = 25) {
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const reset = useCallback(() => setPage(1), []);

  return { page, setPage, pageSize, setPageSize, reset };
}
