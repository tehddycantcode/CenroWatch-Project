import { useEffect, useMemo, useState } from 'react';
import { speciesApi } from '@/lib/api';

// The wildlife species catalogue, split for the two-group picker.
//
// web/src/lib/species.js is a frozen array today. The public species guide is
// the only page that shows its rich fields (scientific name, status, photo,
// credit, description, handling note); the web report form takes just names and
// groups from the same array, and mobile reads a separate, barer copy. This hook
// exists so the guide and the web form can read the catalogue instead: once each
// is switched over, an Admin adding a species changes what residents see with
// nothing rebuilt.
//
// The split is by `is_endangered`, which is ALSO the column that drives
// public-map coordinate obfuscation. One source of truth on purpose: the group a
// resident sees and the privacy control applied to their report cannot disagree.
//
// `Other` is separated out because it is a sentinel, not a species: it belongs at
// the end of the picker, never inside either group.
const OTHER_NAME = 'Other';

export function useSpecies() {
  const [state, setState] = useState({ rows: [], loading: true, error: '' });

  useEffect(() => {
    let cancelled = false;
    speciesApi
      .list()
      .then((r) => {
        if (!cancelled) setState({ rows: r.data.species || [], loading: false, error: '' });
      })
      .catch((e) => {
        // A picker with no options cannot be submitted, so the failure has to be
        // visible rather than presented as an empty dropdown.
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
