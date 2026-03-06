/**
 * Supabase Realtime Presence: track logged-in users (cashiers/admins) for the Active Cashiers dashboard.
 * Broadcast: when a cashier adds a low-stock item (qty <= 3) to cart, broadcast to other cashiers so they see a toast (NEXT 4).
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

const CHANNEL_NAME = 'warehouse-pos-presence';
const ACTIVITY_THROTTLE_MS = 30_000; // update lastActivity at most every 30s
const IDLE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min = Idle

export interface PresencePayload {
  email: string;
  displayName: string;
  role: string;
  warehouseId: string;
  warehouseName: string;
  page: string;
  lastActivity: string; // ISO
}

export interface PresenceEntry {
  key: string;
  payload: PresencePayload;
  isSelf: boolean;
  isIdle: boolean;
  lastActivityAgo: string;
}

/** Payload for low-stock broadcast (NEXT 4). */
export interface LowStockAlertPayload {
  senderEmail: string;
  senderName: string;
  productName: string;
  sizeCode: string | null;
  sizeLabel: string | null;
  remaining: number;
  productId: string;
}

/** A received low-stock alert (for showing toast to other cashiers). */
export interface ReceivedLowStockAlert extends LowStockAlertPayload {
  id: string;
  at: number;
}

interface PresenceContextType {
  presenceState: Record<string, PresencePayload[]>;
  presenceList: PresenceEntry[];
  isSubscribed: boolean;
  /** Send a low-stock broadcast so other cashiers see a toast. Call when adding low-stock item to cart. */
  sendLowStockAlert: (payload: Omit<LowStockAlertPayload, 'senderEmail' | 'senderName'>) => void;
  /** Alerts received from other cashiers (show toast then dismiss). */
  receivedLowStockAlerts: ReceivedLowStockAlert[];
  dismissLowStockAlert: (id: string) => void;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

function getPageLabel(pathname: string): string {
  if (pathname.startsWith('/pos')) return 'POS';
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/inventory')) return 'Inventory';
  if (pathname.startsWith('/reports')) return 'Reports';
  if (pathname.startsWith('/sales')) return 'Sales';
  if (pathname.startsWith('/deliveries')) return 'Deliveries';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'App';
}

function formatActivityAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Active now';
  if (ms < 3600_000) return `Active ${Math.floor(ms / 60_000)} min ago`;
  return `Active ${Math.floor(ms / 3600_000)} hr ago`;
}

