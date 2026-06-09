import { reactive } from 'vue'
import type { Model } from './Model'
import type { ModelCollection } from './ModelCollection'

export class ModelList<T extends Model> implements ModelCollection<T> {
  readonly [index: number]: T
  private readonly items: T[]

  constructor(items: T[] = []) {
    this.items = reactive([...items]) as T[]

    return new Proxy(this, {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          return target.activeItems[Number(property)]
        }

        return Reflect.get(target, property, receiver)
      },
    })
  }

  private get activeItems(): T[] {
    return this.items.filter(item => !item._sharedMeta.isDeleted)
  }

  [Symbol.iterator](): Iterator<T> {
    return this.activeItems[Symbol.iterator]()
  }

  get length(): number {
    return this.activeItems.length
  }

  at(index: number): T | undefined {
    return this.activeItems.at(index)
  }

  find(predicate: (item: T, index: number, array: T[]) => boolean): T | undefined {
    return this.activeItems.find(predicate)
  }

  filter(predicate: (item: T, index: number, array: T[]) => boolean): T[] {
    return this.activeItems.filter(predicate)
  }

  map<U>(callback: (item: T, index: number, array: T[]) => U): U[] {
    return this.activeItems.map(callback)
  }

  forEach(callback: (item: T, index: number, array: T[]) => void): void {
    this.activeItems.forEach(callback)
  }

  some(predicate: (item: T, index: number, array: T[]) => boolean): boolean {
    return this.activeItems.some(predicate)
  }

  every(predicate: (item: T, index: number, array: T[]) => boolean): boolean {
    return this.activeItems.every(predicate)
  }

  push(...items: T[]): number {
    return this.items.push(...items)
  }

  replace(items: T[]): this {
    this.items.splice(0, this.items.length, ...items)
    return this
  }

  clear(): void {
    this.items.splice(0, this.items.length)
  }

  toArray(): T[] {
    return [...this.activeItems]
  }

  get raw(): T[] {
    return this.items
  }
}
