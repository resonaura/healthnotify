import { InlineKeyboard } from "grammy";

export type Locale = "ru" | "en";

export function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return `${n} ${many}`;
  if (rem > 1 && rem < 5) return `${n} ${few}`;
  if (rem === 1) return `${n} ${one}`;
  return `${n} ${many}`;
}

export function pluralDays(lang: Locale, count: number): string {
  if (lang === "en") return count === 1 ? "1 day" : `${count} days`;
  return pluralizeRu(count, "день", "дня", "дней");
}

export function pluralTimes(lang: Locale, count: number): string {
  if (lang === "en") return count === 1 ? "1 time" : `${count} times`;
  return pluralizeRu(count, "раз", "раза", "раз");
}

export function pluralMinutes(lang: Locale, count: number): string {
  if (lang === "en") return count === 1 ? "1 minute" : `${count} minutes`;
  return pluralizeRu(count, "минута", "минуты", "минут");
}

export function pluralReminders(lang: Locale, count: number): string {
  if (lang === "en") return count === 1 ? "1 reminder" : `${count} reminders`;
  return pluralizeRu(count, "напоминание", "напоминания", "напоминаний");
}

export const translations = {
  ru: {
    // Common & Navigation
    choose_language: "Выберите язык интерфейса / Choose interface language:",
    lang_selected_ru: "Выбран русский язык.",
    lang_selected_en: "English language selected.",
    btn_language: "🌐 Язык",
    btn_back_main: "⬅️ В главное меню",
    btn_back: "⬅️ Назад",
    btn_next: "Далее ➡️",
    btn_cancel: "✖️ Отмена",
    btn_confirm: "✅ Подтвердить",
    btn_refresh: "🔄 Обновить",

    // Main Menu
    main_menu_greeting:
      "👋 Привет! Я HealthNotify — бот надёжных напоминаний о здоровье и процедурах.\n\n",
    main_menu_info:
      "📊 Активных напоминаний: {activeCount}.\n\nВыберите нужный раздел в меню ниже:",
    btn_reminders: "📋 Напоминания ({count})",
    btn_reminders_empty: "📋 Напоминания",
    btn_create_reminder: "➕ Создать напоминание",
    btn_recipients: "👥 Получатели",
    btn_chats: "💬 Чаты доставки",
    btn_history: "📊 История и статистика",
    btn_settings: "⚙️ Настройки",

    // Actions on Reminder
    btn_done: "✅ Сделано",
    btn_later: "🕒 Позже",
    btn_skip: "❌ Пропустить",

    // Reminder notification text
    reminder_group_header: "🩺 Напоминание для {targetMention}",
    reminder_dm_header: "🩺 Персональное напоминание",
    reminder_body: "*{title}*{descriptionPart}\n\n⏰ Запланировано на: *{plannedTime}*",
    reminder_status_snoozed: "\n\n🕒 _Отложено до {snoozedTime} (откладывание {count})_",
    reminder_status_completed: "\n\n✅ _Выполнено в {completedTime}_",
    reminder_status_skipped: "\n\n❌ _Пропущено в {skippedTime}_",
    reminder_status_missed: "\n\n⚠️ _Не выполнено (истёк срок ожидания)_",
    reminder_status_cancelled: "\n\n🚫 _Напоминание отменено_",

    // Popups & Feedback
    error_not_your_reminder: "⚠️ Это напоминание предназначено другому человеку.",
    reminder_already_handled: "ℹ️ Это напоминание уже обработано.",
    reminder_card_outdated:
      "⚠️ Это уведомление устарело. Пожалуйста, используйте последнее отправленное сообщение.",
    reminder_done_ack: "✅ Отлично! Выполнение зафиксировано в истории.",
    reminder_snoozed_ack: "🕒 Напоминание отложено на {minutes} мин. (до {time}).",
    reminder_skipped_ack: "❌ Напоминание пропущено.",

    // Wizard
    wizard_step_title:
      "Шаг 1 из 10: Название\n\nВведите понятное название напоминания (например: «Измерить артериальное давление» или «Принять лекарство»):",
    wizard_step_description:
      "Шаг 2 из 10: Описание (необязательно)\n\nВведите дополнительное описание, дозировку или инструкцию. Либо отправьте «-», чтобы пропустить:",
    wizard_step_category: "Шаг 3 из 10: Категория\n\nВыберите категорию напоминания:",
    wizard_step_recipients:
      "Шаг 4 из 10: Получатель\n\nВыберите получателя(-ей) кнопками либо введите один или несколько Telegram User ID через запятую:",
    wizard_step_destination: "Шаг 5 из 10: Канал доставки\n\nКуда отправлять напоминание?",
    wizard_step_timezone: "Шаг 6 из 10: Часовой пояс\n\nВыберите часовой пояс расписания:",
    wizard_step_schedule_type: "Шаг 7 из 10: Тип расписания\n\nВыберите периодичность:",
    wizard_step_times:
      "Шаг 8 из 10: Время суток\n\nУкажите время (например: «06:00, 20:00» или «В 6 утра и 8 вечера»):",
    wizard_step_duration:
      "Шаг 9 из 10: Продолжительность\n\nУкажите срок действия (например: «14 дней» или «бессрочно»):",
    wizard_step_preview:
      "Шаг 10 из 10: Проверка и сохранение\n\nПроверьте параметры нового напоминания:\n\n{previewText}\n\nСохранить напоминание?",
    wizard_saved_success: "✅ Напоминание успешно создано и запланировано!",
    wizard_cancelled: "✖️ Создание напоминания отменено.",

    // Reminders List & Management
    reminders_list_header: "📋 Список напоминаний:\n\n{lines}",
    reminders_empty:
      "📭 Напоминаний пока нет.\n\nНажмите «➕ Создать напоминание», чтобы добавить первое.",
    reminders_detail_header:
      "📌 *Детали напоминания #{id}*\n\nНазвание: *{title}*\nКатегория: {category}\nСтатус: {status}\nПериодичность: {schedule}\nВремя: {times} ({timezone})\nПериод: {dates}\nПолучатели: {recipients}\nКанал доставки: {destination}\nSnooze интервалы: {snooze}\nRepeat интервалы: {repeat}",
    btn_pause_rule: "⏸ Приостановить",
    btn_resume_rule: "▶️ Возобновить",
    btn_delete_rule: "🗑 Удалить",
    btn_edit_title: "✏️ Изменить название",
    btn_edit_times: "⏰ Изменить время",
    btn_archive_rule: "🗑 Архивировать",
    btn_snooze_intervals: "🕒 Изменить Snooze",
    btn_repeat_intervals: "🔄 Изменить Repeat",
    btn_myself: "👤 Себе",
    btn_both_recipient_and_me: "👥 {name} и Я",
    btn_all_recipients: "👥 Всем ({count})",
    btn_to_dm_each: "💬 Личные сообщения (ЛС каждому)",
    prompt_edit_title: "✏️ Введите новое название для напоминания #{id}:",
    prompt_edit_times:
      "⏰ Введите новое время суток (например: «06:00, 20:00» или «В 6 утра и 8 вечера»):",
    reminder_updated_success: "✅ Напоминание #{id} успешно обновлено!",
    confirm_delete:
      "⚠️ Вы уверены, что хотите удалить напоминание «{title}»?\nИстория предыдущих выполнений сохранится.",

    // Recipients Menu
    recipients_header:
      "👥 Зарегистрированные получатели:\n\n{lines}\n\n_Чтобы человек мог получать личные уведомления, он должен хотя бы раз нажать /start в диалоге с ботом._",

    // Chats Menu
    chats_header:
      "💬 Подключённые группы:\n\n{lines}\n\n_Чтобы подключить новую группу, добавьте бота в чат и сделайте его администратором с правом отправки сообщений._",

    // History & Stats
    history_header:
      "📊 Статистика здоровья и выполнений:\n\nПериод: {period}\nВсего запланировано: {total}\n✅ Выполнено: {completed} ({completionRate}%)\n❌ Пропущено: {skipped}\n⚠️ Проигнорировано (Missed): {missed}\n🕒 Всего откладываний: {snoozes}",
    history_empty: "📊 За выбранный период записей пока нет.",

    // Settings Menu
    settings_header:
      "⚙️ Системные настройки:\n\nЧасовой пояс по умолчанию: {timezone}\nЯзык: {language}\nИнтервалы откладывания: {snoozeIntervals} мин.\nИнтервалы повторов: {repeatIntervals} мин.\nАдминистраторы: {admins}",
    settings_snooze_updated: "✅ Интервалы откладывания обновлены: {intervals} мин.",
    settings_repeat_updated: "✅ Интервалы автоповторов обновлены: {intervals} мин.",

    // Blood Pressure measurement prompt
    bp_measurement_prompt:
      "🩺 Хотите записать показатели давления (например: «120/80 70» где 120 — систолическое, 80 — диастолическое, 70 — пульс)? Отправьте значения или нажмите «Пропустить ввод».",
    bp_measurement_saved:
      "✅ Показатели давления сохранены: {systolic}/{diastolic} мм рт. ст., пульс {pulse}.",
    bp_measurement_invalid: "⚠️ Некорректный формат давления. Пример правильного ввода: 120/80 72.",
  },
  en: {
    // Common & Navigation
    choose_language: "Choose interface language / Выберите язык интерфейса:",
    lang_selected_ru: "Russian language selected.",
    lang_selected_en: "English language selected.",
    btn_language: "🌐 Language",
    btn_back_main: "⬅️ To Main Menu",
    btn_back: "⬅️ Back",
    btn_next: "Next ➡️",
    btn_cancel: "✖️ Cancel",
    btn_confirm: "✅ Confirm",
    btn_refresh: "🔄 Refresh",

    // Main Menu
    main_menu_greeting:
      "👋 Hello! I am HealthNotify — reliable health & procedure reminder bot.\n\n",
    main_menu_info: "📊 Active reminders: {activeCount}.\n\nSelect a section from the menu below:",
    btn_reminders: "📋 Reminders ({count})",
    btn_reminders_empty: "📋 Reminders",
    btn_create_reminder: "➕ Create Reminder",
    btn_recipients: "👥 Recipients",
    btn_chats: "💬 Delivery Chats",
    btn_history: "📊 History & Stats",
    btn_settings: "⚙️ Settings",

    // Actions on Reminder
    btn_done: "✅ Done",
    btn_later: "🕒 Later",
    btn_skip: "❌ Skip",

    // Reminder notification text
    reminder_group_header: "🩺 Reminder for {targetMention}",
    reminder_dm_header: "🩺 Personal Reminder",
    reminder_body: "*{title}*{descriptionPart}\n\n⏰ Scheduled for: *{plannedTime}*",
    reminder_status_snoozed: "\n\n🕒 _Snoozed until {snoozedTime} (snooze #{count})_",
    reminder_status_completed: "\n\n✅ _Completed at {completedTime}_",
    reminder_status_skipped: "\n\n❌ _Skipped at {skippedTime}_",
    reminder_status_missed: "\n\n⚠️ _Missed (deadline expired)_",
    reminder_status_cancelled: "\n\n🚫 _Reminder cancelled_",

    // Popups & Feedback
    error_not_your_reminder: "⚠️ This reminder is intended for another person.",
    reminder_already_handled: "ℹ️ This reminder has already been handled.",
    reminder_card_outdated:
      "⚠️ This notification has expired. Please use the latest notification message.",
    reminder_done_ack: "✅ Great! Marked as completed in history.",
    reminder_snoozed_ack: "🕒 Snoozed for {minutes} min (until {time}).",
    reminder_skipped_ack: "❌ Reminder skipped.",

    // Wizard
    wizard_step_title:
      "Step 1 of 10: Title\n\nEnter a clear reminder title (e.g. 'Measure blood pressure' or 'Take medication'):",
    wizard_step_description:
      "Step 2 of 10: Description (optional)\n\nEnter extra notes, dosage, or instructions. Or send '-' to skip:",
    wizard_step_category: "Step 3 of 10: Category\n\nChoose reminder category:",
    wizard_step_recipients:
      "Step 4 of 10: Recipient\n\nSelect recipient(s) using buttons or enter one or more Telegram User IDs separated by commas:",
    wizard_step_destination: "Step 5 of 10: Destination\n\nWhere should the reminder be delivered?",
    wizard_step_timezone: "Step 6 of 10: Timezone\n\nSelect schedule timezone:",
    wizard_step_schedule_type: "Step 7 of 10: Schedule Frequency\n\nChoose recurrence type:",
    wizard_step_times:
      "Step 8 of 10: Times of Day\n\nEnter times (e.g. '06:00, 20:00' or '6am and 8pm'):",
    wizard_step_duration:
      "Step 9 of 10: Duration\n\nEnter duration (e.g. '14 days' or 'indefinite'):",
    wizard_step_preview:
      "Step 10 of 10: Review & Save\n\nReview your new reminder:\n\n{previewText}\n\nSave this reminder?",
    wizard_saved_success: "✅ Reminder successfully created and scheduled!",
    wizard_cancelled: "✖️ Reminder creation cancelled.",

    // Reminders List & Management
    reminders_list_header: "📋 Reminders List:\n\n{lines}",
    reminders_empty:
      "📭 No reminders configured yet.\n\nClick '➕ Create Reminder' to add your first one.",
    reminders_detail_header:
      "📌 *Reminder Details #{id}*\n\nTitle: *{title}*\nCategory: {category}\nStatus: {status}\nSchedule: {schedule}\nTimes: {times} ({timezone})\nPeriod: {dates}\nRecipients: {recipients}\nDestination: {destination}\nSnooze intervals: {snooze}\nRepeat intervals: {repeat}",
    btn_pause_rule: "⏸ Pause",
    btn_resume_rule: "▶️ Resume",
    btn_delete_rule: "🗑 Delete",
    btn_edit_title: "✏️ Edit Title",
    btn_edit_times: "⏰ Edit Times",
    btn_archive_rule: "🗑 Archive",
    btn_snooze_intervals: "🕒 Change Snooze",
    btn_repeat_intervals: "🔄 Change Repeat",
    btn_myself: "👤 Myself",
    btn_both_recipient_and_me: "👥 {name} & Me",
    btn_all_recipients: "👥 All ({count})",
    btn_to_dm_each: "💬 Direct Messages (DM to each)",
    prompt_edit_title: "✏️ Enter new title for reminder #{id}:",
    prompt_edit_times: "⏰ Enter new times (e.g. '06:00, 20:00' or '6am and 8pm'):",
    reminder_updated_success: "✅ Reminder #{id} successfully updated!",
    confirm_delete:
      "⚠️ Are you sure you want to delete '{title}'?\nHistorical occurrences will remain preserved.",

    // Recipients Menu
    recipients_header:
      "👥 Registered Recipients:\n\n{lines}\n\n_To receive private DM notifications, users must send /start to the bot at least once._",

    // Chats Menu
    chats_header:
      "💬 Connected Groups:\n\n{lines}\n\n_To connect a new group, add the bot to the group and grant it administrator rights to post messages._",

    // History & Stats
    history_header:
      "📊 Health & Compliance Statistics:\n\nPeriod: {period}\nTotal Scheduled: {total}\n✅ Completed: {completed} ({completionRate}%)\n❌ Skipped: {skipped}\n⚠️ Missed: {missed}\n🕒 Total Snoozes: {snoozes}",
    history_empty: "📊 No history records for selected period.",

    // Settings Menu
    settings_header:
      "⚙️ System Settings:\n\nDefault Timezone: {timezone}\nLanguage: {language}\nSnooze Progression: {snoozeIntervals} min\nAuto-repeat intervals: {repeatIntervals} min\nAdministrators: {admins}",
    settings_snooze_updated: "✅ Snooze intervals updated: {intervals} min.",
    settings_repeat_updated: "✅ Auto-repeat intervals updated: {intervals} min.",

    // Blood Pressure measurement prompt
    bp_measurement_prompt:
      "🩺 Would you like to record your reading (e.g. '120/80 70' for 120 systolic, 80 diastolic, 70 pulse)? Send values or tap 'Skip entry'.",
    bp_measurement_saved:
      "✅ Blood pressure reading saved: {systolic}/{diastolic} mmHg, pulse {pulse} bpm.",
    bp_measurement_invalid: "⚠️ Invalid format. Example format: 120/80 72.",
  },
} as const;

export type TranslationKey = keyof typeof translations.ru;

export function t(
  lang: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dictionary = translations[lang] ?? translations.ru;
  let text: string = dictionary[key] ?? translations.ru[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }

  return text;
}

export function languageKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Русский", "lang:set:ru").text("English", "lang:set:en");
}
