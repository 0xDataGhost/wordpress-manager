CREATE TABLE "wp_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"domain" text NOT NULL,
	"action" text NOT NULL,
	"target_wp_id" integer,
	"payload" jsonb,
	"expected_version" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"result" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "store_connections" ADD COLUMN "connector_capabilities" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN "origin_command_id" uuid;--> statement-breakpoint
ALTER TABLE "wp_commands" ADD CONSTRAINT "wp_commands_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wp_commands" ADD CONSTRAINT "wp_commands_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wp_commands_store_idempotency_unique" ON "wp_commands" USING btree ("store_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "wp_commands_store_status_idx" ON "wp_commands" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "wp_commands_store_domain_target_idx" ON "wp_commands" USING btree ("store_id","domain","target_wp_id");--> statement-breakpoint
CREATE INDEX "wp_commands_store_created_idx" ON "wp_commands" USING btree ("store_id","created_at","id");