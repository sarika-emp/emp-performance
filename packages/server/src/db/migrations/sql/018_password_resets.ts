import type { Knex } from "knex";

// Password reset tokens for the forgot/reset-password flow. Only a hash of the
// reset token is stored; the raw token is e-mailed to the user. Rows are
// single-use (consumed_at) and expire after a short window.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("password_resets"))) {
    await knex.schema.createTable("password_resets", (t) => {
      t.uuid("id").primary();
      t.bigInteger("user_id").unsigned().notNullable();
      t.string("email", 255).notNullable();
      t.string("token_hash", 128).notNullable();
      t.timestamp("expires_at").notNullable();
      t.timestamp("consumed_at").nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["token_hash"]);
      t.index(["user_id"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("password_resets");
}
