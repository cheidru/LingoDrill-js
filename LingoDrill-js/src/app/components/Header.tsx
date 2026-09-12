// app/components/Header.tsx

import { useEffect, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { createPortal } from "react-dom"
import { useNavigate, useLocation } from "react-router-dom"
import { useSharedAudioEngine } from "../hooks/useSharedAudioEngine"
import { OnboardingScreen } from "./OnboardingScreen"
import { HelpScreen } from "./HelpScreen"
import { hasSeenOnboarding, setOnboardingSeen, SETTINGS_SECTIONS } from "../../utils/settings"
import { useT } from "../../utils/i18n"
import { APP_VERSION } from "../../utils/version"

/* main.tsx adds this class once, before it renders. It has to be read during
   render rather than at module scope: imports are evaluated before the body
   of main.tsx runs, so at import time the class is not there yet. */
const isMobile = () => document.documentElement.classList.contains("mobile")

/* Settings and Contacts are branches of the menu rather than places in the app:
   they are reachable only from the burger and there is nothing to do on them
   once the menu is gone. They are routes purely so they get a full screen on
   mobile, so the header treats them as menu state, not as destinations.
   Help is not among them — like the Demo it is a takeover window, not a route. */
const MENU_SCREEN_PATHS = ["/settings", "/contacts"]
const isMenuScreen = (path: string) =>
  MENU_SCREEN_PATHS.some(p => path === p || path.startsWith(`${p}/`))

/* The tabs that expand into a list instead of going somewhere themselves. Only
   one is ever open, so they share a single piece of state and a single panel:
   opening one closes the other without either having to know about it. */
type SubmenuKey = "settings" | "about"

export function Header() {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedFile } = useSharedAudioEngine()
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [submenu, setSubmenu] = useState<SubmenuKey | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(() => !hasSeenOnboarding())
  const [helpOpen, setHelpOpen] = useState(false)

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
     and pinned to the tab that opened it instead. In the mobile drawer there
     is nothing to clip it, so it stays inline and these coordinates are
     unused. */
  const btnRefs = useRef<Partial<Record<SubmenuKey, HTMLButtonElement | null>>>({})
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null)
  const mobile = isMobile()

  /* On mobile the submenu is rendered inside the drawer, so it cannot outlive
     it: whatever route closes the drawer (overlay tap, navigation, a future
     caller) closes the submenu with it. Deriving this rather than syncing two
     flags means they can never disagree — there is no state where the burger
     shows ☰ while something is still counted as open. */
  const openSubmenu = !mobile || menuOpen ? submenu : null

  const toggleSubmenu = (key: SubmenuKey) => {
    if (openSubmenu === key) {
      setSubmenu(null)
      return
    }
    const r = btnRefs.current[key]?.getBoundingClientRect()
    if (r) setSubmenuPos({ top: r.bottom + 4, left: r.left })
    setSubmenu(key)
  }

  // The panel is pinned to a measured point, so anything that moves the button
  // out from under it dismisses it rather than leaving it stranded.
  useEffect(() => {
    if (!submenu || mobile) return
    const close = () => setSubmenu(null)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [submenu, mobile])

  /* Collapses the drawer and its submenu, and nothing else. Navigation is
     deliberately not part of this: items that navigate have already done so by
     the time it runs, and the drawer's backdrop must only take the drawer away
     — never move the user off the page they can see behind it. */
  const closeMenus = () => {
    setSubmenu(null)
    setMenuOpen(false)
  }

  const openDemo = () => {
    setOnboardingOpen(true)
    closeMenus()
  }

  const openHelp = () => {
    setHelpOpen(true)
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
  const anyMenuOpen = menuOpen || openSubmenu !== null || onMenuScreen

  /* Desktop has no drawer to collapse, so the burger is hidden there — which
     left a menu screen with no way out but picking another tab. It comes back
     purely as the ✕, at the far end of the bar, for as long as the user is
     standing on one. */
  const desktopClose = !mobile && onMenuScreen

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

  /* One panel for both tabs: a dropdown pinned under the button on desktop, an
     indented block inside the drawer on mobile — the CSS decides which. */
  const dropdown = (children: ReactNode) => (
    <div
      className="header__dropdown"
      role="menu"
      style={
        submenuPos
          ? ({
              "--dropdown-top": `${submenuPos.top}px`,
              "--dropdown-left": `${submenuPos.left}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  )

  /* Each section of Settings is its own route, so the tab lists them the way
     About lists its screens rather than opening the page whole. */
  const settingsMenu = dropdown(
    SETTINGS_SECTIONS.map(section => (
      <button
        key={section}
        role="menuitem"
        className={`header__dropdown-item${pathIncludes(`/settings/${section}`) ? " header__dropdown-item--active" : ""}`}
        onClick={() => handleNav(`/settings/${section}`)}
      >
        {t(`settings.section.${section}`)}
      </button>
    ))
  )

  const aboutMenu = dropdown(
    <>
      <button
        role="menuitem"
        className={`header__dropdown-item${pathIncludes("/contacts") ? " header__dropdown-item--active" : ""}`}
        onClick={() => handleNav("/contacts")}
      >
        {t("nav.about.contacts")}
      </button>
      <button role="menuitem" className="header__dropdown-item" onClick={openDemo}>
        {t("nav.about.demo")}
      </button>
      <button role="menuitem" className="header__dropdown-item" onClick={openHelp}>
        {t("nav.about.help")}
      </button>
      {/* Not a menu item: no role, not focusable, just the build the user is on. */}
      <p className="header__about-version">
        {t("app.title")} {t("about.version")} {APP_VERSION}
      </p>
    </>
  )

  const submenuPanel =
    openSubmenu === "settings" ? settingsMenu : openSubmenu === "about" ? aboutMenu : null

  /* The tab itself, identical for both: it opens its list instead of
     navigating, and stays highlighted while the user is on one of its pages. */
  const submenuTab = (key: SubmenuKey, label: string, activePath: string) => (
    <div className="header__dropdown-wrap">
      <button
        ref={el => {
          btnRefs.current[key] = el
        }}
        onClick={() => toggleSubmenu(key)}
        className={`header__nav-btn header__nav-btn--expandable${pathIncludes(activePath) ? " header__nav-btn--active" : ""}`}
        aria-expanded={openSubmenu === key}
        aria-haspopup="true"
      >
        {label}
      </button>
      {openSubmenu === key && mobile && submenuPanel}
    </div>
  )

  return (
    <>
      <header className="header">
        <span className="header__logo">{t("app.title")}</span>

        <button
          className={`header__burger${desktopClose ? " header__burger--close" : ""}`}
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
          {submenuTab("settings", t("nav.settings"), "/settings")}
          {submenuTab("about", t("nav.about"), "/contacts")}
        </nav>
      </header>
      {menuOpen && (
        <div className="header__overlay" onClick={closeMenus} aria-hidden="true" />
      )}
      {/* Desktop only. In the mobile drawer the submenu sits inside the nav,
          which already has its own overlay closing everything at once — a
          second backdrop there could only ever close half the tree. */}
      {openSubmenu && !mobile && (
        <div className="header__dropdown-backdrop" onClick={() => setSubmenu(null)} aria-hidden="true" />
      )}
      {openSubmenu && !mobile && submenuPos && createPortal(submenuPanel, document.body)}

      {onboardingOpen && <OnboardingScreen onClose={closeDemo} />}
      {helpOpen && <HelpScreen onClose={() => setHelpOpen(false)} />}
    </>
  )
}
