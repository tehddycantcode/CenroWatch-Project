// Chart colors follow the app's kind-identity language (IconChip/KIND_UI):
// complaints = amber, wildlife = violet, requests = brand green. Palette
// validated for lightness, chroma, CVD separation, and contrast on the white
// card surface (dataviz six-checks). Red stays reserved for status (SLA).
// Lives outside charts.jsx so that file only exports components (Fast Refresh).
export const CHART_COLORS = {
  complaints: '#d97706', // amber-600
  wildlife: '#7c3aed', // violet-600
  requests: '#22a050', // brand primary
};
