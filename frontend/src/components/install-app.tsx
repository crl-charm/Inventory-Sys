"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "./brand-mark";
import { Icon } from "./icons";
import { Modal } from "./modal";
import { useInstallPrompt } from "@/lib/use-install-prompt";

const DISMISS_KEY = "rgarage-install-card-dismissed";

function detectPlatform(): "ios" | "android" | "desktop" {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return "ios";
  if (/android/i.test(navigator.userAgent)) return "android";
  return "desktop";
}

/** Platform-specific instructions, used when the browser has no native prompt. */
function InstallHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">(
    "desktop"
  );

  useEffect(() => {
    if (open) setPlatform(detectPlatform());
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Install R Garage">
      {platform === "ios" ? (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Tap the <strong>Share</strong> button (square with an arrow) in
            Safari.
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong> — the gold R icon joins your apps and opens
            fullscreen.
          </li>
        </ol>
      ) : platform === "android" ? (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>
              Tap the <strong>⋮</strong> menu in Chrome.
            </li>
            <li>
              Tap <strong>Add to Home screen</strong>, then confirm.
            </li>
          </ol>
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
            While the app runs on the shop Wi-Fi, this makes a shortcut that
            still opens inside Chrome. The full app — icon, fullscreen, no
            address bar — installs from the online (HTTPS) version, which can be
            rolled out whenever you&apos;re ready.
          </p>
        </>
      ) : (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>In Chrome or Edge, look at the right end of the address bar.</li>
          <li>
            Click the <strong>install icon</strong> (a monitor with a down
            arrow) and confirm.
          </li>
        </ol>
      )}
    </Modal>
  );
}

/**
 * One click path for every install surface: the browser's native prompt when
 * available, otherwise the platform steps dialog.
 */
function useInstallAction() {
  const { canPrompt, installed, promptInstall } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function start() {
    if (canPrompt) {
      setBusy(true);
      await promptInstall();
      setBusy(false);
      return;
    }
    setHelpOpen(true);
  }

  return {
    installed,
    busy,
    start,
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  };
}

/** Dashboard banner; hidden once installed or dismissed ("Not now"). */
export function InstallAppCard() {
  const { installed, busy, start, helpOpen, closeHelp } = useInstallAction();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (installed || dismissed) return null;

  return (
    <>
      <div className="animate-fade-up relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-white shadow-[0_24px_60px_-40px_rgba(0,0,0,0.95)] sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-0 h-48 w-48 rounded-full bg-brand-gold/15 blur-3xl"
        />
        <div className="relative flex items-start gap-3.5">
          <BrandMark className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Install R Garage on this device
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
              Open it from your home screen like a real app — no browser tabs,
              no typing addresses.
            </p>
            <div className="mt-3.5 flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="btn-gold"
              >
                <Icon name="install" className="h-4 w-4" />
                {busy ? "Opening…" : "Install app"}
              </button>
              <button
                type="button"
                onClick={() => {
                  window.localStorage.setItem(DISMISS_KEY, "1");
                  setDismissed(true);
                }}
                className="min-h-11 rounded-xl px-3 text-xs font-medium text-slate-400 transition-colors duration-200 hover:bg-white/5 hover:text-white"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
      <InstallHelpModal open={helpOpen} onClose={closeHelp} />
    </>
  );
}

/** Sidebar / drawer item, shown until the app is installed. */
export function InstallAppMenuItem() {
  const { installed, busy, start, helpOpen, closeHelp } = useInstallAction();

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
      >
        <Icon name="install" className="h-5 w-5 shrink-0" />
        {busy ? "Installing…" : "Install app"}
      </button>
      <InstallHelpModal open={helpOpen} onClose={closeHelp} />
    </>
  );
}

/** Subtle link under the sign-in form. */
export function InstallAppLink() {
  const { installed, start, helpOpen, closeHelp } = useInstallAction();

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="mx-auto mt-5 flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors duration-200 hover:text-brand-gold"
      >
        <Icon name="install" className="h-3.5 w-3.5" />
        Install this app on your device
      </button>
      <InstallHelpModal open={helpOpen} onClose={closeHelp} />
    </>
  );
}
