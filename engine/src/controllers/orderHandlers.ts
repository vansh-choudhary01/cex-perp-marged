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
    averagePrice: null,
    status: "open" as OrderStatus,
    fills: [],
    createdAt: Date.now()
  };
  if (!ORDERS.get(String(message.payload.userId))) {
    ORDERS.set(String(message.payload.userId), [order]);
  } else {
    const orders = ORDERS.get(String(message.payload.userId))
    orders?.push(order);
  }

  if (message.payload.type === "limit") {
    message.payload.price = Number(message.payload.price) as number;
    message.payload.qty = Number(message.payload.qty) as number;

    // TODO: first match user balance with (message.payload.price * message.payload.qty) and freese first.
    if (message.payload.side === "sell") {
      // if (!highestPrice) { throw new Error("Buy OrderBook is empty")};
      const userBalance = BALANCES.get(order.userId);
      if (!userBalance || (userBalance![order.symbol]?.available! < order.qty)) {
        order.status = "cancelled";
        return order;
      } else {
        userBalance[order.symbol]!.available -= order.qty;
        userBalance[order.symbol]!.locked += order.qty;
      }
      while (Number(message.payload.qty) > 0) {
        const highestPrice = orderbookBuy.getTop();
        let bid = orderbook.bids.get(highestPrice?.price);
        let filledQty = 0;
        console.log("bid list on given price ", bid);
        if (!highestPrice || highestPrice.price < Number(message.payload.price) || !bid || bid.length === 0) {
          let ask = orderbook.asks.get(Number(message.payload.price));
          if (!ask) {
            orderbook.asks.set(Number(message.payload.price), []);
            ask = orderbook.asks.get(Number(message.payload.price));
          }
          ask!.push({
            orderId: order.orderId,
            userId: String(message.payload.userId),
            side: message.payload.side as Side,
            symbol: message.payload.symbol as string,
            price: Number(message.payload.price),
            qty: Number(message.payload.qty),
            type: "limit",
            filledQty: 0,
            totalPrice: 0,
            averagePrice: null,
            status: "open",
            createdAt: Date.now(),
          })
          orderbookSell.push({ price: Number(message.payload.price) });

          message.payload.qty = 0;
        } else {
          let topBid = bid?.[0];
          const opponentBalance = BALANCES.get(topBid!.userId);
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

            filledQty = Number(message.payload.qty);
            topBid!.filledQty += Number(message.payload.qty);
            topBid!.totalPrice += Number(message.payload.qty) * topBid!.price;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
            order.filledQty += Number(message.payload.qty);
            order.totalPrice += Number(message.payload.qty) * topBid!.price;
            order!.averagePrice = order!.totalPrice / order!.filledQty;
            order.status = "filled";
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
            order.filledQty += topBid!.qty - topBid!.filledQty;
            order.totalPrice += topBid!.price * topBid!.qty - topBid!.filledQty;
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "partially_filled";
            filledQty = topBid!.qty - topBid!.filledQty;
            topBid!.filledQty = topBid!.qty;
            topBid!.totalPrice += topBid!.price * topBid!.qty;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
          }
          if (topBid!.qty === topBid!.filledQty) {
            bid?.shift();
            orderbookBuy.removeTop();
            while (orderbookBuy.getTop()?.price === topBid!.price && !bid.length) {
              orderbookBuy.removeTop();
            }
          }
          if (filledQty > 0) {
            opponentBalance![order.symbol]!.available += filledQty;
            opponentBalance!["USD"]!.locked -= filledQty * topBid!.price;
          }
        }
      }

      if (order.filledQty > 0) {
        userBalance[order.symbol]!.locked -= order.filledQty;
        userBalance["USD"]!.available += order.totalPrice;
      }
    } else if (message.payload.side === "buy") {
      const userBalance = BALANCES.get(order.userId);
      if (!userBalance || (userBalance!["USD"]?.available! < Number(order.price) * order.qty)) {
        order.status = "cancelled";
        return order;
      } else {
        userBalance["USD"]!.available -= Number(order.price) * order.qty;
        userBalance["USD"]!.locked += Number(order.price) * order.qty;
      }
      while (Number(message.payload.qty) > 0) {
        const lowestPrice = orderbookSell.getTop();
        console.log("lowestPrice: ", lowestPrice);
        console.log("ask qty ;", Number(message.payload.qty));
        let ask = orderbook.asks.get(lowestPrice?.price);
        console.log("ask list on given price ", ask);
        if (!lowestPrice || lowestPrice.price > Number(message.payload.price) || !ask || ask.length === 0) {
          let bid = orderbook.bids.get(Number(message.payload.price));
          if (!bid) {
            orderbook.bids.set(Number(message.payload.price), []);
            bid = orderbook.bids.get(Number(message.payload.price));
          }
          bid?.push({
            orderId: order.orderId,
            userId: String(message.payload.userId),
            side: message.payload.side as Side,
            symbol: message.payload.symbol as string,
            price: Number(message.payload.price),
            qty: Number(message.payload.qty),
            totalPrice: 0,
            averagePrice: null,
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
          const opponentBalance = BALANCES.get(topAsk!.userId);
          let filledQty = 0;

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
            filledQty = Number(message.payload.qty);
            topAsk!.filledQty += Number(message.payload.qty);
            topAsk!.totalPrice += topAsk!.price * Number(message.payload.qty);
            topAsk!.averagePrice = topAsk!.totalPrice / topAsk!.filledQty;
            order.filledQty += Number(message.payload.qty);
            order.totalPrice += topAsk!.price * Number(message.payload.qty);
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "filled";
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

            message.payload.qty = Number(message.payload.qty) - (topAsk!.qty - topAsk!.filledQty);
            order.filledQty += (topAsk!.qty - topAsk!.filledQty);
            order.totalPrice += topAsk!.price * (topAsk!.qty - topAsk!.filledQty);
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "partially_filled";
            filledQty = (topAsk!.qty - topAsk!.filledQty);
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

          if (filledQty > 0) {
            opponentBalance![order.symbol]!.locked -= filledQty;
            opponentBalance!["USD"]!.available += filledQty * topAsk!.price;
          }
        }
      }
      if (order.filledQty > 0) {
        userBalance["USD"]!.available += ((Number(order.price) * order.filledQty) - (Number(order.averagePrice) * order.filledQty));
        userBalance["USD"]!.locked -= Number(order.price) * order.filledQty;
        userBalance[order.symbol]!.available += order.filledQty;
      }
    }
    if (order.qty === order.filledQty) {
      order.status = "filled";
    }
  } else if (message.payload.type === "market") {
    message.payload.qty = Number(message.payload.qty);
    const userBalance = BALANCES.get(order.userId);
    if (!userBalance || !userBalance![order.symbol]) {
      order.status = "cancelled";
      return order;
    }

    // TODO: first match user balance with (message.payload.price * message.payload.qty) and freese first.
    if (message.payload.side === "sell") {
      if (userBalance![order.symbol]!.available < order.qty) {
        order.status = "cancelled";
        return order;
      }
      while (Number(message.payload.qty) > 0) {
        const highestPrice = orderbookBuy.getTop();
        let bid = orderbook.bids.get(highestPrice?.price);
        if (!highestPrice || !bid || bid.length === 0) {
          message.payload.qty = 0;
        } else {
          let topBid = bid?.[0];
          const opponentBalance = BALANCES.get(topBid!.userId);
          let filledQty = 0;

          // first check bids[0] and calculate
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

            filledQty = Number(message.payload.qty);
            topBid!.filledQty = Number(message.payload.qty);
            topBid!.totalPrice += Number(message.payload.qty) * topBid!.price;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
            order.filledQty = Number(message.payload.qty);
            order.totalPrice += Number(message.payload.qty) * topBid!.price;
            order!.averagePrice = order!.totalPrice / order!.filledQty;
            order.status = "filled";

            message.payload.qty = 0;
          } else {
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
            order.filledQty += topBid!.qty - topBid!.filledQty;
            order.totalPrice += topBid!.price * topBid!.qty - topBid!.filledQty;
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "partially_filled";
            filledQty = topBid!.qty - topBid!.filledQty;
            topBid!.filledQty = topBid!.qty;
            topBid!.totalPrice += topBid!.price * topBid!.qty;
            topBid!.averagePrice = topBid!.totalPrice / topBid!.filledQty;
          }
          if (topBid!.qty === topBid!.filledQty) {
            bid?.shift();
            orderbookBuy.removeTop();
            while (orderbookBuy.getTop()?.price === topBid!.price && !bid.length) {
              orderbookBuy.removeTop();
            }
          }
          if (filledQty > 0) {
            opponentBalance![order.symbol]!.available += filledQty;
            opponentBalance!["USD"]!.locked -= filledQty * topBid!.price;
          }
        }
      }

      if (order.filledQty > 0) {
        userBalance![order.symbol]!.available -= order.filledQty;
        userBalance!["USD"]!.available += order.totalPrice;
      }
    } else if (message.payload.side === "buy") {
      while (Number(message.payload.qty) > 0) {
        const lowestPrice = orderbookSell.getTop();
        let ask = orderbook.asks.get(lowestPrice?.price);
        if (!lowestPrice || !ask || ask.length === 0) {
          message.payload.qty = 0;
        } else {
          if (message.payload.qty as number > userBalance!["USD"]!.available / lowestPrice!.price) {
            message.payload.qty = userBalance!["USD"]!.available / lowestPrice!.price;
          }
          let topAsk = ask?.[0];
          const opponentBalance = BALANCES.get(topAsk!.userId);
          let filledQty = 0;
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

            filledQty = Number(message.payload.qty);
            topAsk!.filledQty += Number(message.payload.qty);
            topAsk!.totalPrice += topAsk!.price * Number(message.payload.qty);
            topAsk!.averagePrice = topAsk!.totalPrice / topAsk!.filledQty;
            order.filledQty += Number(message.payload.qty);
            order.totalPrice += topAsk!.price * Number(message.payload.qty);
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "filled";
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

            message.payload.qty = Number(message.payload.qty) - (topAsk!.qty - topAsk!.filledQty);
            order.filledQty += (topAsk!.qty - topAsk!.filledQty);
            order.totalPrice += topAsk!.price * (topAsk!.qty - topAsk!.filledQty);
            order.averagePrice = order.totalPrice / order.filledQty;
            order.status = "partially_filled";
            filledQty = (topAsk!.qty - topAsk!.filledQty);
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

          if (filledQty > 0) {
            opponentBalance![order.symbol]!.locked -= filledQty;
            opponentBalance!["USD"]!.available += filledQty * topAsk!.price;
          }
        }
      }

      if (order.filledQty > 0) {
        userBalance!["USD"]!.available -= order.totalPrice;
        userBalance![order.symbol]!.available += order.filledQty;
      }
    }

    if (order.qty === order.filledQty) {
      order.status = "filled";
    } else if (order.status === "open" && order.filledQty === 0) {
      order.status = "cancelled";
    }
  }

  return order;
}

