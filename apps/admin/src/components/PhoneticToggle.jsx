import { Keyboard, Grid3x3 } from 'lucide-react';
import { usePhonetic } from '../context/PhoneticContext';

/**
 * App-wide switches, shown once (in the navbar) and applying to every
 * Bangla-capable field across the app:
 *  - Phonetic typing (type "ami" -> আমি) on/off
 *  - The floating on-screen Bangla keyboard, open/closed
 */
export default function PhoneticToggle({ compact }) {
  const { phoneticOn, setPhoneticOn, keyboardOpen, toggleKeyboard } = usePhonetic();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => setPhoneticOn(!phoneticOn)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          phoneticOn
            ? 'border-ui-brand bg-ui-brand/10 text-ui-brand'
            : 'border-ui-line bg-white text-ui-muted'
        }`}
        title="Type Bangla phonetically anywhere, e.g. type 'ami' to get আমি — applies to every form in the app"
      >
        <Keyboard size={13} />
        {compact ? 'Phonetic' : 'বাংলা phonetic typing'}: {phoneticOn ? 'ON' : 'OFF'}
      </button>

      <button
        type="button"
        onClick={toggleKeyboard}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          keyboardOpen
            ? 'border-ui-brand bg-ui-brand/10 text-ui-brand'
            : 'border-ui-line bg-white text-ui-muted'
        }`}
        title="Show/hide the on-screen Bangla keyboard"
        aria-pressed={keyboardOpen}
      >
        <Grid3x3 size={13} />
        {compact ? 'Keyboard' : 'বাংলা keyboard'}: {keyboardOpen ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
