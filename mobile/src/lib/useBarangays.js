import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Loads the public barangay list once for the report forms' barangay picker.
export default function useBarangays() {
  const [barangays, setBarangays] = useState([]);
  useEffect(() => {
    api
      .barangays()
      .then((res) => setBarangays(res.data.barangays))
      .catch(() => setBarangays([]));
  }, []);
  return barangays;
}
