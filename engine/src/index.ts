import "dotenv/config";
import { createClient } from "redis";
import { env } from "./utils/env.js";
import { MaxHeap, MinHeap, type MaxHeapType, type MinHeapType } from "./algos/heap.js";
import { ORDERBOOKS, ORDERS, type OrderRecord, type OrderStatus, type OrderType, type RestingOrder, type Side } from "./store/exchange-store.js";

export type EngineCommandType =
  | "create_order"
  | "get_depth"
  | "get_user_balance"
  | "get_order"
  | "cancel_order";

export interface EngineRequest {
  correlationId: string;
  responseQueue: string;
  type: EngineCommandType;
  payload: Record<string, unknown>;
}

export interface EngineResponse {
  correlationId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const brokerClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis broker client error", error);
});

const responseClient = createClient({ url: env.redisUrl }).on("error", (error) => {
  console.error("Redis response client error", error);
});

await Promise.all([brokerClient.connect(), responseClient.connect()]);

async function sendResponse(responseQueue: string, response: EngineResponse): Promise<void> {
  await responseClient.lPush(responseQueue, JSON.stringify(response));
}

// const orderbookSell = new MinHeap();
// const orderbookBuy = new MaxHeap();

function handleEngineRequest(message: EngineRequest): unknown {
  /**
   * TODO(student):
   * 1. Check _message.type.
   * 2. Read _message.payload.
   * 3. Call your order book / balance / order logic.
   * 4. Return the data that should go back to the backend.
   *
   * Required message types:
   * - create_order
   * - get_depth
   * - get_user_balance
   * - get_order
   * - cancel_order
   */

  if (message.type === "create_order") {
    let orderbook = ORDERBOOKS.get(message.payload.symbol as string)
    if (!orderbook) {
      orderbook = {
        bidsHeap: new MaxHeap(), // sort through price - > RestingOrders
        asksHeap: new MinHeap(), // sort through price - > RestingOrders 
        bids: new Map<number, RestingOrder[]>,
        asks: new Map<number, RestingOrder[]>,
      }
      ORDERBOOKS.set(message.payload.symbol as string, orderbook);
    }
    let orderbookBuy = orderbook.bidsHeap;
    let orderbookSell = orderbook.asksHeap;
    let order: OrderRecord = {
      orderId: crypto.randomUUID(),
      userId: String(message.payload.userId),
      side: message.payload.side as Side,
      type: message.payload.type as OrderType,
      symbol: String(message.payload.symbol),
      price: Number(message.payload.price),
      qty: Number(message.payload.qty),
      filledQty: 0,
      status: "open" as OrderStatus,
      fills: [],
      createdAt: Date.now()
    };
    if (!ORDERS.get(String(message.payload.userId))) {
      ORDERS.set(String(message.payload.symbol), [order]);
    }

    if (message.payload.type === "limit") {
      message.payload.price = Number(message.payload.price) as number;
      message.payload.qty = Number(message.payload.qty) as number;

      // TODO: first match user balance with (message.payload.price * message.payload.qty) and freese first.
      if (message.payload.side === "sell") {
        const highestPrice = orderbookBuy.getTop();
        console.log("highestPrice", highestPrice);
        console.log("ask qty ;", Number(message.payload.qty));
        // if (!highestPrice) { throw new Error("Buy OrderBook is empty")};
        while (Number(message.payload.qty) > 0) {
          let bid = orderbook.bids.get(highestPrice?.price);
          console.log("bid list on given price ", bid);
          if (!highestPrice || highestPrice.price < Number(message.payload.price) || !bid || bid.length === 0) {
            let ask = orderbook.asks.get(Number(message.payload.price));
            if (!ask) {
              orderbook.asks.set(Number(message.payload.price), []);
              ask = orderbook.asks.get(Number(message.payload.price));
            }
            ask!.push({
              orderId: crypto.randomUUID(),
              userId: String(message.payload.userId),
              side: message.payload.side as Side,
              symbol: message.payload.symbol as string,
              price: Number(message.payload.price),
              qty: Number(message.payload.qty),
              type: "limit",
              filledQty: 0,
              status: "open",
              createdAt: Date.now(),
            })
            orderbookSell.push({ price: Number(message.payload.price) });

            message.payload.qty = 0;
          } else {
            let topBid = bid?.[0];
            console.log(topBid!.qty);

            // first check bids[0] and caluculate 
            if (topBid!.qty - topBid!.filledQty > Number(message.payload.qty)) {
              order.fills.push({
                fillId: crypto.randomUUID(),
                symbol: order.symbol,
                price: topBid!.price,
                qty: Number(message.payload.qty),
                buyOrderId: topBid!.orderId,
                sellOrderId: order.orderId,
                createdAt: Date.now()
              })

              topBid!.filledQty += Number(message.payload.qty);
              // highestPrice.quantity = diff;
              message.payload.qty = 0;
            } else {
              console.log("system ", topBid);
              order.fills.push({
                fillId: crypto.randomUUID(),
                symbol: order.symbol,
                price: topBid!.price,
                qty: topBid!.qty,
                buyOrderId: topBid!.orderId,
                sellOrderId: order.orderId,
                createdAt: Date.now()
              })

              message.payload.qty = Number(message.payload.qty) - (topBid!.qty - topBid!.filledQty);
              topBid!.filledQty = topBid!.qty;
              order.filledQty += topBid!.qty;
            }
            if (topBid!.qty === topBid!.filledQty) {
              bid?.shift();
              orderbookBuy.removeTop();
              while (orderbookBuy.getTop()?.price === topBid!.price && !bid.length) {
                orderbookBuy.removeTop();
              }
            }
          }
        }
      } else if (message.payload.side === "buy") {
        const lowestPrice = orderbookSell.getTop();
        console.log("lowestPrice: ", lowestPrice);
        console.log("ask qty ;", Number(message.payload.qty));

        while (Number(message.payload.qty) > 0) {
          let ask = orderbook.asks.get(lowestPrice?.price);
          console.log("ask list on given price ", ask);
          if (!lowestPrice || lowestPrice.price > Number(message.payload.price) || !ask || ask.length === 0) {
            let bid = orderbook.bids.get(Number(message.payload.price));
            if (!bid) {
              orderbook.bids.set(Number(message.payload.price), []);
              bid = orderbook.bids.get(Number(message.payload.price));
            }
            bid?.push({
              orderId: crypto.randomUUID(),
              userId: String(message.payload.userId),
              side: message.payload.side as Side,
              symbol: message.payload.symbol as string,
              price: Number(message.payload.price),
              qty: Number(message.payload.qty),
              type: "limit",
              filledQty: 0,
              status: "open",
              createdAt: Date.now(),
            })
            orderbookBuy.push({ price: Number(message.payload.price) });
            message.payload.qty = 0;
          } else {
            let topAsk = ask?.[0];
            console.log(topAsk!.qty);

            if (topAsk!.qty - topAsk!.filledQty > Number(message.payload.qty)) {
              order.fills.push({
                fillId: crypto.randomUUID(),
                symbol: order.symbol,
                price: topAsk!.price,
                qty: Number(message.payload.qty),
                buyOrderId: order.orderId,
                sellOrderId: topAsk!.orderId,
                createdAt: Date.now(),
              })

              console.log("topAsk!.filledQty ", topAsk!.filledQty);
              topAsk!.filledQty = topAsk!.filledQty + Number(message.payload.qty);
              order.filledQty += Number(message.payload.qty);
              message.payload.qty = 0;
            } else {
              order.fills.push({
                fillId: crypto.randomUUID(),
                symbol: order.symbol,
                price: topAsk!.price,
                qty: topAsk!.qty - topAsk!.filledQty,
                buyOrderId: order.orderId,
                sellOrderId: topAsk!.orderId,
                createdAt: Date.now(),
              });

              console.log("topAsk!.filledQty ", topAsk!.filledQty);
              console.log("topAsk!.qty ", topAsk!.qty);
              message.payload.qty = Number(message.payload.qty) - (topAsk!.qty - topAsk!.filledQty);
              order.filledQty += (topAsk!.qty - topAsk!.filledQty);
              topAsk!.filledQty = topAsk!.qty;
            }

            if (topAsk!.qty === topAsk!.filledQty) {
              ask?.shift();
              orderbookSell.removeTop();
              while (orderbookSell.getTop()?.price === topAsk!.price && !ask.length) {
                orderbookSell.removeTop();
              }
            }
          }
        }
      }
    }

    return order;
  }

  throw new Error("TODO(student): implement this engine request type");
}

console.log(`Engine listening on Redis queue: ${env.incomingQueue}`);

for (; ;) {
  const item = await brokerClient.brPop(env.incomingQueue, 0);
  if (!item) continue;

  let message: EngineRequest;

  try {
    message = JSON.parse(item.element) as EngineRequest;
  } catch {
    console.error("Skipping invalid broker message");
    continue;
  }

  try {
    const data = handleEngineRequest(message);
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: true,
      data,
    });
  } catch (error) {
    await sendResponse(message.responseQueue, {
      correlationId: message.correlationId,
      ok: false,
      error: error instanceof Error ? error.message : "engine_error",
    });
  }
}