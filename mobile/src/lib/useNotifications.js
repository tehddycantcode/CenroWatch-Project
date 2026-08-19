import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

// In-app notifications for the signed-in resident: the list, the unread count,
// and the two mutations. Mirrors web/src/components/resident/NotificationBell.jsx
// so both clients behave the same; the difference is where the polling gate
// comes from (AppState here, document.hidden on web).
//
// Both the header bell and the notifications screen call this. They are never
// mounted at the same time - ResidentNavigator renders only the top of the
// stack - so there is one poll running, not two.

const POLL_MS = 30000;

export default function useNotifications(limit = 20) {
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.notifications.list(token, limit);
      setItems(res.data.items);
      setUnread(res.data.unread);
      setError('');
    } catch (e) {
      // Keep the last good list. A dropped poll on a phone that walked out of
      // Wi-Fi range should not blank a list the resident is already reading.
      setError(e.message || 'Could not load your notifications.');
    } finally {
      setLoading(false);
    }
  }, [token, limit]);

  useEffect(() => {
    load();

    // Ticks are skipped while the app is backgrounded so a phone in a pocket
    // is not polling all day, and coming back to the app refreshes at once
    // instead of waiting out the rest of the interval.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') load();
    }, POLL_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [load]);

  // Takes the whole notification rather than an id so the caller's already-known
  // is_read flag decides whether there is anything to do - no second lookup.
  const markRead = useCallback(
    async (n) => {
      if (!token || !n || n.is_read) return;
      setItems((prev) =>
        prev.map((x) => (x.notification_id === n.notification_id ? { ...x, is_read: true } : x)),
      );
      setUnread((u) => Math.max(0, u - 1));
      try {
        await api.notifications.markRead(n.notification_id, token);
      } catch {
        // The next poll reconciles it. A read flag that missed is not worth
        // interrupting someone who is on their way to reading the report.
      }
    },
    [token],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await api.notifications.markAllRead(token);
    } catch {
      load(); // Put the real state back rather than leaving a false "all read".
    }
  }, [token, load]);

  return { items, unread, loading, error, refresh: load, markRead, markAllRead };
}
