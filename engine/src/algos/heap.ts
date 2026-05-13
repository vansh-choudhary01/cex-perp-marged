import type { RestingOrder } from "../store/exchange-store";

interface ElementType {
    price: number,
    quantity: number
    userId: string
}

export interface MinHeapType {
    price: number, // price
    // restingOrders: RestingOrder // orders
}

export interface MaxHeapType {
    price: number,
    // restingOrders: RestingOrder // orders
}

export class MinHeap {
    heap = [] as MinHeapType[];
    constructor() {
        this.heap = [];
    }

    push({price}: ElementType) {
        this.heap.push({price: price});
        this.heapifyUp();
    }

    getParent(i: number) {
        return Math.floor((i - 1) / 2);
    }

    getLeftChild(i: number) {
        return Math.floor((2 * i) + 1);
    }

    getRightChild(i: number) {
        return Math.floor((2 * i) + 2);
    }

    heapifyUp() {
        // left 2*i + 1
        // right 2*i + 2
        let index = this.heap.length - 1;

        while(index > 0 && this.heap[index]!.price < this.heap[this.getParent(index)]!.price) {
            this.swap(index, this.getParent(index));
            index = this.getParent(index);
        }
    }

    swap(i: number, j:number) {
        let temp = this.heap[i]
        this.heap[i] = this.heap[j] as ElementType
        this.heap[j] = temp as ElementType;
    }

    heapifyDown() {
        let index = 0;
        
        while(this.getLeftChild(index) < this.heap.length) {
            let smallChild = this.getLeftChild(index);

            if (this.getRightChild(index) < this.heap.length && this.heap[smallChild]!.price > this.heap[this.getRightChild(index)]!.price) {
                smallChild = this.getRightChild(index);
            }

            this.swap(index, smallChild);
            index = smallChild;
        }
    }

    getTop() {
        return this.heap.length === 0 ? null : this.heap[0];
    }

    removeTop() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) {
            return this.heap.pop();
        }

        const min = this.heap[0];
        this.heap[0] = this.heap.pop() as ElementType;
        this.heapifyDown();

        return min;
    }

    // changeTopQty(val: number) {
    //     if (this.heap.length === 0) return null;
    //     this.heap[0]!.quantity = val;
    //     return this.heap[0];
    // }
}


export class MaxHeap {
    heap = [] as MaxHeapType[];
    constructor() {
        this.heap = [];
    }

    push({price}: ElementType) {
        this.heap.push({price: price});
        this.heapifyUp();
    }

    getParent(i: number) {
        return Math.floor((i - 1) / 2);
    }

    getLeftChild(i: number) {
        return Math.floor((2 * i) + 1);
    }

    getRightChild(i: number) {
        return Math.floor((2 * i) + 2);
    }

    heapifyUp() {
        // left 2*i + 1
        // right 2*i + 2
        let index = this.heap.length - 1;

        while(index > 0 && this.heap[index]!.price > this.heap[this.getParent(index)]!.price) {
            this.swap(index, this.getParent(index));
            index = this.getParent(index);
        }
    }

    swap(i: number, j:number) {
        let temp = this.heap[i]
        this.heap[i] = this.heap[j] as ElementType
        this.heap[j] = temp as ElementType;
    }

    heapifyDown() {
        let index = 0;
        
        while(this.getLeftChild(index) < this.heap.length) {
            let bigChild = this.getLeftChild(index);

            if (this.getRightChild(index) < this.heap.length && this.heap[bigChild]!.price < this.heap[this.getRightChild(index)]!.price) {
                bigChild = this.getRightChild(index);
            }

            this.swap(index, bigChild);
            index = bigChild;
        }
    }

    getTop() {
        return this.heap.length === 0 ? null : this.heap[0];
    }

    removeTop() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) {
            return this.heap.pop();
        }

        const min = this.heap[0];
        this.heap[0] = this.heap.pop() as ElementType;
        this.heapifyDown();

        return min;
    }

    // changeTop(val: number) {
    //     if (this.heap.length === 0) return null;
    //     this.heap[0]!.quantity = val;
    //     return this.heap[0];
    // }
}