export function PresenceProvider({
  children,
  currentUserEmail,
  currentUserRole,
  currentWarehouseId,
  currentWarehouseName,
  isAuthenticated,
}: {
  children: ReactNode;
  currentUserEmail: string | null;
  currentUserRole: string | null;
  currentWarehouseId: string;
  currentWarehouseName: string;
  isAuthenticated: boolean;
}) {
  const location = useLocation();
  const [presenceState, setPresenceState] = useState<Record<string, PresencePayload[]>>({});
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [receivedLowStockAlerts, setReceivedLowStockAlerts] = useState<ReceivedLowStockAlert[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const selfEmailRef = useRef(currentUserEmail?.trim().toLowerCase() ?? '');
  selfEmailRef.current = currentUserEmail?.trim().toLowerCase() ?? '';
  const lastTrackRef = useRef(0);
  const payloadRef = useRef<PresencePayload>({
    email: '',
    displayName: '—',
    role: '—',
    warehouseId: '',
    warehouseName: '—',
    page: 'App',
    lastActivity: new Date().toISOString(),
  });

  const page = getPageLabel(location.pathname);
  const payload: PresencePayload = {
    email: currentUserEmail ?? '',
    displayName: currentUserEmail ?? '—',
    role: currentUserRole ?? '—',
    warehouseId: currentWarehouseId ?? '',
    warehouseName: currentWarehouseName ?? '—',
    page,
    lastActivity: new Date().toISOString(),
  };
  payloadRef.current = payload;

  const track = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !isAuthenticated || !currentUserEmail) return;
    const now = Date.now();
    if (now - lastTrackRef.current < ACTIVITY_THROTTLE_MS) return;
    lastTrackRef.current = now;
    const p = { ...payload, lastActivity: new Date().toISOString() };
    ch.track(p);
  }, [isAuthenticated, currentUserEmail, payload.role, payload.warehouseId, payload.warehouseName, payload.page]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserEmail?.trim()) {
      if (channelRef.current) {
        channelRef.current.untrack();
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      setPresenceState({});
      setIsSubscribed(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;

    const ch = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: currentUserEmail.trim().toLowerCase() } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      setPresenceState(ch.presenceState() as Record<string, PresencePayload[]>);
    })
      .on('presence', { event: 'join' }, () => {
        setPresenceState(ch.presenceState() as Record<string, PresencePayload[]>);
      })
      .on('presence', { event: 'leave' }, () => {
        setPresenceState(ch.presenceState() as Record<string, PresencePayload[]>);
      })
      .on('broadcast', { event: 'low_stock_alert' }, ({ payload }: { payload: LowStockAlertPayload }) => {
        if (!payload || typeof payload !== 'object') return;
        const sender = (payload as LowStockAlertPayload).senderEmail?.trim().toLowerCase();
        if (sender && sender === selfEmailRef.current) return;
        const id = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        setReceivedLowStockAlerts((prev) => [...prev.slice(-4), { ...(payload as LowStockAlertPayload), id, at: Date.now() }]);
      })
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          channelRef.current = ch;
          ch.track(payloadRef.current);
        }
      });

    return () => {
      ch.untrack();
      ch.unsubscribe();
      channelRef.current = null;
      setPresenceState({});
      setIsSubscribed(false);
      setReceivedLowStockAlerts([]);
    };
  }, [isAuthenticated, currentUserEmail]);

  const sendLowStockAlert = useCallback(
    (p: Omit<LowStockAlertPayload, 'senderEmail' | 'senderName'>) => {
      const ch = channelRef.current;
      if (!ch || !currentUserEmail?.trim()) return;
      ch.send({
        type: 'broadcast',
        event: 'low_stock_alert',
        payload: {
          ...p,
          senderEmail: currentUserEmail.trim(),
          senderName: payloadRef.current.displayName || currentUserEmail.trim(),
        },
      });
    },
    [currentUserEmail]
  );

  const dismissLowStockAlert = useCallback((id: string) => {
    setReceivedLowStockAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !channelRef.current) return;
    const p = { ...payloadRef.current, lastActivity: new Date().toISOString() };
    channelRef.current.track(p);
  }, [isAuthenticated, page, currentWarehouseId, currentWarehouseName]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const id = window.setInterval(track, ACTIVITY_THROTTLE_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, track]);

  const presenceList: PresenceEntry[] = (() => {
    const selfKey = currentUserEmail?.trim().toLowerCase() ?? '';
    const now = Date.now();
    const out: PresenceEntry[] = [];
    for (const [key, presences] of Object.entries(presenceState)) {
      const p = Array.isArray(presences) ? presences[0] : presences;
      if (!p || typeof p !== 'object' || !(p as PresencePayload).email) continue;
      const pl = p as PresencePayload;
      if (pl.email?.toLowerCase() === selfKey) continue;
      const last = new Date(pl.lastActivity || 0).getTime();
      const isIdle = now - last > IDLE_THRESHOLD_MS;
      out.push({
        key,
        payload: pl,
        isSelf: false,
        isIdle,
        lastActivityAgo: formatActivityAgo(pl.lastActivity || new Date(0).toISOString()),
      });
    }
    out.sort((a, b) => {
      const ta = new Date(a.payload.lastActivity).getTime();
      const tb = new Date(b.payload.lastActivity).getTime();
      return tb - ta;
    });
    return out;
  })();

  const value: PresenceContextType = {
    presenceState,
    presenceList,
    isSubscribed,
    sendLowStockAlert,
    receivedLowStockAlerts,
    dismissLowStockAlert,
  };

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceContextType {
  const ctx = useContext(PresenceContext);
  if (ctx === undefined) {
    return {
      presenceState: {},
      presenceList: [],
      isSubscribed: false,
      sendLowStockAlert: () => {},
      receivedLowStockAlerts: [],
      dismissLowStockAlert: () => {},
    };
  }
  return ctx;
}
