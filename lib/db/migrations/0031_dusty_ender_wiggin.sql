CREATE TABLE "platform_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"hashed_value" text NOT NULL,
	"hint" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "execution_level" text DEFAULT 'basic' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_api_keys" ADD CONSTRAINT "platform_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_api_keys_hashed_value_idx" ON "platform_api_keys" USING btree ("hashed_value");--> statement-breakpoint
CREATE INDEX "platform_api_keys_user_id_created_at_idx" ON "platform_api_keys" USING btree ("user_id","created_at");