import type { Model } from './Model'

/**
 * Shared read contract satisfied by both a plain `T[]` (SSR, non-hydrated)
 * and a `ModelList<T>` (client, hydrated). Lets consumers annotate a single
 * type — `ref<ModelCollection<User>>()` — without a server/client union,
 * since the access path is identical in both modes.
 */
export interface ModelCollection<T extends Model> extends Iterable<T> {
  readonly [index: number]: T
  readonly length: number
  at(index: number): T | undefined
  map<U>(callback: (item: T, index: number, array: T[]) => U): U[]
  filter(predicate: (item: T, index: number, array: T[]) => boolean): T[]
  find(predicate: (item: T, index: number, array: T[]) => boolean): T | undefined
  forEach(callback: (item: T, index: number, array: T[]) => void): void
  some(predicate: (item: T, index: number, array: T[]) => boolean): boolean
  every(predicate: (item: T, index: number, array: T[]) => boolean): boolean
}
