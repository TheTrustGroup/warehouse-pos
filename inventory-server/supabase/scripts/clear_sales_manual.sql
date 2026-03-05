-- Manual one-time clear of sales and sale_lines (use only when RPC/API is not available).
-- Prefer: POST /api/admin/clear-sales-history with body { "confirm": "CLEAR_ALL_SALES" }.
--
-- If you must run in DB:
--   1. SET statement_timeout = '30s';  (optional, to avoid long locks)
--   2. Run the DELETE below repeatedly until it returns DELETE 0:
--      DELETE FROM sale_lines WHERE ctid = ANY(ARRAY(SELECT ctid FROM sale_lines LIMIT 25));
--   3. Then run until DELETE 0:
--      DELETE FROM sales WHERE ctid = ANY(ARRAY(SELECT ctid FROM sales LIMIT 25));
--   4. Reset receipt sequence: SELECT setval('receipt_seq', 1);

DELETE FROM sale_lines WHERE ctid = ANY(ARRAY(SELECT ctid FROM sale_lines LIMIT 25));
