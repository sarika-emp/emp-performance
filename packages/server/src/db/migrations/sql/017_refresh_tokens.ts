import type { Knex } from "knex";

// Persisted refresh-token / session store so that refresh tokens can be
// revoked on logout or compromise. The token itself is never stored — only a
// SHA-256 hash of the signed JWT (jti) is kept, alongside expiry and revocation
// metadata. The refresh flow checks this table and rejects revoked/missing rows.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable("refresh_tokens"))) {
    await knex.schema.createTable("refresh_tokens", (t) => {
      t.uuid("id").primary(); // == the jti embedded in the refresh JWT
      t.bigInteger("user_id").unsigned().notNullable();
      t.bigInteger("organization_id").unsigned().notNullable();
      t.string("token_hash", 128).notNullable(); // sha256 of the signed token
      t.timestamp("expires_at").notNullable();
      t.timestamp("revoked_at").nullable();
      t.string("user_agent", 512).nullable();
      t.string("ip_address", 64).nullable();
      t.timestamp("created_at").defaultTo(knex.fn.now());
      t.timestamp("updated_at").defaultTo(knex.fn.now());

      t.index(["user_id"]);
      t.index(["expires_at"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("refresh_tokens");
}
