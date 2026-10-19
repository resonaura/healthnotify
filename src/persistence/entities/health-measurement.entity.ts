import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

export type HealthMeasurementType =
  "blood_pressure" | "pulse" | "blood_sugar" | "weight" | "temperature" | "custom";

@Entity("health_measurements")
export class HealthMeasurement {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 36, nullable: true })
  occurrenceId!: string | null;

  @Column({ type: "integer" })
  targetUserId!: number;

  @Column({ type: "varchar", length: 32, default: "blood_pressure" })
  measurementType!: HealthMeasurementType;

  @Column({ type: "text" })
  valueJson!: string;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "datetime" })
  recordedAtUtc!: Date;
}
