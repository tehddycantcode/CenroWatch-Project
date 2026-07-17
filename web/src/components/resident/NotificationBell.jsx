import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '@/lib/api';

// Relative "x ago" for notification timestamps.
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const r = await notificationApi.list({ limit: 15 });
      setItems(r.data.items);
      setUnread(r.data.unread);
    } catch {
      /* keep last good state if the poll fails */
    }
  }, []);

  // Initial load + poll every 30s. Smart polling: ticks are skipped while
  // the tab is hidden (no wasted requests), and returning to the tab
  // refreshes immediately instead of waiting for the next tick.
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (!document.hidden) load();
    }, 30000);
    function onVisibility() {
      if (!document.hidden) load();
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  async function openNotification(n) {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      notificationApi.markRead(n.notification_id).catch(() => {});
    }
    if (n.link) navigate(n.link);
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    try {
      await notificationApi.markAllRead();
    } catch {
      load();
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md border px-2.5 py-1.5 hover:bg-accent"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              items.map((n) => (
                <button
                  type="button"
                  key={n.notification_id}
                  onClick={() => openNotification(n)}
                  className={`flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/40 ${
                    n.is_read ? '' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{n.title}</span>
                    {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <span className="text-xs text-muted-foreground">{n.body}</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{timeAgo(n.created_at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
