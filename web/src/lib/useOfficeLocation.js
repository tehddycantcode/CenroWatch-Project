import { useEffect, useState } from 'react';
import { staffApi } from '@/lib/api';

// Where the CENRO office is, for the distance line on a report's detail view.
//
// Returns null - not an error - when an Admin has not set both coordinates yet,
// and null again if the request fails. A missing office means one line of the
// page is absent; it must never stop a staff member reading the report they
// opened, so nothing here surfaces an error state.
//
// The coordinates come from SystemSetting and change about never, so the answer
// is cached for the session: opening ten reports costs one request.
let cached;

export function useOfficeLocation() {
  const [office, setOffice] = useState(cached ?? null);

  useEffect(() => {
    if (cached !== undefined) return undefined;
    let cancelled = false;
    staffApi
      .officeLocation()
      .then((r) => {
        cached = r?.data?.office ?? null;
        if (!cancelled) setOffice(cached);
      })
      .catch(() => {
        cached = null;
        if (!cancelled) setOffice(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return office;
}
