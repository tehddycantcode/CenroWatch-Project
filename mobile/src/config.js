// Where the API lives.
//
// SET EXPO_PUBLIC_API_URL IN mobile/.env FOR ANYTHING THAT IS NOT THIS DESK.
// A deployed build needs a real host, and this file is tracked, so hardcoding
// one makes every environment change a source commit: the git history of this
// file is literally a list of IP addresses somebody had to edit and push. The
// env var is read the same way MapPicker reads EXPO_PUBLIC_MAPTILER_API_KEY, so
// Metro inlines it at bundle time. It has to stay written as a plain static
// member expression - destructure it or build the name dynamically and Metro
// cannot substitute it, leaving `undefined` in the bundle.
//
// The fallback below is the LAN address of a development machine, and it is a
// DEV convenience only. A physical phone running Expo Go cannot reach
// `localhost` - that points at the phone itself - so it needs the PC's IPv4
// address (`ipconfig`, e.g. 192.168.1.10) with both devices on the same Wi-Fi.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.18.11:5000/api/v1';
