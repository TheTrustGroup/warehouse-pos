-- One-time clear of all sales and delivery history so real sales can begin.
-- Run ONE statement per execution. If it still times out: use LIMIT 10, or run
--   SET statement_timeout = '30s';
-- in the same tab first, then run the DELETE.
--
-- A) Run the next line repeatedly until it returns DELETE 0:
DELETE FROM sale_lines WHERE ctid = ANY(ARRAY(SELECT ctid FROM sale_lines LIMIT 25));
-- B) Then run this repeatedly until DELETE 0:
-- DELETE FROM sales WHERE ctid = ANY(ARRAY(SELECT ctid FROM sales LIMIT 25));
-- C) Then once: SELECT setval('receipt_seq', 1);
