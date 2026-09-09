import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { humanize } from './reports';

// Report categories for the complaint and service-request forms.
//
// DUPLICATE IN SPIRIT of web/src/lib/useCategories.js - mobile cannot import
// from web/src (see AGENTS.md) - but the shapes differ: the mobile Select takes
// { value, label } options and the fetch goes through api/client.js, so this is
// a parallel implementation rather than a copied file.
//
// These used to be a hardcoded array compiled into the app bundle, which on
// mobile meant a new category needed a store release. They come from the API
// now, so the app picks one up on its next launch.
//
// `label` falls back to humanize(name), the same rule the rest of the system
// uses, so a new category only needs a label when its display name differs from
// its underscored name.
const toOptions = (rows) =>
  (rows || []).map((r) => ({ value: r.name, label: r.label || humanize(r.name) }));

export function useCategories() {
  const [state, setState] = useState({ complaintTypes: [], requestTypes: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    api
      .categories()
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
        // A form with no options cannot be submitted, so this has to be visible
        // rather than looking like an empty picker.
        if (!cancelled) {
          setState({
            complaintTypes: [],
            requestTypes: [],
            loading: false,
            error: e.message || 'Could not load the categories.',
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}
