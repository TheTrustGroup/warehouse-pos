-- VERIFY 6 — pg_cron (run this alone). Job name: reconcile-warehouse-inventory-nightly
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobname;
