import type { Knex } from "knex";

// In-app notification feed. Each row is a single notification targeted at one
// user within an organization. Drives the bell dropdown, unread counts, and
// the /notifications page.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("notifications"))) {
    await knex.schema.createTable("notifications", (t) => {
      t.uuid("id").primary();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.bigInteger("user_id").unsigned().notNullable(); // recipient (empcloud user id)
      t.string("type", 64).notNullable().defaultTo("system");
      t.string("title", 255).notNullable();
      t.text("body").nullable();
      t.string("link", 512).nullable(); // in-app deep link (e.g. /reviews/:id/edit)
      t.boolean("is_read").notNullable().defaultTo(false);
      t.timestamp("read_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["organization_id", "user_id"]);
      t.index(["organization_id", "user_id", "is_read"]);
      t.index(["created_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notifications");
}
