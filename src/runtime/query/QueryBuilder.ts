import type { ResourceMeta } from '../core/metadata'
import { MetadataStorage } from '../core/metadata'
import { hydrate } from '../model/hydrate'
import type { Model } from '../model/Model'
import { ModelList } from '../model/ModelList'
import { PayloadCache } from '../cache/payloadCache'
import getCurrentFetch from '../helpers/getCurrentFetch'
import type { ISearchResponse } from '../types/search'
import { snakeCaseToCamelCase } from '../utils/snakeCaseToCamelCase'

type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'like' | 'not like' | 'in' | 'not in' | 'between' | 'not between'
type FilterType = 'and' | 'or'
type AggregateType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'exists'

interface Filter {
  field: string
  operator?: FilterOperator
  value: any
  type?: FilterType
}

interface NestedFilter {
  nested: Filter[]
  type?: FilterType
}

interface Sort {
  field: string
  direction: 'asc' | 'desc'
}

interface Include {
  relation: string
  filters?: Filter[]
  limit?: number
  includes?: Include[]
}

interface Aggregate {
  relation: string
  type: AggregateType
  field?: string
  alias?: string
  filters?: Filter[]
}

interface Instruction {
  name: string
  fields?: Array<{ name: string, value: any }>
}

export interface SearchPayload {
  search: {
    text?: {
      value: string
    }
    filters?: (Filter | NestedFilter)[]
    sorts?: Sort[]
    selects?: Array<{ field: string }>
    includes?: Include[]
    scopes?: Array<{ name: string, parameters?: any[] }>
    aggregates?: Aggregate[]
    instructions?: Instruction[]
    gates?: string[]
    page?: number
    limit?: number
  }
}

type SearchResponse<TData = unknown[]> = {
  data: TData
} & Record<string, unknown>

export class QueryBuilder<T extends Model> {
  private resource: ResourceMeta
  private filters: (Filter | NestedFilter)[] = []
  private sorts: Sort[] = []
  private selects: string[] = []
  private includes: Include[] = []
  private scopes: Array<{ name: string, parameters?: any[] }> = []
  private aggregates: Aggregate[] = []
  private instructions: Instruction[] = []
  private gates: string[] = []
  private textSearch?: string
  private pageNumber: number | null = null
  private limitNumber: number | null = null

  constructor(resourceClass: new () => T) {
    this.resource = MetadataStorage.getResource(resourceClass)
  }

  private findDistantRelation(distantRelation: string) {
    const relationNames = distantRelation.split('.')
    let resource = this.resource
    relationNames.forEach((relationName) => {
      const relation = resource.relations.find(relation =>
        snakeCaseToCamelCase(relation.property) === relationName,
      )
      if (!relation)
        throw new Error(`Relation ${relationName} doesn't exist in resource ${resource.endpoint}`)
      resource = MetadataStorage.getResource(relation.target())
    })
    return resource
  }

  private findField(fieldName: string) {
    const fieldMeta = this.resource.fields.find(field => field.name === fieldName)
    if (!fieldMeta)
      throw new Error(`Field ${fieldName} doesn't exist in resource ${this.resource.endpoint}`)
    return fieldMeta
  }

  private findDistantField(distantField: string) {
    const nodes = distantField.split('.')
    const relationNames = nodes.slice(0, -1)
    const fieldName = nodes.at(-1)
    let resource = this.resource
    relationNames.forEach((relationName) => {
      const relation = resource.relations.find(relation =>
        snakeCaseToCamelCase(relation.property) === relationName,
      )
      if (!relation)
        throw new Error(`Relation ${relationName} doesn't exist in resource ${resource.endpoint}`)
      resource = MetadataStorage.getResource(relation.target())
    })
    const fieldMeta = resource.fields.find(field => field.name === fieldName)
    if (!fieldMeta)
      throw new Error(`Field ${fieldName} doesn't exist in resource ${resource.endpoint}`)
    return fieldMeta
  }

  private checkLimit(limit: number) {
    if (!this.resource.limits.includes(limit)) {
      throw new Error(`Limit ${limit} is not allowed for resource ${this.resource.endpoint}. Allowed limits: ${this.resource.limits.join(', ')}`)
    }
  }

  /**
   * Recherche full-text
   */
  text(value: string): this {
    this.textSearch = value
    return this
  }

  /**
   * Sélectionne les champs à retourner
   */
  select(...fields: string[]): this {
    fields.forEach(f => this.findField(f))
    this.selects = fields
    return this
  }

  /**
   * Inclut des relations
   */
  include(relation: keyof T | string, callback?: (q: QueryBuilder<any>) => void): this {
    const relationMeta = this.findDistantRelation(relation as string)

    const include: Include = {
      relation: relation as string,
    }

    if (callback) {
      const includeBuilder = new QueryBuilder<any>(relationMeta.target)
      callback(includeBuilder)
      Object.assign(include, includeBuilder.buildPayload().search)
    }

    this.includes.push(include)
    return this
  }

  /**
   * Filtre simple (AND par défaut)
   */
  where(field: keyof T | string, operator: FilterOperator | any, value?: any): this {
    // Si seulement 2 args, operator est la valeur
    if (value === undefined) {
      value = operator
      operator = '='
    }
    this.findDistantField(field as string)

    this.filters.push({
      field: field as string,
      operator: operator as FilterOperator,
      value,
    })

    return this
  }

  /**
   * Filtre OR
   */
  orWhere(field: keyof T | string, operator: FilterOperator | any, value?: any): this {
    if (value === undefined) {
      value = operator
      operator = '='
    }

    this.findDistantField(field as string)

    this.filters.push({
      field: field as string,
      operator: operator as FilterOperator,
      value,
      type: 'or',
    })
    return this
  }

