/**
 * router-cache.ts — In-memory LRU cache for LLM routing results.
 *
 * The LLM-enhanced routing path (`llmEnhanceRouting`) costs ~1k tokens per call.
 * When the same or very similar prompt arrives within a short window, this
 * cache returns the previous result without calling the API again.
 *
 * Design:
 *  - In-memory Map (no DB dependency — cache is transient by nature)
 *  - Configurable TTL (default 5 minutes, set via env or RouterOptions)
 *  - LRU eviction when size exceeds maxEntries (default 500)
 *  - Prompt normalization: lowercase + trim + collapse whitespace
 *  - Hit/miss counters for observability
 */

import type { RoutingResult } from './router'

// ─── Configuration ─────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes
const DEFAULT_MAX_ENTRIES = 500

const TTL_MS = process.env.ROUTER_CACHE_TTL_MS ? Number(process.env.ROUTER_CACHE_TTL_MS) : DEFAULT_TTL_MS

const MAX_ENTRIES = process.env.ROUTER_CACHE_MAX_ENTRIES
  ? Number(process.env.ROUTER_CACHE_MAX_ENTRIES)
  : DEFAULT_MAX_ENTRIES

// ─── Cache entry ───────────────────────────────────────────────────────

interface CacheEntry {
  result: RoutingResult
  createdAt: number // Date.now() when stored
}

// ─── LRU tracking node ─────────────────────────────────────────────────

/**
 * Doubly-linked-list node for LRU ordering.
 * `prev`/`next` point to nodes in recency order — `head` is most recent.
 */
interface LruNode {
  key: string
  prev: LruNode | null
  next: LruNode | null
}

// ─── Cache class ───────────────────────────────────────────────────────

export class RouterCache {
  /** Key → cached routing result */
  private store = new Map<string, CacheEntry>()

  /** Head of LRU list (most recently used) */
  private head: LruNode | null = null
  /** Tail of LRU list (least recently used — first evicted) */
  private tail: LruNode | null = null
  /** Key → LRU node (for O(1) lookup and detachment) */
  private lruMap = new Map<string, LruNode>()

  /**
   * Pending in-flight promises for deduplication.
   * When request A starts an LLM call for prompt P, the promise is stored here.
   * Request B for the same prompt P awaits this promise instead of starting
   * a second LLM call. Resolved/rejected promises are removed from the map.
   */
  private pendingPromises = new Map<string, Promise<RoutingResult>>()

  /** Number of cache hits since instantiation */
  private _hits = 0
  /** Number of cache misses since instantiation */
  private _misses = 0

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Retrieve a cached routing result for a normalized prompt.
   * Returns `undefined` on miss or expired entry.
   * On hit, promotes the key to MRU position.
   */
  get(prompt: string): RoutingResult | undefined {
    const key = normalizeKey(prompt)
    const entry = this.store.get(key)

    if (!entry) {
      this._misses++
      return undefined
    }

    // Expired
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.store.delete(key)
      this.removeFromLru(key)
      this._misses++
      return undefined
    }

