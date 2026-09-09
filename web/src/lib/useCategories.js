import { useEffect, useState } from 'react';
import { categoryApi } from '@/lib/api';
import { humanize } from '@/lib/reports';

// Report categories for the complaint and service-request forms.
//
// These used to be frozen arrays compiled into the bundle, which meant adding a
// category needed a schema migration, a code change and a redeploy. They come
// from the API now, so an Admin adding one in the admin screen changes what
// residents see without anything being rebuilt.
//
// The fetch is cached in api.js for the session and shared by every consumer, so
// mounting this hook on several pages costs one request. Admin mutations
// invalidate that cache, which is what keeps a retired category from lingering
// in a dropdown in the same browser tab.
//
// `label` falls back to humanize(name) - the same rule the rest of the system
// uses for enum-shaped values - so a new category needs no label unless its
// display name differs from its underscored name (only 'Creek / River Cleaning'
// does today).
const toOptions = (rows) =>
  (rows || []).map((r) => ({ value: r.name, label: r.label || humanize(r.name) }));

export function useCategories() {
  const [state, setState] = useState({ complaintTypes: [], requestTypes: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    categoryApi
      .list()
      .then((r) => {
        if (cancelled) return;
        setState({
          complaintTypes: toOptions(r.data.complaint_types),
          requestTypes: toOptions(r.data.request_types),
          loading: false,
          error: '',
        });
      })
      .catch((e) => {
        if (!cancelled) {
          // A form with no options cannot be submitted, so the failure has to be
          // visible rather than presented as an empty dropdown.
          setState({ complaintTypes: [], requestTypes: [], loading: false, error: e.message || 'Could not load the categories.' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
