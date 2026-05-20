import type { EngineRequest } from "..";
import { BALANCES, INDEXPRICES, type OrderRecord } from "../store/perps-store";
import { createOrderObj, createPositionObj, handleOrder } from "./futuresControllers";

type PRICESINDEX = keyof typeof INDEXPRICES;

export function createOrder(message: EngineRequest) {
    // create order
    const order = createOrderObj(message);
    
    const indexPrice = INDEXPRICES[order.symbol];
    const balance = BALANCES.get(order.userId)!["USDT"]!;

    if (balance.available < order.margin) {
        order.status = "cancelled";
        return order;
    } else if (order.leverage > indexPrice.leverageThresold) {
        order.status = "cancelled";
        return order;
    }

    balance.available -= order.margin;
    balance.locked += order.margin;

    const position = createPositionObj(order);

    handleOrder(order);

    return order;
}