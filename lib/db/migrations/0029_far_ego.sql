CREATE TABLE "api_keys_pool" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"function_name" text NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"is_exhausted" boolean DEFAULT false NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"quota_window_day" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "function_routing" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"function_name" text NOT NULL,
	"preferred_providers" text[] NOT NULL,
	"default_model" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys_pool" ADD CONSTRAINT "api_keys_pool_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_routing" ADD CONSTRAINT "function_routing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_pool_fn_prov_idx" ON "api_keys_pool" USING btree ("user_id","function_name","provider","is_exhausted");--> statement-breakpoint
CREATE INDEX "api_keys_pool_fn_idx" ON "api_keys_pool" USING btree ("user_id","function_name");--> statement-breakpoint
CREATE UNIQUE INDEX "function_routing_user_fn_idx" ON "function_routing" USING btree ("user_id","function_name");--> statement-breakpoint
CREATE INDEX "background_test_executions_task_id_created_at_idx" ON "background_test_executions" USING btree ("task_id","created_at");--> statement-breakpoint

-- Backfill: copy every legacy single key into the new pool so existing users
-- do not have to re-enter their secrets. We label each row as "Default" and
-- store its function as 'global' so the main agent keeps working.
INSERT INTO "api_keys_pool" (
	"id", "user_id", "function_name", "provider", "label", "value",
	"created_at", "updated_at"
)
SELECT
	"id",
	"user_id",
	'global',
	"provider",
	'Default',
	"value",
	"created_at",
	"updated_at"
FROM "keys"
ON CONFLICT DO NOTHING;
