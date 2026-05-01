import { useEffect, useState } from "react"
import { getLanguage, type Language } from "./settings"

type Dict = Record<string, string>
type Translations = Record<Language, Dict>

const translations: Translations = {
  en: {
    "app.title": "LingoDrill",
    "nav.audioLibrary": "Audio Library",
    "nav.fragmentLibrary": "Fragment Library",
    "nav.favourites": "Favourites",
    "nav.settings": "Settings",
    "nav.about": "About",
    "menu.open": "Open menu",
    "menu.close": "Close menu",
    "settings.title": "Settings",
    "settings.startPage": "Start page",
    "settings.startPage.library": "Audio Library",
    "settings.startPage.favourites": "Favourites",
    "settings.startPage.lastSequence": "Last sequence",
    "settings.fragmentGap": "Fragment gap",
    "settings.subFontSize": "Sub font size",
    "settings.language": "Language",
    "settings.language.en": "English",
    "settings.language.ru": "Russian",
    "settings.theme": "Theme",
    "settings.theme.open": "Open theme settings",
    "settings.theme.title": "Theme",
    "settings.theme.mode": "Mode",
    "settings.theme.light": "Light",
    "settings.theme.dark": "Dark",
    "settings.theme.colorTheme": "Color theme",
    "settings.theme.normal": "Normal",
    "settings.theme.pastel": "Pastel",
    "settings.theme.neon": "Neon",
    "settings.preview": "Subtitle preview",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.add": "Add",
    "common.back": "← Back",
    "common.bind": "Bind selected text",
    "fragmentLibrary.title": "Fragment Library",
    "fragmentLibrary.newSequence": "+ New sequence",
    "fragmentLibrary.sub": "Sub",
    "fragmentLibrary.vocab": "Vocab",
    "fragmentLibrary.subTitle": "Subtitle files",
    "fragmentLibrary.vocabTitle": "Vocabulary files",
    "fragmentLibrary.subEmpty": "No subtitle files uploaded yet.",
    "fragmentLibrary.vocabEmpty": "No vocabulary files uploaded yet.",
    "fragmentLibrary.addSub": "+ Add subtitle file",
    "fragmentLibrary.addVocab": "+ Add vocabulary file",
    "fragmentLibrary.confirmDelete": "Delete this sequence?",
    "fragmentLibrary.empty": "No sequences yet. Create one in the editor.",
    "vocab.title": "Vocab",
    "vocab.attached": "Attached vocabulary",
    "vocab.unbind": "Unbind",
    "vocab.edit": "Edit",
    "vocab.choose": "Choose vocabulary file",
    "vocab.selectText": "Select text for vocabulary",
    "vocab.selectHint": "Select the text portion that corresponds to this fragment, then click \"Bind selected text\".",
    "vocab.fileNotUploaded": "No vocabulary files uploaded. Upload one from the Sequences page.",
  },
  ru: {
    "app.title": "LingoDrill",
    "nav.audioLibrary": "Аудиотека",
    "nav.fragmentLibrary": "Библиотека фрагментов",
    "nav.favourites": "Избранное",
    "nav.settings": "Настройки",
    "nav.about": "О программе",
    "menu.open": "Открыть меню",
    "menu.close": "Закрыть меню",
    "settings.title": "Настройки",
    "settings.startPage": "Стартовая страница",
    "settings.startPage.library": "Аудиотека",
    "settings.startPage.favourites": "Избранное",
    "settings.startPage.lastSequence": "Последняя последовательность",
    "settings.fragmentGap": "Пауза между фрагментами",
    "settings.subFontSize": "Размер шрифта субтитров",
    "settings.language": "Язык",
    "settings.language.en": "Английский",
    "settings.language.ru": "Русский",
    "settings.theme": "Тема",
    "settings.theme.open": "Открыть настройки темы",
    "settings.theme.title": "Тема",
    "settings.theme.mode": "Режим",
    "settings.theme.light": "Светлая",
    "settings.theme.dark": "Тёмная",
    "settings.theme.colorTheme": "Цветовая схема",
    "settings.theme.normal": "Обычная",
    "settings.theme.pastel": "Пастельная",
    "settings.theme.neon": "Неон",
    "settings.preview": "Предпросмотр субтитра",
    "common.close": "Закрыть",
    "common.cancel": "Отмена",
    "common.delete": "Удалить",
    "common.add": "Добавить",
    "common.back": "← Назад",
    "common.bind": "Привязать выделенный текст",
    "fragmentLibrary.title": "Библиотека фрагментов",
    "fragmentLibrary.newSequence": "+ Новая последовательность",
    "fragmentLibrary.sub": "Суб",
    "fragmentLibrary.vocab": "Слов",
    "fragmentLibrary.subTitle": "Файлы субтитров",
    "fragmentLibrary.vocabTitle": "Файлы словаря",
    "fragmentLibrary.subEmpty": "Файлы субтитров ещё не загружены.",
    "fragmentLibrary.vocabEmpty": "Файлы словаря ещё не загружены.",
    "fragmentLibrary.addSub": "+ Добавить файл субтитров",
    "fragmentLibrary.addVocab": "+ Добавить файл словаря",
    "fragmentLibrary.confirmDelete": "Удалить эту последовательность?",
    "fragmentLibrary.empty": "Пока нет последовательностей. Создайте новую в редакторе.",
    "vocab.title": "Словарь",
    "vocab.attached": "Привязанный словарь",
    "vocab.unbind": "Отвязать",
    "vocab.edit": "Изменить",
    "vocab.choose": "Выберите файл словаря",
    "vocab.selectText": "Выберите текст для словаря",
    "vocab.selectHint": "Выделите часть текста, соответствующую этому фрагменту, затем нажмите «Привязать выделенный текст».",
    "vocab.fileNotUploaded": "Файлы словаря не загружены. Загрузите файл со страницы последовательностей.",
  },
}

export function t(key: string, lang: Language = getLanguage()): string {
  const dict = translations[lang] ?? translations.en
  return dict[key] ?? translations.en[key] ?? key
}

export function useT() {
  const [lang, setLang] = useState<Language>(getLanguage())
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail as Language
      setLang(detail)
    }
    window.addEventListener("lingodrill:languagechange", onChange)
    return () => window.removeEventListener("lingodrill:languagechange", onChange)
  }, [])
  return (key: string) => t(key, lang)
}
