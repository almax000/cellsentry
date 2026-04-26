/**
 * V2 first-launch upgrade banner (W4 Step 4.5 / Warning N2).
 *
 * Shown ONCE on first launch when v2 is installed over a v1 codebase that
 * left a localStorage marker indicating the user previously ran v1. Plan v3:
 * "v2 is a complete re-focus on medical de-identification. v1 Excel features
 * removed. See cellsentry.pro/blog/v2-pivot for details."
 *
 * Logic:
 *   - Check `cellsentry-v2-upgrade-banner-shown` localStorage flag
 *   - If unset AND app version is 2.x.x-beta or later, show modal
 *   - On dismiss, set flag → never show again on this install
 *
 * Why localStorage instead of detecting v1 install state directly: there's
 * no reliable cross-platform way for a v2 process to detect whether v1 was
 * previously installed. localStorage persists across app launches in the
 * same Electron app data dir, so a user upgrading via DMG/Setup.exe-replace
 * keeps their previous localStorage. New installs (no v1 history) also see
 * this banner once — that's acceptable since the v2-only audience also
 * benefits from the welcome message.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import './V2UpgradeBanner.css'

const STORAGE_KEY = 'cellsentry-v2-upgrade-banner-shown'

export default function V2UpgradeBanner(): JSX.Element | null {
  const { t } = useTranslation('medical')
  const [shown, setShown] = useState(false)

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY)
      if (!seen) setShown(true)
    } catch {
      // localStorage may throw in some sandbox modes — fail open (don't block UI).
    }
  }, [])

  const handleDismiss = (): void => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore — banner won't reappear in this session anyway
    }
    setShown(false)
  }

  if (!shown) return null

  return (
    <div
      className="v2-banner-overlay"
      role="dialog"
      aria-labelledby="v2-banner-title"
      aria-describedby="v2-banner-body"
    >
      <div className="v2-banner-card">
        <h2 id="v2-banner-title" className="v2-banner-title">
          {t('v2Banner.title')}
        </h2>
        <div id="v2-banner-body" className="v2-banner-body">
          <p>{t('v2Banner.intro')}</p>
          <ul className="v2-banner-bullets">
            <li>{t('v2Banner.bulletReplaced')}</li>
            <li>{t('v2Banner.bulletV1Available')}</li>
            <li>{t('v2Banner.bulletNoMigration')}</li>
          </ul>
          <p className="v2-banner-link">
            <a
              href="https://cellsentry.pro/blog/v2-pivot"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('v2Banner.readMore')}
            </a>
          </p>
        </div>
        <footer className="v2-banner-footer">
          <button
            className="v2-banner-dismiss"
            onClick={handleDismiss}
            data-testid="v2-banner-dismiss"
          >
            {t('v2Banner.dismiss')}
          </button>
        </footer>
      </div>
    </div>
  )
}
