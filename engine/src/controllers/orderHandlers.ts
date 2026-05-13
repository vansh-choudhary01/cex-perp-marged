import type { EngineRequest } from "../index.js";
import { MaxHeap, MinHeap } from "../algos/heap.js";
import { BALANCES, FILLS, ORDERBOOKS, ORDERS, type OrderRecord, type OrderStatus, type OrderType, type RestingOrder, type Side } from "../store/exchange-store.js";

export function createOrder(message: EngineRequest) {
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
    totalPrice: 0,
    averagePrice: 0,
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
            totalPrice: 0,
            averagePrice: 0,
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
            const fill = {
              fillId: crypto.randomUUID(),
              symbol: order.symbol,
              price: topBid!.price,
              qty: Number(message.payload.qty),
              buyOrderId: topBid!.orderId,
              sellOrderId: order.orderId,
              createdAt: Date.now()
            }
            order.fills.push(fill);
            FILLS.push(fill);

            topBid!.filledQty += Number(message.payload.qty);
            topBid!.totalPrice += Number(message.payload.qty) * topBid!.price;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
            // highestPrice.quantity = diff;
            message.payload.qty = 0;
          } else {
            console.log("system ", topBid);
            const fill = {
              fillId: crypto.randomUUID(),
              symbol: order.symbol,
              price: topBid!.price,
              qty: topBid!.qty - topBid!.filledQty,
              buyOrderId: topBid!.orderId,
              sellOrderId: order.orderId,
              createdAt: Date.now()
            }
            order.fills.push(fill);
            FILLS.push(fill);

            message.payload.qty = Number(message.payload.qty) - (topBid!.qty - topBid!.filledQty);
            topBid!.filledQty = topBid!.qty;
            topBid!.totalPrice += topBid!.price * topBid!.qty;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
            order.filledQty += topBid!.qty - topBid!.filledQty;
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
            totalPrice: 0,
            averagePrice: 0,
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
            const fill = {
              fillId: crypto.randomUUID(),
              symbol: order.symbol,
              price: topAsk!.price,
              qty: Number(message.payload.qty),
              buyOrderId: order.orderId,
              sellOrderId: topAsk!.orderId,
              createdAt: Date.now(),
            }
            order.fills.push(fill);
            FILLS.push(fill);

            console.log("topAsk!.filledQty ", topAsk!.filledQty);
            topAsk!.filledQty = topAsk!.filledQty + Number(message.payload.qty);
            topAsk!.totalPrice += topAsk!.price * Number(message.payload.qty);
            topAsk!.averagePrice = topAsk!.totalPrice / topAsk!.filledQty;
            order.filledQty += Number(message.payload.qty);
            message.payload.qty = 0;
          } else {
            const fill = {
              fillId: crypto.randomUUID(),
              symbol: order.symbol,
              price: topAsk!.price,
              qty: topAsk!.qty - topAsk!.filledQty,
              buyOrderId: order.orderId,
              sellOrderId: topAsk!.orderId,
              createdAt: Date.now(),
            }
            order.fills.push(fill);
            FILLS.push(fill);

            console.log("topAsk!.filledQty ", topAsk!.filledQty);
            console.log("topAsk!.qty ", topAsk!.qty);
            message.payload.qty = Number(message.payload.qty) - (topAsk!.qty - topAsk!.filledQty);
            order.filledQty += (topAsk!.qty - topAsk!.filledQty);
            topAsk!.filledQty = topAsk!.qty;
            topAsk!.totalPrice += topAsk!.price * topAsk!.qty;
            topAsk!.averagePrice = topAsk!.totalPrice / topAsk!.filledQty;
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

export function updateBalance(message: EngineRequest) {
  const { userId, balance, symbol} = message.payload;
  const currentUserBalance = BALANCES.get(userId as string);
  if (!currentUserBalance) {
    BALANCES.set(userId as string, {});
  }
  if (!currentUserBalance![String(symbol)]) {
    currentUserBalance![String(symbol)] = {
      available: balance as number,
      locked: 0
    };
  } else {
    currentUserBalance![String(symbol)]!.available = balance as number;
  }

  return currentUserBalance![String(symbol)];
}

export function getBalances(message: EngineRequest) {
  const { userId } = message.payload;
  const currentUserBalance = BALANCES.get(userId as string);
  if (!currentUserBalance) {
    BALANCES.set(userId as string, {});
  }

  return currentUserBalance || {};
}