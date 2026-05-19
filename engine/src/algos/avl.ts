import {AVLTree} from 'avl';
import type { Bid } from '../store/perps-store';
// const tree = new AVLTree();

type treeObj = AVLTree<number, Bid> | null;
type Comparator = (a: number, b: number) => number;
const algo: Comparator = (a, b) => a - b;

export class AVLTreeInit {
    static initialTree: treeObj = null;
    static create(type: string): AVLTree<number, Bid> {
        if (type === 'new') {
            return new AVLTree<number, Bid>(algo);
        }
        if (!AVLTreeInit.initialTree) {
            AVLTreeInit.initialTree = new AVLTree();
            return AVLTreeInit.initialTree
        }
        return AVLTreeInit.initialTree;
    }
} 