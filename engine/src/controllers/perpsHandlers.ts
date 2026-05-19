import type { EngineRequest } from "..";
import { BALANCES, FILLS, INDEXPRICES, ORDERBOOKS, ORDERS, type OrderRecord, type OrderStatus, type OrderType, type Position, type RestingOrder, type Side } from "../store/perps-store";

export function createOrder(message: EngineRequest) {
    let orderbook = ORDERBOOKS[message.payload.symbol as string];
    // if (!orderbook) {
    //     orderbook = {
    //         bids: AVLTreeInit.create("new"),
    //         asks: AVLTreeInit.create("new"),
    //     }
    //     ORDERBOOKS.set(message.payload.symbol as string, orderbook);
    // }
    let orderbookBuy = orderbook!.bids;
    let orderbookSell = orderbook!.asks;
    let order: OrderRecord = {
        orderId: crypto.randomUUID(),
        userId: String(message.payload.userId),
        side: message.payload.side as Side,
        type: message.payload.type as OrderType,
        symbol: String(message.payload.symbol),
        price: Number(message.payload.price),
        qty: Number(message.payload.qty),
        margin: Number(message.payload.margin),
        filledQty: 0,
        totalPrice: 0,
        averagePrice: null,
        status: "open" as OrderStatus,
        fills: [],
        createdAt: Date.now()
    };

    type Indexprice = keyof typeof INDEXPRICES;
    const leverage = (order.qty * INDEXPRICES[order.symbol as Indexprice].indexPrice) / order.margin;
    if (leverage > INDEXPRICES[order.symbol as Indexprice].leverageThresold) {
        order.status = "cancelled";
        return order;
    }

    let position: Position = {
        market: message.payload.symbol as "SOL" | "ETH",
        type: message.payload.type === "buy" ? "LONG" : "SORT",
        qty: Number(message.payload.qty),
        margin: Number(message.payload.margin),
        liquidationPrice: (leverage * order.margin) - order.margin,
        pnL: 0,
        averagePrice: null,
    }

    if (!ORDERS.get(String(message.payload.userId))) {
        ORDERS.set(String(message.payload.userId), [order]);
    } else {
        const orders = ORDERS.get(String(message.payload.userId))
        orders?.push(order);
    }

    if (message.payload.type === "limit") {
        message.payload.price = Number(message.payload.price) as number;
        message.payload.qty = Number(message.payload.qty) as number;

        if (message.payload.side === "sell") {
            // if (!highestPrice) { throw new Error("Buy OrderBook is empty")};
            const userBalance = BALANCES.get(order.userId);
            if (!userBalance || (userBalance!["USDT"]?.available! < order.margin)) {
                order.status = "cancelled";
                return order;
            } else {
                userBalance[order.symbol]!.available -= order.margin;
                userBalance[order.symbol]!.locked += order.margin;
                userBalance[order.symbol]!.leverageAmount += (leverage * order.margin) - order.margin;
            }
            while (Number(message.payload.qty) > 0) {
                let highestPrice = orderbookBuy.maxNode();
                let bid = highestPrice?.data?.openOrders;
                let filledQty = 0;
                console.log("bid list on given price ", bid);

                if (!bid || bid.length === 0) {
                    orderbookBuy.popMax();
                    while (highestPrice && orderbookBuy.maxNode()?.key === highestPrice.key) {
                        orderbookBuy.popMax();
                    }
                    highestPrice = orderbookBuy.maxNode();
                    bid = highestPrice?.data?.openOrders;
                }

                if (!highestPrice || highestPrice.key < Number(message.payload.price) || !bid || bid.length === 0) {
                    let ask = orderbookSell.find(Number(message.payload.price));
                    if (!ask) {
                        orderbookSell.insert(Number(message.payload.price), {
                            availableQty: 0,
                            openOrders: []
                        });
                        ask = orderbookSell.find(Number(message.payload.price));
                    }
                    ask?.data?.openOrders.push(order as RestingOrder);
                    // orderbookSell.push({ price: Number(message.payload.price) });

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
                        topBid!.status = "partially_filled";
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
                        topBid!.status = "filled";
                    }
                    if (topBid!.qty === topBid!.filledQty) {
                        bid?.shift();
                        orderbookBuy.popMax();
                        while (orderbookBuy.maxNode()?.key === topBid!.price && !bid.length) {
                            orderbookBuy.popMax();
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
                let lowestPrice = orderbookSell.minNode();
                console.log("lowestPrice: ", lowestPrice);
                console.log("ask qty ;", Number(message.payload.qty));
                let ask = lowestPrice?.data?.openOrders;
                console.log("ask list on given price ", ask);

                if (!ask || !ask.length) {
                    orderbookSell.pop();
                    while (lowestPrice && orderbookSell.minNode()?.key === lowestPrice.key) {
                        orderbookSell.pop();
                    }
                    lowestPrice = orderbookSell.minNode();
                    ask = lowestPrice?.data?.openOrders
                }
                if (!lowestPrice || lowestPrice.key > Number(message.payload.price) || !ask || ask.length === 0) {
                    let bid = orderbookBuy.find(Number(message.payload.price));
                    if (!bid) {
                        orderbookBuy.insert(Number(message.payload.price), {
                            availableQty: 0,
                            openOrders: []
                        });
                        bid = orderbookBuy.find(Number(message.payload.price))
                    }
                    bid?.data?.openOrders?.push(order as RestingOrder);
                    // orderbookBuy.push({ price: Number(message.payload.price) });
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
                        topAsk!.status = "partially_filled";
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
                        topAsk!.status = "filled";
                    }

                    if (topAsk!.qty === topAsk!.filledQty) {
                        ask?.shift();
                        orderbookSell.pop();
                        while (orderbookSell.minNode()?.key === topAsk!.price && !ask.length) {
                            orderbookSell.pop();
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

        if (message.payload.side === "sell") {
            if (userBalance![order.symbol]!.available < order.qty) {
                order.status = "cancelled";
                return order;
            }
            while (Number(message.payload.qty) > 0) {
                let highestPrice = orderbookBuy.maxNode();
                let bid = highestPrice?.data?.openOrders;

                if (!bid || !bid.length) {
                    orderbookBuy.popMax();
                    while (highestPrice && orderbookBuy.maxNode()?.key === highestPrice.key) {
                        orderbookBuy.popMax();
                    }
                    highestPrice = orderbookBuy.maxNode();
                    bid = highestPrice?.data?.openOrders;
                }
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
                        topBid!.status = "partially_filled";
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
                        topBid!.status = "filled";
                    }
                    if (topBid!.qty === topBid!.filledQty) {
                        bid?.shift();
                        orderbookBuy.maxNode();
                        while (orderbookBuy.maxNode()?.key === topBid!.price && !bid.length) {
                            orderbookBuy.popMax();
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
                let lowestPrice = orderbookSell.minNode();
                let ask = lowestPrice?.data?.openOrders;

                if (!ask || !ask.length) {
                    orderbookSell.minNode();
                    while (lowestPrice && orderbookSell.minNode()?.key === lowestPrice.key) {
                        orderbookSell.pop();
                    }
                    lowestPrice = orderbookSell.minNode();
                    ask = lowestPrice?.data?.openOrders;
                }
                if (!lowestPrice || !ask || ask.length === 0) {
                    message.payload.qty = 0;
                } else {
                    if (message.payload.qty as number > userBalance!["USD"]!.available / lowestPrice!.key) {
                        message.payload.qty = userBalance!["USD"]!.available / lowestPrice!.key;
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
                        topAsk!.status = "partially_filled";
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
                        topAsk!.status = "filled";
                    }

                    if (topAsk!.qty === topAsk!.filledQty) {
                        ask?.shift();
                        orderbookSell.pop();
                        while (orderbookSell.minNode()?.key === topAsk!.price && !ask.length) {
                            orderbookSell.pop();
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