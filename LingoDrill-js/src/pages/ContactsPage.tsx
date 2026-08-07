// pages/ContactsPage.tsx

import { useT } from "../utils/i18n"

const CONTACT_EMAIL = "info.lingodrill@gmail.com"
const CONTACT_TELEGRAM = "t.me/lingodrill"

const MailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m2 7 10 6 10-6" />
  </svg>
)

const TelegramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21.6 4.2 3.4 11.2c-1 .4-1 1.8.1 2.1l4.6 1.4 1.7 5.4c.2.7 1.1.9 1.6.4l2.6-2.5 4.5 3.3c.6.4 1.4.1 1.6-.6l3.3-15c.2-.8-.6-1.5-1.4-1.2zM9.6 14.6l9.1-5.6c.2-.1.4.2.2.3l-7.4 6.8c-.3.2-.4.6-.5.9l-.3 1.9c0 .1-.2.1-.2 0l-.9-4.3z" />
  </svg>
)

export function ContactsPage() {
  const t = useT()

  return (
    <div className="page contacts-page">
      <h2>{t("contacts.title")}</h2>
      <p className="contacts-page__body">{t("contacts.body")}</p>

      <div className="contacts-card">
        <a className="contacts-row" href={`mailto:${CONTACT_EMAIL}`}>
          <span className="contacts-row__icon"><MailIcon /></span>
          <span className="contacts-row__text">
            <span className="contacts-row__label">{t("contacts.email")}</span>
            <span className="contacts-row__value">{CONTACT_EMAIL}</span>
          </span>
        </a>
        <a
          className="contacts-row"
          href={`https://${CONTACT_TELEGRAM}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          <span className="contacts-row__icon"><TelegramIcon /></span>
          <span className="contacts-row__text">
            <span className="contacts-row__label">{t("contacts.telegram")}</span>
            <span className="contacts-row__value">{CONTACT_TELEGRAM}</span>
          </span>
        </a>
      </div>
    </div>
  )
}
