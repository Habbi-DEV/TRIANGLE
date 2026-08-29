import { useEffect, useState, useCallback } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` instead of showing their
// own install UI automatically, so the app has to capture the event, stash
// it, and trigger it later from our own button/banner. iOS Safari never
// fires this event (no native install prompt API) — callers should hide
// the custom banner there and rely on the "Add to Home Screen" share-sheet
// instructions instead.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'triangle_pwa_install_dismissed';

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismissed = typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1';

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDeferred(null);
  }, []);

  // Already running standalone (installed) → nothing to prompt.
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);

  return {
    canInstall: !!deferred && !installed && !standalone && !dismissed,
    promptInstall,
    dismiss,
  };
}
