// Shared header row for the admin data tables.
//
// Four pages rendered a structurally identical `thead > tr > th...` with the
// same two Tailwind strings copied into each. React Doctor flagged two of them
// as a duplicate family; the real cost was that the table styling lived in four
// places, so changing it meant finding all four and a missed one would drift
// visually without anything failing.
//
// The prop surface is deliberately one array of strings. An empty string renders
// an unlabelled column - the trailing cell above a row-actions button. Anything
// needing per-column widths, alignment or aria attributes should keep writing
// its own thead rather than growing this: StaffQueue does exactly that, because
// its columns carry individual classes and aria-hidden spacers, and bending this
// component to cover that would make it harder to read than the markup it
// replaced.

export function TableHead({ columns }) {
  return (
    <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
      <tr>
        {columns.map((label, i) => (
          <th key={label || `col-${i}`} className="px-4 py-3 font-medium">
            {label || null}
          </th>
        ))}
      </tr>
    </thead>
  );
}
