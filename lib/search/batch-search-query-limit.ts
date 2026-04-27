/** Maximum BOQ lines per multi-line keyword search (POST `/api/search`). */
export const MAX_BATCH_SEARCH_QUERIES = 100;

export const BATCH_SEARCH_QUERIES_VALIDATION_MESSAGE =
  `queries must be a non-empty array of non-empty strings (max ${MAX_BATCH_SEARCH_QUERIES})`;
