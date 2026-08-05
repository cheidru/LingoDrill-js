// pages/ContactsPage.tsx

import { useT } from "../utils/i18n"

/* Placeholder until a real support address exists. */
const CONTACT_EMAIL = "hello@lingodrill.app"

export function ContactsPage() {
  const t = useT()

  return (
    <div className="page contacts-page">
      <h2>{t("contacts.title")}</h2>
      <p className="contacts-page__body">{t("contacts.body")}</p>
      <a className="contacts-page__mail" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    </div>
  )
}
