import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type DeliveryAttemptType = "initial" | "repeat" | "snooze";
export type DeliveryStatus = "success" | "failed";

@Entity("delivery_attempts")
export class DeliveryAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 36 })
  occurrenceId!: string;

  @Column({ type: "varchar", length: 16, default: "initial" })
  attemptType!: DeliveryAttemptType;

  @Column({ type: "integer" })
  destinationChatId!: number;

  @Column({ type: "varchar", length: 16, default: "success" })
  status!: DeliveryStatus;

  @Column({ type: "integer", nullable: true })
  telegramMessageId!: number | null;

  @Column({ type: "text", nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: "datetime" })
  attemptedAtUtc!: Date;
}
