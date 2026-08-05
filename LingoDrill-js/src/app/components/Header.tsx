// app/components/Header.tsx

import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"
import { OnboardingScreen } from "./OnboardingScreen"
import { hasSeenOnboarding, setOnboardingSeen } from "../../utils/settings"
import { useT } from "../../utils/i18n"

/* main.tsx adds this class once, before it renders. It has to be read during
   render rather than at module scope: imports are evaluated before the body
   of main.tsx runs, so at import time the class is not there yet. */
const isMobile = () => document.documentElement.classList.contains("mobile")

/* Settings and Contacts are branches of the menu rather than places in the app:
   they are reachable only from the burger and there is nothing to do on them
   once the menu is gone. They are routes purely so they get a full screen on
   mobile, so the header treats them as menu state, not as destinations. */
const MENU_SCREEN_PATHS = ["/settings", "/contacts"]
const isMenuScreen = (path: string) =>
  MENU_SCREEN_PATHS.some(p => path === p || path.startsWith(`${p}/`))

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding())

  const audioIdMatch = location.pathname.match(/\/file\/([^/]+)/)
  const audioId = audioIdMatch ? audioIdMatch[1] : selectedFile?.id ?? null

  const onMenuScreen = isMenuScreen(location.pathname)

  /* Where ✕ returns to. Every route that is not itself part of the menu is
     recorded, so backing out of Settings or Contacts lands on whatever the user
     was actually doing rather than on a hardcoded home route. Deep-linking or
     reloading straight onto a menu screen leaves nothing to go back to, and the
     library stands in. A ref rather than state: nothing renders from it, so
     re-rendering the header on every navigation to store it would be waste. */
  const lastAppPath = useRef(onMenuScreen ? "/" : `${location.pathname}${location.search}`)
  useEffect(() => {
    if (!onMenuScreen) lastAppPath.current = `${location.pathname}${location.search}`
  }, [location.pathname, location.search, onMenuScreen])

  /* On desktop the submenu is a dropdown, but it cannot live inside .header:
     that bar scrolls horizontally and its backdrop-filter makes it a
     containing block, so it would clip the panel. It is portalled to <body>
     and pinned to the About button instead. In the mobile drawer there is
     nothing to clip it, so it stays inline and these coordinates are unused. */
  const aboutBtnRef = useRef<HTMLButtonElement>(null)
  const [aboutPos, setAboutPos] = useState<{ top: number; left: number } | null>(null)
  const mobile = isMobile()

  /* On mobile the submenu is rendered inside the drawer, so it cannot outlive
     it: whatever route closes the drawer (overlay tap, navigation, a future
     caller) closes the submenu with it. Deriving this rather than syncing two
     flags means they can never disagree — there is no state where the burger
     shows ☰ while something is still counted as open. */
  const aboutOpen = aboutMenuOpen && (!mobile || menuOpen)

  const toggleAboutMenu = () => {
    if (aboutOpen) {
      setAboutMenuOpen(false)
      return
    }
    const r = aboutBtnRef.current?.getBoundingClientRect()
    if (r) setAboutPos({ top: r.bottom + 4, left: r.left })
    setAboutMenuOpen(true)
  }

  // The panel is pinned to a measured point, so anything that moves the button
  // out from under it dismisses it rather than leaving it stranded.
  useEffect(() => {
    if (!aboutMenuOpen || mobile) return
    const close = () => setAboutMenuOpen(false)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [aboutMenuOpen, mobile])

  /* Collapses the drawer and its submenu, and nothing else. Navigation is
     deliberately not part of this: items that navigate have already done so by
     the time it runs, and the drawer's backdrop must only take the drawer away
     — never move the user off the page they can see behind it. */
  const closeMenus = () => {
    setAboutMenuOpen(false)
    setMenuOpen(false)
  }

  const openDemo = () => {
    setOnboardingOpen(true)
    closeMenus()
  }

  const closeDemo = () => {
    setOnboardingSeen()
    setOnboardingOpen(false)
  }

  /* The burger reflects the whole menu tree, not just the drawer. Settings and
     Contacts count as part of it even though the drawer is shut over them, so
     the icon stays ✕ for every item that keeps the user inside the menu and
     turns back into ☰ only once a real page is showing. */
  const anyMenuOpen = menuOpen || aboutOpen || (mobile && onMenuScreen)

  /* What ✕ does. As well as collapsing the drawer it backs out of a menu
     screen, so a single press always ends the same way — menu gone, an app page
     on screen, burger back to ☰ — from any depth in the tree. */
  const dismissMenu = () => {
    closeMenus()
    if (onMenuScreen) navigate(lastAppPath.current)
  }

  const handleNav = (path: string) => {
    navigate(path)
    closeMenus()
  }

  const pathIncludes = (p: string) => (p === "/" ? location.pathname === "/" : location.pathname.startsWith(p))

  const aboutMenu = (
    <div
      className="header__about-menu"
      role="menu"
      style={
        aboutPos
          ? ({ "--about-top": `${aboutPos.top}px`, "--about-left": `${aboutPos.left}px` } as CSSProperties)
          : undefined
      }
    >
      <button
        role="menuitem"
        className={`header__about-item${pathIncludes("/contacts") ? " header__about-item--active" : ""}`}
        onClick={() => handleNav("/contacts")}
      >
        {t("nav.about.contacts")}
      </button>
      <button role="menuitem" className="header__about-item" onClick={openDemo}>
        {t("nav.about.demo")}
      </button>
    </div>
  )

  return (
    <>
      <header className="header">
        <span className="header__logo">{t("app.title")}</span>

        <button
          className="header__burger"
          onClick={() => (anyMenuOpen ? dismissMenu() : setMenuOpen(true))}
          aria-label={anyMenuOpen ? t("menu.close") : t("menu.open")}
          aria-expanded={anyMenuOpen}
        >
          <span className="header__burger-icon" aria-hidden="true">{anyMenuOpen ? "✕" : "☰"}</span>
        </button>

        <nav className={`header__nav${menuOpen ? " header__nav--open" : ""}`}>
          <button
            onClick={() => handleNav("/")}
            className={`header__nav-btn${pathIncludes("/") ? " header__nav-btn--active" : ""}`}
          >
            {t("nav.audioLibrary")}
          </button>
          <button
            onClick={() => audioId && handleNav(`/file/${audioId}/sequences`)}
            disabled={!audioId}
            className={`header__nav-btn${audioId && pathIncludes(`/file/${audioId}/sequences`) ? " header__nav-btn--active" : ""}${!audioId ? " header__nav-btn--disabled" : ""}`}
          >
            {t("nav.fragmentLibrary")}
          </button>
          <button
            onClick={() => handleNav("/favourites")}
            className={`header__nav-btn${pathIncludes("/favourites") ? " header__nav-btn--active" : ""}`}
          >
            {t("nav.favourites")}
          </button>
          <button
            onClick={() => handleNav("/settings")}
            className={`header__nav-btn${pathIncludes("/settings") ? " header__nav-btn--active" : ""}`}
          >
            {t("nav.settings")}
          </button>
          <div className="header__about">
            <button
              ref={aboutBtnRef}
              onClick={toggleAboutMenu}
              className={`header__nav-btn header__nav-btn--expandable${pathIncludes("/contacts") ? " header__nav-btn--active" : ""}`}
              aria-expanded={aboutOpen}
              aria-haspopup="true"
            >
              {t("nav.about")}
            </button>
            {aboutOpen && mobile && aboutMenu}
          </div>
        </nav>
      </header>
      {menuOpen && (
        <div className="header__overlay" onClick={closeMenus} aria-hidden="true" />
      )}
      {/* Desktop only. In the mobile drawer the submenu sits inside the nav,
          which already has its own overlay closing everything at once — a
          second backdrop there could only ever close half the tree. */}
      {aboutOpen && !mobile && (
        <div className="header__about-backdrop" onClick={() => setAboutMenuOpen(false)} aria-hidden="true" />
      )}
      {aboutOpen && !mobile && aboutPos && createPortal(aboutMenu, document.body)}

      {onboardingOpen && <OnboardingScreen onClose={closeDemo} />}
    </>
  )
}
