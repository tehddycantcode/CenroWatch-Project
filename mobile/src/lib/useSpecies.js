import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

// The wildlife species catalogue, split for the two-group picker.
//
// DUPLICATE IN SPIRIT of web/src/lib/useSpecies.js - mobile cannot import from
// web/src (see AGENTS.md) - and deliberately the SAME return shape, so the two
// can be diffed for drift. The difference is the fetch, which goes through
// api/client.js.
//
// This replaces WILDLIFE_SPECIES, a hardcoded array compiled into the app
// bundle: adding a species used to need an app release. It comes from the API
// now, so the app picks one up on its next launch.
//
// The split is by `is_endangered`, which is ALSO the column that drives
// public-map coordinate obfuscation - one source of truth, so the group a
// resident sees and the privacy control applied cannot disagree.
//
// `Other` is separated out because it is a sentinel, not a species: it belongs
// at the end of the picker, never inside either group.
const OTHER_NAME = 'Other';

export default function useSpecies() {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    api
      .species()
      .then((r) => {
        if (!cancelled) setState({ rows: r.data.species || [], loading: false, error: '' });
      })
      .catch((e) => {
        // A picker with no options cannot be submitted, so this has to be
        // visible rather than looking like an empty list.
        if (!cancelled) {
          setState({ rows: [], loading: false, error: e.message || 'Could not load the species list.' });
        }
      });
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const real = state.rows.filter((s) => s.name !== OTHER_NAME);
    return {
      common: real.filter((s) => !s.is_endangered),
      endangered: real.filter((s) => s.is_endangered),
      other: state.rows.find((s) => s.name === OTHER_NAME) || null,
      byName: Object.fromEntries(state.rows.map((s) => [s.name, s])),
      loading: state.loading,
      error: state.error,
    };
  }, [state]);
}
