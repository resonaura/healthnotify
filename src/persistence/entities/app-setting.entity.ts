import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("app_settings")
export class AppSetting {
  @PrimaryColumn({ type: "varchar", length: 64 })
  key!: string;

  @Column({ type: "text" })
  value!: string;

  @UpdateDateColumn({ type: "datetime" })
  updatedAt!: Date;
}
