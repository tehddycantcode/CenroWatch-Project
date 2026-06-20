import { useEffect, useState } from 'react';
import { barangayApi } from '@/lib/api';
import { Select } from '@/components/ui/select';

// Fetches the public barangay list once and renders it as a Select.
export default function BarangaySelect({ value, onChange, id = 'barangay_id', ...props }) {
  const [barangays, setBarangays] = useState([]);

  useEffect(() => {
    barangayApi
      .list()
      .then((res) => setBarangays(res.data.barangays))
      .catch(() => setBarangays([]));
  }, []);

  return (
    <Select id={id} value={value} onChange={onChange} {...props}>
      <option value="">Select your barangay</option>
      {barangays.map((b) => (
        <option key={b.barangay_id} value={b.barangay_id}>
          {b.name}
        </option>
      ))}
    </Select>
  );
}
