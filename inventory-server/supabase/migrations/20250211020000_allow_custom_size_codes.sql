-- Allow custom size codes: drop FK so warehouse_inventory_by_size can store any size string.
-- size_codes remains the reference list for dropdown suggestions; users can type sizes not in the list.

alter table warehouse_inventory_by_size
  drop constraint if exists warehouse_inventory_by_size_size_code_fkey;

comment on column warehouse_inventory_by_size.size_code is 'Normalized size identifier (e.g. US9, M, or custom e.g. EU42). Predefined in size_codes; custom values allowed.';
