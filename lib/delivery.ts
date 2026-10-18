import "server-only";
import { randomUUID } from "node:crypto";
import { claimDelivery, findOrder, markOrderSent, releaseDelivery, rotateOrderToken, type Order } from "./orders";
import { resolveDeliveryProduct } from "./catalog";
import { issueToken } from "./tokens";
import { sendDeliveryEmail } from "./email";
import { assertDownloadAvailable } from "./product-files";

export class DeliveryBusyError extends Error {}

export async function deliverOrder(input: {
  order: Order;
  initialToken?: ReturnType<typeof issueToken>;
  force?: boolean;
  email?: string;
}) {
  const lockId = randomUUID();
  let order = await claimDelivery(input.order.stripe_session_id, lockId, !!input.force);
  if (!order) {
    const current = await findOrder(input.order.stripe_session_id);
    if (!input.force && current?.email_status === "sent") return current.email;
    throw new DeliveryBusyError("Order delivery is already in progress");
  }
  try {
    const product = await resolveDeliveryProduct(order.product_id, order.product_snapshot);
    if (!product) throw new Error("Order has an unknown product");
    await assertDownloadAvailable(product.storagePath, "The purchased file is missing from Storage. Restore the original file before resending this order.");
    // A concurrent worker may have rotated the token before we acquired the lock.
    const initial = input.initialToken?.hash === order.download_token_hash ? input.initialToken : undefined;
    const token = initial ?? issueToken();
    if (!initial || input.force) {
      order = await rotateOrderToken(order.id, lockId, {
        hash: token.hash, expiresAt: token.expiresAt,
        email: input.email, resetCount: input.force,
      });
    }
    await sendDeliveryEmail({
      email: order.email, sessionId: order.stripe_session_id,
      product, token: token.token, tokenHash: token.hash,
    });
    await markOrderSent(order.id, lockId, token.hash);
    return order.email;
  } catch (error) {
    try { await releaseDelivery(order.id, lockId); } catch {
      console.error("Could not release delivery lock", { sessionId: order.stripe_session_id });
    }
    throw error;
  }
}
