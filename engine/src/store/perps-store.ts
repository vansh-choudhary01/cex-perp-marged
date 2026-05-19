import { AVLTreeInit } from "../algos/avl";
import { AVLTree } from "avl";

export type Side = "buy" | "sell";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";
export type OrderType = "market" | "limit";

export interface Balance {
  available: number;
  locked: number;
  leverageAmount: number;
}

export type Bid = {
    availableQty: number,
    openOrders: RestingOrder[]
}

export interface RestingOrder {
  orderId: string;
  userId: string;
  side: Side;
  type: "limit";
  symbol: string;
  price: number;
  qty: number;
  filledQty: number;
  totalPrice: number;
  averagePrice: number | null;
  status: OrderStatus;
  createdAt: number;
}

export interface Fill {
  fillId: string;
  symbol: string;
  price: number;
  qty: number;
  buyOrderId: string;
  sellOrderId: string;
  createdAt: number;
}

export interface OrderRecord {
  orderId: string;
  userId: string;
  side: Side;
  type: OrderType;
  symbol: string;
  price: number | null;
  qty: number;
  margin: number;
  filledQty: number;
  totalPrice: number;
  averagePrice: number | null;
  status: OrderStatus;
  fills: Fill[];
  createdAt: number;
}

export type Orderbook = {
    bids: AVLTree<number, Bid>,
    asks: AVLTree<number, Bid>,
    lastTradedPrice: number,
    indexPrice: number
}

export interface Position {
  market: "SOL" | "ETH",
  type: "LONG" | "SORT",
  qty: number,
  margin: number,
  liquidationPrice: number,
  pnL: number,
  averagePrice: number | null,
}

export type Orderbooks = Record<string, Orderbook>

export const orderbooks: Orderbooks = {
    SOL: { bids: AVLTreeInit.create("new"), asks: AVLTreeInit.create("new"), lastTradedPrice: 90, indexPrice: 90.01 },
    ETH: { bids: AVLTreeInit.create("new"), asks: AVLTreeInit.create("new"), lastTradedPrice: 1900, indexPrice: 1899.9 }
}

export const ORDERBOOKS: Orderbooks = {
    SOL: { bids: AVLTreeInit.create("new"), asks: AVLTreeInit.create("new"), lastTradedPrice: 90, indexPrice: 90.01 },
    ETH: { bids: AVLTreeInit.create("new"), asks: AVLTreeInit.create("new"), lastTradedPrice: 1900, indexPrice: 1899.9 }
}

export const FILLS: Fill[] = [];

export const ORDERS = new Map<string, OrderRecord[]>();

export const BALANCES = new Map<string, Record<string, Balance>>();

export const INDEXPRICES = {
  SOL: { indexPrice: 0, leverageThresold: 100},
  ETH: { indexPrice: 0, leverageThresold: 100},
};