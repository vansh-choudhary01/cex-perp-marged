import type { EngineRequest } from "..";
import type { OrderRecord } from "../store/perps-store";
import { createOrderObj, createPositionObj, handleLimitOrder, handleMarketOrder } from "./futuresControllers";

export function createOrder(message: EngineRequest) {
    // create order
    const order = createOrderObj(message);
    const position = createPositionObj(order);

    if (order.type === "limit") {
        handleLimitOrder(order);
    } else if (order.type === "market") {
        handleMarketOrder(order);
    }

    return order;
}