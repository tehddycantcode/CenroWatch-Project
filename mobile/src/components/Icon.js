import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../theme';

// Every icon in the app comes through here, so the family is chosen once.
// Ionicons ships with Expo as a font, which is why these render identically on
// every device - the emoji they replaced were drawn by whatever set the phone
// happened to have, so the same screen looked different on Samsung and Xiaomi.
//
// Names must exist in the Ionicons glyph map; an unknown name renders as a
// blank box rather than failing loudly, so check before inventing one.
export default function Icon({ name, size = 20, color = colors.text, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
