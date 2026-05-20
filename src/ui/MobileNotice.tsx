/**
 * MobileNotice — shown only on small viewports.
 *
 * The app is designed for users with a physical Tamil99 keyboard (or a
 * physical QWERTY keyboard, which the composer remaps). On a phone, the
 * keystroke-based interaction model doesn't work — there's nothing to
 * type on. Surfacing this upfront prevents the "I tapped Start and
 * nothing happened" confusion the audit flagged.
 */

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

export function MobileNotice() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!isMobile || dismissed) return null;

  return (
    <div className="bg-amber-100 border border-amber-300 text-amber-900 px-4 py-3 rounded-lg mb-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong>Best on a desktop or laptop.</strong> This tutor needs a
          physical keyboard to practise Tamil99 typing — phone touchscreens
          can't trigger the per-key feedback. You can still browse the
          lessons here; come back on a computer when you're ready to type.
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-amber-700 hover:text-amber-900 text-xs font-semibold uppercase tracking-wide"
          aria-label="Dismiss notice"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
