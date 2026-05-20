import type { EngineRequest } from "..";
import { INDEXPRICES, ORDERBOOKS, POSITIONS, type OrderRecord, type OrderType, type Position, type RestingOrder, type Side, type Symbol } from "../store/perps-store";
type IndexPrice = keyof typeof INDEXPRICES;
// type IndexSymbol = keyof typeof ORDERBOOKS;

export function createOrderObj(message: EngineRequest): OrderRecord {
    const indexPrice = INDEXPRICES[message.payload.symbol as IndexPrice].indexPrice;
    const leverage: number = (message.payload.qty as number * indexPrice) / (message.payload.margin as number);
    return {
        orderId: crypto.randomUUID(),
        userId: String(message.payload.userId),
        side: message.payload.side as Side,
        type: message.payload.type as OrderType,
        symbol: message.payload.symbol as Symbol,
        price: message.payload.type as number | null,
        qty: message.payload.qty as number,
        margin: message.payload.margin as number,
        indexPrice,
        leverage,
        filledQty: 0,
        totalPrice: 0,
        averagePrice: 0,
        status: 'open',
        fills: [],
        createdAt: Date.now()
    }
}

export function createPositionObj(order: OrderRecord): Position {
    const indexPrice = INDEXPRICES[order.symbol as IndexPrice].indexPrice;
    return {
        symbol: order.symbol,
        side: order.side,
        qty: order.filledQty,
        margin: order.margin,
        leverage: order.leverage,
        liquidationPrice: indexPrice - (order.margin / order.qty), // TODO
        pnL: (order.filledQty * INDEXPRICES[order.symbol as IndexPrice].indexPrice) - (order.filledQty * order.averagePrice),
        averagePrice: order.averagePrice
    }
}

export function handleOrder(order: OrderRecord) {
    if (order.side === "LONG") {
        handleLongOrder(order);
    } else if (order.side === "SORT") {
        handleSortOrder(order);
    }
}

export function handleLongOrder(order: OrderRecord) {
    // user wanna buy first sell last
    let remainingQty = order.qty - order.filledQty;
    const bidsPrices = ORDERBOOKS[order.symbol as Symbol]?.bids;
    const asksPrices = ORDERBOOKS[order.symbol as Symbol]?.asks;
    while (remainingQty > 0) {
        const minSeller = asksPrices?.minNode();

        // first i check is minSeller.orders is empty -> add in orderbook
        // partialfill / fullfill
        const restingOrder: RestingOrder = {
            orderId: order.orderId,
            userId: order.userId,
            side: order.side,
            type: "limit",
            symbol: order.symbol,
            price: order.price!,
            qty: order.qty,
            filledQty: order.filledQty,
            totalPrice: order.totalPrice,
            averagePrice: order.averagePrice,
            status: order.filledQty > 0 ? "partially_filled" : "open",
            createdAt: Date.now()
        }
        if (!minSeller || !minSeller.data?.openOrders?.length || minSeller.key > order.price!) {
            if (order.type === "market") {
                order.status = order.filledQty > 0 ? "partially_filled" : "cancelled";
                return;
            }
            const bidRestingOrders = bidsPrices?.find(order.price!);
            if (bidRestingOrders) {
                bidRestingOrders.data?.openOrders.push(restingOrder);
            } else {
                bidsPrices?.insert(order.price!, {
                    availableQty: remainingQty,
                    openOrders: [restingOrder]
                })
            }

            remainingQty = 0;
        } else {
            const firstRestingOrder = minSeller.data.openOrders[0]!;
            if (firstRestingOrder?.qty! - firstRestingOrder?.filledQty! < remainingQty) {
                const swapQty = firstRestingOrder.qty - firstRestingOrder.filledQty;
                handleFill(firstRestingOrder!, order, swapQty);
                minSeller.data.openOrders.shift();
                if (!minSeller.data.openOrders.length) {
                    asksPrices?.remove(minSeller.key);
                }
            } else {
                const swapQty = order.qty - order.filledQty;
                handleFill(firstRestingOrder!, order, swapQty);
            }
        }
    }

    if (order.qty === order.filledQty) {
        order.status = "filled";
    } else if (order.filledQty > 0) {
        order.status = "partially_filled";
    }

    return order;
}

export function handleSortOrder(order: OrderRecord) {
    // user wanna sell first buy last
    let remainingQty = order.qty - order.filledQty;
    const bidsPrices = ORDERBOOKS[order.symbol as Symbol]?.bids;
    const asksPrices = ORDERBOOKS[order.symbol as Symbol]?.asks;
    while (remainingQty > 0) {
        const maxBuyer = bidsPrices?.maxNode();

        // first i check is maxBuyer.orders is empty -> add in orderbook
        // partialfill / fullfill
        const restingOrder: RestingOrder = {
            orderId: order.orderId,
            userId: order.userId,
            side: order.side,
            type: "limit",
            symbol: order.symbol,
            price: order.price!,
            qty: order.qty,
            filledQty: order.filledQty,
            totalPrice: order.totalPrice,
            averagePrice: order.averagePrice,
            status: order.filledQty > 0 ? "partially_filled" : "open",
            createdAt: Date.now()
        }
        if (!maxBuyer || !maxBuyer.data?.openOrders?.length || maxBuyer.key < order.price!) {
            if (order.type === "market") {
                order.status = order.filledQty > 0 ? "partially_filled" : "cancelled";
                return;
            }
            const askRestingOrders = asksPrices?.find(order.price!);
            if (askRestingOrders) {
                askRestingOrders.data?.openOrders.push(restingOrder);
            } else {
                asksPrices?.insert(order.price!, {
                    availableQty: remainingQty,
                    openOrders: [restingOrder]
                })
            }

            remainingQty = 0;
        } else {
            const firstRestingOrder = maxBuyer.data.openOrders[0]!;
            if (firstRestingOrder?.qty! - firstRestingOrder?.filledQty! < remainingQty) {
                const swapQty = firstRestingOrder.qty - firstRestingOrder.filledQty;
                handleFill(firstRestingOrder!, order, swapQty);
                maxBuyer.data.openOrders.shift();
                if (!maxBuyer.data.openOrders.length) {
                    bidsPrices?.remove(maxBuyer.key);
                }
            } else {
                const swapQty = order.qty - order.filledQty;
                handleFill(firstRestingOrder!, order, swapQty);
            }
        }
    }

    if (order.qty === order.filledQty) {
        order.status = "filled";
    } else if (order.filledQty > 0) {
        order.status = "partially_filled";
    }

    return order;
}

export function handleFill(firstRestingOrder: RestingOrder, order: OrderRecord, swapQty: number) {
    const fill = {
        fillId: crypto.randomUUID(),
        symbol: order.symbol,
        price: firstRestingOrder.price,
        qty: swapQty,
        buyOrderId: firstRestingOrder.orderId,
        sellOrderId: order.orderId,
    }

    firstRestingOrder.filledQty += swapQty;
    firstRestingOrder.totalPrice += fill.price * fill.qty;
    firstRestingOrder.averagePrice = firstRestingOrder.filledQty * firstRestingOrder.averagePrice!;

    order.filledQty += swapQty;
    order.totalPrice += fill.price * fill.qty;
    order.averagePrice = order.filledQty * order.averagePrice;

    // opponenet ka resting order update
    const opponentPosition = POSITIONS.get(firstRestingOrder.orderId)!;
    opponentPosition.qty += swapQty;
    // opponentPosition.liquidationPrice = 0; // Todo
}