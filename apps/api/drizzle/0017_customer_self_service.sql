CREATE TABLE "customer_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_code_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"code_id" uuid NOT NULL,
	"assignment_id" uuid,
	"order_id" uuid,
	"customer_id" uuid,
	"token_id" uuid,
	"viewer_user_id" uuid,
	"viewer_type" text NOT NULL,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_access_tokens" ADD CONSTRAINT "customer_access_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_code_id_digital_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."digital_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_assignment_id_code_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."code_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_token_id_customer_access_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."customer_access_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_code_views" ADD CONSTRAINT "customer_code_views_viewer_user_id_users_id_fk" FOREIGN KEY ("viewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_access_tokens_token_hash_unique" ON "customer_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "customer_access_tokens_store_order_idx" ON "customer_access_tokens" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "customer_access_tokens_expires_idx" ON "customer_access_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "customer_code_views_store_code_idx" ON "customer_code_views" USING btree ("store_id","code_id");--> statement-breakpoint
CREATE INDEX "customer_code_views_store_order_idx" ON "customer_code_views" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "customer_code_views_store_created_idx" ON "customer_code_views" USING btree ("store_id","created_at","id");