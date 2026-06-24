CREATE INDEX "stores_owner_user_idx" ON "stores" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "store_users_user_idx" ON "store_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "user_roles_store_role_idx" ON "user_roles" USING btree ("store_id","role_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_store_idx" ON "refresh_tokens" USING btree ("store_id") WHERE "refresh_tokens"."store_id" is not null;--> statement-breakpoint
CREATE INDEX "products_store_created_idx" ON "products" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "products_store_status_idx" ON "products" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "customers_store_created_idx" ON "customers" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_created_idx" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_status_idx" ON "orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");