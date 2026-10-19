import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type ReminderEventType =
  | "scheduled"
  | "sent"
  | "repeated"
  | "snoozed"
  | "completed"
  | "skipped"
  | "missed"
  | "unknown"
  | "cancelled"
  | "paused"
  | "resumed"
  | "updated"
  | "delivery_failed"
  | "unauthorized_click";

@Entity("reminder_events")
export class ReminderEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 36 })
  occurrenceId!: string;

  @Column({ type: "integer" })
  reminderDefinitionId!: number;

  @Column({ type: "integer" })
  targetUserId!: number;

  @Column({ type: "integer", default: 0 })
  actorUserId!: number;

  @Column({ type: "varchar", length: 32 })
  eventType!: ReminderEventType;

  @Column({ type: "text", nullable: true })
  payloadJson!: string | null;

  @CreateDateColumn({ type: "datetime" })
  createdAtUtc!: Date;
}
