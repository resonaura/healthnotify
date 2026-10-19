import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type ChatType = "group" | "supergroup" | "channel";

@Entity("registered_chats")
export class RegisteredChat {
  @PrimaryColumn({ type: "integer" })
  id!: number;

  @Column({ type: "text" })
  title!: string;

  @Column({ type: "varchar", length: 32 })
  chatType!: ChatType;

  @Column({ type: "integer" })
  addedByUserId!: number;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "datetime" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}
