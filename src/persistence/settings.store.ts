import type { Repository } from "typeorm";
import type { Locale } from "../i18n/index.js";
import { AppSetting } from "./entities/app-setting.entity.js";

export const SETTINGS = {
  menuNavPrefix: "menu_nav",
  userLangPrefix: "user_lang",
  wizardDraftPrefix: "wizard_draft",
  snoozeIntervals: "snooze_intervals",
  repeatIntervals: "repeat_intervals",
} as const;

export class SettingsStore {
  constructor(private readonly repository: Repository<AppSetting>) {}

  public async get(key: string, fallback = ""): Promise<string> {
    const record = await this.repository.findOneBy({ key });
    return record?.value ?? fallback;
  }

  public async set(key: string, value: string): Promise<void> {
    await this.repository.save(
      this.repository.create({
        key,
        value,
      }),
    );
  }

  public async setIfMissing(key: string, value: string): Promise<void> {
    if (!value || (await this.repository.findOneBy({ key }))) return;
    await this.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    await this.repository.delete({ key });
  }

  public async getUserLanguage(userId: number, defaultLocale: Locale = "ru"): Promise<Locale> {
    const val = await this.get(`${SETTINGS.userLangPrefix}_${userId}`, defaultLocale);
    return val === "en" ? "en" : "ru";
  }

  public async setUserLanguage(userId: number, lang: Locale): Promise<void> {
    await this.set(`${SETTINGS.userLangPrefix}_${userId}`, lang);
  }

  public async getUserMenu(userId: number, defaultMenu = "MainMenu"): Promise<string> {
    return this.get(`${SETTINGS.menuNavPrefix}_${userId}`, defaultMenu);
  }

  public async setUserMenu(userId: number, menuName: string): Promise<void> {
    await this.set(`${SETTINGS.menuNavPrefix}_${userId}`, menuName);
  }

  public async getWizardDraft<T>(userId: number): Promise<T | null> {
    const raw = await this.get(`${SETTINGS.wizardDraftPrefix}_${userId}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  public async setWizardDraft<T>(userId: number, draft: T): Promise<void> {
    await this.set(`${SETTINGS.wizardDraftPrefix}_${userId}`, JSON.stringify(draft));
  }

  public async clearWizardDraft(userId: number): Promise<void> {
    await this.delete(`${SETTINGS.wizardDraftPrefix}_${userId}`);
  }

  public async getSnoozeIntervals(fallback: number[] = [5, 10, 20, 40, 60]): Promise<number[]> {
    const raw = await this.get(SETTINGS.snoozeIntervals);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as number[]) : fallback;
    } catch {
      return fallback;
    }
  }

  public async setSnoozeIntervals(intervals: number[]): Promise<void> {
    await this.set(SETTINGS.snoozeIntervals, JSON.stringify(intervals));
  }

  public async getAutoRepeatIntervals(fallback: number[] = [5, 10, 20, 40]): Promise<number[]> {
    const raw = await this.get(SETTINGS.repeatIntervals);
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as number[]) : fallback;
    } catch {
      return fallback;
    }
  }

  public async setAutoRepeatIntervals(intervals: number[]): Promise<void> {
    await this.set(SETTINGS.repeatIntervals, JSON.stringify(intervals));
  }
}
