export interface CannedCloseReason {
  /** Used as the button's action value, keep it short and stable. */
  key: string;
  /** Shown on the button in the staff modal. */
  label: string;
  /** Posted verbatim as the resolution announcement, plain text from Hestia, never names who clicked it. */
  message: string;
}

// Add more reasons here any time, nothing else needs to change.
export const CANNED_CLOSE_REASONS: CannedCloseReason[] = [
  {
    key: "fraud",
    label: "Fraud",
    message: "Hi, please keep your fraud related questions with @fraud squad. It's better for us all!",
  },
  {
    key: "hackatime",
    label: "Hackatime",
    message: "Hi, would you mind redirecting your Hackatime questions to letterbird.co/hackatime?",
  },
];

export function findCannedCloseReason(key: string): CannedCloseReason | undefined {
  return CANNED_CLOSE_REASONS.find((r) => r.key === key);
}
