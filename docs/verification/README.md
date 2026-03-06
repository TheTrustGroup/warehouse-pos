# Verification SQL — run one file at a time

Supabase SQL editor can time out if you run many queries or heavy ones together.

**Do this:** Open one `.sql` file, copy its contents into the Supabase SQL editor, run it. Then the next file. Run on **both** Supabase projects.

| File | What it checks |
|------|----------------|
| `VERIFY_1_trigger.sql` | Trigger on `warehouse_inventory_by_size` exists |
| `VERIFY_2_view.sql` | View `warehouse_dashboard_stats` exists |
| `VERIFY_2_view_data.sql` | View returns data (one row per warehouse) |
| `VERIFY_3_realtime.sql` | Realtime publication tables |
| `VERIFY_4_storage.sql` | `product-images` bucket objects |
| `VERIFY_5_rpc.sql` | `receive_delivery` function exists |
| `VERIFY_6_cron.sql` | pg_cron job `reconcile-warehouse-inventory-nightly` |

If any file times out, run only the first statement in that file.