export function updateBalance(message: EngineRequest) {
  const { userId, balance, symbol } = message.payload;
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

  // TODO: remove after testing
  if (!currentUserBalance) {
    const testingBalance = {
      "USD": {
        available: 1000000 as number,
        locked: 0
      },
      "BTC": {
        available: 1000 as number,
        locked: 0
      }
    };
    BALANCES.set(userId as string, testingBalance);
    return testingBalance;
  }

  if (!currentUserBalance) {
    BALANCES.set(userId as string, {});
  }

  return currentUserBalance || {};
}

export function getOrders(message: EngineRequest) {
  const { userId } = message.payload;
  const orders = ORDERS.get(String(userId));

  return orders || [];
}

export function getOrder(message: EngineRequest) {
  const { userId, orderId } = message.payload;
  const orders = ORDERS.get(String(userId));

  const order = orders?.find((order) => order.orderId === orderId);

  if (!order) {
    throw new Error("order not found");
  }

  return order;
}

export function cancelOrder(message: EngineRequest) {
  const { userId, orderId } = message.payload;
  const orders = ORDERS.get(String(userId));

  const order = orders?.find((order) => order.orderId === orderId);
  
  if(!order) {
    throw new Error("order not found");
  }

  const userBalance = BALANCES.get(String(userId));
  if (order.side === 'sell') {
    const remainingOrders = order.qty - order.filledQty;
    userBalance![order.symbol]!.available += remainingOrders;
    userBalance![order.symbol]!.locked -= remainingOrders;
  } else if (order.side === 'buy') {
    const remainingOrders = order.qty - order.filledQty;

    userBalance!["USD"]!.available += remainingOrders;
    userBalance!["USD"]!.locked -= remainingOrders; 
  }

  order.status = "cancelled";
  return order;
}