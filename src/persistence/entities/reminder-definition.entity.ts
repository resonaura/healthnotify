import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type ReminderCategory =
  "measurement" | "medication" | "procedure" | "exercise" | "habit" | "custom";

export type ScheduleType = "once" | "daily" | "weekdays" | "interval";
export type DestinationType = "dm" | "group";
export type ActiveStatus = "active" | "paused" | "archived";

@Entity("reminder_definitions")
export class ReminderDefinition {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 32, default: "measurement" })
  category!: ReminderCategory;

  @Column({ type: "integer" })
  createdByUserId!: number;

  @Column({ type: "text" })
  targetUserIdsJson!: string;

  @Column({ type: "integer" })
  destinationChatId!: number;

  @Column({ type: "varchar", length: 16, default: "group" })
  destinationType!: DestinationType;

  @Column({ type: "varchar", length: 32, default: "daily" })
  scheduleType!: ScheduleType;

  @Column({ type: "text" })
  timesOfDayJson!: string;

  @Column({ type: "text", nullable: true })
  daysOfWeekJson!: string | null;

  @Column({ type: "varchar", length: 64, default: "Europe/Moscow" })
  timezone!: string;

  @Column({ type: "varchar", length: 10 })
  startDate!: string;

  @Column({ type: "varchar", length: 10, nullable: true })
  endDate!: string | null;

  @Column({ type: "text", default: "[5,10,20,40,60]" })
  snoozeIntervalsJson!: string;

  @Column({ type: "integer", default: 5 })
  maxSnoozeCount!: number;

  @Column({ type: "text", default: "[5,10,20,40]" })
  autoRepeatIntervalsJson!: string;

  @Column({ type: "integer", default: 4 })
  maxAutoRepeatCount!: number;

  @Column({ type: "varchar", length: 16, default: "active" })
  activeStatus!: ActiveStatus;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;

  public getTargetUserIds(): number[] {
    try {
      return JSON.parse(this.targetUserIdsJson) as number[];
    } catch {
      return [];
    }
  }

  public getTimesOfDay(): string[] {
    try {
      return JSON.parse(this.timesOfDayJson) as string[];
    } catch {
      return [];
    }
  }

  public getDaysOfWeek(): number[] | null {
    if (!this.daysOfWeekJson) return null;
    try {
      return JSON.parse(this.daysOfWeekJson) as number[];
    } catch {
      return null;
    }
  }

  public getSnoozeIntervals(): number[] {
    try {
      return JSON.parse(this.snoozeIntervalsJson) as number[];
    } catch {
      return [5, 10, 20, 40, 60];
    }
  }

  public getAutoRepeatIntervals(): number[] {
    try {
      return JSON.parse(this.autoRepeatIntervalsJson) as number[];
    } catch {
      return [5, 10, 20, 40];
    }
  }
}
