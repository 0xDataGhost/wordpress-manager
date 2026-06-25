CREATE TABLE "code_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"code_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"customer_id" uuid,
	"assignment_type" text DEFAULT 'sale' NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"replaced_by_assignment_id" uuid,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "digital_delivery_status" text DEFAULT 'not_required' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "digital_delivery_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "digital_delivery_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_code_id_digital_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."digital_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_assignments" ADD CONSTRAINT "code_assignments_replaced_by_assignment_id_code_assignments_id_fk" FOREIGN KEY ("replaced_by_assignment_id") REFERENCES "public"."code_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "code_assignments_active_code_unique" ON "code_assignments" USING btree ("store_id","code_id") WHERE "code_assignments"."status" in ('assigned','delivered');--> statement-breakpoint
CREATE INDEX "code_assignments_store_order_idx" ON "code_assignments" USING btree ("store_id","order_id");--> statement-breakpoint
CREATE INDEX "code_assignments_store_order_item_idx" ON "code_assignments" USING btree ("store_id","order_item_id");--> statement-breakpoint
CREATE INDEX "code_assignments_store_customer_idx" ON "code_assignments" USING btree ("store_id","customer_id");--> statement-breakpoint
CREATE INDEX "code_assignments_store_product_idx" ON "code_assignments" USING btree ("store_id","product_id");--> statement-breakpoint
CREATE INDEX "code_assignments_store_created_idx" ON "code_assignments" USING btree ("store_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_store_digital_status_idx" ON "orders" USING btree ("store_id","digital_delivery_status");