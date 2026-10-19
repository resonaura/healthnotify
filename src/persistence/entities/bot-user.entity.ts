import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type UserRole = "ADMIN" | "USER";

@Entity("bot_users")
export class BotUser {
  @PrimaryColumn({ type: "integer" })
  id!: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  username!: string | null;

  @Column({ type: "text" })
  firstName!: string;

  @Column({ type: "text", nullable: true })
  lastName!: string | null;

  @Column({ type: "varchar", length: 16, default: "USER" })
  role!: UserRole;

  @Column({ type: "boolean", default: false })
  dmActive!: boolean;

  @Column({ type: "varchar", length: 8, default: "ru" })
  language!: string;

  @Column({ type: "boolean", default: true })
  dataConsent!: boolean;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}
