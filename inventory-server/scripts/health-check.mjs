#!/usr/bin/env node
const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
fetch(`${baseUrl}/api/health`)
  .then((r) => {
    if (!r.ok) process.exit(1);
    return r.json();
  })
  .then((d) => {
    process.exit(d?.status === 'ok' ? 0 : 1);
  })
  .catch(() => process.exit(1));