  /**
   * Filtres imbriqués (pour grouper avec parenthèses)
   */
  whereNested(callback: (q: QueryBuilder<T>) => void): this {
    const nestedBuilder = new QueryBuilder<T>(this.resource.target)
    callback(nestedBuilder)
    this.filters.push({
      nested: nestedBuilder.filters as Filter[],
      type: 'and',
    })
    return this
  }

  /**
   * Tri
   */
  orderBy(field: keyof T | string, direction: 'asc' | 'desc' = 'asc'): this {
    this.findField(field as string)
    this.sorts.push({
      field: field as string,
      direction,
    })
    return this
  }

  /**
   * Applique un scope Laravel
   */
  scope(name: string, ...parameters: any[]): this {
    this.scopes.push({ name, parameters })
    return this
  }

  /**
   * Ajoute une agrégation sur une relation
   */
  aggregate(
    relation: string,
    type: AggregateType,
    field?: string,
    alias?: string,
    filters?: Filter[],
  ): this {
    const aggregate: Aggregate = { relation, type }
    if (field) aggregate.field = field
    if (alias) aggregate.alias = alias
    if (filters && filters.length > 0) aggregate.filters = filters
    this.aggregates.push(aggregate)
    return this
  }

  /**
   * Raccourcis pour les agrégations courantes
   */
  withCount(relation: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'count', undefined, alias, filters)
  }

  withSum(relation: string, field: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'sum', field, alias, filters)
  }

  withAvg(relation: string, field: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'avg', field, alias, filters)
  }

  withMin(relation: string, field: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'min', field, alias, filters)
  }

  withMax(relation: string, field: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'max', field, alias, filters)
  }
  
  withExists(relation: string, alias?: string, filters?: Filter[]): this {
    return this.aggregate(relation, 'exists', undefined, alias, filters)
  }

  /**
   * Ajoute une instruction personnalisée
   */
  instruction(name: string, fields?: Array<{ name: string, value: any }>): this {
    this.instructions.push({ name, fields })
    return this
  }

  /**
   * Ajoute des gates (permissions) à vérifier
   */
  gate(...gates: string[]): this {
    this.gates.push(...gates)
    return this
  }

  /**
   * Pagination
   */
  page(page: number): this {
    this.pageNumber = page
    return this
  }

  /**
   * Limite
   */
  limit(limit: number): this {
    this.checkLimit(limit)
    this.limitNumber = limit
    return this
  }

  /**
   * Construit le payload pour l'API
   */
  public buildPayload(): SearchPayload {
    const payload: SearchPayload = {
      search: {},
    }

    if (this.textSearch?.trim()) {
      payload.search.text = { value: this.textSearch }
    }

    if (this.filters.length > 0) {
      payload.search.filters = this.filters
    }

    if (this.sorts.length > 0) {
      payload.search.sorts = this.sorts
    }

    if (this.selects.length > 0) {
      payload.search.selects = this.selects.map(field => ({ field }))
    }

    if (this.includes.length > 0) {
      payload.search.includes = this.includes
    }

    if (this.scopes.length > 0) {
      payload.search.scopes = this.scopes
    }

    if (this.aggregates.length > 0) {
      payload.search.aggregates = this.aggregates
    }

    if (this.instructions.length > 0) {
      payload.search.instructions = this.instructions
    }

    if (this.gates.length > 0) {
      payload.search.gates = this.gates
    }

    if (this.pageNumber !== null) {
      payload.search.page = this.pageNumber
    }

    if (this.limitNumber !== null) {
      payload.search.limit = this.limitNumber
    }

    return payload
  }

  /**
   * Exécute la recherche et retourne les résultats
   */
  async get(): Promise<[ModelList<T> | T[], Omit<ISearchResponse<T>, 'data'>]> {
    const payload = this.buildPayload()
    const url = `${this.resource.endpoint}/search`
    const body = JSON.stringify(payload)

    // Check cache first (populated from SSR payload on client)
    const cachedResponse = PayloadCache.lookup(url, 'POST', payload) as ISearchResponse<T> | null
    let response: ISearchResponse<T>

    if (cachedResponse !== null) {
      // Use full cached response (data + pagination/meta)
      response = cachedResponse
    }
    else {
      const customFetch = getCurrentFetch()
      response = await customFetch<ISearchResponse<T>>(url, {
        method: 'POST',
        body,
      })

      // Register in cache for SSR → client transfer
      if (import.meta.server) {
        PayloadCache.register(url, 'POST', response, payload)
      }
    }

    const data = Array.isArray(response.data) ? response.data : []
    const { data: _ignoredData, ...searchMeta } = response

    let ret: ModelList<T> | T[]
    if (import.meta.server) {
      ret = data
    }
    else
      ret = new ModelList<T>(
        Array.isArray(data)
          ? data.map((item: T) => hydrate(this.resource.target as new () => T, item as Record<string, unknown>))
          : [],
      )
    return [
      ret,
      searchMeta,
    ]
  }

  /**
   * Exécute la recherche et retourne les résultats
   */
  async getPage(page: number): Promise<[ModelList<T> | T[], Omit<ISearchResponse<T>, 'data'>]> {
    this.page(page)
    return await this.get()
  }

  /**
   * Récupère le premier résultat
   */
  async first(): Promise<T | null> {
    this.checkLimit(1)
    const [results] = await this.get()
    return Array.isArray(results) ? (results.at(0) as T | null) ?? null : (results.at(0) ?? null)
  }

  /**
   * Trouve une ressource par sa clé primaire
   */
  async findByKey(id: any): Promise<T> {
    this.where(this.resource.key || 'id', '=', id)

    const response = await this.first()
    if (!response) {
      throw new Error(`Resource ${this.resource.endpoint} with key ${id} not found`)
    }

    return response
  }
}
