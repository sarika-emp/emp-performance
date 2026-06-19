import type { Knex } from "knex";

// Delivery log for outbound emails / reminders. Every send attempt (success or
// failure) is recorded so admins can diagnose missed notifications from the
// Settings -> Notification Log page.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("notification_log"))) {
    await knex.schema.createTable("notification_log", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("channel", 32).notNullable().defaultTo("email"); // email | in_app
      t.string("category", 64).notNullable(); // review_reminder, pip_reminder, etc.
      t.string("recipient", 255).nullable(); // email address or user id
      t.string("subject", 512).nullable();
      t.string("status", 16).notNullable().defaultTo("sent"); // sent | failed
      t.text("error").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "created_at"]);
      t.index(["organization_id", "status"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_log");
}
