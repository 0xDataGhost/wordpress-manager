import "dotenv/config";
import { closeDatabase } from "../db";
import { closeQueues } from "../queue";
import {
  runDailySalesReport,
  runLowStockCheck,
  runWhatsappOrderMessage,
} from "../modules/automations/automations.service";
import type { AutomationType } from "../db/schema/automations";

/**
 * Manual automation runner — the safe execution helper for Phase 11 while no
 * BullMQ worker consumes the automation queues yet. Runs a single automation
 * for a store synchronously, writing the same log + notification a worker would.
 *
 * Usage:
 *   tsx src/scripts/run-automation.ts <type> <storeId> [--force] [--orderId=<id>]
 *
 *   <type> = low_stock_alert | daily_sales_report | whatsapp_order_message
 *   --force  run even when the automation is disabled (testing aid)
 *
 * WhatsApp NEVER sends a real message — it only enqueues a placeholder + logs.
 */
const USAGE =
  "Usage: tsx src/scripts/run-automation.ts <low_stock_alert|daily_sales_report|whatsapp_order_message> <storeId> [--force] [--orderId=<id>]";

async function main(): Promise<void> {
  const [type, storeId, ...rest] = process.argv.slice(2);

  if (!type || !storeId) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  const force = rest.includes("--force");
  const orderIdArg = rest.find((a) => a.startsWith("--orderId="));
  const orderId = orderIdArg ? orderIdArg.split("=")[1] : undefined;

  let result;
  switch (type as AutomationType) {
    case "low_stock_alert":
      result = await runLowStockCheck(storeId, { force });
      break;
    case "daily_sales_report":
      result = await runDailySalesReport(storeId, { force });
      break;
    case "whatsapp_order_message":
      result = await runWhatsappOrderMessage(storeId, { force, orderId });
      break;
    default:
      console.error(`Unknown automation type "${type}".\n${USAGE}`);
      process.exitCode = 1;
      return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await closeQueues();
    await closeDatabase();
    process.exit(process.exitCode ?? 0);
  })
  .catch(async (err) => {
    console.error("Automation run failed:", err);
    await closeQueues().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
