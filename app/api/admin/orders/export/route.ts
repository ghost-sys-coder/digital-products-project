import { requireOwner } from "@/lib/auth";
import { recentOrders } from "@/lib/dashboard";
import { apiError } from "@/lib/http";
import { csvCell } from "@/lib/csv";

export const runtime = "nodejs";
export async function GET() {
  try {
    await requireOwner();
    const orders = await recentOrders(5000);
    const rows = [["Session", "Email", "Product", "Amount (minor units)", "Currency", "Email status", "Purchased at"],
      ...orders.map((order) => [order.stripe_session_id, order.email, order.product_snapshot?.name ?? order.product_id, order.amount_total, order.currency, order.email_status, order.created_at])];
    return new Response("\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="veilcode-latest-5000-orders.csv"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) { return apiError(error); }
}
