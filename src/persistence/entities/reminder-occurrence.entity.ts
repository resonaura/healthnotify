import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type OccurrenceStatus =
  | "SCHEDULED"
  | "PENDING"
  | "SNOOZED"
  | "COMPLETED"
  | "SKIPPED"
  | "MISSED"
  | "UNKNOWN"
  | "CANCELLED";

@Entity("reminder_occurrences")
@Index(["status", "dueAtUtc"])
@Index(["reminderDefinitionId", "targetUserId", "plannedAtUtc"], { unique: true })
export class ReminderOccurrence {
  @PrimaryColumn({ type: "varchar", length: 36 })
  id!: string;

  @Column({ type: "integer" })
  reminderDefinitionId!: number;

  @Column({ type: "integer" })
  targetUserId!: number;

  @Column({ type: "datetime" })
  plannedAtUtc!: Date;

  @Column({ type: "datetime" })
  dueAtUtc!: Date;

  @Column({ type: "varchar", length: 16, default: "SCHEDULED" })
  status!: OccurrenceStatus;

  @Column({ type: "integer", default: 0 })
  snoozeCount!: number;

  @Column({ type: "integer", default: 0 })
  repeatCount!: number;

  @Column({ type: "datetime", nullable: true })
  snoozedUntilUtc!: Date | null;

  @Column({ type: "datetime", nullable: true })
  lastDeliveredAtUtc!: Date | null;

  @Column({ type: "datetime", nullable: true })
  completedAtUtc!: Date | null;

  @Column({ type: "datetime", nullable: true })
  skippedAtUtc!: Date | null;

  @Column({ type: "datetime", nullable: true })
  missedAtUtc!: Date | null;

  @Column({ type: "datetime", nullable: true })
  cancelledAtUtc!: Date | null;

  @Column({ type: "integer", nullable: true })
  activeMessageChatId!: number | null;

  @Column({ type: "integer", nullable: true })
  activeMessageId!: number | null;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}
