import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Pages Router API route - use to verify Vercel is serving API routes.
 * If this returns 200, Next.js API deployment works; then we can fix App Router routes.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true, source: 'pages', timestamp: new Date().toISOString() });
}
