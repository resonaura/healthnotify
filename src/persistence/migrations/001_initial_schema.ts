import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1700000000001 implements MigrationInterface {
  name = "InitialSchema1700000000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt DATETIME NOT NULL
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS bot_users (
        id INTEGER PRIMARY KEY,
        username VARCHAR(64),
        firstName TEXT NOT NULL,
        lastName TEXT,
        role VARCHAR(16) NOT NULL DEFAULT 'USER',
        dmActive BOOLEAN NOT NULL DEFAULT 0,
        language VARCHAR(8) NOT NULL DEFAULT 'ru',
        dataConsent BOOLEAN NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS registered_chats (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        chatType VARCHAR(32) NOT NULL,
        addedByUserId INTEGER NOT NULL,
        isActive BOOLEAN NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reminder_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category VARCHAR(32) NOT NULL DEFAULT 'measurement',
        createdByUserId INTEGER NOT NULL,
        targetUserIdsJson TEXT NOT NULL,
        destinationChatId INTEGER NOT NULL,
        destinationType VARCHAR(16) NOT NULL DEFAULT 'group',
        scheduleType VARCHAR(32) NOT NULL DEFAULT 'daily',
        timesOfDayJson TEXT NOT NULL,
        daysOfWeekJson TEXT,
        timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Moscow',
        startDate VARCHAR(10) NOT NULL,
        endDate VARCHAR(10),
        snoozeIntervalsJson TEXT NOT NULL DEFAULT '[5,10,20,40,60]',
        maxSnoozeCount INTEGER NOT NULL DEFAULT 5,
        autoRepeatIntervalsJson TEXT NOT NULL DEFAULT '[5,10,20,40]',
        maxAutoRepeatCount INTEGER NOT NULL DEFAULT 4,
        activeStatus VARCHAR(16) NOT NULL DEFAULT 'active',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reminder_occurrences (
        id VARCHAR(36) PRIMARY KEY,
        reminderDefinitionId INTEGER NOT NULL,
        targetUserId INTEGER NOT NULL,
        plannedAtUtc DATETIME NOT NULL,
        dueAtUtc DATETIME NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED',
        snoozeCount INTEGER NOT NULL DEFAULT 0,
        repeatCount INTEGER NOT NULL DEFAULT 0,
        snoozedUntilUtc DATETIME,
        lastDeliveredAtUtc DATETIME,
        completedAtUtc DATETIME,
        skippedAtUtc DATETIME,
        missedAtUtc DATETIME,
        cancelledAtUtc DATETIME,
        activeMessageChatId INTEGER,
        activeMessageId INTEGER,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_occurrences_due_status 
      ON reminder_occurrences (status, dueAtUtc);
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_definition_target_planned 
      ON reminder_occurrences (reminderDefinitionId, targetUserId, plannedAtUtc);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurrenceId VARCHAR(36) NOT NULL,
        attemptType VARCHAR(16) NOT NULL DEFAULT 'initial',
        destinationChatId INTEGER NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'success',
        telegramMessageId INTEGER,
        errorMessage TEXT,
        attemptedAtUtc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reminder_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurrenceId VARCHAR(36) NOT NULL,
        reminderDefinitionId INTEGER NOT NULL,
        targetUserId INTEGER NOT NULL,
        actorUserId INTEGER NOT NULL DEFAULT 0,
        eventType VARCHAR(32) NOT NULL,
        payloadJson TEXT,
        createdAtUtc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS health_measurements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        occurrenceId VARCHAR(36),
        targetUserId INTEGER NOT NULL,
        measurementType VARCHAR(32) NOT NULL DEFAULT 'blood_pressure',
        valueJson TEXT NOT NULL,
        note TEXT,
        recordedAtUtc DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS health_measurements;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reminder_events;`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_attempts;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reminder_occurrences;`);
    await queryRunner.query(`DROP TABLE IF EXISTS reminder_definitions;`);
    await queryRunner.query(`DROP TABLE IF EXISTS registered_chats;`);
    await queryRunner.query(`DROP TABLE IF EXISTS bot_users;`);
    await queryRunner.query(`DROP TABLE IF EXISTS app_settings;`);
  }
}