    // Hit — promote to MRU
    this.promote(key)
    this._hits++
    return entry.result
  }

  /**
   * Get a cached result or fetch it, with deduplication.
   *
   * If another concurrent request is already fetching the same prompt,
   * we await its promise instead of starting a second LLM call.
   * This prevents the stampeding-herd problem.
   *
   * @param prompt - The user prompt to look up or fetch for.
   * @param fetcher - Async function that produces the routing result
   *                  (only called on cache miss with no in-flight request).
   * @returns The routing result (cached or freshly fetched).
   */
  async getOrFetch(
    prompt: string,
    fetcher: () => Promise<RoutingResult>,
  ): Promise<{ result: RoutingResult; wasCached: boolean }> {
    // 1. Check cache first
    const cached = this.get(prompt)
    if (cached) return { result: cached, wasCached: true }

    const key = normalizeKey(prompt)

    // 2. Check for an already-in-flight request
    const pending = this.pendingPromises.get(key)
    if (pending) {
      this._hits++ // debatable — but semantically this is a dedup hit
      const result = await pending
      return { result, wasCached: true }
    }

    // 3. Start new fetch, store the promise, clean up after resolution
    const promise = fetcher()
      .then((result) => {
        this.set(prompt, result)
        return result
      })
      .finally(() => {
        this.pendingPromises.delete(key)
      })

    this.pendingPromises.set(key, promise)
    const result = await promise
    return { result, wasCached: false }
  }

  /**
   * Store a routing result in the cache.
   * If the cache is at capacity, the LRU entry is evicted first.
   * The new entry is placed at MRU position.
   */
  set(prompt: string, result: RoutingResult): void {
    const key = normalizeKey(prompt)

    // If key already exists, update and promote
    const existing = this.store.get(key)
    if (existing) {
      this.store.set(key, { result, createdAt: Date.now() })
      this.promote(key)
      return
    }

    // Evict LRU if at capacity
    if (this.store.size >= MAX_ENTRIES) {
      this.evictLru()
    }

    // Store
    this.store.set(key, { result, createdAt: Date.now() })
    this.prependToLru(key)
  }

  /**
   * Invalidate a single cached entry.
   */
  invalidate(prompt: string): void {
    const key = normalizeKey(prompt)
    this.store.delete(key)
    this.removeFromLru(key)
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.store.clear()
    this.lruMap.clear()
    this.head = null
    this.tail = null
    this._hits = 0
    this._misses = 0
  }

  /**
   * Number of entries currently in the cache.
   */
  get size(): number {
    return this.store.size
  }

  /**
   * Cache hit count.
   */
  get hits(): number {
    return this._hits
  }

  /**
   * Cache miss count.
   */
  get misses(): number {
    return this._misses
  }

  /**
   * Current TTL in ms (configurable via ROUTER_CACHE_TTL_MS env var).
   */
  get ttlMs(): number {
    return TTL_MS
  }

  /**
   * Return cache stats for observability.
   */
  stats(): { size: number; hits: number; misses: number; ttlMs: number; maxEntries: number } {
    return {
      size: this.store.size,
      hits: this._hits,
      misses: this._misses,
      ttlMs: TTL_MS,
      maxEntries: MAX_ENTRIES,
    }
  }

  // ── LRU internals ──────────────────────────────────────────────────

  /** Move a key to the MRU (head) position. */
  private promote(key: string): void {
    const node = this.lruMap.get(key)
    if (!node || node === this.head) return // already at head

    // Detach from current position
    this.detachNode(node)

    // Insert at head
    node.next = this.head
    node.prev = null
    if (this.head) this.head.prev = node
    this.head = node

    // If list was empty, head is also tail
    if (!this.tail) this.tail = node
  }

  /** Insert a new key at the MRU (head) position. */
  private prependToLru(key: string): void {
    const node: LruNode = { key, prev: null, next: this.head }
    if (this.head) this.head.prev = node
    this.head = node
    if (!this.tail) this.tail = node
    this.lruMap.set(key, node)
  }

  /** Remove a node from the doubly-linked list. */
  private removeFromLru(key: string): void {
    const node = this.lruMap.get(key)
    if (!node) return
    this.detachNode(node)
    this.lruMap.delete(key)
  }

  /** Detach a node from its current position in the list. */
  private detachNode(node: LruNode): void {
    if (node.prev) node.prev.next = node.next
    if (node.next) node.next.prev = node.prev
    if (node === this.head) this.head = node.next
    if (node === this.tail) this.tail = node.prev
    node.prev = null
    node.next = null
  }

  /** Evict the single least-recently-used entry. */
  private evictLru(): void {
    if (!this.tail) return
    const key = this.tail.key
    this.store.delete(key)
    this.lruMap.delete(key)

    // Move tail backward
    this.tail = this.tail.prev
    if (this.tail) this.tail.next = null
    if (!this.tail) this.head = null
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────

/**
 * Global singleton — all routing shares one cache.
 * This is safe because the cache is read-only (you can't mutate a returned
 * RoutingResult through the cache), and the only mutation is eviction which
 * never causes data races within a single Node.js event loop.
 */
let _instance: RouterCache | null = null

export function getRouterCache(): RouterCache {
  if (!_instance) {
    _instance = new RouterCache()
  }
  return _instance
}

// ─── Key normalization ─────────────────────────────────────────────────

/**
 * Normalize a prompt string into a cache key.
 *
 * Normalization:
 *  1. Trim whitespace
 *  2. Lowercase
 *  3. Collapse multiple whitespace characters into a single space
 *  4. Strip very common filler words to increase hit rate for
 *     semantically similar prompts
 *
 * This is intentionally conservative — we'd rather miss the cache
 * than return a stale routing for a meaningfully different prompt.
 */
function normalizeKey(prompt: string): string {
  const normalized = prompt
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(please|can you|could you|would you|i need you to|i want you to|help me|kindly)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  // For very long prompts, use a prefix-based key to catch near-duplicates
  if (normalized.length > 500) {
    // First 500 chars captures the intent; append a hash of the full length
    // to differentiate prompts of meaningfully different length
    return `${normalized.slice(0, 500)}::len=${normalized.length}`
  }

  return normalized
}
