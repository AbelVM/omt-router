//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, n) => {
	let r = {};
	for (var i in e) t(r, i, {
		get: e[i],
		enumerable: !0
	});
	return n || t(r, Symbol.toStringTag, { value: "Module" }), r;
}, c = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, l = (n, r, a) => (a = n == null ? {} : e(i(n)), c(r || !n || !n.__esModule ? t(a, "default", {
	value: n,
	enumerable: !0
}) : a, n)), u = null;
if (typeof process < "u" && process?.hrtime && typeof process.hrtime.bigint == "function") try {
	let e = Number(process.hrtime.bigint() / 1000000n);
	u = Date.now() - e;
} catch {
	u = null;
}
var d = () => {
	let e = Date.now();
	if (typeof performance < "u" && typeof performance?.now == "function" && typeof performance?.timeOrigin == "number") try {
		let t = performance.timeOrigin + performance.now();
		return Math.abs(t - e) < 1e3 ? t : e;
	} catch {}
	if (u != null) try {
		let t = Number(process.hrtime.bigint() / 1000000n) + u;
		return Math.abs(t - e) < 1e3 ? t : e;
	} catch {
		return e;
	}
	return e;
}, f = 1e3, p = 60 * f, m = 30 * f, h = 1e3, g = 1e3, _ = p, v = 1e3, y = 5e3, b = class {
	constructor({ maxEntries: e = Infinity, maxWeight: t = Infinity, weightFn: n = () => 1, defaultTTL: r = _, maxPoolSize: i = g, rejectOversized: a = !1, onEvict: o = null, onExpire: s = null, initialPoolSize: c = 0, maxCleanupPerTick: l = 100, eagerCleanupOnRead: u = !1, defaultAsyncTimeout: d = m } = {}) {
		if (arguments.length > 0 && arguments[0] != null && typeof arguments[0] != "object") throw TypeError("PowerCache options must be an object");
		this.maxEntries = e, this.maxWeight = t, this.weightFn = n, this.defaultTTL = r, this.maxPoolSize = i, this.rejectOversized = !!a, this.onEvict = typeof o == "function" ? o : null, this.onExpire = typeof s == "function" ? s : null, this.maxCleanupPerTick = Number.isFinite(+l) ? Math.max(1, +l) : 100, this.eagerCleanupOnRead = !!u, this._map = /* @__PURE__ */ new Map(), this._head = null, this._tail = null, this._pool = [];
		for (let e = 0; e < Math.min(c || 0, this.maxPoolSize); e++) this._pool.push({
			key: null,
			value: null,
			weight: 0,
			expiresAt: 0,
			prev: null,
			next: null
		});
		this._currentWeight = 0, this._hits = 0, this._misses = 0, this._evictions = 0, this._rejected = 0, this._expirations = 0, Object.defineProperty(this, "map", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._map;
			},
			set(e) {
				this._map = e;
			}
		}), Object.defineProperty(this, "head", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._head;
			},
			set(e) {
				this._head = e;
			}
		}), Object.defineProperty(this, "tail", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._tail;
			},
			set(e) {
				this._tail = e;
			}
		}), Object.defineProperty(this, "pool", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._pool;
			},
			set(e) {
				this._pool = e;
			}
		}), Object.defineProperty(this, "currentWeight", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._currentWeight;
			},
			set(e) {
				this._currentWeight = e;
			}
		}), Object.defineProperty(this, "hits", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._hits;
			},
			set(e) {
				this._hits = e;
			}
		}), Object.defineProperty(this, "misses", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._misses;
			},
			set(e) {
				this._misses = e;
			}
		}), Object.defineProperty(this, "evictions", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._evictions;
			},
			set(e) {
				this._evictions = e;
			}
		}), Object.defineProperty(this, "rejected", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._rejected;
			},
			set(e) {
				this._rejected = e;
			}
		}), Object.defineProperty(this, "expirations", {
			configurable: !0,
			enumerable: !1,
			get() {
				return this._expirations;
			},
			set(e) {
				this._expirations = e;
			}
		}), this._cleanupTimer = null, this._cleanupRunning = !1, this._cleanupParams = null, this._cleanupCursor = null, this._cleanupCursorValid = !1, this._evictionCandidate = null, this._inflightPromises = /* @__PURE__ */ new Map(), this._defaultAsyncTimeout = Number.isFinite(Number(d)) ? Math.max(0, Math.floor(Number(d))) : 3e4;
	}
	_allocNode(e, t, n, r) {
		let i = this._pool.pop() || {
			key: null,
			value: null,
			weight: 0,
			expiresAt: 0,
			prev: null,
			next: null
		};
		return i.key = e, i.value = t, i.weight = n || 0, i.expiresAt = r || 0, i.prev = null, i.next = null, i;
	}
	_computeWeight(e, t) {
		if (t != null) {
			let e = +t;
			return Number.isFinite(e) ? Math.max(0, e) : 0;
		}
		try {
			let t = +this.weightFn(e);
			return Number.isFinite(t) ? Math.max(0, t) : 0;
		} catch {
			return 0;
		}
	}
	_freeNode(e) {
		e.key = null, e.value = null, e.weight = 0, e.expiresAt = 0, e.prev = null, e.next = null, this._pool.length < this.maxPoolSize && this._pool.push(e);
	}
	_removeExpiredNode(e, t) {
		if (!e.expiresAt || e.expiresAt > t) return !1;
		let n = e.key, r = e.value, i = e.next;
		this._map.delete(n), this._currentWeight -= e.weight || 0, this._cleanupCursor === e && (this._cleanupCursor = i), this._cleanupCursorValid = !!this._cleanupCursor, this._remove(e);
		try {
			this.onExpire && this.onExpire(n, r);
		} catch (e) {
			try {
				typeof this._logger?.error == "function" ? this._logger.error(e, "PowerCache onExpire callback threw") : typeof console < "u" && typeof console.error == "function" && console.error("PowerCache onExpire callback threw", e);
			} catch {}
		}
		return this._freeNode(e), this._expirations++, !0;
	}
	_fetchValidNode(e, { ignoreExpiry: t = !1, countMiss: n = !1, allowExpired: r = !1 } = {}) {
		let i = this._map.get(e);
		if (!i) return n && this._misses++, null;
		let a = !t && i.expiresAt ? d() : 0;
		return a && i.expiresAt <= a ? r ? i : (this._removeExpiredNode(i, a), n && this._misses++, null) : i;
	}
	_refreshStaleEntry(e, t, { ttl: n = void 0, weight: r = void 0 } = {}) {
		if (this._inflightPromises.has(e)) return;
		let i;
		try {
			i = Promise.resolve().then(() => t());
		} catch {
			return;
		}
		let a = i.then((t) => {
			try {
				this.set(e, t, {
					ttl: n,
					weight: r
				});
			} catch {}
			return t;
		}).catch(() => void 0).finally(() => {
			this._inflightPromises.delete(e);
		});
		this._inflightPromises.set(e, a);
	}
	_append(e) {
		if (!this._tail) {
			this._head = this._tail = e, this._evictionCandidate = this._head;
			return;
		}
		e.prev = this._tail, e.next = null, this._tail.next = e, this._tail = e;
	}
	_remove(e) {
		let t = e.prev, n = e.next;
		t ? t.next = n : this._head = n, t || (this._evictionCandidate = this._head), n ? n.prev = t : this._tail = t, e.prev = e.next = null;
	}
	_moveToTail(e) {
		this._tail !== e && (this._remove(e), this._append(e));
	}
	_evictIfNeeded() {
		for (; this._map.size > this.maxEntries || this._currentWeight > this.maxWeight;) {
			let e = this._evictionCandidate || this._head;
			if (!e) break;
			let t = e.next, n = e.key, r = e.value;
			this._cleanupCursor === e && (this._cleanupCursor = t), this._cleanupCursorValid = !!this._cleanupCursor, this._evictionCandidate = t, this._remove(e), this._map.delete(n), this._currentWeight -= e.weight || 0, this._evictions++;
			try {
				this.onEvict && this.onEvict(n, r, "evicted");
			} catch (e) {
				try {
					typeof this._logger?.error == "function" ? this._logger.error(e, "PowerCache onEvict callback threw") : typeof console < "u" && typeof console.error == "function" && console.error("PowerCache onEvict callback threw", e);
				} catch {}
			}
			this._freeNode(e);
		}
		this._evictionCandidate || (this._evictionCandidate = this._head);
	}
	set(e, t, { ttl: n = this.defaultTTL, weight: r = null } = {}) {
		let i = d(), a = n == null || n === Infinity ? 0 : i + n, o = this._computeWeight(t, r);
		if (this.rejectOversized && Number.isFinite(this.maxWeight) && o > this.maxWeight) {
			this._rejected++;
			try {
				this.onEvict && this.onEvict(e, t, "rejected-oversized");
			} catch {}
			return !1;
		}
		if (this._map.has(e)) {
			let n = this._map.get(e);
			this._currentWeight -= n.weight || 0, n.value = t, n.weight = o, n.expiresAt = a, this._currentWeight += n.weight || 0, this._moveToTail(n);
		} else {
			let n = this._allocNode(e, t, o, a);
			this._map.set(e, n), this._append(n), this._currentWeight += n.weight || 0, this._evictIfNeeded();
		}
		return this;
	}
	get(e) {
		let t = this._fetchValidNode(e, { countMiss: !0 });
		if (t) return this._moveToTail(t), this._hits++, t.value;
	}
	peek(e) {
		let t = this._fetchValidNode(e);
		return t ? t.value : void 0;
	}
	has(e, { ignoreExpiry: t = !1 } = {}) {
		return !!this._fetchValidNode(e, { ignoreExpiry: t });
	}
	getOrSet(e, t, { ttl: n = void 0, weight: r = void 0, staleWhileRevalidate: i = !1 } = {}) {
		let a = d(), o = this._fetchValidNode(e, {
			countMiss: !1,
			allowExpired: i
		});
		if (o) if (o.expiresAt && o.expiresAt <= a) {
			if (typeof t == "function") return this._moveToTail(o), this._hits++, this._refreshStaleEntry(e, t, {
				ttl: n,
				weight: r
			}), o.value;
			this._removeExpiredNode(o, a), this._misses++;
		} else return this._moveToTail(o), this._hits++, o.value;
		else this._misses++;
		if (typeof t == "function") {
			let i = t();
			return typeof i?.then == "function" ? i.then((t) => {
				try {
					this.set(e, t, {
						ttl: n,
						weight: r
					});
				} catch {}
				return t;
			}) : (this.set(e, i, {
				ttl: n,
				weight: r
			}), i);
		}
		return this.set(e, t, {
			ttl: n,
			weight: r
		}), t;
	}
	setMany(e, { ttl: t = void 0, weight: n = void 0 } = {}) {
		let r = d(), i = t == null || t === Infinity ? 0 : r + t;
		for (let t of e) {
			if (!t) continue;
			let [e, r] = t, a = this._computeWeight(r, n);
			if (this._map.has(e)) {
				let t = this._map.get(e);
				this._currentWeight -= t.weight || 0, t.value = r, t.weight = a, t.expiresAt = i, this._currentWeight += t.weight || 0, this._moveToTail(t);
			} else {
				let t = this._allocNode(e, r, a, i);
				this._map.set(e, t), this._append(t), this._currentWeight += t.weight || 0;
			}
		}
		return this._evictIfNeeded(), this;
	}
	getMany(e, { ignoreExpiry: t = !1 } = {}) {
		let n = /* @__PURE__ */ new Map();
		for (let r of e) {
			let e = this._fetchValidNode(r, {
				ignoreExpiry: t,
				countMiss: !0
			});
			e && (this._moveToTail(e), this._hits++, n.set(r, e.value));
		}
		return n;
	}
	touch(e, t = void 0) {
		let n = this._fetchValidNode(e);
		if (!n) return !1;
		let r = d();
		return t !== void 0 && (n.expiresAt = t == null || t === Infinity ? 0 : r + t), this._moveToTail(n), !0;
	}
	getOrSetAsync(e, t, { ttl: n = void 0, weight: r = void 0, staleWhileRevalidate: i = !1, timeout: a = void 0 } = {}) {
		if (typeof t != "function") return Promise.resolve(this.getOrSet(e, t, {
			ttl: n,
			weight: r
		}));
		let o = d(), s = this._map.get(e);
		if (s) if (s.expiresAt && s.expiresAt <= o) {
			if (i) return this._moveToTail(s), this._hits++, this._refreshStaleEntry(e, t, {
				ttl: n,
				weight: r
			}), Promise.resolve(s.value);
			this._removeExpiredNode(s, o);
		} else return this._moveToTail(s), this._hits++, Promise.resolve(s.value);
		if (this._inflightPromises.has(e)) return this._inflightPromises.get(e);
		this._misses++;
		let c;
		try {
			c = Promise.resolve().then(() => t());
		} catch (e) {
			return Promise.reject(e);
		}
		let l = Number.isFinite(Number(a)) ? Math.max(0, Math.floor(Number(a))) : Number.isFinite(Number(this._defaultAsyncTimeout)) ? this._defaultAsyncTimeout : void 0, u = c;
		if (Number.isFinite(l) && l > 0) {
			let e = null;
			u = new Promise((t, n) => {
				e = setTimeout(() => {
					try {
						n(/* @__PURE__ */ Error("getOrSetAsync timeout"));
					} catch {}
				}, l), c.then((n) => {
					try {
						clearTimeout(e);
					} catch {}
					t(n);
				}, (t) => {
					try {
						clearTimeout(e);
					} catch {}
					n(t);
				});
			});
		}
		let f = u.then((t) => {
			try {
				this.set(e, t, {
					ttl: n,
					weight: r
				});
			} catch {}
			return t;
		}).finally(() => {
			this._inflightPromises.delete(e);
		});
		return this._inflightPromises.set(e, f), f;
	}
	hasEqual(e, t, { ignoreExpiry: n = !1, seen: r = void 0 } = {}) {
		let i = this._fetchValidNode(e, { ignoreExpiry: n });
		if (!i) return !1;
		let a = i.value;
		return a === t ? !0 : typeof a != "object" || !a || typeof t != "object" || !t ? a === t : x(a, t, r);
	}
	hasEqualWithSeen(e, t, n, { ignoreExpiry: r = !1 } = {}) {
		return this.hasEqual(e, t, {
			ignoreExpiry: r,
			seen: n
		});
	}
	delete(e) {
		let t = this._map.get(e);
		if (!t) return !1;
		let n = t.next;
		this._map.delete(e), this._currentWeight -= t.weight || 0, this._cleanupCursor === t && (this._cleanupCursor = n), this._cleanupCursorValid = !!this._cleanupCursor, this._remove(t);
		try {
			this.onEvict && this.onEvict(t.key, t.value, "deleted");
		} catch {}
		return this._freeNode(t), !0;
	}
	clear() {
		for (let e = this._head; e;) {
			let t = e.next;
			this._freeNode(e), e = t;
		}
		this._head = this._tail = null, this._map.clear(), this._currentWeight = 0, this._cleanupCursor = null, this._cleanupCursorValid = !1, this._evictionCandidate = null;
	}
	cleanupExpired() {
		return this.cleanupExpiredUpTo();
	}
	cleanupExpiredUpTo(e = Infinity) {
		let t = d(), n = 0, r = this._cleanupCursor && this._cleanupCursorValid ? this._cleanupCursor : this._head;
		for (; r && n < e;) {
			let e = r.next;
			if (r.expiresAt && r.expiresAt <= t) {
				let t = r.key, n = r.value;
				this._map.delete(t), this._currentWeight -= r.weight || 0, this._cleanupCursor === r && (this._cleanupCursor = e), this._cleanupCursorValid = !!this._cleanupCursor, this._remove(r);
				try {
					this.onExpire && this.onExpire(t, n);
				} catch {}
				this._freeNode(r), this._expirations++;
			}
			r = e, n++;
		}
		return this._cleanupCursor = r || this._head, this._cleanupCursorValid = !!this._cleanupCursor, n;
	}
	startCleanup(e = {}) {
		let t, n;
		typeof e == "number" ? (t = e, n = this.maxCleanupPerTick) : (t = Number.isFinite(+e.interval) ? +e.interval : Math.max(f, Math.min(this.defaultTTL || 6e4, _)), n = Number.isFinite(+e.maxCleanupPerTick) ? Math.max(1, +e.maxCleanupPerTick) : this.maxCleanupPerTick), this.stopCleanup(), this._cleanupParams = {
			interval: t,
			maxCleanupPerTick: n
		}, this._cleanupTimer = setTimeout(() => this._cleanupTick(), t);
	}
	stopCleanup() {
		this._cleanupTimer && (clearTimeout(this._cleanupTimer), this._cleanupTimer = null), this._cleanupRunning = !1, this._cleanupParams = null;
	}
	[Symbol.dispose]() {
		try {
			this.stopCleanup();
		} catch {}
		try {
			this.clear();
		} catch {}
	}
	async [Symbol.asyncDispose]() {
		try {
			this.stopCleanup();
		} catch {}
		try {
			this.clear();
		} catch {}
	}
	_cleanupTick() {
		if (this._cleanupTimer != null) {
			if (this._cleanupRunning) {
				this._cleanupTimer = setTimeout(() => this._cleanupTick(), this._cleanupParams.interval);
				return;
			}
			this._cleanupRunning = !0;
			try {
				this.cleanupExpiredUpTo(this._cleanupParams.maxCleanupPerTick);
			} finally {
				this._cleanupRunning = !1;
			}
			this._cleanupTimer = setTimeout(() => this._cleanupTick(), this._cleanupParams.interval);
		}
	}
	get size() {
		return this._map.size;
	}
	get hitRate() {
		let e = (this._hits || 0) + (this._misses || 0);
		return e ? this._hits / e : 0;
	}
	stats() {
		return {
			size: this.size,
			weight: this._currentWeight,
			hits: this._hits,
			misses: this._misses,
			evictions: this._evictions,
			expirations: this._expirations,
			rejected: this._rejected,
			poolSize: this._pool.length
		};
	}
	resize({ maxEntries: e, maxWeight: t } = {}) {
		Number.isFinite(+e) && (this.maxEntries = Math.max(0, +e)), Number.isFinite(+t) && (this.maxWeight = Math.max(0, +t)), this._evictIfNeeded(), this._cleanupCursor = null, this._cleanupCursorValid = !1, this._evictionCandidate = this.head;
	}
	*entries(e = "MRU") {
		if (e === "MRU") for (let e = this._tail; e; e = e.prev) yield [e.key, e.value];
		else for (let e = this._head; e; e = e.next) yield [e.key, e.value];
	}
	[Symbol.iterator]() {
		return this.entries("MRU");
	}
	*keys(e = "MRU") {
		for (let [t] of this.entries(e)) yield t;
	}
	*values(e = "MRU") {
		for (let [, t] of this.entries(e)) yield t;
	}
};
function x(e, t, n = void 0, r = 0) {
	if (r > 100) return e === t;
	if (e === t) return !0;
	if (e == null || t == null || typeof e != "object" || typeof t != "object") return e === t;
	n || (n = /* @__PURE__ */ new WeakMap());
	let i = n.get(e);
	if (i?.has(t)) return !0;
	if (i || (i = /* @__PURE__ */ new WeakSet(), n.set(e, i)), i.add(t), Object.getPrototypeOf(e) !== Object.getPrototypeOf(t)) return !1;
	if (typeof Uint8Array < "u" && e instanceof Uint8Array) {
		if (!(t instanceof Uint8Array) || e.length !== t.length) return !1;
		for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
		return !0;
	}
	if (Array.isArray(e)) {
		if (!Array.isArray(t) || e.length !== t.length) return !1;
		for (let i = 0; i < e.length; i++) if (!x(e[i], t[i], n, r + 1)) return !1;
		return !0;
	}
	if (ArrayBuffer.isView(e)) {
		if (!ArrayBuffer.isView(t) || e.byteLength !== t.byteLength) return !1;
		let n = new Uint8Array(e.buffer, e.byteOffset || 0, e.byteLength), r = new Uint8Array(t.buffer, t.byteOffset || 0, t.byteLength);
		for (let e = 0; e < n.length; e++) if (n[e] !== r[e]) return !1;
		return !0;
	}
	if (e instanceof ArrayBuffer) {
		if (!(t instanceof ArrayBuffer) || e.byteLength !== t.byteLength) return !1;
		let n = new Uint8Array(e), r = new Uint8Array(t);
		for (let e = 0; e < n.length; e++) if (n[e] !== r[e]) return !1;
		return !0;
	}
	if (e instanceof Date) return t instanceof Date ? e.getTime() === t.getTime() : !1;
	if (e instanceof RegExp) return t instanceof RegExp ? e.toString() === t.toString() : !1;
	if (e instanceof Map) {
		if (!(t instanceof Map) || e.size !== t.size) return !1;
		for (let [i, a] of e) if (!t.has(i) || !x(a, t.get(i), n, r + 1)) return !1;
		return !0;
	}
	if (e instanceof Set) {
		if (!(t instanceof Set) || e.size !== t.size) return !1;
		let i = !0;
		for (let t of e) if (typeof t == "object" && t) {
			i = !1;
			break;
		}
		if (i) {
			for (let n of e) if (!t.has(n)) return !1;
			return !0;
		}
		let a = Array.from(t), o = Array(a.length).fill(!1), s = /* @__PURE__ */ new Map();
		for (let e = 0; e < a.length; e++) s.set(a[e], e);
		let c = (e) => {
			try {
				return JSON.stringify(e, (e, t) => t instanceof Date ? {
					__type: "Date",
					v: t.getTime()
				} : t instanceof RegExp ? {
					__type: "RegExp",
					v: t.toString()
				} : typeof ArrayBuffer < "u" && ArrayBuffer.isView(t) ? {
					__type: "TypedArray",
					v: Array.from(new Uint8Array(t.buffer, t.byteOffset || 0, t.byteLength))
				} : typeof ArrayBuffer < "u" && t instanceof ArrayBuffer ? {
					__type: "ArrayBuffer",
					v: Array.from(new Uint8Array(t))
				} : t);
			} catch {
				return null;
			}
		}, l = /* @__PURE__ */ new Map(), u = [];
		for (let e = 0; e < a.length; e++) {
			let t = c(a[e]);
			if (t == null) u.push(e);
			else {
				let n = l.get(t);
				n ? n.push(e) : l.set(t, [e]);
			}
		}
		for (let t of e) {
			let e = s.get(t);
			if (e !== void 0 && !o[e]) {
				o[e] = !0;
				continue;
			}
			let i = c(t), u = !1;
			if (i != null) {
				let e = l.get(i) || [];
				for (let i of e) if (!o[i] && x(t, a[i], n, r + 1)) {
					o[i] = !0, u = !0;
					break;
				}
				if (u) continue;
			}
			for (let e = 0; e < a.length; e++) if (!o[e] && x(t, a[e], n, r + 1)) {
				o[e] = !0, u = !0;
				break;
			}
			if (!u) return !1;
		}
		return !0;
	}
	let a = Object.keys(e), o = Object.keys(t);
	if (a.length !== o.length) return !1;
	for (let i = 0; i < a.length; i++) {
		let o = a[i];
		if (!Object.prototype.hasOwnProperty.call(t, o) || !x(e[o], t[o], n, r + 1)) return !1;
	}
	return !0;
}
//#endregion
//#region src/tiles/tilesManager.js
function S(e, t, n) {
	let r = 2 ** n, i = Math.floor((e + 180) / 360 * r), a = t * Math.PI / 180;
	return {
		z: n,
		x: i,
		y: Math.floor((1 - Math.log(Math.tan(a) + 1 / Math.cos(a)) / Math.PI) / 2 * r)
	};
}
function C(e, t, n, r = "zxy") {
	let i = S(e, t, n);
	return r.toLowerCase() === "tms" && (i.y = 2 ** n - 1 - i.y), i;
}
function w(e, t, n, r = 0, i = "zxy") {
	n = 14;
	let a = C(e[0], e[1], n, i), o = C(t[0], t[1], n, i), s = /* @__PURE__ */ new Map(), c = i.toLowerCase() === "tms", l = 2 ** n, u = Math.abs(o.x - a.x), d = Math.abs(o.y - a.y), f = a.x < o.x ? 1 : -1, p = a.y < o.y ? 1 : -1, m = u - d, h = a.x, g = a.y;
	for (;;) {
		if (s.set(`${n}_${h}_${g}`, {
			z: n,
			x: h,
			y: g
		}), r > 0) {
			let e = c ? l - 1 - g : g;
			for (let t = -r; t <= r; t++) for (let i = -r; i <= r; i++) {
				if (t === 0 && i === 0) continue;
				let r = h + t, a = e + i, o = (r % l + l) % l;
				if (a >= 0 && a < l) {
					let e = c ? l - 1 - a : a;
					s.set(`${n}_${o}_${e}`, {
						z: n,
						x: o,
						y: e
					});
				}
			}
		}
		if (h === o.x && g === o.y) break;
		let e = m * 2;
		e > -d && (m -= d, h += f), e < u && (m += u, g += p);
	}
	return [...s.values()];
}
function T(e, t, n, r, i = "zxy") {
	n = 14;
	let a = 2 ** n, o = i.toLowerCase() === "tms", s = C(e, t, n, i), c = Math.PI / 180 * t, l = 2 * Math.PI * 6371e3 * Math.cos(c) / 2 ** n, u = Math.sqrt(2) * l / 2, d = Math.max(0, Math.ceil(r / l)), f = Math.min(20, d), p = /* @__PURE__ */ new Map(), m = (e) => e / a * 360 - 180, h = (e) => {
		let t = 1 - 2 * e / a;
		return Math.atan(Math.sinh(Math.PI * t)) * 180 / Math.PI;
	}, g = Math.PI / 180, _ = (e, t, n, r) => {
		let i = (r - t) * g, a = (n - e) * g, o = t * g, s = r * g, c = Math.sin(i / 2), l = Math.sin(a / 2), u = c * c + Math.cos(o) * Math.cos(s) * l * l;
		return 2 * 6371e3 * Math.asin(Math.sqrt(u));
	};
	for (let i = -f; i <= f; i++) for (let c = -f; c <= f; c++) {
		let l = s.x + i, d = o ? a - 1 - s.y + c : s.y + c, f = (l % a + a) % a;
		if (d < 0 || d >= a) continue;
		let g = o ? a - 1 - d : d;
		_(e, t, m(f + .5), h(g + .5)) <= r + u && p.set(`${n}_${f}_${g}`, {
			z: n,
			x: f,
			y: g
		});
	}
	return [...p.values()];
}
//#endregion
//#region node_modules/@mapbox/point-geometry/index.js
function E(e, t) {
	this.x = e, this.y = t;
}
E.prototype = {
	clone() {
		return new E(this.x, this.y);
	},
	add(e) {
		return this.clone()._add(e);
	},
	sub(e) {
		return this.clone()._sub(e);
	},
	multByPoint(e) {
		return this.clone()._multByPoint(e);
	},
	divByPoint(e) {
		return this.clone()._divByPoint(e);
	},
	mult(e) {
		return this.clone()._mult(e);
	},
	div(e) {
		return this.clone()._div(e);
	},
	rotate(e) {
		return this.clone()._rotate(e);
	},
	rotateAround(e, t) {
		return this.clone()._rotateAround(e, t);
	},
	matMult(e) {
		return this.clone()._matMult(e);
	},
	unit() {
		return this.clone()._unit();
	},
	perp() {
		return this.clone()._perp();
	},
	round() {
		return this.clone()._round();
	},
	mag() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	},
	equals(e) {
		return this.x === e.x && this.y === e.y;
	},
	dist(e) {
		return Math.sqrt(this.distSqr(e));
	},
	distSqr(e) {
		let t = e.x - this.x, n = e.y - this.y;
		return t * t + n * n;
	},
	angle() {
		return Math.atan2(this.y, this.x);
	},
	angleTo(e) {
		return Math.atan2(this.y - e.y, this.x - e.x);
	},
	angleWith(e) {
		return this.angleWithSep(e.x, e.y);
	},
	angleWithSep(e, t) {
		return Math.atan2(this.x * t - this.y * e, this.x * e + this.y * t);
	},
	_matMult(e) {
		let t = e[0] * this.x + e[1] * this.y, n = e[2] * this.x + e[3] * this.y;
		return this.x = t, this.y = n, this;
	},
	_add(e) {
		return this.x += e.x, this.y += e.y, this;
	},
	_sub(e) {
		return this.x -= e.x, this.y -= e.y, this;
	},
	_mult(e) {
		return this.x *= e, this.y *= e, this;
	},
	_div(e) {
		return this.x /= e, this.y /= e, this;
	},
	_multByPoint(e) {
		return this.x *= e.x, this.y *= e.y, this;
	},
	_divByPoint(e) {
		return this.x /= e.x, this.y /= e.y, this;
	},
	_unit() {
		return this._div(this.mag()), this;
	},
	_perp() {
		let e = this.y;
		return this.y = this.x, this.x = -e, this;
	},
	_rotate(e) {
		let t = Math.cos(e), n = Math.sin(e), r = t * this.x - n * this.y, i = n * this.x + t * this.y;
		return this.x = r, this.y = i, this;
	},
	_rotateAround(e, t) {
		let n = Math.cos(e), r = Math.sin(e), i = t.x + n * (this.x - t.x) - r * (this.y - t.y), a = t.y + r * (this.x - t.x) + n * (this.y - t.y);
		return this.x = i, this.y = a, this;
	},
	_round() {
		return this.x = Math.round(this.x), this.y = Math.round(this.y), this;
	},
	constructor: E
}, E.convert = function(e) {
	if (e instanceof E) return e;
	if (Array.isArray(e)) return new E(+e[0], +e[1]);
	if (e.x !== void 0 && e.y !== void 0) return new E(+e.x, +e.y);
	throw Error("Expected [x, y] or {x, y} point format");
};
//#endregion
//#region node_modules/@mapbox/vector-tile/index.js
var D = class {
	constructor(e, t, n, r, i) {
		this.properties = {}, this.extent = n, this.type = 0, this.id = void 0, this._pbf = e, this._geometry = -1, this._keys = r, this._values = i, e.readFields(O, this, t);
	}
	loadGeometry() {
		let e = this._pbf;
		e.pos = this._geometry;
		let t = e.readVarint() + e.pos, n = [], r, i = 1, a = 0, o = 0, s = 0;
		for (; e.pos < t;) {
			if (a <= 0) {
				let t = e.readVarint();
				i = t & 7, a = t >> 3;
			}
			if (a--, i === 1 || i === 2) o += e.readSVarint(), s += e.readSVarint(), i === 1 && (r && n.push(r), r = []), r && r.push(new E(o, s));
			else if (i === 7) r && r.push(r[0].clone());
			else throw Error(`unknown command ${i}`);
		}
		return r && n.push(r), n;
	}
	bbox() {
		let e = this._pbf;
		e.pos = this._geometry;
		let t = e.readVarint() + e.pos, n = 1, r = 0, i = 0, a = 0, o = Infinity, s = -Infinity, c = Infinity, l = -Infinity;
		for (; e.pos < t;) {
			if (r <= 0) {
				let t = e.readVarint();
				n = t & 7, r = t >> 3;
			}
			if (r--, n === 1 || n === 2) i += e.readSVarint(), a += e.readSVarint(), i < o && (o = i), i > s && (s = i), a < c && (c = a), a > l && (l = a);
			else if (n !== 7) throw Error(`unknown command ${n}`);
		}
		return [
			o,
			c,
			s,
			l
		];
	}
	toGeoJSON(e, t, n) {
		let r = this.extent * 2 ** n, i = this.extent * e, a = this.extent * t, o = this.loadGeometry();
		function s(e) {
			return [(e.x + i) * 360 / r - 180, 360 / Math.PI * Math.atan(Math.exp((1 - (e.y + a) * 2 / r) * Math.PI)) - 90];
		}
		function c(e) {
			return e.map(s);
		}
		let l;
		if (this.type === 1) {
			let e = [];
			for (let t of o) e.push(t[0]);
			let t = c(e);
			l = e.length === 1 ? {
				type: "Point",
				coordinates: t[0]
			} : {
				type: "MultiPoint",
				coordinates: t
			};
		} else if (this.type === 2) {
			let e = o.map(c);
			l = e.length === 1 ? {
				type: "LineString",
				coordinates: e[0]
			} : {
				type: "MultiLineString",
				coordinates: e
			};
		} else if (this.type === 3) {
			let e = A(o), t = [];
			for (let n of e) t.push(n.map(c));
			l = t.length === 1 ? {
				type: "Polygon",
				coordinates: t[0]
			} : {
				type: "MultiPolygon",
				coordinates: t
			};
		} else throw Error("unknown feature type");
		let u = {
			type: "Feature",
			geometry: l,
			properties: this.properties
		};
		return this.id != null && (u.id = this.id), u;
	}
};
D.types = [
	"Unknown",
	"Point",
	"LineString",
	"Polygon"
];
function O(e, t, n) {
	e === 1 ? t.id = n.readVarint() : e === 2 ? k(n, t) : e === 3 ? t.type = n.readVarint() : e === 4 && (t._geometry = n.pos);
}
function k(e, t) {
	let n = e.readVarint() + e.pos;
	for (; e.pos < n;) {
		let n = t._keys[e.readVarint()], r = t._values[e.readVarint()];
		t.properties[n] = r;
	}
}
function A(e) {
	let t = e.length;
	if (t <= 1) return [e];
	let n = [], r, i;
	for (let a = 0; a < t; a++) {
		let t = ee(e[a]);
		t !== 0 && (i === void 0 && (i = t < 0), i === t < 0 ? (r && n.push(r), r = [e[a]]) : r && r.push(e[a]));
	}
	return r && n.push(r), n;
}
function ee(e) {
	let t = 0;
	for (let n = 0, r = e.length, i = r - 1, a, o; n < r; i = n++) a = e[n], o = e[i], t += (o.x - a.x) * (a.y + o.y);
	return t;
}
typeof TextDecoder > "u" || new TextDecoder("utf-8");
//#endregion
//#region node_modules/performance-helpers/src/helpers/powerBuffer.js
var j, M;
function te() {
	return j === void 0 ? typeof TextEncoder < "u" ? (j = new TextEncoder(), j) : typeof Buffer < "u" && typeof Buffer.from == "function" ? (j = { encode: (e) => new Uint8Array(Buffer.from(e)) }, j) : (j = !1, null) : j === !1 ? null : j;
}
function ne() {
	return M === void 0 ? typeof TextDecoder < "u" ? (M = new TextDecoder(), M) : typeof Buffer < "u" && typeof Buffer.from == "function" ? (M = { decode: (e) => Buffer.from(e).toString("utf8") }, M) : (M = !1, null) : M === !1 ? null : M;
}
var re = (e) => {
	if (e instanceof Uint8Array) return e;
	if (ArrayBuffer.isView(e)) return new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
	if (e instanceof ArrayBuffer) return new Uint8Array(e);
	let t = JSON.stringify(e), n = te();
	if (typeof n?.encode == "function") return n.encode(t);
	throw Error("No TextEncoder or Buffer available to encode object");
}, ie = (e) => {
	let t;
	if (e instanceof Uint8Array) t = e;
	else if (ArrayBuffer.isView(e)) t = new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
	else if (e instanceof ArrayBuffer) t = new Uint8Array(e);
	else if (typeof Buffer < "u" && typeof Buffer.isBuffer == "function" && Buffer.isBuffer(e)) t = new Uint8Array(e);
	else throw TypeError("Unsupported input to u82o, expected ArrayBuffer/TypedArray/Buffer");
	let n = ne();
	if (typeof n?.decode == "function") return JSON.parse(n.decode(t));
	if (typeof TextDecoder < "u") return JSON.parse(new TextDecoder().decode(t));
	throw Error("No TextDecoder or Buffer available to decode object");
};
//#endregion
//#region node_modules/performance-helpers/src/utils/errors.js
function ae(e, t = "ERR_ITEM") {
	return !e || typeof e != "object" ? {
		error: !0,
		code: t,
		message: e ? String(e) : void 0,
		stack: void 0
	} : {
		error: !0,
		code: e.code || t,
		message: e.message,
		stack: e.stack
	};
}
function oe(e) {
	return !e || !e.error ? String(e) : `${e.code || "ERR"}: ${e.message || ""}`;
}
//#endregion
//#region node_modules/performance-helpers/src/helpers/powerLogger.js
var N = Object.freeze({
	error: "error",
	warn: "warn",
	info: "info",
	log: "log",
	debug: "debug",
	table: "table"
}), P = typeof globalThis < "u" && globalThis?.console ? globalThis.console : typeof self < "u" && self?.console ? self.console : typeof window < "u" && window?.console ? window.console : typeof global < "u" && global?.console ? global.console : null;
function se(e) {
	try {
		return JSON.stringify(e);
	} catch {
		try {
			let t = typeof WeakSet == "function" ? /* @__PURE__ */ new WeakSet() : /* @__PURE__ */ new Set();
			return JSON.stringify(e, function(e, n) {
				if (n && typeof n == "object") {
					if (t.has(n)) return "[Circular]";
					t.add(n);
				}
				return typeof n == "function" ? `[Function: ${n.name || "anonymous"}]` : typeof n == "symbol" ? String(n) : typeof n == "bigint" ? n.toString() + "n" : n;
			});
		} catch {
			try {
				return String(e);
			} catch {
				return "[Unserializable]";
			}
		}
	}
}
var ce = class {
	constructor(e = 0, t = {}) {
		this._debugLevel = 0, this._counters = Object.create(null), this._format = t?.format || "text", this.name = t?.name || null, this._formatter = typeof t?.formatter == "function" ? t.formatter : null, this._output = typeof t?.output == "function" ? t.output : null, this.setDebugLevel(e);
	}
	setDebugLevel(e) {
		let t = NaN;
		typeof e == "number" ? t = e : typeof e == "string" || typeof e == "boolean" ? t = Number(e) : (e instanceof Number || e instanceof String || e instanceof Boolean) && (t = Number(e.valueOf())), this._debugLevel = Number.isFinite(t) && t >= 0 ? Math.max(0, Math.min(3, Math.floor(t))) : 0;
	}
	getDebugLevel() {
		return this._debugLevel;
	}
	isDebugLevel(e = 1) {
		return Number(this._debugLevel) >= Number(e || 1);
	}
	isDebug() {
		return this.isDebugLevel(1);
	}
	_resolveLogArgs(e) {
		return e.map((e) => {
			if (typeof e == "function") try {
				return e();
			} catch (e) {
				return e;
			}
			return e;
		});
	}
	_emit(e, t, n, r, i = {}) {
		if (!this.isDebugLevel(e)) return;
		let a = this._resolveLogArgs(r), o = {
			level: n,
			msg: i.msgArray ? a : a.length === 1 ? a[0] : a,
			ts: d(),
			format: this._format
		};
		if (this.name && (o.name = this.name), this._formatter) try {
			let e = this._formatter(o);
			if (e != null) {
				if (typeof e == "string") {
					if (this._output) {
						try {
							this._output(e);
						} catch {}
						return;
					}
					typeof P?.[t] == "function" && P[t](e);
					return;
				}
				o = e;
			}
		} catch {}
		if (this._output) {
			try {
				this._output(o);
			} catch {}
			return;
		}
		if (typeof P?.[t] == "function") if (this._format === "json") try {
			let e = typeof o == "string" ? o : se(o);
			P[t](e);
		} catch {
			try {
				P[t](...Array.isArray(a) ? a : [a]);
			} catch {}
		}
		else P[t](...a);
	}
	error(...e) {
		let t = e.map((e) => {
			try {
				if (e?.error) return oe(e);
				if (e instanceof Error || e && typeof e == "object") return oe(ae(e));
			} catch {}
			return e;
		});
		this._emit(1, "error", N.error, t);
	}
	warn(...e) {
		this._emit(2, "warn", N.warn, e);
	}
	info(...e) {
		this._emit(3, "info", N.info, e);
	}
	log(...e) {
		this._emit(3, "log", N.log, e);
	}
	debug(...e) {
		this._emit(3, "debug", N.debug, e);
	}
	table(...e) {
		if (!this.isDebugLevel(3) || !P) return;
		if (this._format === "json") {
			this._emit(3, "log", N.table, e, { msgArray: !0 });
			return;
		}
		let t = this._resolveLogArgs(e);
		typeof P.table == "function" ? P.table(...t) : typeof P.log == "function" && P.log(...t);
	}
	incrementCounter(e) {
		if (!this.isDebug()) return;
		let t = String(e || "");
		t && (this._counters[t] = (this._counters[t] || 0) + 1);
	}
	getDebugCounters() {
		return Object.assign({}, this._counters);
	}
	resetDebugCounters() {
		this._counters = Object.create(null);
	}
}, le = {
	car: {
		class: new Set([
			"motorway",
			"motorway_link",
			"motorway_junction",
			"trunk",
			"trunk_link",
			"primary",
			"primary_link",
			"secondary",
			"secondary_link",
			"tertiary",
			"tertiary_link",
			"residential",
			"living_street",
			"service",
			"unclassified",
			"road",
			"minor"
		]),
		exclude_subclass: new Set([
			"pedestrian",
			"footway",
			"steps",
			"cycleway",
			"bridleway",
			"corridor"
		])
	},
	pedestrian: {
		class: new Set([
			"road",
			"primary",
			"primary_link",
			"secondary",
			"secondary_link",
			"tertiary",
			"tertiary_link",
			"residential",
			"living_street",
			"service",
			"track",
			"pedestrian",
			"path",
			"cycleway",
			"footway",
			"bridleway",
			"byway",
			"steps",
			"unclassified",
			"minor"
		]),
		subclass: new Set([
			"pedestrian",
			"footway",
			"steps",
			"path",
			"corridor",
			"platform"
		]),
		foot: new Set([
			"yes",
			"designated",
			"permissive",
			"use_sidepath"
		])
	},
	bicycle: {
		class: new Set([
			"road",
			"primary",
			"primary_link",
			"secondary",
			"secondary_link",
			"tertiary",
			"tertiary_link",
			"residential",
			"living_street",
			"service",
			"track",
			"unclassified",
			"path",
			"cycleway",
			"footway",
			"pedestrian",
			"bridleway"
		]),
		subclass: new Set(["cycleway", "path"]),
		exclude_classes: new Set([
			"motorway",
			"motorway_link",
			"motorway_junction",
			"trunk",
			"trunk_link"
		]),
		bicycle: new Set([
			"yes",
			"designated",
			"permissive",
			"use_sidepath",
			"optional_sidepath"
		])
	}
}, ue = {
	car: {
		motorway: 1,
		motorway_link: 1,
		motorway_junction: 1,
		trunk: 1.05,
		trunk_link: 1.05,
		primary: 1.15,
		primary_link: 1.15,
		secondary: 1.5,
		secondary_link: 1.5,
		tertiary: 1.75,
		tertiary_link: 1.75,
		residential: 2.5,
		service: 2.5,
		unclassified: 3,
		living_street: 3,
		road: 5,
		minor: 5
	},
	bicycle: {
		cycleway: 1,
		path: 1.1,
		pedestrian: 1.1,
		footway: 1.1,
		bridleway: 1.3,
		track: 2,
		living_street: 2,
		service: 2,
		residential: 2.2,
		unclassified: 2.3,
		tertiary_link: 2.5,
		tertiary: 2.5,
		secondary_link: 3,
		secondary: 3,
		primary_link: 3.5,
		primary: 3.5,
		road: 4
	},
	pedestrian: {
		road: 1,
		primary: 1,
		primary_link: 1,
		secondary: 1,
		secondary_link: 1,
		tertiary: 1,
		tertiary_link: 1,
		residential: 1,
		living_street: 1,
		service: 1,
		track: 1,
		pedestrian: 1,
		path: 1,
		cycleway: 1,
		footway: 1,
		bridleway: 1,
		byway: 1,
		steps: 1,
		unclassified: 1,
		minor: 1
	}
}, de = (e, t) => e.replace(/\{([^}]+)\}/g, (e, n) => Object.prototype.hasOwnProperty.call(t, n) ? t[n] : `{${n}}`), fe = 6371e3, pe = fe * fe, me = Math.PI / 180;
function F([e, t], [n, r]) {
	return he(e, t, n, r);
}
function he(e, t, n, r) {
	let i = (r - t) * me, a = (n - e) * me, o = t * me, s = r * me, c = Math.sin(i / 2), l = Math.sin(a / 2), u = Math.hypot(c, Math.cos(o) * Math.cos(s) * l);
	return 2 * fe * Math.asin(u);
}
function ge(e, t, n, r, i) {
	let a = t * me, o = r * me, s = o - a, c = (n - e) * me, l = (a + o) * .5, u = c * Math.cos(l), d = s;
	return (u * u + d * d) * pe <= i * i;
}
function _e(e, t, n = 5) {
	if (e === t) return [e];
	let r = e > t, i = r ? t : e, a = r ? e : t, o = (a - i) / n, s = 10 ** Math.floor(Math.log10(o)), c = o / s, l;
	l = c < 1.5 ? 1 : c < 3 ? 2 : c < 7 ? 5 : 10;
	let u = l * s, d = Math.floor(i / u) * u, f = Math.ceil(a / u) * u, p = [], m = d, h = Math.max(0, -Math.floor(Math.log10(u))), g = u / 1e9;
	for (; m <= f + g;) p.push(Number(m.toFixed(h))), m += u;
	return r ? p.reverse() : p;
}
//#endregion
//#region src/graphs/graphBuilder.js
var ve = new ce(0, { name: "omt-router/graph" }), ye = 1e6, be = 15, xe = Se();
function Se() {
	let e = Array.from(le.car.class), t = [1, 1];
	for (let n = 2; n < e.length; n++) t[n] = t[n - 1] + t[n - 2];
	let n = {};
	for (let r = 0; r < e.length; r++) n[e[r]] = t[r];
	return n;
}
function Ce(e, t) {
	return `${Math.round(e * ye)},${Math.round(t * ye)}`;
}
function we(e, t) {
	return e === "pedestrian" ? 0 : t;
}
function Te(e) {
	let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), r = be / 111320 * 2, i = (e, t) => [Math.floor(e / r), Math.floor(t / r)], a = be / 111320, o = /* @__PURE__ */ new Map(), s = [], c = /* @__PURE__ */ new Map(), l = [], u = e === "car" ? [] : null, d = 0;
	return {
		nodes: t,
		nodeIndex: n,
		edges: s,
		edgeSet: c,
		outDegree: l,
		outCarCentrality: u,
		nodeCounter: d,
		edgeCounter: 0,
		classToFibonacciScore: e === "car" ? xe : null,
		mode: e,
		getOrCreateNode: (e, r, s, c, l, u) => {
			let f = u ?? Ce(e, r), p = n.get(f);
			if (p !== void 0) return p;
			if (c && l) {
				let [t, s] = i(e, r);
				for (let i = -1; i <= 1; i++) {
					let c = o.get(t + i);
					if (c) for (let t = -1; t <= 1; t++) {
						let i = c.get(s + t);
						if (i) for (let { coords: t, id: o } of i) {
							let i = t[0] - e, s = t[1] - r;
							if (!(i > a || i < -a || s > a || s < -a) && ge(t[0], t[1], e, r, be)) return n.set(f, o), o;
						}
					}
				}
			}
			let m = d++;
			n.set(f, m);
			let h = [e, r];
			if (t.set(m, {
				id: m,
				coords: h
			}), c && l) {
				let [e, t] = i(h[0], h[1]), n = o.get(e);
				n || (n = /* @__PURE__ */ new Map(), o.set(e, n));
				let r = n.get(t);
				r || (r = [], n.set(t, r)), r.push({
					id: m,
					coords: h
				});
			}
			return m;
		}
	};
}
var Ee = 13;
function De(e, t) {
	let { edgeSet: n, outDegree: r, outCarCentrality: i, mode: a } = e;
	if (t.length === 0) return;
	let o = t[0];
	if (typeof o == "object" && o && "c1" in o) {
		for (let o of t) {
			let [t, s] = o.c1, [c, l] = o.c2, u = o.c1Key ?? Ce(t, s), d = o.c2Key ?? Ce(c, l), f = o.oneway, p = o.speed, m = o.props, h = o.roadId, g = !!o.c1boundary, _ = !!o.c2boundary, v = !!o.clipped, y = we(a, f), b = e.getOrCreateNode(t, s, h, g, v, u), x = e.getOrCreateNode(c, l, h, _, v, d), S = n.get(b);
			if (S || (S = /* @__PURE__ */ new Set(), n.set(b, S)), S.has(x)) continue;
			S.add(x);
			let C = he(t, s, c, l), w = C / (p / 3.6), T = {
				id: e.edgeCounter++,
				source: b,
				target: x,
				cost: y === -1 ? -1 : C,
				reverseCost: y === 1 ? -1 : C,
				length: C,
				speed: p,
				travelTime: w,
				roadId: h,
				properties: m
			};
			if (e.classToFibonacciScore) {
				let t = m.class ?? "";
				T.fibonacciScore = e.classToFibonacciScore[t] ?? 1;
			}
			r[b] = (r[b] || 0) + 1, i && (i[b] = (i[b] || 0) + (T.fibonacciScore ?? 1)), e.edges.push(T);
		}
		return;
	}
	for (let o = 0; o < t.length; o += Ee) {
		let s = t[o], c = t[o + 1], l = t[o + 2], u = t[o + 3], d = t[o + 4], f = t[o + 5], p = t[o + 6], m = t[o + 7], h = t[o + 8], g = t[o + 9], _ = !!t[o + 10], v = !!t[o + 11], y = !!t[o + 12], b = we(a, p), x = e.getOrCreateNode(s, c, g, _, y, d), S = e.getOrCreateNode(l, u, g, v, y, f), C = n.get(x);
		if (C || (C = /* @__PURE__ */ new Set(), n.set(x, C)), C.has(S)) continue;
		C.add(S);
		let w = he(s, c, l, u), T = w / (m / 3.6), E = {
			id: e.edgeCounter++,
			source: x,
			target: S,
			cost: b === -1 ? -1 : w,
			reverseCost: b === 1 ? -1 : w,
			length: w,
			speed: m,
			travelTime: T,
			roadId: g,
			properties: h
		};
		if (e.classToFibonacciScore) {
			let t = h.class ?? "";
			E.fibonacciScore = e.classToFibonacciScore[t] ?? 1;
		}
		r[x] = (r[x] || 0) + 1, i && (i[x] = (i[x] || 0) + (E.fibonacciScore ?? 1)), e.edges.push(E);
	}
}
function Oe(e) {
	return {
		mode: e.mode,
		nodes: e.nodes,
		edges: e.edges,
		nodeIndex: e.nodeIndex,
		outDegree: new Int32Array(e.outDegree),
		outCarCentrality: e.outCarCentrality ? new Int32Array(e.outCarCentrality) : void 0
	};
}
function ke(e) {
	return !e || typeof e.code != "string" ? !1 : e.code === "MissingAllowOriginHeader" || e.code === "NetworkError" || e.code.startsWith("HTTP_");
}
async function Ae(e, t, { pool: n, cache: r, ttl: i = 3e5, maxConcurrentTiles: a } = {}) {
	if (!le[t]) throw Error(`Unknown transport mode "${t}". Valid values: car, pedestrian, bicycle.`);
	let o = Math.max(1, typeof a == "number" && a > 0 ? Math.min(a, e.length) : Math.min(8, e.length, typeof n?.maxSize == "number" ? n.maxSize : 4)), s = ({ url: e, x: a, y: o, z: s }) => r.getOrSetAsync(`graph:v2:${t}:${s}/${a}/${o}:${e}`, async () => {
		let r = await n.postMessage({
			op: "parse-tile",
			url: e,
			x: a,
			y: o,
			z: s,
			mode: t
		}, void 0, {
			awaitResponse: !0,
			timeout: 1e4
		});
		if (r?.fetchFailed) {
			let t = r?.fetchError?.code, n = r?.fetchError?.message, i = /* @__PURE__ */ Error(n ? `tile fetch failed for ${s}/${a}/${o}: ${n}` : `tile fetch failed for ${s}/${a}/${o}`);
			throw i.code = t ?? "TileFetchFailed", i.tile = {
				z: s,
				x: a,
				y: o,
				url: e
			}, i;
		}
		let i = r?.output ?? r;
		return i instanceof ArrayBuffer || ArrayBuffer.isView(i) ? ie(i) : i;
	}, { ttl: i }), c = [];
	for (let t = 0; t < e.length; t += o) {
		let n = e.slice(t, t + o).map((e) => s(e)), r = await Promise.allSettled(n);
		if (c.push(...r), r.some((e) => e.status === "rejected" && ke(e.reason))) break;
	}
	let l = Te(t), u = !1, d = [];
	for (let e of c) {
		if (e.status === "rejected") {
			u = !0, ve.warn(() => `tile fetch failed, skipping: ${e.reason?.message ?? e.reason}`), d.push({
				code: e.reason?.code ?? "TileFetchFailed",
				message: e.reason?.message ?? String(e.reason),
				tile: e.reason?.tile ?? null
			});
			continue;
		}
		De(l, e.value);
	}
	let f = Oe(l);
	return f.hasMissingTiles = u, f.missingTileErrors = d, f;
}
//#endregion
//#region node_modules/performance-helpers/src/helpers/powerQueue.js
var je = class {
	constructor(e = 16) {
		let t = Math.max(2, Number(e) || 16);
		for (this._capacity = 1; this._capacity < t;) this._capacity <<= 1;
		this._mask = this._capacity - 1, this._buffer = Array(this._capacity), this._head = 0, this._tail = 0, this._size = 0;
	}
	push(e) {
		return this._size === this._capacity && this._grow(), this._buffer[this._tail] = e, this._tail = this._tail + 1 & this._mask, this._size++, this._size;
	}
	shift() {
		if (this._size === 0) return;
		let e = this._buffer[this._head];
		return this._buffer[this._head] = void 0, this._head = this._head + 1 & this._mask, this._size--, e;
	}
	peek() {
		return this._size === 0 ? void 0 : this._buffer[this._head];
	}
	clear() {
		if (this._size === 0) return;
		let e = this._head;
		for (let t = 0; t < this._size; t++) this._buffer[e] = void 0, e = e + 1 & this._mask;
		this._head = this._tail = 0, this._size = 0;
	}
	get capacity() {
		return this._capacity;
	}
	get isEmpty() {
		return this._size === 0;
	}
	*[Symbol.iterator]() {
		let e = this._head;
		for (let t = 0; t < this._size; t++) yield this._buffer[e + t & this._mask];
	}
	values() {
		return this[Symbol.iterator]();
	}
	*keys() {
		for (let e = 0; e < this._size; e++) yield e;
	}
	*entries() {
		for (let e = 0; e < this._size; e++) yield [e, this._buffer[this._head + e & this._mask]];
	}
	*drain() {
		for (; this._size > 0;) yield this.shift();
	}
	toArray() {
		let e = Array(this._size);
		for (let t = 0; t < this._size; t++) e[t] = this._buffer[this._head + t & this._mask];
		return e;
	}
	_grow() {
		let e = this._buffer, t = this._capacity << 1, n = Array(t);
		for (let t = 0; t < this._size; t++) n[t] = e[this._head + t & this._mask];
		this._buffer = n, this._capacity = t, this._mask = t - 1, this._head = 0, this._tail = this._size & this._mask;
	}
	pushMany(e) {
		if (!Array.isArray(e) || e.length === 0) return this._size;
		let t = this._size + e.length;
		for (; this._capacity < t;) this._grow();
		let n = Math.min(e.length, this._capacity - this._tail);
		for (let t = 0; t < n; t++) this._buffer[this._tail + t] = e[t];
		this._tail = this._tail + n & this._mask;
		let r = n;
		for (; r < e.length;) {
			let t = Math.min(e.length - r, this._capacity - this._tail);
			for (let n = 0; n < t; n++) this._buffer[this._tail + n] = e[r + n];
			this._tail = this._tail + t & this._mask, r += t;
		}
		return this._size = t, this._size;
	}
	get length() {
		return this._size;
	}
	unshiftMany(e) {
		if (!Array.isArray(e) || e.length === 0) return this._size;
		let t = this._size + e.length;
		for (; this._capacity < t;) this._grow();
		let n = this._head - e.length & this._mask;
		for (let t = 0; t < e.length; t++) this._buffer[n + t & this._mask] = e[t];
		return this._head = n, this._size = t, this._size;
	}
}, Me = Symbol("PowerSubscriberSet.original"), Ne = class {
	constructor(e = {}) {
		let { weak: t = !1, maxListeners: n = 0 } = e || {};
		this._weak = !!t, this._maxListeners = Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0, this._listeners = /* @__PURE__ */ new Set(), this._onceMap = /* @__PURE__ */ new WeakMap(), this._finalization = null, this._weak && typeof WeakRef < "u" && typeof FinalizationRegistry < "u" && (this._finalization = new FinalizationRegistry((e) => {
			this._listeners.delete(e.ref);
		}));
	}
	get size() {
		return this._cleanup(), this._listeners.size;
	}
	add(e) {
		if (typeof e != "function") {
			if (!this._weak || !e || typeof e.deref != "function") throw TypeError("listener must be a function");
			if (this._maxListeners > 0 && this.size + 1 > this._maxListeners) throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);
			return this._listeners.add(e), () => this.delete(e);
		}
		if (this._maxListeners > 0 && this.size + 1 > this._maxListeners) throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);
		let t = this._makeEntry(e);
		return this._listeners.add(t), () => this.delete(e);
	}
	addOnce(e) {
		if (typeof e != "function") throw TypeError("listener must be a function");
		let t = (...t) => {
			try {
				e(...t);
			} finally {
				this.delete(e);
			}
		};
		try {
			t[Me] = e;
		} catch {}
		if (this._onceMap.set(e, t), this._maxListeners > 0 && this.size + 1 > this._maxListeners) throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);
		let n = this._makeEntry(t);
		return this._listeners.add(n), () => this.delete(e);
	}
	delete(e) {
		let t = e, n = this._onceMap.get(e);
		n && (t = n, this._onceMap.delete(e));
		for (let e of this._listeners) {
			if (e === t) return this._listeners.delete(e), this._finalization && typeof e.deref == "function" && this._finalization.unregister(e), !0;
			let n = this._deref(e);
			if (!n) {
				this._listeners.delete(e);
				continue;
			}
			if (n === t) return this._listeners.delete(e), this._finalization && typeof e.deref == "function" && this._finalization.unregister(e), !0;
		}
		return !1;
	}
	forEach(e) {
		for (let t of this._listeners) {
			let n = this._deref(t);
			if (!n) {
				this._listeners.delete(t);
				continue;
			}
			e(n);
		}
	}
	clear() {
		this._listeners.clear(), this._onceMap = /* @__PURE__ */ new WeakMap();
	}
	values() {
		this._cleanup();
		let e = [];
		for (let t of this._listeners) {
			let n = this._deref(t);
			n && e.push(n);
		}
		return e;
	}
	*[Symbol.iterator]() {
		for (let e of this._listeners) {
			let t = this._deref(e);
			if (!t) {
				this._listeners.delete(e);
				continue;
			}
			yield t;
		}
	}
	_cleanup() {
		if (!(!this._weak || typeof WeakRef > "u")) for (let e of this._listeners) typeof e?.deref == "function" && !e.deref() && this._listeners.delete(e);
	}
	_makeEntry(e) {
		if (this._weak && typeof WeakRef < "u") {
			let t = new WeakRef(e);
			if (this._finalization) try {
				this._finalization.register(e, { ref: t }, t);
			} catch {}
			return t;
		}
		return e;
	}
	_deref(e) {
		return typeof e?.deref == "function" ? e.deref() : e;
	}
};
function Pe(e) {
	if (e) {
		if (typeof e.cleanup == "function") {
			try {
				e.cleanup();
			} catch {}
			return;
		}
		if (typeof e._cleanup == "function") {
			try {
				e._cleanup();
			} catch {}
			return;
		}
		if (typeof e[Symbol.iterator] == "function" && typeof e.delete == "function") for (let t of e) (typeof t?.deref == "function" ? t.deref() : t) || e.delete(t);
	}
}
//#endregion
//#region node_modules/performance-helpers/src/helpers/powerEventBus.js
var Fe = class {
	constructor(e = {}) {
		this._listeners = /* @__PURE__ */ new Map(), this._maxListeners = Number.isFinite(Number(e.maxListeners)) ? Math.max(0, Number(e.maxListeners)) : 0, this._weak = !!e.weak, this._fr = null, this._finalizationRefs = /* @__PURE__ */ new WeakMap(), this._eventFinalizationRefs = /* @__PURE__ */ new Map();
	}
	_ensureFinalizationRegistry() {
		return !this._weak || typeof FinalizationRegistry > "u" ? null : (this._fr || (this._fr = new FinalizationRegistry((e) => {
			try {
				let { event: t, ref: n } = e, r = this._listeners.get(t), i = this._eventFinalizationRefs.get(t);
				if (i && n && (i.delete(n), i.size === 0 && this._eventFinalizationRefs.delete(t)), !r) return;
				Pe(r), r.size === 0 && (this._listeners.delete(t), this._eventFinalizationRefs.delete(t));
			} catch {}
		})), this._fr);
	}
	cleanup() {
		if (this._weak) for (let [e, t] of this._listeners) Pe(t), t.size === 0 && (this._clearWeakListenerEvent(e), this._listeners.delete(e));
	}
	on(e, t) {
		if (typeof t != "function") throw TypeError("listener must be a function");
		let n = this._getBucket(e);
		n || (n = new Ne({
			maxListeners: this._maxListeners,
			weak: this._weak
		}), this._listeners.set(e, n));
		let r = n.add(t);
		return this._registerWeakListener(t, e) ? () => {
			r(), this._unregisterWeakListener(t, e);
		} : r;
	}
	_getBucket(e) {
		let t = this._listeners.get(e);
		if (!t) return null;
		if (t instanceof Ne) return t;
		if (typeof t?.[Symbol.iterator] == "function") {
			let n = new Ne({
				maxListeners: this._maxListeners,
				weak: this._weak
			});
			for (let e of t) {
				let t = typeof e?.deref == "function" ? e.deref() : e;
				t && n.add(t);
			}
			return this._listeners.set(e, n), n;
		}
		return null;
	}
	_registerWeakListener(e, t) {
		let n = this._ensureFinalizationRegistry();
		if (!n || typeof WeakRef > "u") return null;
		let r = new WeakRef(e);
		try {
			n.register(e, {
				event: t,
				ref: r
			}, r);
			let i = this._finalizationRefs.get(e);
			i || (i = /* @__PURE__ */ new Map(), this._finalizationRefs.set(e, i));
			let a = i.get(t);
			a || (a = /* @__PURE__ */ new Set(), i.set(t, a)), a.add(r);
			let o = this._eventFinalizationRefs.get(t);
			o || (o = /* @__PURE__ */ new Set(), this._eventFinalizationRefs.set(t, o)), o.add(r);
		} catch {
			return null;
		}
		return r;
	}
	_unregisterWeakListener(e, t) {
		if (!this._fr || !this._finalizationRefs.has(e)) return;
		let n = this._finalizationRefs.get(e);
		if (!n || n.size === 0) {
			this._finalizationRefs.delete(e);
			return;
		}
		let r = t === void 0 ? Array.from(n.keys()) : [t];
		for (let e of r) {
			let t = n.get(e);
			if (!t || t.size === 0) {
				n.delete(e);
				continue;
			}
			for (let n of t) {
				try {
					this._fr.unregister(n);
				} catch {}
				let t = this._eventFinalizationRefs.get(e);
				t && (t.delete(n), t.size === 0 && this._eventFinalizationRefs.delete(e));
			}
			n.delete(e);
		}
		n.size === 0 && this._finalizationRefs.delete(e);
	}
	_clearWeakListenerEvent(e) {
		if (!this._fr) return;
		let t = this._eventFinalizationRefs.get(e);
		if (t) {
			for (let e of t) try {
				this._fr.unregister(e);
			} catch {}
			this._eventFinalizationRefs.delete(e);
		}
	}
	once(e, t) {
		if (typeof t != "function") throw TypeError("listener must be a function");
		let n = this._getBucket(e);
		n || (n = new Ne({
			maxListeners: this._maxListeners,
			weak: this._weak
		}), this._listeners.set(e, n));
		let r = n.addOnce(t);
		return this._registerWeakListener(t, e) ? () => {
			r(), this._unregisterWeakListener(t, e);
		} : r;
	}
	off(e, t) {
		let n = this._getBucket(e);
		n && (n.delete(t), this._unregisterWeakListener(t, e), n.size === 0 && (this._clearWeakListenerEvent(e), this._listeners.delete(e)));
	}
	emit(e, t) {
		let n = this._listeners.get(e);
		if (!n || n.size === 0) return !1;
		if (n instanceof Ne) {
			let r = !1;
			return n.forEach((e) => {
				r = !0;
				try {
					e(t);
				} catch {}
			}), n.size === 0 && (this._clearWeakListenerEvent(e), this._listeners.delete(e)), r;
		}
		let r = n.size > 0;
		for (let e of n) {
			let r = typeof e?.deref == "function" ? e.deref() : e;
			if (!r) {
				n.delete(e);
				continue;
			}
			try {
				r(t);
			} catch {}
		}
		return n.size === 0 && (this._clearWeakListenerEvent(e), this._listeners.delete(e)), r;
	}
	*_iterBucketListeners(e) {
		if (e instanceof Ne) {
			yield* e;
			return;
		}
		for (let t of e) {
			let n = typeof t?.deref == "function" ? t.deref() : t;
			if (!n) {
				e.delete(t);
				continue;
			}
			yield n;
		}
	}
	async emitAsync(e, t, { concurrency: n = Infinity } = {}) {
		let r = this._listeners.get(e);
		if (!r || r.size === 0) return !1;
		let i = Number.isFinite(+n) && +n > 0 ? Math.max(1, Math.floor(+n)) : Infinity, a = async (e) => {
			try {
				await e(t);
			} catch {}
		}, o = /* @__PURE__ */ new Set(), s = !1;
		for (let e of this._iterBucketListeners(r)) {
			if (!e) continue;
			s = !0;
			let t = Promise.resolve().then(() => a(e)).finally(() => {
				o.delete(t);
			});
			o.add(t), Number.isFinite(i) && o.size >= i && await Promise.race(o);
		}
		return o.size && await Promise.all(o), r.size === 0 && (this._clearWeakListenerEvent(e), this._listeners.delete(e)), s;
	}
	listeners(e) {
		let t = this._listeners.get(e);
		return t ? t instanceof Ne ? t.values() : Array.from(t).map((e) => typeof e?.deref == "function" ? e.deref() : e).filter(Boolean) : [];
	}
	clear(e) {
		if (e === void 0) {
			for (let e of this._eventFinalizationRefs.keys()) this._clearWeakListenerEvent(e);
			this._eventFinalizationRefs.clear(), this._finalizationRefs = /* @__PURE__ */ new WeakMap(), this._listeners.clear();
			return;
		}
		this._clearWeakListenerEvent(e), this._listeners.delete(e);
	}
}, Ie = class {
	constructor(e, t, n) {
		this._underlying = e, this._logger = t, this._pool = n, this.onmessage = null, this.onerror = null, this.onmessageerror = null;
	}
	postMessage(e, t) {
		let n = e, r = t;
		if (n instanceof Uint8Array || ArrayBuffer.isView(n) || n instanceof ArrayBuffer) {
			if (Array.isArray(r)) try {
				r.length ? this._underlying.postMessage(n, r) : this._underlying.postMessage(n);
				return;
			} catch (e) {
				throw this._logger.error(e, "Failed to postMessage to underlying worker"), e;
			}
			if (!r) {
				let e = n instanceof ArrayBuffer ? n : n.buffer;
				e?.byteLength > 0 && (r = [e]);
			}
			try {
				r?.length ? this._underlying.postMessage(n, r) : this._underlying.postMessage(n);
			} catch (e) {
				throw this._logger.error(e, "Failed to postMessage to underlying worker"), e;
			}
			return;
		}
		if (typeof n == "object" && n && !ArrayBuffer.isView(n) && !(n instanceof ArrayBuffer)) try {
			let t = this._pool._encodeForTransfer(e);
			if (!r) r = [t.buffer];
			else if (Array.isArray(r)) r.includes(t.buffer) || r.push(t.buffer);
			else {
				let e = Array.from(r);
				e.includes(t.buffer) || e.push(t.buffer), r = e;
			}
			n = t;
		} catch {
			r = t, n = e;
		}
		try {
			r?.length ? this._underlying.postMessage(n, r) : this._underlying.postMessage(n);
		} catch (e) {
			throw this._logger.error(e, "Failed to postMessage to underlying worker"), e;
		}
	}
	addEventListener(...e) {
		return this._underlying.addEventListener(...e);
	}
	removeEventListener(...e) {
		return this._underlying.removeEventListener(...e);
	}
	terminate() {
		typeof this._underlying.terminate == "function" && this._underlying.terminate();
	}
}, Le = class extends Error {
	constructor(e = "PowerPool has been shut down") {
		super(e), this.name = "PowerPoolShutdownError";
	}
}, Re = class {
	constructor(e, t = {}) {
		let n = typeof navigator < "u" && navigator.hardwareConcurrency || 2, { size: r = Math.min(n, 2), minSize: i = 2, maxSize: a = Math.max(r, n), workerOptions: o = {}, maxTasksPerWorker: s, idleTimeout: c = _, taskQueue: l = !0, queuePolicy: u = "enqueue", lazy: f = !0, awaitResponseTimeout: p = m, autoScale: g = !1 } = t, b = s === void 0 && g ? 1 : s ?? Infinity;
		if (typeof e != "function" && typeof e != "string") throw TypeError("PowerPool workerSource must be a function or string");
		this._workerSource = e, this._workerOptions = o, this._maxTasksPerWorker = b, this.minSize = Math.max(0, i), this.maxSize = Math.max(this.minSize, a), this.idleTimeout = Math.max(0, c), this.taskQueueEnabled = !!l, this._queuePolicy = [
			"enqueue",
			"drop-oldest",
			"drop-newest",
			"reject"
		].includes(u) ? u : "enqueue", this._createdAt = d(), this._totalWorkersCreated = 0, this._totalTasksCompleted = 0, this._taskDurationsWelfordCount = 0, this._taskDurationsWelfordMean = 0, this._taskDurationsWelfordM2 = 0, this._taskDurationsMin = Infinity, this._taskDurationsMax = -Infinity, this._ewmaLatency = null, this._autoScale = null, this._autoScaleInterval = null, this._lastAutoScaleAt = 0, this._terminatedWorkerTaskCountsTotal = 0, this._terminatedWorkerTaskCountsCount = 0, this.workers = [], this.queue = new je();
		let x = {
			maxListeners: t?.listenerMaxListeners ?? t?.maxListeners,
			weak: !!t?.weakListeners
		};
		this._bus = new Fe(x), this._queueHighThreshold = Number.isFinite(Number(t?.queueHighThreshold)) ? Math.max(0, Math.floor(Number(t?.queueHighThreshold))) : Infinity, this._queueHighCrossed = !1, this._onmessage = null, this._onerror = null, this._onidle = null, this._onresize = null, this._nextIndex = 0, this._nextWorkerId = 0, this._correlationCounter = 0, this._activeTasks = 0, this._isIdle = !0, this._queuePaused = !1;
		let S = typeof t?.debugLevel == "number" ? t.debugLevel : 1;
		if (this._logger = new ce(S, { name: "powerPool" }), arguments.length > 1 && arguments[1] != null && typeof arguments[1] != "object") throw TypeError("PowerPool options must be an object");
		this._pendingResponses = /* @__PURE__ */ new Map(), this._underlyingToWorkerObj = /* @__PURE__ */ new Map(), this._defaultAwaitResponseTimeout = Number.isFinite(Number(p)) ? Math.max(0, Math.floor(Number(p))) : m;
		let C = Math.min(f ? this.minSize : Math.max(r, this.minSize), this.maxSize);
		for (let e = 0; e < C; e++) try {
			this._addWorkerInstance();
		} catch (e) {
			try {
				if ((e?.message ? String(e.message) : "").includes("Invalid workerSource")) throw e;
			} catch (e) {
				throw e;
			}
			try {
				this._logger.error(e, "Initial worker creation failed");
			} catch (e) {
				this._debugLog?.(e, "Initial worker creation: logger error");
			}
			try {
				this._bus.emit("pool:error", {
					phase: "init",
					error: e
				});
			} catch (e) {
				this._debugLog?.(e, "Initial worker creation: bus.emit failed");
			}
			break;
		}
		if (this._reaperInterval = setInterval(() => this._reapIdleWorkers(), Math.max(h, Math.floor(this.idleTimeout / 2))), this._encodeCache = /* @__PURE__ */ new Map(), this._encodeCacheLimit = Math.max(16, t?.encodeCacheLimit ? t.encodeCacheLimit : 64), this._encodeCacheByteLimit = Number.isFinite(Number(t?.encodeCacheByteLimit)) ? Math.max(0, Number(t?.encodeCacheByteLimit)) : Infinity, this._encodeCacheBytes = 0, t?.autoScale) {
			let e = typeof t.autoScale == "object" ? t.autoScale : {}, n = Number.isFinite(Number(e.intervalMs)) ? Math.max(100, Math.floor(e.intervalMs)) : v, r = Number.isFinite(Number(e.targetMs)) ? Math.max(1, Number(e.targetMs)) : 50, i = Number.isFinite(Number(e.alpha)) ? Math.max(0, Math.min(1, Number(e.alpha))) : .2, a = Number.isFinite(Number(e.cooldownMs)) ? Math.max(0, Math.floor(e.cooldownMs)) : y, o = Number.isFinite(Number(e.hysteresis)) ? Math.max(0, Math.min(1, Number(e.hysteresis))) : .2, s = Number.isFinite(Number(e.stepUp)) ? Math.max(1, Math.floor(Number(e.stepUp))) : 1, c = Number.isFinite(Number(e.stepDown)) ? Math.max(1, Math.floor(Number(e.stepDown))) : 1, l = Number.isFinite(Number(e.backoffFactor)) ? Math.max(1, Number(e.backoffFactor)) : 1, u = Number.isFinite(Number(e.backoffMaxMultiplier)) ? Math.max(1, Number(e.backoffMaxMultiplier)) : 8, d = Number.isFinite(Number(e.backoffResetMs)) ? Math.max(0, Math.floor(Number(e.backoffResetMs))) : a * 4;
			this._autoScale = {
				enabled: !0,
				intervalMs: n,
				targetMs: r,
				alpha: i,
				cooldownMs: a,
				hysteresis: o,
				stepUp: s,
				stepDown: c,
				backoffFactor: l,
				backoffMaxMultiplier: u,
				backoffResetMs: d
			}, this._autoScaleBackoffMultiplier = 1;
			try {
				this._autoScaleInterval = setInterval(() => this._autoScaleTick(), n);
			} catch (e) {
				this._debugLog?.(e, "autoScale: interval setup failed");
			}
		}
	}
	_debugLog(e, t) {
		try {
			typeof this._logger?.debug == "function" && (e ? this._logger.debug(e, t || "swallowed error") : this._logger.debug(t || "swallowed error"));
		} catch (e) {
			try {
				typeof console < "u" && typeof console.debug == "function" && console.debug(e, t || "swallowed error");
			} catch {}
		}
	}
	_ensureReaper() {
		try {
			this._reaperInterval || (this._reaperInterval = setInterval(() => this._reapIdleWorkers(), Math.max(h, Math.floor(this.idleTimeout / 2))));
		} catch (e) {
			this._debugLog?.(e, "_ensureReaper: setInterval failed");
		}
	}
	_createPendingResponsePromise(e, t) {
		let n = e == null ? e : String(e), r = null;
		return {
			pendingPromise: new Promise((e, i) => {
				r = {
					resolve: e,
					reject: i,
					timer: null
				};
				let a = Number.isFinite(Number(t?.timeout)) ? Math.max(0, Math.floor(Number(t?.timeout))) : Number.isFinite(Number(this._defaultAwaitResponseTimeout)) ? this._defaultAwaitResponseTimeout : void 0;
				Number.isFinite(a) && a > 0 && (r.timer = setTimeout(() => {
					try {
						this._cleanupPendingResponse(n, { rejectWith: /* @__PURE__ */ Error("postMessage response timeout") });
					} catch {
						try {
							i(/* @__PURE__ */ Error("postMessage response timeout"));
						} catch (e) {
							this._debugLog?.(e, "createPendingResponsePromise: reject fallback failed");
						}
					}
				}, a)), this._pendingResponses.set(n, r);
			}),
			correlationKey: n
		};
	}
	_postToWorkerObj(e, t, n, r, i, a) {
		try {
			return t.transfer?.length ? e.worker.postMessage(t.message, t.transfer) : e.worker.postMessage(t.message), typeof e._startTimes?.push == "function" && e._startTimes.push(n), e.tasks++, this._activeTasks++, e.lastActive = n, this._isIdle && this._updateIdleState(), r ? a : !0;
		} catch (e) {
			if (r && i) {
				try {
					this._cleanupPendingResponse(i, { rejectWith: e });
				} catch (e) {
					this._debugLog?.(e, "postToWorkerObj: cleanupPendingResponse failed");
				}
				try {
					this._logger.error(e, "Failed to postMessage to worker");
				} catch (e) {
					this._debugLog?.(e, "postToWorkerObj: logger.error failed");
				}
				return a;
			}
			try {
				this._logger.error(e, "Failed to postMessage to worker");
			} catch (e) {
				this._debugLog?.(e, "postToWorkerObj: logger.error failed");
			}
			return !1;
		}
	}
	_tryGrowPool(e, t, n, r, i, a, o) {
		let s;
		try {
			s = this._addWorkerInstance();
		} catch (e) {
			try {
				this._logger.error(e, "Failed to grow pool");
			} catch (e) {
				this._debugLog?.(e, "tryGrowPool: logger.error failed");
			}
			try {
				this._bus.emit("pool:error", {
					phase: "grow",
					error: e
				});
			} catch (e) {
				this._debugLog?.(e, "tryGrowPool: bus.emit failed");
			}
			if (i && a) {
				try {
					this._cleanupPendingResponse(a, { rejectWith: e });
				} catch (e) {
					this._debugLog?.(e, "tryGrowPool: cleanupPendingResponse failed");
				}
				return o;
			}
			return !1;
		}
		if (!s) {
			if (i && a) {
				try {
					this._cleanupPendingResponse(a, { rejectWith: /* @__PURE__ */ Error("failed to add worker") });
				} catch (e) {
					this._debugLog?.(e, "tryGrowPool: cleanupPendingResponse failed");
				}
				return o;
			}
			return !1;
		}
		let c = this._prepareForTransfer(e, t, n);
		return this._postToWorkerObj(s, c, r, i, a, o);
	}
	_enqueueOrReject(e, t, n, r) {
		let i = this._queuePolicy;
		if (i === "reject" || i === "drop-newest" && this.queue.length > 0) return t && n ? (this._cleanupPendingResponse(n, { rejectWith: /* @__PURE__ */ Error("postMessage rejected by queue policy") }), r) : !1;
		if (i === "drop-oldest" && this.queue.length > 0) {
			let e = this.queue.shift();
			e?.correlationId != null && this._cleanupPendingResponse(e.correlationId, { rejectWith: /* @__PURE__ */ Error("postMessage queued task dropped by policy") });
		}
		let a = {
			message: e.message,
			transfer: e.transfer
		};
		t && n && (a.correlationId = n), this.queue.push(a);
		try {
			Number.isFinite(this._queueHighThreshold) && this.queue.length > this._queueHighThreshold && !this._queueHighCrossed && (this._queueHighCrossed = !0, this._bus.emit("pool:queue:high", {
				length: this.queue.length,
				threshold: this._queueHighThreshold
			}));
		} catch (e) {
			this._debugLog?.(e, "enqueueOrReject: bus.emit failed");
		}
		return this._updateIdleState(), t ? r : !0;
	}
	_clearLifecycleIntervals() {
		try {
			this._reaperInterval && (clearInterval(this._reaperInterval), this._reaperInterval = null);
		} catch (e) {
			this._debugLog?.(e, "clearLifecycleIntervals: clearInterval(reaper) failed");
		}
		try {
			this._autoScaleInterval && (clearInterval(this._autoScaleInterval), this._autoScaleInterval = null);
		} catch (e) {
			this._debugLog?.(e, "clearLifecycleIntervals: clearInterval(autoScale) failed");
		}
	}
	shutdown() {
		this._clearLifecycleIntervals();
		try {
			for (let [e] of this._pendingResponses) try {
				this._cleanupPendingResponse(e, { rejectWith: new Le("pool:shutdown") });
			} catch (e) {
				this._debugLog?.(e, "shutdown: cleanup pending response");
			}
			try {
				typeof this._pendingResponses?.clear == "function" && this._pendingResponses.clear();
			} catch (e) {
				this._debugLog?.(e, "shutdown: pendingResponses.clear failed");
			}
		} catch (e) {
			this._debugLog?.(e, "shutdown: iterate pending responses");
		}
		try {
			for (let e of this.workers) try {
				e.worker.terminate();
			} catch (e) {
				this._debugLog?.(e, "shutdown: terminate worker");
			}
		} catch (e) {
			this._debugLog?.(e, "shutdown: terminate workers loop");
		}
		try {
			this._underlyingToWorkerObj && this._underlyingToWorkerObj.clear();
		} catch (e) {
			this._debugLog?.(e, "shutdown: underlyingToWorkerObj.clear failed");
		}
		let e = this.workers.map((e) => e?.id).filter((e) => e != null);
		e?.length && this._bus.emit("pool:scale", {
			action: "remove",
			terminated: e,
			count: e.length
		}), this.workers = [], this.queue = new je(), this._queueHighCrossed = !1, this._activeTasks = 0;
	}
	_encodeForTransfer(e) {
		try {
			let t = JSON.stringify(e);
			if (typeof t == "string" && t.length > 2048) return re(e);
			let n = this._encodeCache.get(t);
			if (n) {
				try {
					this._encodeCache.delete(t), this._encodeCache.set(t, n);
				} catch {}
				return n;
			}
			let r = re(e), i = r?.byteLength || 0, a = () => this._encodeCache.size >= this._encodeCacheLimit || this._encodeCacheByteLimit !== Infinity && this._encodeCacheBytes + i > this._encodeCacheByteLimit;
			for (; a();) {
				let e = [], t = this._encodeCache.keys();
				for (; a() && e.length < 10;) {
					let n = t.next();
					if (n.done) break;
					e.push(n.value);
				}
				if (!e.length) break;
				for (let t of e) {
					try {
						let e = this._encodeCache.get(t), n = typeof e?.byteLength == "number" ? e.byteLength : 0;
						this._encodeCacheBytes = Math.max(0, this._encodeCacheBytes - n);
					} catch {}
					this._encodeCache.delete(t);
				}
			}
			return this._encodeCache.set(t, r), r?.byteLength && (this._encodeCacheBytes += r.byteLength), r;
		} catch {
			return re(e);
		}
	}
	prepareBuffer(e, t = {}) {
		let { clone: n = !0 } = t, r = this._encodeForTransfer(e);
		return n ? r.slice() : r;
	}
	prepareBuffers(e, t = {}) {
		if (!Array.isArray(e)) throw Error("prepareBuffers expects an array");
		let { clone: n = !0, zeroCopy: r = !1 } = t, i = Array(e.length);
		for (let t = 0; t < e.length; t++) {
			let a = e[t] && typeof e[t] == "object" && "message" in e[t] ? e[t] : { message: e[t] }, o = a.message, s = a.transfer;
			if (s) {
				i[t] = {
					message: o,
					transfer: s
				};
				continue;
			}
			if (typeof o == "object" && o && !ArrayBuffer.isView(o) && !(o instanceof ArrayBuffer)) {
				if (r) {
					i[t] = {
						message: o,
						transfer: void 0
					};
					continue;
				}
				try {
					let e = this._encodeForTransfer(o), r = n ? e.slice() : e;
					i[t] = {
						message: r,
						transfer: n ? [r.buffer] : void 0
					};
					continue;
				} catch {
					i[t] = {
						message: o,
						transfer: void 0
					};
					continue;
				}
			}
			if (o instanceof ArrayBuffer || ArrayBuffer.isView(o)) {
				i[t] = {
					message: o,
					transfer: [o instanceof ArrayBuffer ? o : o.buffer]
				};
				continue;
			}
			i[t] = {
				message: o,
				transfer: void 0
			};
		}
		return i;
	}
	_prepareForTransfer(e, t, n) {
		let r = !!n?.zeroCopy;
		if (e instanceof Uint8Array || ArrayBuffer.isView(e) || e instanceof ArrayBuffer) {
			let n = e instanceof ArrayBuffer ? e : e.buffer;
			if (!t) {
				if (n?.byteLength === 0) try {
					let t = e instanceof ArrayBuffer ? e.slice(0) : new Uint8Array(e);
					return {
						message: t,
						transfer: [t.buffer]
					};
				} catch {
					return {
						message: e,
						transfer: void 0
					};
				}
				return {
					message: e,
					transfer: [n]
				};
			}
			if (Array.isArray(t)) return {
				message: e,
				transfer: t
			};
			if (t.length === 0) return {
				message: e,
				transfer: [n]
			};
			let r = [], i = !1;
			for (let e of t) r.push(e), e === n && (i = !0);
			return i || r.push(n), {
				message: e,
				transfer: r
			};
		}
		if (typeof e == "object" && e && !ArrayBuffer.isView(e) && !(e instanceof ArrayBuffer)) {
			if (r) return {
				message: e,
				transfer: t
			};
			try {
				let n = this._encodeForTransfer(e).slice(), r = t;
				if (!r || Array.isArray(r) && r.length === 0) r = [n.buffer];
				else if (Array.isArray(r)) {
					let e = !1;
					for (let t of r) if (t === n.buffer) {
						e = !0;
						break;
					}
					e || (r = [...r, n.buffer]);
				} else if (r.length === 0) r = [n.buffer];
				else {
					let e = [], t = !1;
					for (let i of r) e.push(i), i === n.buffer && (t = !0);
					t || e.push(n.buffer), r = e;
				}
				return {
					message: n,
					transfer: r
				};
			} catch {
				return {
					message: e,
					transfer: t
				};
			}
		}
		return {
			message: e,
			transfer: t
		};
	}
	_decrementActiveTasks(e = 1) {
		try {
			let t = Number.isFinite(Number(e)) ? Math.max(0, Math.floor(Number(e))) : 1;
			this._activeTasks = Math.max(0, this._activeTasks - t);
		} catch {
			this._activeTasks = 0;
		}
	}
	resize(e) {
		let t = this.minSize, n = this.maxSize;
		if (typeof e == "object" && e) Number.isFinite(e.minSize) && (t = Math.max(0, Math.floor(e.minSize))), Number.isFinite(e.maxSize) && (n = Math.max(t, Math.floor(e.maxSize)));
		else {
			let r = Number(e);
			if (!Number.isFinite(r)) return;
			n = Math.max(t, Math.floor(r));
		}
		this.minSize = Math.max(0, t), this.maxSize = Math.max(this.minSize, n);
		let r = 0;
		for (; this.workers.length < this.minSize && this.workers.length < this.maxSize;) try {
			let e = this.workers.length;
			if (this._addWorkerInstance(), this.workers.length === e) break;
			r++;
		} catch (e) {
			try {
				this._logger.error(e, "resize: add worker failed");
			} catch (e) {
				this._debugLog?.(e, "resize: logger.error failed");
			}
			try {
				this._bus.emit("pool:error", {
					phase: "resize",
					error: e
				});
			} catch (e) {
				this._debugLog?.(e, "resize: bus.emit failed");
			}
			break;
		}
		let i = [];
		for (; this.workers.length > this.maxSize;) {
			let e = this.workers.pop();
			if (e) {
				this._decrementActiveTasks(e.tasks || 0);
				try {
					e.worker.terminate();
				} catch (e) {
					this._debugLog?.(e, "resize: worker.terminate failed");
				}
				this._deleteWorkerUnderlyingMapping(e), this._terminatedWorkerTaskCountsTotal += e.completedTasks || 0, this._terminatedWorkerTaskCountsCount += 1, i.push(e.id);
			}
		}
		if (i.length || r) {
			let e = { data: {
				type: "pool:resize",
				terminated: i,
				added: r
			} };
			if (this._onresize) try {
				this._onresize(e);
			} catch (e) {
				this._logger.error(e, "Pool onresize handler error");
			}
			this._bus.emit("resize", e), this._bus.emit("pool:scale", {
				added: r,
				terminated: i,
				minSize: this.minSize,
				maxSize: this.maxSize
			});
		}
		this._updateIdleState();
	}
	_createWorkerInstance() {
		if (typeof this._workerSource == "function") {
			let e = this._workerSource;
			if (e.prototype === void 0) return e();
			try {
				return new e();
			} catch (t) {
				let n = String(t?.message);
				if (t instanceof TypeError && /not a constructor|cannot be invoked without\s*'new'|Class constructor|not constructable/i.test(n)) return e();
				throw t;
			}
		}
		if (typeof this._workerSource == "string") {
			let e;
			try {
				e = Function("try { return import.meta?.url } catch (e) { return undefined }")();
			} catch {
				e = void 0;
			}
			if (!e && typeof document < "u") {
				let t = document.currentScript;
				t?.src && (e = t.src);
			}
			!e && typeof location < "u" && location.href && (e = location.href);
			try {
				if (e) return new Worker(new URL(this._workerSource, e), this._workerOptions);
			} catch {}
			return new Worker(this._workerSource, this._workerOptions);
		}
		throw Error("Invalid workerSource: expected Worker factory or relative path string");
	}
	_deleteWorkerUnderlyingMapping(e) {
		try {
			let t = e?.worker?._underlying;
			t && this._underlyingToWorkerObj && this._underlyingToWorkerObj.delete(t);
		} catch (e) {
			this._debugLog?.(e, "_deleteWorkerUnderlyingMapping failed");
		}
	}
	_addWorkerInstance(e) {
		e ?? (e = this._nextWorkerId++);
		let t = this._createWorkerInstance(), n = new Ie(t, this._logger, this), r = {
			id: e,
			worker: n,
			tasks: 0,
			lastActive: d(),
			latencyEwma: null,
			_startTimes: new je()
		};
		r.completedTasks = 0, this.workers.push(r), this._totalWorkersCreated++, this._bus.emit("pool:scale", {
			action: "add",
			id: r.id,
			minSize: this.minSize,
			maxSize: this.maxSize
		});
		try {
			this._underlyingToWorkerObj.set(t, r);
		} catch {}
		n.onmessage = (e) => {
			let t = d();
			r.tasks = Math.max(0, r.tasks - 1), this._decrementActiveTasks(1), r.lastActive = t;
			try {
				let t = e?.data;
				if (t && typeof t == "object" && t.correlationId != null) {
					let e = String(t.correlationId), n = Object.prototype.hasOwnProperty.call(t, "response") ? t.response : t;
					this._cleanupPendingResponse(e, { resolveWith: n });
				}
			} catch (e) {
				this._debugLog?.(e, "worker.onmessage: resolve pending response");
			}
			try {
				let n = r._startTimes?.length ? r._startTimes.shift() : null, i = null;
				try {
					let a = e?.data;
					if (typeof a?.duration == "number" && Number.isFinite(a.duration) ? i = Math.max(0, Number(a.duration)) : n != null && (i = Math.max(0, t - n)), i != null) {
						let e = this._autoScale?.alpha || .2;
						r.latencyEwma == null ? r.latencyEwma = i : r.latencyEwma = e * i + (1 - e) * r.latencyEwma, this._ewmaLatency == null ? this._ewmaLatency = i : this._ewmaLatency = e * i + (1 - e) * this._ewmaLatency, this._totalTasksCompleted = (this._totalTasksCompleted || 0) + 1, r.completedTasks = (r.completedTasks || 0) + 1;
						let t = this._taskDurationsWelfordCount;
						this._taskDurationsWelfordCount = t + 1;
						let n = i - this._taskDurationsWelfordMean;
						this._taskDurationsWelfordMean += n * 1 / this._taskDurationsWelfordCount;
						let a = i - this._taskDurationsWelfordMean;
						this._taskDurationsWelfordM2 += n * a, i < this._taskDurationsMin && (this._taskDurationsMin = i), i > this._taskDurationsMax && (this._taskDurationsMax = i);
					}
				} catch (e) {
					this._debugLog?.(e, "worker.onmessage: latency tracking inner");
				}
			} catch (e) {
				this._debugLog?.(e, "worker.onmessage: latency tracking outer");
			}
			if (!this._queuePaused && this.queue.length > 0 && r.tasks < this._maxTasksPerWorker) {
				let e = this.queue.shift();
				try {
					e.transfer ? n.postMessage(e.message, e.transfer) : n.postMessage(e.message), r._startTimes.push(t), r.tasks++, this._activeTasks++;
				} catch (e) {
					this._debugLog?.(e, "dispatch queued message to worker failed"), this._logger.error(e, "Failed to dispatch queued message to worker");
				}
				this._queueHighCrossed && this.queue.length <= this._queueHighThreshold && (this._queueHighCrossed = !1);
			}
			if (this._onmessage) try {
				this._onmessage(e);
			} catch (e) {
				this._logger.error(e, "Pool onmessage handler error");
			}
			this._bus.emit("message", e), this._updateIdleState();
		};
		let i = (e) => {
			let t = e?.data === void 0 ? e : e.data, r = t;
			if (t && (t instanceof ArrayBuffer || ArrayBuffer.isView(t))) try {
				r = ie(t);
			} catch (e) {
				try {
					o(e);
				} catch (e) {
					this._debugLog?.(e, "_handleMessage: _handleMessageError failed");
				}
				r = t;
			}
			let i = e?.data !== void 0 && r === t ? e : {
				data: r,
				originalEvent: e
			};
			if (typeof n.onmessage == "function") try {
				n.onmessage(i);
			} catch (e) {
				this._logger.error(e, "worker wrapper onmessage error");
			}
		}, a = (e) => {
			if (typeof n.onerror == "function") try {
				n.onerror(e);
			} catch (e) {
				this._logger.error(e, "worker wrapper onerror error");
			}
			this._bus.emit("error", e);
		}, o = (e) => {
			if (typeof n.onmessageerror == "function") try {
				n.onmessageerror(e);
			} catch (e) {
				this._logger.error(e, "worker wrapper onmessageerror error");
			}
			this._bus.emit("messageerror", e);
		};
		if (typeof t.addEventListener == "function") {
			try {
				t.addEventListener("message", i);
			} catch (e) {
				this._debugLog?.(e, "attach addEventListener message");
			}
			try {
				t.addEventListener("error", a);
			} catch (e) {
				this._debugLog?.(e, "attach addEventListener error");
			}
			try {
				t.addEventListener("messageerror", o);
			} catch (e) {
				this._debugLog?.(e, "attach addEventListener messageerror");
			}
		} else if (typeof t.on == "function") {
			try {
				t.on("message", i);
			} catch (e) {
				this._debugLog?.(e, "attach underlying.on message");
			}
			try {
				t.on("error", a);
			} catch (e) {
				this._debugLog?.(e, "attach underlying.on error");
			}
			try {
				t.on("messageerror", o);
			} catch (e) {
				this._debugLog?.(e, "attach underlying.on messageerror");
			}
		} else {
			try {
				t.onmessage = i;
			} catch (e) {
				this._debugLog?.(e, "assign underlying.onmessage");
			}
			try {
				t.onerror = a;
			} catch (e) {
				this._debugLog?.(e, "assign underlying.onerror");
			}
			try {
				t.onmessageerror = o;
			} catch (e) {
				this._debugLog?.(e, "assign underlying.onmessageerror");
			}
		}
		return r;
	}
	_findLeastLoadedWorker() {
		if (!this.workers.length) return null;
		let e = null, t = Infinity, n = Infinity;
		for (let r = 0; r < this.workers.length; r++) {
			let i = this.workers[r], a = i.latencyEwma == null ? Infinity : i.latencyEwma;
			(i.tasks < t || i.tasks === t && a < n) && (e = i, t = i.tasks, n = a);
		}
		return e;
	}
	postMessage(e, t, n) {
		n = n || void 0;
		let r = d(), i = n?.workerId == null ? null : n.workerId, a = i == null && this.workers.length === 1 && this._maxTasksPerWorker === Infinity, o = i == null ? a ? this.workers[0] : this._findLeastLoadedWorker() : this.workers.find((e) => e.id === i), s = !!(n?.awaitResponse || n?.correlationId != null), c, l;
		if (s) {
			if (c = n.correlationId == null ? this._generateCorrelationId() : String(n.correlationId), !(typeof e == "object" && e && !ArrayBuffer.isView(e) && !(e instanceof ArrayBuffer))) throw Error("postMessage awaitResponse requires a plain-object message");
			e = Object.assign({}, e, { correlationId: c });
			let t = this._createPendingResponsePromise(c, n);
			l = t.pendingPromise, c = t.correlationKey;
		}
		if (o?.tasks < this._maxTasksPerWorker) try {
			let i = r, a = this._prepareForTransfer(e, t, n);
			return this._postToWorkerObj(o, a, i, s, c, l);
		} catch (e) {
			if (s && c) {
				try {
					this._cleanupPendingResponse(c, { rejectWith: e });
				} catch (e) {
					this._debugLog?.(e, "postMessage: cleanupPendingResponse failed");
				}
				try {
					this._logger.error(e, "Failed to postMessage to worker");
				} catch (e) {
					this._debugLog?.(e, "postMessage: logger.error failed");
				}
				return l;
			}
			try {
				this._logger.error(e, "Failed to postMessage to worker");
			} catch (e) {
				this._debugLog?.(e, "postMessage: logger.error failed");
			}
			return !1;
		}
		if (i != null && (!o || o.tasks >= this._maxTasksPerWorker)) {
			if (s && c) {
				try {
					this._cleanupPendingResponse(c, { rejectWith: /* @__PURE__ */ Error("targeted worker unavailable") });
				} catch (e) {
					this._debugLog?.(e, "postMessage: cleanupPendingResponse failed");
				}
				return l;
			}
			return !1;
		}
		if (i == null && this.workers.length < this.maxSize) {
			let i = r;
			return this._tryGrowPool(e, t, n, i, s, c, l);
		}
		if (this.taskQueueEnabled) {
			let r = this._prepareForTransfer(e, t, n);
			return this._enqueueOrReject(r, s, c, l);
		}
		if (!this.workers.length) return s ? l : !1;
		let u = this._nextIndex % this.workers.length;
		this._nextIndex = (this._nextIndex + 1) % this.workers.length;
		let f = this.workers[u];
		try {
			let n = r, i = this._prepareForTransfer(e, t);
			return this._postToWorkerObj(f, i, n, s, c, l);
		} catch (e) {
			if (s && c) {
				try {
					this._cleanupPendingResponse(c, { rejectWith: e });
				} catch (e) {
					this._debugLog?.(e, "postMessage: cleanupPendingResponse failed");
				}
				try {
					this._logger.error(e, "Failed to postMessage to fallback worker");
				} catch (e) {
					this._debugLog?.(e, "postMessage: logger.error failed");
				}
				return l;
			}
			try {
				this._logger.error(e, "Failed to postMessage to fallback worker");
			} catch (e) {
				this._debugLog?.(e, "postMessage: logger.error failed");
			}
			return !1;
		}
	}
	_generateCorrelationId() {
		try {
			let e = typeof globalThis < "u" ? globalThis.crypto : void 0;
			if (typeof e?.randomUUID == "function") return String(`${e.randomUUID()}-${this._correlationCounter++}`);
		} catch {}
		try {
			let e = typeof globalThis < "u" ? globalThis.crypto : void 0;
			if (typeof e?.getRandomValues == "function") {
				let t = new Uint8Array(16);
				e.getRandomValues(t);
				let n = Array.from(t).map((e) => e.toString(16).padStart(2, "0")).join("");
				return String(`${n}-${this._correlationCounter++}`);
			}
		} catch {}
		let e = Math.floor(Math.random() * 4294967295).toString(16);
		return String(`cid-${Math.floor(d()).toString(36)}-${e}-${this._correlationCounter++}`);
	}
	_cleanupPendingResponse(e, t = {}) {
		let n = e == null ? e : String(e), r = this._pendingResponses.get(n);
		if (!r) return !1;
		try {
			if (r.timer) try {
				clearTimeout(r.timer);
			} catch (e) {
				this._debugLog?.(e, "_cleanupPendingResponse: clearTimeout failed");
			}
		} catch (e) {
			this._debugLog?.(e, "_cleanupPendingResponse: timer check failed");
		}
		try {
			Object.prototype.hasOwnProperty.call(t, "resolveWith") ? r.resolve(t.resolveWith) : Object.prototype.hasOwnProperty.call(t, "rejectWith") && r.reject(t.rejectWith);
		} catch (e) {
			this._debugLog?.(e, "_cleanupPendingResponse: resolve/reject failed");
		} finally {
			try {
				this._pendingResponses.delete(n);
			} catch (e) {
				this._debugLog?.(e, "_cleanupPendingResponse: delete failed");
			}
		}
		return !0;
	}
	broadcast(e, t) {
		let n = d(), r = null, i = typeof e == "object" && !!e && !ArrayBuffer.isView(e) && !(e instanceof ArrayBuffer);
		for (let a of this.workers) try {
			let o = e, s = t;
			if (!s && i) try {
				r ?? (r = this._encodeForTransfer(e));
				let t = r.slice();
				o = t, s = [t.buffer];
			} catch {
				o = e, s = void 0;
			}
			s?.length ? a.worker.postMessage(o, s) : a.worker.postMessage(o), typeof a._startTimes?.push == "function" && a._startTimes.push(n), a.tasks++, this._activeTasks++, a.lastActive = n;
		} catch (e) {
			this._logger.error(e, "broadcast error");
		}
		this._updateIdleState();
	}
	_normalizeStopThePressOptions(e) {
		let t = e?.recreateWorkers === void 0 ? !0 : !!e.recreateWorkers, n = typeof e == "object" ? Object.assign({}, e) : void 0;
		return n && delete n.recreateWorkers, {
			recreate: t,
			fwdOptions: n
		};
	}
	_resetPoolForStopThePress({ recreate: e, scope: t }) {
		try {
			typeof this.queue?.clear == "function" && this.queue.clear();
		} catch (e) {
			this._logger.error(e, `${t}: failed to clear queue`);
		}
		try {
			this._queueHighCrossed = !1;
		} catch (e) {
			this._debugLog?.(e, "_resetPoolForStopThePress: queueHighCrossed reset failed");
		}
		try {
			for (let [e] of this._pendingResponses) try {
				this._cleanupPendingResponse(e, { rejectWith: /* @__PURE__ */ Error(`${t}: cancelled pending response`) });
			} catch (e) {
				this._debugLog?.(e, "_resetPoolForStopThePress: cleanupPendingResponse failed");
			}
		} catch (e) {
			this._logger.error(e, `${t}: failed to cancel pending responses`);
		}
		let n = 0, r = [];
		try {
			let e = this.workers;
			if (n = Number(e?.length) || 0, Array.isArray(e)) r = e.slice();
			else {
				r = Array(n);
				for (let t = 0; t < n; t++) r[t] = e[t];
			}
		} catch (e) {
			this._logger.error(e, `${t}: failed to snapshot workers`), n = 0, r = [];
		}
		let i = r.map((e) => e?.id).filter((e) => e != null);
		try {
			for (let e = r.length - 1; e >= 0; e--) {
				let t = r[e];
				this._terminatedWorkerTaskCountsTotal += t.completedTasks || 0, this._terminatedWorkerTaskCountsCount += 1;
				try {
					t.worker.terminate();
				} catch (e) {
					this._debugLog?.(e, "_resetPoolForStopThePress: worker.terminate failed");
				}
				this._deleteWorkerUnderlyingMapping(t);
			}
			this.workers.length = 0, this._activeTasks = 0;
		} catch (e) {
			this._logger.error(e, `${t}: failed while terminating workers`);
		}
		if (e || this._clearLifecycleIntervals(), e) {
			let e = Math.max(this.minSize, Math.min(n, this.maxSize));
			for (let t = 0; t < e; t++) try {
				let e = this.workers.length;
				if (this._addWorkerInstance(), this.workers.length === e) break;
			} catch (e) {
				try {
					this._logger.error(e, "recreate: add worker failed");
				} catch (e) {
					this._debugLog?.(e, "recreate: logger.error failed");
				}
				try {
					this._bus.emit("pool:error", {
						phase: "recreate",
						error: e
					});
				} catch (e) {
					this._debugLog?.(e, "recreate: bus.emit failed");
				}
				break;
			}
			try {
				this._ensureReaper();
			} catch (e) {
				this._debugLog?.(e, "recreate: ensureReaper failed");
			}
		}
		return this._updateIdleState(), {
			currentCount: n,
			terminatedIds: i
		};
	}
	stopThePress(e, t, n) {
		let { recreate: r, fwdOptions: i } = this._normalizeStopThePressOptions(n), { currentCount: a, terminatedIds: o } = this._resetPoolForStopThePress({
			recreate: r,
			scope: "stopThePress"
		});
		try {
			o?.length && this._bus.emit("pool:scale", {
				action: "remove",
				terminated: o,
				count: a
			});
		} catch (e) {
			this._logger.error(e, "pool scale stopThePress listener error");
		}
		return this.postMessage(e, t, i);
	}
	postMessageBatch(e, t) {
		if (!Array.isArray(e)) throw Error("postMessageBatch expects an array of {message, transfer?}");
		let n = !!(t?.awaitResponse || t?.correlationId != null), r = typeof t?.correlationIdFactory == "function" ? t.correlationIdFactory : null;
		if (n) {
			if (t?.correlationId != null && e.length > 1 && !r) throw Error("postMessageBatch cannot use a fixed correlationId for multiple items; provide options.correlationIdFactory or omit correlationId");
			let n = Array(e.length);
			for (let i = 0; i < e.length; i++) {
				let a = e[i] || {}, o = Object.assign({}, t);
				r && (o.correlationId = String(r(i, a))), n[i] = this.postMessage(a.message, a.transfer, o);
			}
			return n;
		}
		let i = Array(e.length), a = [], o = t?.workerId == null ? null : t.workerId, s = this.prepareBuffers(e, {
			clone: !0,
			zeroCopy: !!t?.zeroCopy
		});
		if (o == null && this.workers.length === 1 && this._maxTasksPerWorker === Infinity) {
			let t = this.workers[0], n = !1;
			for (let r = 0; r < e.length; r++) {
				let a = s[r] || {
					message: e[r]?.message,
					transfer: e[r]?.transfer
				};
				try {
					let e = d();
					a.transfer?.length ? t.worker.postMessage(a.message, a.transfer) : t.worker.postMessage(a.message), typeof t._startTimes?.push == "function" && t._startTimes.push(e), t.tasks++, this._activeTasks++, t.lastActive = e, n = !0, i[r] = !0;
				} catch {
					i[r] = !1;
				}
			}
			return n && this._updateIdleState(), i;
		}
		let c = o != null, l = null;
		if (c) {
			if (l = this.workers.find((e) => e.id === o), !l) return e.map(() => !1);
		} else l = this._findLeastLoadedWorker();
		let u = !1;
		for (let t = 0; t < e.length; t++) {
			let n = e[t] || {}, r = s[t] || {
				message: n.message,
				transfer: n.transfer
			}, f = !1;
			l?.tasks >= this._maxTasksPerWorker && (l = null);
			let p = l;
			if (!p && !c && (p = this._findLeastLoadedWorker()), p?.tasks < this._maxTasksPerWorker) try {
				let e = d();
				r.transfer?.length ? p.worker.postMessage(r.message, r.transfer) : p.worker.postMessage(r.message), typeof p._startTimes?.push == "function" && p._startTimes.push(e), p.tasks++, this._activeTasks++, p.lastActive = e, u = !0, i[t] = !0, f = !0, l = p.tasks < this._maxTasksPerWorker ? p : null;
			} catch {
				i[t] = !1, f = !0;
			}
			if (!f && o == null && this.workers.length < this.maxSize) try {
				let e = this._addWorkerInstance();
				if (!e) i[t] = !1, f = !0;
				else {
					let n = d();
					r.transfer?.length ? e.worker.postMessage(r.message, r.transfer) : e.worker.postMessage(r.message), typeof e._startTimes?.push == "function" && e._startTimes.push(n), e.tasks++, this._activeTasks++, e.lastActive = n, u = !0, i[t] = !0, f = !0, l = e.tasks < this._maxTasksPerWorker ? e : null;
				}
			} catch (e) {
				try {
					this._logger.error(e, "postMessageBatch: add worker failed");
				} catch {}
				try {
					this._bus.emit("pool:error", {
						phase: "postMessageBatch",
						error: e
					});
				} catch {}
				i[t] = !1, f = !0;
			}
			if (!f) {
				if (o != null) {
					i[t] = !1;
					continue;
				}
				if (this.taskQueueEnabled) {
					let e = this._queuePolicy;
					if (e === "reject" || e === "drop-newest" && this.queue.length > 0) i[t] = !1;
					else {
						if (e === "drop-oldest" && this.queue.length > 0) {
							let e = this.queue.shift();
							e?.correlationId != null && this._cleanupPendingResponse(e.correlationId, { rejectWith: /* @__PURE__ */ Error("postMessage queued task dropped by policy") });
						}
						a.push({
							message: r.message,
							transfer: r.transfer
						}), i[t] = !0;
					}
				} else if (!this.workers.length) i[t] = !1;
				else {
					let e = this._nextIndex % this.workers.length;
					this._nextIndex = (this._nextIndex + 1) % this.workers.length;
					let n = this.workers[e];
					try {
						let e = d();
						r.transfer?.length ? n.worker.postMessage(r.message, r.transfer) : n.worker.postMessage(r.message), typeof n._startTimes?.push == "function" && n._startTimes.push(e), n.tasks++, this._activeTasks++, n.lastActive = e, u = !0, i[t] = !0;
					} catch (e) {
						i[t] = !1, this._logger.error(e, "Failed to postMessage to fallback worker");
					}
				}
			}
		}
		if (a.length) try {
			this.queue.pushMany(a), u = !0;
			try {
				Number.isFinite(this._queueHighThreshold) && this.queue.length > this._queueHighThreshold && !this._queueHighCrossed && (this._queueHighCrossed = !0, this._bus.emit("pool:queue:high", {
					length: this.queue.length,
					threshold: this._queueHighThreshold
				}));
			} catch (e) {
				this._debugLog?.(e, "postMessageBatch: bus.emit pool:queue:high failed");
			}
		} catch (e) {
			this._logger.error(e, "postMessageBatch: failed to enqueue prepared items");
		}
		return u && this._updateIdleState(), i;
	}
	stopThePressBatch(e, t) {
		let { recreate: n, fwdOptions: r } = this._normalizeStopThePressOptions(t);
		this._resetPoolForStopThePress({
			recreate: n,
			scope: "stopThePressBatch"
		});
		try {
			return this.postMessageBatch(e, r);
		} catch (t) {
			try {
				this._logger.error(t, "stopThePressBatch: postMessageBatch failed");
			} catch (e) {
				this._debugLog?.(e, "stopThePressBatch: logger.error failed");
			}
			try {
				return Array(e ? e.length : 0).fill(!1);
			} catch {
				return [];
			}
		}
	}
	addWorker() {
		try {
			return this._addWorkerInstance();
		} catch (e) {
			try {
				this._logger.error(e, "addWorker: failed");
			} catch (e) {
				this._debugLog?.(e, "addWorker: logger.error failed");
			}
			try {
				this._bus.emit("pool:error", {
					phase: "addWorker",
					error: e
				});
			} catch (e) {
				this._debugLog?.(e, "addWorker: bus.emit failed");
			}
			return null;
		}
	}
	removeWorker() {
		let e = this.workers.pop();
		if (e) {
			this._decrementActiveTasks(e.tasks || 0);
			try {
				e.worker.terminate();
			} catch (e) {
				this._debugLog?.(e, "removeWorker: worker.terminate failed");
			}
			this._deleteWorkerUnderlyingMapping(e), this._terminatedWorkerTaskCountsTotal += e.completedTasks || 0, this._terminatedWorkerTaskCountsCount += 1;
		}
	}
	_reapIdleWorkers() {
		if (this.idleTimeout <= 0) return;
		let e = d();
		for (let t = this.workers.length - 1; t >= 0; t--) {
			let n = this.workers[t];
			if (this.workers.length <= this.minSize) break;
			if (n.tasks === 0 && e - (n.lastActive || 0) > this.idleTimeout) {
				try {
					n.worker.terminate();
				} catch (e) {
					this._debugLog?.(e, "_reapIdleWorkers: worker.terminate failed");
				}
				try {
					let e = n.worker?._underlying;
					e && this._underlyingToWorkerObj && this._underlyingToWorkerObj.delete(e);
				} catch (e) {
					this._debugLog?.(e, "_reapIdleWorkers: underlyingToWorkerObj.delete failed");
				}
				let e = this.workers.length - 1;
				t === e ? this.workers.pop() : this.workers[t] = this.workers.pop();
			}
		}
		this._updateIdleState();
	}
	_autoScaleTick() {
		try {
			if (!this._autoScale || !this._autoScale.enabled) return;
			let e = d(), t = this._autoScale;
			this._lastAutoScaleAt && t.backoffResetMs && e - this._lastAutoScaleAt > t.backoffResetMs && (this._autoScaleBackoffMultiplier = 1);
			let n = Math.floor((t.cooldownMs || 0) * (this._autoScaleBackoffMultiplier || 1));
			if (this._lastAutoScaleAt && e - this._lastAutoScaleAt < n) return;
			let r = t.targetMs, i = t.hysteresis || .2, a = this._ewmaLatency, o = this.workers.length, s = r * (1 + i), c = a == null ? !1 : a > s, l = this.queue.length > Math.ceil(o * (1 + i));
			if (c || l) {
				if (o < this.maxSize) try {
					let n = Math.min(this.maxSize - o, t.stepUp || 1);
					for (let e = 0; e < n; e++) try {
						let e = this.workers.length;
						if (this._addWorkerInstance(), this.workers.length === e) break;
					} catch (e) {
						this._debugLog?.(e, "autoScale: addWorker failed");
						try {
							this._bus.emit("pool:error", {
								phase: "autoScale:add",
								error: e
							});
						} catch (e) {
							this._debugLog?.(e, "autoScale: bus.emit failed");
						}
						break;
					}
					this._lastAutoScaleAt = e, this._autoScaleBackoffMultiplier = Math.min((this._autoScaleBackoffMultiplier || 1) * (t.backoffFactor || 1), t.backoffMaxMultiplier || 8);
				} catch (e) {
					this._debugLog?.(e, "autoScale: addWorker failed outer");
				}
				return;
			}
			let u = r * Math.max(0, 1 - i);
			if (a != null && a < u && this.queue.length === 0 && o > this.minSize) try {
				let n = Math.min(o - this.minSize, t.stepDown || 1), r = 0;
				for (let e = this.workers.length - 1; e >= 0 && r < n; e--) {
					let t = this.workers[e];
					if (!t || t.tasks > 0) continue;
					try {
						t.worker.terminate();
					} catch (e) {
						this._debugLog?.(e, "autoScale: terminate worker");
					}
					this._deleteWorkerUnderlyingMapping(t), this._terminatedWorkerTaskCountsTotal += t.completedTasks || 0, this._terminatedWorkerTaskCountsCount += 1;
					let n = this.workers.length - 1;
					e === n ? this.workers.pop() : this.workers[e] = this.workers.pop(), r++;
				}
				r > 0 && (this._lastAutoScaleAt = e, this._autoScaleBackoffMultiplier = Math.min((this._autoScaleBackoffMultiplier || 1) * (t.backoffFactor || 1), t.backoffMaxMultiplier || 8));
			} catch (e) {
				this._debugLog?.(e, "autoScale: remove worker failed");
			}
		} catch (e) {
			this._debugLog?.(e, "autoScaleTick outer");
		}
	}
	_emitIdle() {
		let e = { data: {
			type: "pool:idle",
			stats: this.getStats()
		} };
		if (this._isIdle = !0, this._onmessage) try {
			this._onmessage(e);
		} catch (e) {
			this._logger.error(e, "Pool onmessage handler error");
		}
		if (this._onidle) try {
			this._onidle(e);
		} catch (e) {
			this._logger.error(e, "Pool onidle handler error");
		}
		try {
			this._bus.emit("message", e);
		} catch (e) {
			this._logger.error(e, "pool listener error");
		}
		try {
			this._bus.emit("idle", e);
		} catch (e) {
			this._logger.error(e, "pool idle listener error");
		}
	}
	_updateIdleState() {
		let e = this.queue.length === 0, t = this._activeTasks === 0 && e;
		t && !this._isIdle ? this._emitIdle() : !t && this._isIdle && (this._isIdle = !1);
	}
	terminate() {
		try {
			this.shutdown();
		} catch {}
	}
	async [Symbol.dispose]() {
		if (typeof this[Symbol.asyncDispose] == "function") {
			await this[Symbol.asyncDispose]();
			return;
		}
		this.terminate();
	}
	async [Symbol.asyncDispose]() {
		try {
			await this.drain();
		} catch {}
		this.terminate();
	}
	getStats() {
		let e = this.workers.map((e) => ({
			id: e.id,
			tasks: e.tasks,
			lastActive: e.lastActive
		})), t = d(), n = this._createdAt == null ? 0 : Math.max(0, t - this._createdAt), r = this._totalWorkersCreated || this.workers.length, i = this._totalTasksCompleted || 0, a = this._terminatedWorkerTaskCountsCount || 0, o = this._terminatedWorkerTaskCountsTotal || 0, s = 0;
		for (let e of this.workers) s += e.completedTasks || 0;
		let c = a + (this.workers.length || 0), l = c > 0 ? (o + s) / c : 0, u = 0, f = 0, p = 0, m = 0, h = 0, g = this._taskDurationsWelfordCount || 0;
		if (g > 0) {
			u = this._taskDurationsMin === Infinity ? 0 : this._taskDurationsMin, f = this._taskDurationsMax === -Infinity ? 0 : this._taskDurationsMax, p = this._taskDurationsWelfordMean;
			let e = g > 1 ? this._taskDurationsWelfordM2 / g : 0;
			m = Math.sqrt(e), h = 0;
		}
		return {
			status: e,
			performance: {
				poolLiveDuration: n,
				totalWorkersCreated: r,
				totalTasksPerformed: i,
				averageTasksPerWorkerUntilTermination: l,
				timePerTask: {
					max: f,
					min: u,
					average: p,
					stddev: m
				},
				percentSlowTasks: h
			},
			queueLength: this.queue.length,
			activeTasks: this._activeTasks,
			workerCount: this.workers.length,
			minSize: this.minSize,
			maxSize: this.maxSize,
			isIdle: this._activeTasks === 0 && this.queue.length === 0
		};
	}
	drain() {
		let e = this.queue.length === 0;
		return this._activeTasks === 0 && e ? Promise.resolve(this.getStats()) : new Promise((e) => {
			let t = () => {
				try {
					this.removeEventListener("idle", t);
				} catch (e) {
					this._debugLog?.(e, "drain: removeEventListener failed");
				}
				e(this.getStats());
			};
			this.addEventListener("idle", t);
		});
	}
	addEventListener(e, t) {
		if (typeof t == "function" && (this._bus.on(e, t), e === "idle")) {
			let e = this.queue.length === 0;
			if (this._activeTasks === 0 && e) {
				let e = { data: {
					type: "pool:idle",
					stats: this.getStats()
				} };
				try {
					t(e);
				} catch (e) {
					this._logger.error(e, "pool idle listener error");
				}
			}
		}
	}
	removeEventListener(e, t) {
		!t || typeof t != "function" || this._bus.off(e, t);
	}
	get onresize() {
		return this._onresize;
	}
	set onresize(e) {
		this._onresize = e;
	}
	get onmessage() {
		return this._onmessage;
	}
	set onmessage(e) {
		this._onmessage = e;
	}
	get onerror() {
		return this._onerror;
	}
	set onerror(e) {
		this._onerror = e;
	}
	get onidle() {
		return this._onidle;
	}
	set onidle(e) {
		if (this._onidle = e, typeof e == "function") {
			let t = this.queue.length === 0;
			if (this._activeTasks === 0 && t) {
				let t = { data: {
					type: "pool:idle",
					stats: this.getStats()
				} };
				try {
					e(t);
				} catch (e) {
					this._logger.error(e, "Pool onidle handler error");
				}
			}
		}
	}
	pauseQueue() {
		this._queuePaused = !0;
	}
	resumeQueue() {
		this._queuePaused && (this._queuePaused = !1, this._dispatchQueuedTasks());
	}
	pause() {
		return this.pauseQueue();
	}
	resume() {
		return this.resumeQueue();
	}
	get queuePaused() {
		return this._queuePaused;
	}
	_dispatchQueuedTasks() {
		if (this._queuePaused || !this.taskQueueEnabled || this.queue.length === 0) return;
		let e = this.queue, t = this._maxTasksPerWorker, n = d(), r = !1;
		for (let i of this.workers) {
			let a = t - i.tasks;
			for (; a > 0 && e.length > 0;) {
				let t = e.shift();
				try {
					t.transfer?.length ? i.worker.postMessage(t.message, t.transfer) : i.worker.postMessage(t.message), typeof i._startTimes?.push == "function" && i._startTimes.push(n), i.tasks++, a--, this._activeTasks++, i.lastActive = n, r = !0;
				} catch (e) {
					this._debugLog?.(e, "dispatch queued message to worker failed"), this._logger.error(e, "Failed to dispatch queued message to worker");
					break;
				}
			}
		}
		this._queueHighCrossed && this.queue.length <= this._queueHighThreshold && (this._queueHighCrossed = !1), r && this._updateIdleState();
	}
}, ze = "(function(){let e,t;function n(){return e===void 0?typeof TextEncoder<`u`?(e=new TextEncoder,e):typeof Buffer<`u`&&typeof Buffer.from==`function`?(e={encode:e=>new Uint8Array(Buffer.from(e))},e):(e=!1,null):e===!1?null:e}function r(){return t===void 0?typeof TextDecoder<`u`?(t=new TextDecoder,t):typeof Buffer<`u`&&typeof Buffer.from==`function`?(t={decode:e=>Buffer.from(e).toString(`utf8`)},t):(t=!1,null):t===!1?null:t}let i=e=>{if(e instanceof Uint8Array)return e;if(ArrayBuffer.isView(e))return new Uint8Array(e.buffer,e.byteOffset,e.byteLength);if(e instanceof ArrayBuffer)return new Uint8Array(e);let t=JSON.stringify(e),r=n();if(typeof r?.encode==`function`)return r.encode(t);throw Error(`No TextEncoder or Buffer available to encode object`)},a=e=>{let t;if(e instanceof Uint8Array)t=e;else if(ArrayBuffer.isView(e))t=new Uint8Array(e.buffer,e.byteOffset,e.byteLength);else if(e instanceof ArrayBuffer)t=new Uint8Array(e);else if(typeof Buffer<`u`&&typeof Buffer.isBuffer==`function`&&Buffer.isBuffer(e))t=new Uint8Array(e);else throw TypeError(`Unsupported input to u82o, expected ArrayBuffer/TypedArray/Buffer`);let n=r();if(typeof n?.decode==`function`)return JSON.parse(n.decode(t));if(typeof TextDecoder<`u`)return JSON.parse(new TextDecoder().decode(t));throw Error(`No TextDecoder or Buffer available to decode object`)};function o(e,t=`ERR_ITEM`){return!e||typeof e!=`object`?{error:!0,code:t,message:e?String(e):void 0,stack:void 0}:{error:!0,code:e.code||t,message:e.message,stack:e.stack}}function s(e){return!e||!e.error?String(e):`${e.code||`ERR`}: ${e.message||``}`}let c=null;if(typeof process<`u`&&process?.hrtime&&typeof process.hrtime.bigint==`function`)try{let e=Number(process.hrtime.bigint()/1000000n);c=Date.now()-e}catch{c=null}let l=()=>{let e=Date.now();if(typeof performance<`u`&&typeof performance?.now==`function`&&typeof performance?.timeOrigin==`number`)try{let t=performance.timeOrigin+performance.now();return Math.abs(t-e)<1e3?t:e}catch{}if(c!=null)try{let t=Number(process.hrtime.bigint()/1000000n)+c;return Math.abs(t-e)<1e3?t:e}catch{return e}return e},u=Object.freeze({error:`error`,warn:`warn`,info:`info`,log:`log`,debug:`debug`,table:`table`}),d=typeof globalThis<`u`&&globalThis?.console?globalThis.console:typeof self<`u`&&self?.console?self.console:typeof window<`u`&&window?.console?window.console:typeof global<`u`&&global?.console?global.console:null;function f(e){try{return JSON.stringify(e)}catch{try{let t=typeof WeakSet==`function`?new WeakSet:new Set;return JSON.stringify(e,function(e,n){if(n&&typeof n==`object`){if(t.has(n))return`[Circular]`;t.add(n)}return typeof n==`function`?`[Function: ${n.name||`anonymous`}]`:typeof n==`symbol`?String(n):typeof n==`bigint`?n.toString()+`n`:n})}catch{try{return String(e)}catch{return`[Unserializable]`}}}}var p=class{constructor(e=0,t={}){this._debugLevel=0,this._counters=Object.create(null),this._format=t?.format||`text`,this.name=t?.name||null,this._formatter=typeof t?.formatter==`function`?t.formatter:null,this._output=typeof t?.output==`function`?t.output:null,this.setDebugLevel(e)}setDebugLevel(e){let t=NaN;typeof e==`number`?t=e:typeof e==`string`||typeof e==`boolean`?t=Number(e):(e instanceof Number||e instanceof String||e instanceof Boolean)&&(t=Number(e.valueOf())),this._debugLevel=Number.isFinite(t)&&t>=0?Math.max(0,Math.min(3,Math.floor(t))):0}getDebugLevel(){return this._debugLevel}isDebugLevel(e=1){return Number(this._debugLevel)>=Number(e||1)}isDebug(){return this.isDebugLevel(1)}_resolveLogArgs(e){return e.map(e=>{if(typeof e==`function`)try{return e()}catch(e){return e}return e})}_emit(e,t,n,r,i={}){if(!this.isDebugLevel(e))return;let a=this._resolveLogArgs(r),o={level:n,msg:i.msgArray?a:a.length===1?a[0]:a,ts:l(),format:this._format};if(this.name&&(o.name=this.name),this._formatter)try{let e=this._formatter(o);if(e!=null){if(typeof e==`string`){if(this._output){try{this._output(e)}catch{}return}typeof d?.[t]==`function`&&d[t](e);return}o=e}}catch{}if(this._output){try{this._output(o)}catch{}return}if(typeof d?.[t]==`function`)if(this._format===`json`)try{let e=typeof o==`string`?o:f(o);d[t](e)}catch{try{d[t](...Array.isArray(a)?a:[a])}catch{}}else d[t](...a)}error(...e){let t=e.map(e=>{try{if(e?.error)return s(e);if(e instanceof Error||e&&typeof e==`object`)return s(o(e))}catch{}return e});this._emit(1,`error`,u.error,t)}warn(...e){this._emit(2,`warn`,u.warn,e)}info(...e){this._emit(3,`info`,u.info,e)}log(...e){this._emit(3,`log`,u.log,e)}debug(...e){this._emit(3,`debug`,u.debug,e)}table(...e){if(!this.isDebugLevel(3)||!d)return;if(this._format===`json`){this._emit(3,`log`,u.table,e,{msgArray:!0});return}let t=this._resolveLogArgs(e);typeof d.table==`function`?d.table(...t):typeof d.log==`function`&&d.log(...t)}incrementCounter(e){if(!this.isDebug())return;let t=String(e||``);t&&(this._counters[t]=(this._counters[t]||0)+1)}getDebugCounters(){return Object.assign({},this._counters)}resetDebugCounters(){this._counters=Object.create(null)}};let m=1e3;60*m,30*m;var h=class{constructor(e={}){this._options=e||{}}static async run(e,t={}){if(typeof e!=`function`)throw TypeError(`fn must be a function`);let{maxAttempts:n=3,backoff:r=`exponential`,baseDelay:i=100,maxDelay:a=1e4,jitter:o=!0,attemptTimeout:s,retryIf:c=()=>!0,onRetry:l}=t,u=Number(n);if(!Number.isFinite(u)||u<=0)throw TypeError(`maxAttempts must be a positive finite number`);let d=Math.floor(u),f=e=>{let t;return t=r===`linear`?i*e:r===`fixed`?i:i*2**(e-1),t>a&&(t=a),o&&(t=Math.round(t*(.5+Math.random()*.5))),t},p;for(let t=1;t<=d;t++)try{let n=(async()=>e())();if(typeof s==`number`&&s>0){let e;try{return await Promise.race([n,new Promise((n,r)=>{e=setTimeout(()=>{let e=Error(`Attempt timed out`);e.code=`ETIMEOUT`,e.attempts=t,e.attemptTimeout=s,r(e)},s)})])}finally{e&&clearTimeout(e)}}return await n}catch(e){if(p=e,!(typeof c==`function`?c(e):c)||t===d)break;let n=f(t);try{typeof l==`function`&&l(t,e,n)}catch{}await new Promise(e=>setTimeout(e,n))}throw p}async run(e,t={}){let n=Object.assign({},this._options||{},t||{});return this.constructor.run(e,n)}};function g(e,t){this.x=e,this.y=t}g.prototype={clone(){return new g(this.x,this.y)},add(e){return this.clone()._add(e)},sub(e){return this.clone()._sub(e)},multByPoint(e){return this.clone()._multByPoint(e)},divByPoint(e){return this.clone()._divByPoint(e)},mult(e){return this.clone()._mult(e)},div(e){return this.clone()._div(e)},rotate(e){return this.clone()._rotate(e)},rotateAround(e,t){return this.clone()._rotateAround(e,t)},matMult(e){return this.clone()._matMult(e)},unit(){return this.clone()._unit()},perp(){return this.clone()._perp()},round(){return this.clone()._round()},mag(){return Math.sqrt(this.x*this.x+this.y*this.y)},equals(e){return this.x===e.x&&this.y===e.y},dist(e){return Math.sqrt(this.distSqr(e))},distSqr(e){let t=e.x-this.x,n=e.y-this.y;return t*t+n*n},angle(){return Math.atan2(this.y,this.x)},angleTo(e){return Math.atan2(this.y-e.y,this.x-e.x)},angleWith(e){return this.angleWithSep(e.x,e.y)},angleWithSep(e,t){return Math.atan2(this.x*t-this.y*e,this.x*e+this.y*t)},_matMult(e){let t=e[0]*this.x+e[1]*this.y,n=e[2]*this.x+e[3]*this.y;return this.x=t,this.y=n,this},_add(e){return this.x+=e.x,this.y+=e.y,this},_sub(e){return this.x-=e.x,this.y-=e.y,this},_mult(e){return this.x*=e,this.y*=e,this},_div(e){return this.x/=e,this.y/=e,this},_multByPoint(e){return this.x*=e.x,this.y*=e.y,this},_divByPoint(e){return this.x/=e.x,this.y/=e.y,this},_unit(){return this._div(this.mag()),this},_perp(){let e=this.y;return this.y=this.x,this.x=-e,this},_rotate(e){let t=Math.cos(e),n=Math.sin(e),r=t*this.x-n*this.y,i=n*this.x+t*this.y;return this.x=r,this.y=i,this},_rotateAround(e,t){let n=Math.cos(e),r=Math.sin(e),i=t.x+n*(this.x-t.x)-r*(this.y-t.y),a=t.y+r*(this.x-t.x)+n*(this.y-t.y);return this.x=i,this.y=a,this},_round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this},constructor:g},g.convert=function(e){if(e instanceof g)return e;if(Array.isArray(e))return new g(+e[0],+e[1]);if(e.x!==void 0&&e.y!==void 0)return new g(+e.x,+e.y);throw Error(`Expected [x, y] or {x, y} point format`)};var _=class{constructor(e,t,n,r,i){this.properties={},this.extent=n,this.type=0,this.id=void 0,this._pbf=e,this._geometry=-1,this._keys=r,this._values=i,e.readFields(v,this,t)}loadGeometry(){let e=this._pbf;e.pos=this._geometry;let t=e.readVarint()+e.pos,n=[],r,i=1,a=0,o=0,s=0;for(;e.pos<t;){if(a<=0){let t=e.readVarint();i=t&7,a=t>>3}if(a--,i===1||i===2)o+=e.readSVarint(),s+=e.readSVarint(),i===1&&(r&&n.push(r),r=[]),r&&r.push(new g(o,s));else if(i===7)r&&r.push(r[0].clone());else throw Error(`unknown command ${i}`)}return r&&n.push(r),n}bbox(){let e=this._pbf;e.pos=this._geometry;let t=e.readVarint()+e.pos,n=1,r=0,i=0,a=0,o=1/0,s=-1/0,c=1/0,l=-1/0;for(;e.pos<t;){if(r<=0){let t=e.readVarint();n=t&7,r=t>>3}if(r--,n===1||n===2)i+=e.readSVarint(),a+=e.readSVarint(),i<o&&(o=i),i>s&&(s=i),a<c&&(c=a),a>l&&(l=a);else if(n!==7)throw Error(`unknown command ${n}`)}return[o,c,s,l]}toGeoJSON(e,t,n){let r=this.extent*2**n,i=this.extent*e,a=this.extent*t,o=this.loadGeometry();function s(e){return[(e.x+i)*360/r-180,360/Math.PI*Math.atan(Math.exp((1-(e.y+a)*2/r)*Math.PI))-90]}function c(e){return e.map(s)}let l;if(this.type===1){let e=[];for(let t of o)e.push(t[0]);let t=c(e);l=e.length===1?{type:`Point`,coordinates:t[0]}:{type:`MultiPoint`,coordinates:t}}else if(this.type===2){let e=o.map(c);l=e.length===1?{type:`LineString`,coordinates:e[0]}:{type:`MultiLineString`,coordinates:e}}else if(this.type===3){let e=b(o),t=[];for(let n of e)t.push(n.map(c));l=t.length===1?{type:`Polygon`,coordinates:t[0]}:{type:`MultiPolygon`,coordinates:t}}else throw Error(`unknown feature type`);let u={type:`Feature`,geometry:l,properties:this.properties};return this.id!=null&&(u.id=this.id),u}};_.types=[`Unknown`,`Point`,`LineString`,`Polygon`];function v(e,t,n){e===1?t.id=n.readVarint():e===2?y(n,t):e===3?t.type=n.readVarint():e===4&&(t._geometry=n.pos)}function y(e,t){let n=e.readVarint()+e.pos;for(;e.pos<n;){let n=t._keys[e.readVarint()],r=t._values[e.readVarint()];t.properties[n]=r}}function b(e){let t=e.length;if(t<=1)return[e];let n=[],r,i;for(let a=0;a<t;a++){let t=x(e[a]);t!==0&&(i===void 0&&(i=t<0),i===t<0?(r&&n.push(r),r=[e[a]]):r&&r.push(e[a]))}return r&&n.push(r),n}function x(e){let t=0;for(let n=0,r=e.length,i=r-1,a,o;n<r;i=n++)a=e[n],o=e[i],t+=(o.x-a.x)*(a.y+o.y);return t}var S=class{constructor(e,t){this.version=1,this.name=``,this.extent=4096,this.length=0,this._pbf=e,this._keys=[],this._values=[],this._features=[],e.readFields(C,this,t),this.length=this._features.length}feature(e){if(e<0||e>=this._features.length)throw Error(`feature index out of bounds`);this._pbf.pos=this._features[e];let t=this._pbf.readVarint()+this._pbf.pos;return new _(this._pbf,t,this.extent,this._keys,this._values)}};function C(e,t,n){e===15?t.version=n.readVarint():e===1?t.name=n.readString():e===5?t.extent=n.readVarint():e===2?t._features.push(n.pos):e===3?t._keys.push(n.readString()):e===4&&t._values.push(ee(n))}function ee(e){let t=null,n=e.readVarint()+e.pos;for(;e.pos<n;){let n=e.readVarint()>>3;t=n===1?e.readString():n===2?e.readFloat():n===3?e.readDouble():n===4?e.readVarint64():n===5?e.readVarint():n===6?e.readSVarint():n===7?e.readBoolean():null}if(t==null)throw Error(`unknown feature value`);return t}var w=class{constructor(e,t){this.layers=e.readFields(T,{},t)}};function T(e,t,n){if(e===3){let e=new S(n,n.readVarint()+n.pos);e.length&&(t[e.name]=e)}}let E=65536*65536,D=1/E,O=typeof TextDecoder>`u`?null:new TextDecoder(`utf-8`);var te=class{constructor(e=new Uint8Array(16)){this.buf=ArrayBuffer.isView(e)?e:new Uint8Array(e),this.dataView=new DataView(this.buf.buffer),this.pos=0,this.type=0,this.length=this.buf.length}readFields(e,t,n=this.length){for(;this.pos<n;){let n=this.readVarint(),r=n>>3,i=this.pos;this.type=n&7,e(r,t,this),this.pos===i&&this.skip(n)}return t}readMessage(e,t){return this.readFields(e,t,this.readVarint()+this.pos)}readFixed32(){let e=this.dataView.getUint32(this.pos,!0);return this.pos+=4,e}readSFixed32(){let e=this.dataView.getInt32(this.pos,!0);return this.pos+=4,e}readFixed64(){let e=this.dataView.getUint32(this.pos,!0)+this.dataView.getUint32(this.pos+4,!0)*E;return this.pos+=8,e}readSFixed64(){let e=this.dataView.getUint32(this.pos,!0)+this.dataView.getInt32(this.pos+4,!0)*E;return this.pos+=8,e}readFloat(){let e=this.dataView.getFloat32(this.pos,!0);return this.pos+=4,e}readDouble(){let e=this.dataView.getFloat64(this.pos,!0);return this.pos+=8,e}readVarint(e){let t=this.buf,n,r;return r=t[this.pos++],n=r&127,r<128||(r=t[this.pos++],n|=(r&127)<<7,r<128)||(r=t[this.pos++],n|=(r&127)<<14,r<128)||(r=t[this.pos++],n|=(r&127)<<21,r<128)?n:(r=t[this.pos],n|=(r&15)<<28,ne(n,e,this))}readVarint64(){return this.readVarint(!0)}readSVarint(){let e=this.readVarint();return e%2==1?(e+1)/-2:e/2}readBoolean(){return!!this.readVarint()}readString(){let e=this.readVarint()+this.pos,t=this.pos;return this.pos=e,e-t>=12&&O?O.decode(this.buf.subarray(t,e)):z(this.buf,t,e)}readBytes(){let e=this.readVarint()+this.pos,t=this.buf.subarray(this.pos,e);return this.pos=e,t}readPackedVarint(e=[],t){let n=this.readPackedEnd();for(;this.pos<n;)e.push(this.readVarint(t));return e}readPackedSVarint(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readSVarint());return e}readPackedBoolean(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readBoolean());return e}readPackedFloat(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readFloat());return e}readPackedDouble(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readDouble());return e}readPackedFixed32(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readFixed32());return e}readPackedSFixed32(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readSFixed32());return e}readPackedFixed64(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readFixed64());return e}readPackedSFixed64(e=[]){let t=this.readPackedEnd();for(;this.pos<t;)e.push(this.readSFixed64());return e}readPackedEnd(){return this.type===2?this.readVarint()+this.pos:this.pos+1}skip(e){let t=e&7;if(t===0)for(;this.buf[this.pos++]>127;);else if(t===2)this.pos=this.readVarint()+this.pos;else if(t===5)this.pos+=4;else if(t===1)this.pos+=8;else throw Error(`Unimplemented type: ${t}`)}writeTag(e,t){this.writeVarint(e<<3|t)}realloc(e){let t=this.length||16;for(;t<this.pos+e;)t*=2;if(t!==this.length){let e=new Uint8Array(t);e.set(this.buf),this.buf=e,this.dataView=new DataView(e.buffer),this.length=t}}finish(){return this.length=this.pos,this.pos=0,this.buf.subarray(0,this.length)}writeFixed32(e){this.realloc(4),this.dataView.setInt32(this.pos,e,!0),this.pos+=4}writeSFixed32(e){this.realloc(4),this.dataView.setInt32(this.pos,e,!0),this.pos+=4}writeFixed64(e){this.realloc(8),this.dataView.setInt32(this.pos,e&-1,!0),this.dataView.setInt32(this.pos+4,Math.floor(e*D),!0),this.pos+=8}writeSFixed64(e){this.realloc(8),this.dataView.setInt32(this.pos,e&-1,!0),this.dataView.setInt32(this.pos+4,Math.floor(e*D),!0),this.pos+=8}writeVarint(e){if(e=+e||0,e>268435455||e<0){ie(e,this);return}this.realloc(4),this.buf[this.pos++]=e&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=(e>>>=7)&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=(e>>>=7)&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=e>>>7&127)))}writeSVarint(e){this.writeVarint(e<0?-e*2-1:e*2)}writeBoolean(e){this.writeVarint(+e)}writeString(e){e=String(e),this.realloc(e.length*4),this.pos++;let t=this.pos;this.pos=B(this.buf,e,this.pos);let n=this.pos-t;n>=128&&k(t,n,this),this.pos=t-1,this.writeVarint(n),this.pos+=n}writeFloat(e){this.realloc(4),this.dataView.setFloat32(this.pos,e,!0),this.pos+=4}writeDouble(e){this.realloc(8),this.dataView.setFloat64(this.pos,e,!0),this.pos+=8}writeBytes(e){let t=e.length;this.writeVarint(t),this.realloc(t);for(let n=0;n<t;n++)this.buf[this.pos++]=e[n]}writeRawMessage(e,t){this.pos++;let n=this.pos;e(t,this);let r=this.pos-n;r>=128&&k(n,r,this),this.pos=n-1,this.writeVarint(r),this.pos+=r}writeMessage(e,t,n){this.writeTag(e,2),this.writeRawMessage(t,n)}writePackedVarint(e,t){t.length&&this.writeMessage(e,A,t)}writePackedSVarint(e,t){t.length&&this.writeMessage(e,j,t)}writePackedBoolean(e,t){t.length&&this.writeMessage(e,P,t)}writePackedFloat(e,t){t.length&&this.writeMessage(e,M,t)}writePackedDouble(e,t){t.length&&this.writeMessage(e,N,t)}writePackedFixed32(e,t){t.length&&this.writeMessage(e,F,t)}writePackedSFixed32(e,t){t.length&&this.writeMessage(e,I,t)}writePackedFixed64(e,t){t.length&&this.writeMessage(e,L,t)}writePackedSFixed64(e,t){t.length&&this.writeMessage(e,R,t)}writeBytesField(e,t){this.writeTag(e,2),this.writeBytes(t)}writeFixed32Field(e,t){this.writeTag(e,5),this.writeFixed32(t)}writeSFixed32Field(e,t){this.writeTag(e,5),this.writeSFixed32(t)}writeFixed64Field(e,t){this.writeTag(e,1),this.writeFixed64(t)}writeSFixed64Field(e,t){this.writeTag(e,1),this.writeSFixed64(t)}writeVarintField(e,t){this.writeTag(e,0),this.writeVarint(t)}writeSVarintField(e,t){this.writeTag(e,0),this.writeSVarint(t)}writeStringField(e,t){this.writeTag(e,2),this.writeString(t)}writeFloatField(e,t){this.writeTag(e,5),this.writeFloat(t)}writeDoubleField(e,t){this.writeTag(e,1),this.writeDouble(t)}writeBooleanField(e,t){this.writeVarintField(e,+t)}};function ne(e,t,n){let r=n.buf,i,a;if(a=r[n.pos++],i=(a&112)>>4,a<128||(a=r[n.pos++],i|=(a&127)<<3,a<128)||(a=r[n.pos++],i|=(a&127)<<10,a<128)||(a=r[n.pos++],i|=(a&127)<<17,a<128)||(a=r[n.pos++],i|=(a&127)<<24,a<128)||(a=r[n.pos++],i|=(a&1)<<31,a<128))return re(e,i,t);throw Error(`Expected varint not more than 10 bytes`)}function re(e,t,n){return n?t*4294967296+(e>>>0):(t>>>0)*4294967296+(e>>>0)}function ie(e,t){let n,r;if(e>=0?(n=e%4294967296|0,r=e/4294967296|0):(n=~(-e%4294967296),r=~(-e/4294967296),n^4294967295?n=n+1|0:(n=0,r=r+1|0)),e>=0x10000000000000000||e<-0x10000000000000000)throw Error(`Given varint doesn't fit into 10 bytes`);t.realloc(10),ae(n,r,t),oe(r,t)}function ae(e,t,n){n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos]=e&127}function oe(e,t){let n=(e&7)<<4;t.buf[t.pos++]|=n|((e>>>=3)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127)))))}function k(e,t,n){let r=t<=16383?1:t<=2097151?2:t<=268435455?3:Math.floor(Math.log(t)/(Math.LN2*7));n.realloc(r);for(let t=n.pos-1;t>=e;t--)n.buf[t+r]=n.buf[t]}function A(e,t){for(let n=0;n<e.length;n++)t.writeVarint(e[n])}function j(e,t){for(let n=0;n<e.length;n++)t.writeSVarint(e[n])}function M(e,t){for(let n=0;n<e.length;n++)t.writeFloat(e[n])}function N(e,t){for(let n=0;n<e.length;n++)t.writeDouble(e[n])}function P(e,t){for(let n=0;n<e.length;n++)t.writeBoolean(e[n])}function F(e,t){for(let n=0;n<e.length;n++)t.writeFixed32(e[n])}function I(e,t){for(let n=0;n<e.length;n++)t.writeSFixed32(e[n])}function L(e,t){for(let n=0;n<e.length;n++)t.writeFixed64(e[n])}function R(e,t){for(let n=0;n<e.length;n++)t.writeSFixed64(e[n])}function z(e,t,n){let r=``,i=t;for(;i<n;){let t=e[i],a=null,o=t>239?4:t>223?3:t>191?2:1;if(i+o>n)break;let s,c,l;o===1?t<128&&(a=t):o===2?(s=e[i+1],(s&192)==128&&(a=(t&31)<<6|s&63,a<=127&&(a=null))):o===3?(s=e[i+1],c=e[i+2],(s&192)==128&&(c&192)==128&&(a=(t&15)<<12|(s&63)<<6|c&63,(a<=2047||a>=55296&&a<=57343)&&(a=null))):o===4&&(s=e[i+1],c=e[i+2],l=e[i+3],(s&192)==128&&(c&192)==128&&(l&192)==128&&(a=(t&15)<<18|(s&63)<<12|(c&63)<<6|l&63,(a<=65535||a>=1114112)&&(a=null))),a===null?(a=65533,o=1):a>65535&&(a-=65536,r+=String.fromCharCode(a>>>10&1023|55296),a=56320|a&1023),r+=String.fromCharCode(a),i+=o}return r}function B(e,t,n){for(let r=0,i,a;r<t.length;r++){if(i=t.charCodeAt(r),i>55295&&i<57344)if(a)if(i<56320){e[n++]=239,e[n++]=191,e[n++]=189,a=i;continue}else i=a-55296<<10|i-56320|65536,a=null;else{i>56319||r+1===t.length?(e[n++]=239,e[n++]=191,e[n++]=189):a=i;continue}else a&&(e[n++]=239,e[n++]=191,e[n++]=189,a=null);i<128?e[n++]=i:(i<2048?e[n++]=i>>6|192:(i<65536?e[n++]=i>>12|224:(e[n++]=i>>18|240,e[n++]=i>>12&63|128),e[n++]=i>>6&63|128),e[n++]=i&63|128)}return n}let V={car:{class:new Set([`motorway`,`motorway_link`,`motorway_junction`,`trunk`,`trunk_link`,`primary`,`primary_link`,`secondary`,`secondary_link`,`tertiary`,`tertiary_link`,`residential`,`living_street`,`service`,`unclassified`,`road`,`minor`]),exclude_subclass:new Set([`pedestrian`,`footway`,`steps`,`cycleway`,`bridleway`,`corridor`])},pedestrian:{class:new Set([`road`,`primary`,`primary_link`,`secondary`,`secondary_link`,`tertiary`,`tertiary_link`,`residential`,`living_street`,`service`,`track`,`pedestrian`,`path`,`cycleway`,`footway`,`bridleway`,`byway`,`steps`,`unclassified`,`minor`]),subclass:new Set([`pedestrian`,`footway`,`steps`,`path`,`corridor`,`platform`]),foot:new Set([`yes`,`designated`,`permissive`,`use_sidepath`])},bicycle:{class:new Set([`road`,`primary`,`primary_link`,`secondary`,`secondary_link`,`tertiary`,`tertiary_link`,`residential`,`living_street`,`service`,`track`,`unclassified`,`path`,`cycleway`,`footway`,`pedestrian`,`bridleway`]),subclass:new Set([`cycleway`,`path`]),exclude_classes:new Set([`motorway`,`motorway_link`,`motorway_junction`,`trunk`,`trunk_link`]),bicycle:new Set([`yes`,`designated`,`permissive`,`use_sidepath`,`optional_sidepath`])}},H={motorway:130,motorway_link:130,motorway_junction:130,trunk:110,trunk_link:110,primary:90,primary_link:90,secondary:90,secondary_link:90,tertiary:90,tertiary_link:90,residential:50,living_street:20,service:50,unclassified:50,road:50,minor:50,track:20,path:5,pedestrian:5},U={pedestrian:5,bicycle:15};function W(e,t){if(e===`car`)return H[t]??50;if(e===`bicycle`||e===`pedestrian`)return U[e];throw Error(`Unknown transport mode: ${e}`)}let G=6371e3;G*G;let K=Math.PI/180;function q(e,t,n,r){let i=(r-t)*K,a=(n-e)*K,o=t*K,s=r*K,c=Math.sin(i/2),l=Math.sin(a/2),u=Math.hypot(c,Math.cos(o)*Math.cos(s)*l);return 2*G*Math.asin(u)}new p(0,{name:`omt-router/graph`});let J=1e6,Y=.001;se();function se(){let e=Array.from(V.car.class),t=[1,1];for(let n=2;n<e.length;n++)t[n]=t[n-1]+t[n-2];let n={};for(let r=0;r<e.length;r++)n[e[r]]=t[r];return n}function X(e,t){return`${Math.round(e*J)},${Math.round(t*J)}`}function Z(e){return typeof e==`string`?e:e==null?``:String(e)}function ce(e){if(e===1||e===-1)return e;if(typeof e==`string`){let t=e.trim().toLowerCase();if(t===`1`||t===`yes`||t===`true`)return 1;if(t===`-1`||t===`reverse`)return-1}return 0}function le(e,t){return e===`pedestrian`?0:t}function ue(e,t){let n=Z(e.access);if(n===`no`||n===`private`)return!1;let r=V[t],i=Z(e.class),a=Z(e.subclass);if(t===`car`)return!(!r.class.has(i)||a&&r.exclude_subclass.has(a));if(t===`pedestrian`){let t=Z(e.foot);return t===`no`||t===`private`?!1:r.class.has(i)||r.subclass.has(a)||r.foot.has(t)}if(t===`bicycle`){if(r.exclude_classes.has(i))return!1;let t=Z(e.bicycle);return t===`no`||t===`private`?!1:r.class.has(i)||r.subclass.has(a)||r.bicycle.has(t)}return!1}function de(e,t,n,r,i){let a=new w(new te(e)).layers.transportation;if(!a)return[];let o=2**r,s=t/o*360-180,c=360/(o*a.extent),l=1-2*n/o,u=-2/(o*a.extent),d=180/Math.PI,f=[],p=e=>ue(e,i),m=(e,t,n)=>{let r=1e-9;return Math.abs(e)<r||Math.abs(e-n)<r||Math.abs(t)<r||Math.abs(t-n)<r};for(let e=0;e<a.length;e++){let t=a.feature(e);if(t.type!==2)continue;let n=t.properties,r=Z(n.class),o={...n,access:Z(n.access),class:r,subclass:Z(n.subclass),foot:Z(n.foot),bicycle:Z(n.bicycle)};if(!p(o))continue;let h=le(i,ce(n.oneway??0)),g=W(i,r),_=t.id==null?void 0:Math.floor(t.id/10);for(let e of t.loadGeometry())for(let t=0;t<e.length-1;t++){let n=fe(e[t].x,e[t].y,e[t+1].x,e[t+1].y,a.extent);if(!n)continue;let[r,i,p,v,y]=n,b=s+r*c,x=Math.atan(Math.sinh(Math.PI*(l+i*u)))*d,S=s+p*c,C=Math.atan(Math.sinh(Math.PI*(l+v*u)))*d;f.push(b,x,S,C,X(b,x),X(S,C),h,g,o,_,+!!m(r,i,a.extent),+!!m(p,v,a.extent),+!!y)}}return me(f)}function fe(e,t,n,r,i){let a=n-e,o=r-t,s=0,c=1;if(a===0){if(e<0||e>i)return null}else{let t=1/a,n=-e*t,r=(i-e)*t;if(s=Math.max(s,Math.min(n,r)),c=Math.min(c,Math.max(n,r)),s>c)return null}if(o===0){if(t<0||t>i)return null}else{let e=1/o,n=-t*e,r=(i-t)*e;if(s=Math.max(s,Math.min(n,r)),c=Math.min(c,Math.max(n,r)),s>c)return null}return[e+s*a,t+s*o,e+c*a,t+c*o,s!==0||c!==1]}function pe(e,t,n,r,i,a){let o=i-n,s=a-r,c=o*o+s*s;if(c===0)return null;let l=((e-n)*o+(t-r)*s)/c;if(l<=0||l>=1)return null;let u=n+l*o,d=r+l*s;return q(e,t,u,d)>2?null:{t:l,x:u,y:d}}function me(e){if(e.length===0)return e;let t=e.length/Q,n=new Map,r=Array.from({length:t},()=>new Map);for(let t=0;t<e.length;t+=Q){let r=t/Q,i=e[t],a=e[t+1],o=e[t+2],s=e[t+3],c=Math.min(i,o)-Y,l=Math.max(i,o)+Y,u=Math.min(a,s)-Y,d=Math.max(a,s)+Y,f=Math.floor(c/Y),p=Math.floor(l/Y),m=Math.floor(u/Y),h=Math.floor(d/Y);for(let e=f;e<=p;e++)for(let t=m;t<=h;t++){let i=`${e},${t}`,a=n.get(i)??[];a.push(r),n.has(i)||n.set(i,a)}}for(let t=0;t<e.length;t+=Q){let i=t/Q;for(let a=0;a<=2;a+=2){let o=e[t+a],s=e[t+a+1],c=X(o,s),l=Math.floor(o/Y),u=Math.floor(s/Y),d=new Set;for(let e=-1;e<=1;e++)for(let t=-1;t<=1;t++){let r=`${l+e},${u+t}`,a=n.get(r);if(a)for(let e of a)e!==i&&d.add(e)}for(let t of d){let n=t*Q,i=e[n+4],a=e[n+5];if(c===i||c===a)continue;let l=e[n],u=e[n+1],d=e[n+2],f=e[n+3],p=pe(o,s,l,u,d,f);if(!p)continue;let m=X(o,s);r[t].has(m)||r[t].set(m,p.t)}}}let i=[];for(let t=0;t<e.length;t+=Q){let n=t/Q,a=e[t],o=e[t+1],s=e[t+2],c=e[t+3],l=e[t+4],u=e[t+5],d=e[t+6],f=e[t+7],p=e[t+8],m=e[t+9],h=e[t+10],g=e[t+11],_=e[t+12],v=r[n];if(v.size===0){i.push(a,o,s,c,l,u,d,f,p,m,h,g,_);continue}let y=[...v.entries()].map(([e,t])=>({key:e,t})).sort((e,t)=>e.t-t.t),b=a,x=o,S=l,C=h;for(let{key:e,t}of y){let n=a+(s-a)*t,r=o+(c-o)*t,l=e;i.push(b,x,n,r,S,l,d,f,p,m,C,0,_),b=n,x=r,S=l,C=0}i.push(b,x,s,c,S,u,d,f,p,m,0,g,_)}return i}let Q=13,he=new p(0,{name:`omt-router/worker`}),ge=new h({maxAttempts:3,backoff:`exponential`,baseDelay:200,jitter:!0,retryIf:e=>e?.status>=500||e?.status===408});function $(e){try{return typeof self?.location?.origin==`string`?new URL(e,self.location.href).origin!==self.location.origin:!1}catch{return!1}}function _e(e,t){return t?.status?{code:`HTTP_${t.status}`,message:`Tile server responded with HTTP ${t.status}`,status:t.status}:$(e)&&t instanceof TypeError?{code:`MissingAllowOriginHeader`,message:`Cross-origin tile request failed. Ensure Access-Control-Allow-Origin includes this app origin or use a same-origin proxy.`}:{code:`NetworkError`,message:t?.message??`Failed to fetch tile`}}self.onmessage=async e=>{let t=e.data,n=t instanceof ArrayBuffer||ArrayBuffer.isView(t)?a(t):t;if(n.op===`parse-tile`){let{url:e,x:t,y:r,z:a,mode:o}=n,s=null,c=null;try{s=await ge.run(()=>fetch(e,{mode:`cors`}).then(e=>{if(!e.ok)throw Object.assign(Error(`HTTP ${e.status}`),{status:e.status});return e.arrayBuffer()}))}catch(t){c=_e(e,t),he.error(()=>`Failed to fetch tile ${e}: ${t?.message??t}`)}if(!s){self.postMessage({correlationId:n.correlationId,output:null,fetchFailed:!0,fetchError:c});return}let l=i(de(s,t,r,a,o)).buffer;self.postMessage({correlationId:n.correlationId,output:l},[l]);return}}})();", Be = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", ze], { type: "text/javascript;charset=utf-8" });
function Ve(e) {
	let t;
	try {
		if (t = Be && (self.URL || self.webkitURL).createObjectURL(Be), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(ze), { name: e?.name });
	}
}
//#endregion
//#region src/tiles/tilePool.js
var He = typeof navigator < "u" ? navigator.hardwareConcurrency ?? 4 : 4, Ue = Math.min(8, Math.max(1, He - 1)), We = Math.min(2, Ue), Ge = null, Ke = typeof Worker < "u";
function qe() {
	if (Ge) return Ge;
	if (!Ke) throw Error("Web Worker is not available in this environment.");
	return Ge = new Re(Ve, {
		size: We,
		maxSize: Ue,
		lazy: !0,
		autoScale: {
			intervalMs: 350,
			targetMs: 55,
			alpha: .32,
			cooldownMs: 1200,
			hysteresis: .2,
			stepUp: 2,
			stepDown: 1,
			backoffFactor: 1.5,
			backoffMaxMultiplier: 4,
			backoffResetMs: 6e3
		},
		idleTimeout: 3e4
	}), Ge;
}
function Je() {
	if (Ge) try {
		Ge.shutdown();
	} finally {
		Ge = null;
	}
}
//#endregion
//#region src/utils/routeValidation.js
var Ye = new Set([
	"car",
	"bicycle",
	"pedestrian"
]), Xe = new Set(["zxy", "tms"]);
function Ze(e) {
	return Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]) && e[0] >= -180 && e[0] <= 180 && e[1] >= -90 && e[1] <= 90;
}
function Qe(e, t) {
	if (!Ze(e)) throw Error(`Invalid ${t}: expected [lng, lat] with finite numbers, lng ∈ [-180, 180], lat ∈ [-90, 90]`);
}
function $e(e) {
	if (typeof e != "string") throw Error("Invalid transport mode: expected \"car\", \"bicycle\", or \"pedestrian\".");
	let t = e.toLowerCase();
	if (!Ye.has(t)) throw Error("Unknown transport mode: expected \"car\", \"bicycle\", or \"pedestrian\".");
	return t;
}
function et(e) {
	if (!Number.isFinite(e) || !Number.isInteger(e) || e < 0 || e > 22) throw Error("Invalid zoom: expected an integer between 0 and 22.");
}
function tt(e) {
	if (typeof e != "string") throw Error("Invalid tile schema: expected \"zxy\" or \"tms\".");
	let t = e.toLowerCase();
	if (!Xe.has(t)) throw Error("Invalid tile schema: expected \"zxy\" or \"tms\".");
	return t;
}
function nt(e) {
	if (typeof e != "string" || !e.trim()) throw Error("Invalid urlTemplate: expected a non-empty string.");
}
function rt(e) {
	if (e !== void 0 && (!Number.isFinite(e) || e < 0)) throw Error("Invalid maxAcceptableSnapDistanceM: expected a non-negative finite number.");
}
function it(e) {
	if (!Number.isFinite(e) || !Number.isInteger(e) || e < 1) throw Error("Invalid radius: expected a positive integer.");
	return Math.floor(e);
}
function at(e = {}) {
	let { intersectionPenaltySec: t = 0, turnPenaltySec: n = 0, turnAngleThresholdDeg: r = 25 } = e, i = [
		["intersectionPenaltySec", t],
		["turnPenaltySec", n],
		["turnAngleThresholdDeg", r]
	];
	for (let [e, t] of i) if (!Number.isFinite(t) || t < 0) throw Error(`Invalid penalties.${e}: expected a non-negative finite number`);
	return {
		intersectionPenaltySec: t,
		turnPenaltySec: n,
		turnAngleThresholdDeg: r
	};
}
//#endregion
//#region node_modules/kdbush/index.js
var ot = [
	Int8Array,
	Uint8Array,
	Uint8ClampedArray,
	Int16Array,
	Uint16Array,
	Int32Array,
	Uint32Array,
	Float32Array,
	Float64Array
], st = 1, ct = 8, lt = class e {
	static from(t) {
		if (!(t instanceof ArrayBuffer)) throw Error("Data must be an instance of ArrayBuffer.");
		let [n, r] = new Uint8Array(t, 0, 2);
		if (n !== 219) throw Error("Data does not appear to be in a KDBush format.");
		let i = r >> 4;
		if (i !== st) throw Error(`Got v${i} data when expected v${st}.`);
		let a = ot[r & 15];
		if (!a) throw Error("Unrecognized array type.");
		let [o] = new Uint16Array(t, 2, 1), [s] = new Uint32Array(t, 4, 1);
		return new e(s, o, a, t);
	}
	constructor(e, t = 64, n = Float64Array, r) {
		if (isNaN(e) || e < 0) throw Error(`Unpexpected numItems value: ${e}.`);
		this.numItems = +e, this.nodeSize = Math.min(Math.max(+t, 2), 65535), this.ArrayType = n, this.IndexArrayType = e < 65536 ? Uint16Array : Uint32Array;
		let i = ot.indexOf(this.ArrayType), a = e * 2 * this.ArrayType.BYTES_PER_ELEMENT, o = e * this.IndexArrayType.BYTES_PER_ELEMENT, s = (8 - o % 8) % 8;
		if (i < 0) throw Error(`Unexpected typed array class: ${n}.`);
		r && r instanceof ArrayBuffer ? (this.data = r, this.ids = new this.IndexArrayType(this.data, ct, e), this.coords = new this.ArrayType(this.data, ct + o + s, e * 2), this._pos = e * 2, this._finished = !0) : (this.data = new ArrayBuffer(ct + a + o + s), this.ids = new this.IndexArrayType(this.data, ct, e), this.coords = new this.ArrayType(this.data, ct + o + s, e * 2), this._pos = 0, this._finished = !1, new Uint8Array(this.data, 0, 2).set([219, (st << 4) + i]), new Uint16Array(this.data, 2, 1)[0] = t, new Uint32Array(this.data, 4, 1)[0] = e);
	}
	add(e, t) {
		let n = this._pos >> 1;
		return this.ids[n] = n, this.coords[this._pos++] = e, this.coords[this._pos++] = t, n;
	}
	finish() {
		let e = this._pos >> 1;
		if (e !== this.numItems) throw Error(`Added ${e} items when expected ${this.numItems}.`);
		return ut(this.ids, this.coords, this.nodeSize, 0, this.numItems - 1, 0), this._finished = !0, this;
	}
	range(e, t, n, r) {
		if (!this._finished) throw Error("Data not yet indexed - call index.finish().");
		let { ids: i, coords: a, nodeSize: o } = this, s = [
			0,
			i.length - 1,
			0
		], c = [];
		for (; s.length;) {
			let l = s.pop() || 0, u = s.pop() || 0, d = s.pop() || 0;
			if (u - d <= o) {
				for (let o = d; o <= u; o++) {
					let s = a[2 * o], l = a[2 * o + 1];
					s >= e && s <= n && l >= t && l <= r && c.push(i[o]);
				}
				continue;
			}
			let f = d + u >> 1, p = a[2 * f], m = a[2 * f + 1];
			p >= e && p <= n && m >= t && m <= r && c.push(i[f]), (l === 0 ? e <= p : t <= m) && (s.push(d), s.push(f - 1), s.push(1 - l)), (l === 0 ? n >= p : r >= m) && (s.push(f + 1), s.push(u), s.push(1 - l));
		}
		return c;
	}
	within(e, t, n) {
		if (!this._finished) throw Error("Data not yet indexed - call index.finish().");
		let { ids: r, coords: i, nodeSize: a } = this, o = [
			0,
			r.length - 1,
			0
		], s = [], c = n * n;
		for (; o.length;) {
			let l = o.pop() || 0, u = o.pop() || 0, d = o.pop() || 0;
			if (u - d <= a) {
				for (let n = d; n <= u; n++) mt(i[2 * n], i[2 * n + 1], e, t) <= c && s.push(r[n]);
				continue;
			}
			let f = d + u >> 1, p = i[2 * f], m = i[2 * f + 1];
			mt(p, m, e, t) <= c && s.push(r[f]), (l === 0 ? e - n <= p : t - n <= m) && (o.push(d), o.push(f - 1), o.push(1 - l)), (l === 0 ? e + n >= p : t + n >= m) && (o.push(f + 1), o.push(u), o.push(1 - l));
		}
		return s;
	}
};
function ut(e, t, n, r, i, a) {
	if (i - r <= n) return;
	let o = r + i >> 1;
	dt(e, t, o, r, i, a), ut(e, t, n, r, o - 1, 1 - a), ut(e, t, n, o + 1, i, 1 - a);
}
function dt(e, t, n, r, i, a) {
	for (; i > r;) {
		if (i - r > 600) {
			let o = i - r + 1, s = n - r + 1, c = Math.log(o), l = .5 * Math.exp(2 * c / 3), u = .5 * Math.sqrt(c * l * (o - l) / o) * (s - o / 2 < 0 ? -1 : 1);
			dt(e, t, n, Math.max(r, Math.floor(n - s * l / o + u)), Math.min(i, Math.floor(n + (o - s) * l / o + u)), a);
		}
		let o = t[2 * n + a], s = r, c = i;
		for (ft(e, t, r, n), t[2 * i + a] > o && ft(e, t, r, i); s < c;) {
			for (ft(e, t, s, c), s++, c--; t[2 * s + a] < o;) s++;
			for (; t[2 * c + a] > o;) c--;
		}
		t[2 * r + a] === o ? ft(e, t, r, c) : (c++, ft(e, t, c, i)), c <= n && (r = c + 1), n <= c && (i = c - 1);
	}
}
function ft(e, t, n, r) {
	pt(e, n, r), pt(t, 2 * n, 2 * r), pt(t, 2 * n + 1, 2 * r + 1);
}
function pt(e, t, n) {
	let r = e[t];
	e[t] = e[n], e[n] = r;
}
function mt(e, t, n, r) {
	let i = e - n, a = t - r;
	return i * i + a * a;
}
//#endregion
//#region src/graphs/snapper.js
var ht = Math.PI / 180, gt = 111320, _t = 1e-6, vt = 250;
function yt(e) {
	return Math.max(Math.cos(e * ht), _t);
}
function bt(e) {
	return Array.isArray(e) && e.length === 2 && Number.isFinite(e[0]) && Number.isFinite(e[1]);
}
function xt(e) {
	let { nodes: t } = e, n = t.size, r = new lt(n), i = Array(n), a = Array(n), o = 0;
	for (let [e, n] of t) r.add(n.coords[0], n.coords[1]), a[o] = e, i[o] = n.coords, o += 1;
	return r.finish(), {
		index: r,
		coordsArr: i,
		nodeIds: a
	};
}
function St(e, t, n) {
	e._spatialIndex || (e._spatialIndex = xt(e));
	let { index: r, nodeIds: i } = e._spatialIndex, [a, o] = t, s = n / (gt * yt(o));
	return r.within(a, o, s).map((e) => i[e]);
}
function Ct(e, t, n = 500) {
	if (!t || typeof t != "object" || !t.nodes || typeof t.nodes != "object" || typeof t.nodes.get != "function" || typeof t.nodes.has != "function" || typeof t.nodes.size != "number") throw Error("Invalid graph: expected object with nodes Map.");
	if (!bt(e)) return -1;
	t._spatialIndex || (t._spatialIndex = xt(t));
	let { index: r, coordsArr: i, nodeIds: a } = t._spatialIndex, [o, s] = e, c = n / (gt * yt(s)), l = r.within(o, s, c);
	if (l.length === 0) return -1;
	let u = -1, d = n;
	for (let t of l) {
		let n = a[t], r = F(e, i[t]);
		r < d && (d = r, u = n);
	}
	return u;
}
function wt(e) {
	if (e._incidentEdgeIndex) return e._incidentEdgeIndex;
	let t = e.nodes.size, n = Array.from({ length: t }, () => []);
	for (let r = 0; r < e.edges.length; r++) {
		let i = e.edges[r];
		i.source >= 0 && i.source < t && n[i.source].push(r), i.target >= 0 && i.target < t && n[i.target].push(r);
	}
	return e._incidentEdgeIndex = n, n;
}
function Tt(e) {
	if (e._edgeSpatialIndex) return e._edgeSpatialIndex;
	let t = new lt(e.edges.length), n = [], r = [], i = [], a = 0;
	for (let o = 0; o < e.edges.length; o += 1) {
		let s = e.edges[o], c = e.nodes.get(s.source), l = e.nodes.get(s.target);
		if (!c || !l) continue;
		let [u, d] = c.coords, [f, p] = l.coords, m = (u + f) / 2, h = (d + p) / 2, g = yt(h), _ = (f - u) * g / 2, v = (p - d) / 2, y = Math.hypot(_, v);
		n.push([m, h]), r.push(y), i.push(o), t.add(m, h), y > a && (a = y);
	}
	return t.finish(), e._edgeSpatialIndex = {
		index: t,
		edgeCenters: n,
		edgeRadiusDegs: r,
		edgeIndexByPointIndex: i,
		maxEdgeRadiusDeg: a
	}, e._edgeSpatialIndex;
}
function Et(e, t, n) {
	let { index: r, edgeCenters: i, edgeRadiusDegs: a, edgeIndexByPointIndex: o, maxEdgeRadiusDeg: s } = Tt(e), [c, l] = t, u = yt(l), d = n / (gt * u), f = d + s;
	return r.within(c, l, f).filter((e) => {
		let t = i[e];
		if (!t) return !1;
		let n = (t[0] - c) * u, r = t[1] - l;
		return Math.hypot(n, r) <= d + a[e];
	}).map((e) => o[e]);
}
function Dt(e, t, n, r) {
	let i = e[0] * r, a = e[1], o = t[0] * r, s = t[1], c = n[0] * r, l = n[1], u = c - o, d = l - s, f = u * u + d * d;
	if (f === 0) return null;
	let p = ((i - o) * u + (a - s) * d) / f;
	return {
		t: p,
		projected: [o + u * p, s + d * p]
	};
}
function Ot(e, t, n, r = 60) {
	let i = St(t, e, n + vt), a = wt(t), o = /* @__PURE__ */ new Set();
	for (let e of i) {
		let t = a[e];
		if (t) for (let e of t) o.add(e);
	}
	for (let r of Et(t, e, n + vt)) o.add(r);
	if (o.size === 0) return null;
	let s = yt(e[1]), c = null, l = (i) => {
		let a = t.edges[i];
		if (!a) return;
		let o = t.nodes.get(a.source)?.coords, l = t.nodes.get(a.target)?.coords;
		if (!o || !l || a.cost === -1 && a.reverseCost === -1) return;
		let u = Dt(e, o, l, s);
		if (!u) return;
		let { t: d, projected: f } = u, p = Math.max(0, Math.min(1, d)), m = p === d ? [f[0] / s, f[1]] : [(o[0] * s + (l[0] * s - o[0] * s) * p) / s, o[1] + (l[1] - o[1]) * p], h = F(e, m);
		h > n || h > r || (!c || h < c.distanceM) && (c = {
			edge: a,
			edgeIndex: i,
			projectedCoords: m,
			distanceM: h,
			source: a.source,
			target: a.target,
			t: p
		});
	};
	for (let e of o) l(e);
	if (o.size < t.edges.length) for (let e = 0; e < t.edges.length; e++) o.has(e) || l(e);
	return c;
}
function kt(e, t, n) {
	let r = {
		id: t,
		coords: n
	};
	return {
		size: e.size + 1,
		get(n) {
			return n === t ? r : e.get(n);
		},
		has(n) {
			return n === t || e.has(n);
		},
		keys() {
			return (function* () {
				for (let t of e.keys()) yield t;
				yield t;
			})();
		},
		values() {
			return (function* () {
				for (let t of e.values()) yield t;
				yield r;
			})();
		},
		entries() {
			return (function* () {
				for (let t of e.entries()) yield t;
				yield [t, r];
			})();
		},
		[Symbol.iterator]() {
			return this.entries();
		}
	};
}
function At(e, t, n) {
	let r = e.length + n.length - 1, i = Array(r), a = 0;
	for (let n = 0; n < t; n += 1) i[a++] = e[n];
	for (let e = 0; e < n.length; e += 1) i[a++] = n[e];
	for (let n = t + 1; n < e.length; n += 1) i[a++] = e[n];
	return i;
}
function jt(e) {
	let t = -1;
	for (let n of e.nodes.keys()) n > t && (t = n);
	return t + 1;
}
function Mt(e, t) {
	let n = jt(e), r = kt(e.nodes, n, t.projectedCoords), i = e.nodes.get(t.edge.source).coords, a = e.nodes.get(t.edge.target).coords, o = F(i, t.projectedCoords), s = F(t.projectedCoords, a), c = o / (t.edge.speed / 3.6), l = s / (t.edge.speed / 3.6), u = t.edge.properties, d = t.edge.fibonacciScore, f = Number.isFinite(t.edge.id) ? t.edge.id : e.edges.length, p = -(f * 2 + 1), m = -(f * 2 + 2), h = t.edge.cost === -1 ? -1 : o, g = t.edge.cost === -1 ? -1 : s, _ = t.edge.reverseCost === -1 ? -1 : o, v = t.edge.reverseCost === -1 ? -1 : s, y = [{
		id: p,
		source: t.edge.source,
		target: n,
		cost: h,
		reverseCost: _,
		length: o,
		speed: t.edge.speed,
		travelTime: c,
		properties: u,
		fibonacciScore: d
	}, {
		id: m,
		source: n,
		target: t.edge.target,
		cost: g,
		reverseCost: v,
		length: s,
		speed: t.edge.speed,
		travelTime: l,
		properties: u,
		fibonacciScore: d
	}], b = At(e.edges, t.edgeIndex, y), x = {
		...e,
		nodes: r,
		edges: b,
		nodeIndex: e.nodeIndex && new Map(e.nodeIndex),
		_lastAddedNodeId: n
	};
	return delete x._spatialIndex, delete x._incidentEdgeIndex, delete x._prepared, x;
}
function Nt(e, t, n, r = 60) {
	let i = {
		type: "none",
		nodeId: -1,
		nodeSnapDistanceM: Infinity,
		segmentSnap: null,
		segmentSnapDistanceM: Infinity,
		snapDistanceM: Infinity
	};
	if (!bt(e)) return i;
	let a = Ct(e, t, n);
	i.nodeId = a, a !== -1 && (i.nodeSnapDistanceM = F(e, t.nodes.get(a)?.coords ?? [NaN, NaN]));
	let o = Ot(e, t, n, r);
	return o ? (i.segmentSnap = o, i.segmentSnapDistanceM = o.distanceM, o.t === 0 || o.t === 1 ? (i.nodeId = o.t === 0 ? o.source : o.target, i.nodeSnapDistanceM = o.distanceM, i.type = "node", i.snapDistanceM = o.distanceM) : (i.type = "segment", i.snapDistanceM = i.segmentSnapDistanceM)) : i.nodeId !== -1 && (i.type = "node", i.snapDistanceM = i.nodeSnapDistanceM), i;
}
function Pt(e, t, n, r = 60) {
	let i = Array.isArray(n) && n.length > 0 ? n : [
		250,
		500,
		800
	], a = {
		type: "none",
		nodeId: -1,
		nodeSnapDistanceM: Infinity,
		segmentSnap: null,
		segmentSnapDistanceM: Infinity,
		snapDistanceM: Infinity
	};
	for (let n of i) if (a = Nt(e, t, n, r), a.type !== "none") return a;
	return a;
}
//#endregion
//#region src/tuning/model.js
var Ft = Object.freeze({
	generatedAt: "2026-05-08T06:56:47.004332+00:00",
	featureOrder: /* @__PURE__ */ "safeN.safeE.safeBeelineKm.avgOutDegree.logAvgOutDegree.edgesPerKm.nodesPerKm.sizeRatioEN.beelinePerNode.relativeDensity.logRelativeDensity.globalCoverage.logGlobalCoverage.emptyRatio.logEmptyRatio.sourceDegree.logSourceDegree.targetDegree.logTargetDegree.sourceCentrality.logSourceCentrality.targetCentrality.logTargetCentrality.sourceTargetDegreeRatio.logSourceTargetDegreeRatio.sourceTargetCentralityRatio.logSourceTargetCentralityRatio.graphDensity.logGraphDensity.avgBranchFactor.logAvgBranchFactor.logN.logE.logBeelineKm.logEdgesPerKm.logNodesPerKm.logEoverN.logBeelinePerNode.densityBySize.logDensityBySize.coverageDensity.logCoverageDensity.degreeProduct.logDegreeProduct.centralityProduct.logCentralityProduct.coverageEmptyContrast.logCoverageEmptyContrast.safeBeelineKmOverSizeRatioEN.globalCoverageTimesEmptyRatio.avgOutDegreeTimesLogRelativeDensity.beelinePerNodeTimesSourceTargetDegreeRatio.coverageEmptyContrastTimesLogAvgBranchFactor.densityBySizeTimesSourceCentrality".split("."),
	engines: [
		"bidirectional-astar",
		"adaptive-barrier",
		"delta-stepping",
		"ultra-dijkstra"
	],
	profiles: {
		sabOff: {
			modelType: "runtime-linear",
			runtimeFeatureOrder: /* @__PURE__ */ "logN.logE.logDensityBySize.sourceCentrality.avgOutDegreeTimesLogRelativeDensity.degreeProduct.logTargetDegree.nodesPerKm.logSourceTargetDegreeRatio.globalCoverageTimesEmptyRatio.targetDegree.sourceTargetDegreeRatio.logSourceTargetCentralityRatio.beelinePerNodeTimesSourceTargetDegreeRatio.safeBeelineKm.logSourceCentrality.logSourceDegree.sourceDegree.logDegreeProduct.targetCentrality.coverageDensity.logEdgesPerKm.logCentralityProduct.logTargetCentrality.logCoverageEmptyContrast.logNodesPerKm.safeN.logEmptyRatio.relativeDensity".split("."),
			runtimeScalerMean: [
				9.953534111145693,
				10.306107657870928,
				10.179418255010212,
				35.23255813953488,
				1.2000989786158425,
				2.0697674418604652,
				.8735181818435295,
				16146.147553997811,
				.6971508099449448,
				.06862466902882636,
				1.4651162790697674,
				1.0620155038759689,
				.5353518764732391,
				.12554421254928,
				4.48686046511628,
				1.782412313084339,
				.8440179184606578,
				1.372093023255814,
				1.0462601861070673,
				75.23255813953489,
				.2105043345120366,
				9.650933379716797,
				3.5454774889245333,
				3.319556356155643,
				.07036258708020175,
				9.298380539267672,
				32026.95348837209,
				.48884699873646015,
				1.374378107174757
			],
			runtimeScalerScale: [
				.7802797824053423,
				.8112631380226669,
				.9852697125276325,
				59.91421666493021,
				.3841215840043817,
				1.3188322677914255,
				.23347911503556903,
				15609.187220087797,
				.22657707937345387,
				.07486406893026765,
				.6231516747429889,
				.4941822465274178,
				1.0065020502025708,
				.10630825516298101,
				5.612798264023307,
				1.9242883930750867,
				.19598683756458085,
				.48336301606573323,
				.37122137966779756,
				63.66768272592054,
				.2538511405761554,
				.841276044629191,
				3.983688334644014,
				1.9720370078600902,
				.10256917352535876,
				.8564976115643828,
				43468.110955018936,
				.14544184764502804,
				.6394766982126728
			],
			scaler_mean: [
				32026.95348837209,
				47081.53488372093,
				4.48686046511628,
				1.4279653004235897,
				.8857757363486024,
				22674.918175575764,
				16146.147553997811,
				1.4279653004235897,
				.12236987517754519,
				1.374378107174757,
				.8348080412448576,
				.14748502713305092,
				.12727839311720254,
				.6468584102887971,
				.48884699873646015,
				1.372093023255814,
				.8440179184606578,
				1.4651162790697674,
				.8735181818435295,
				35.23255813953488,
				1.782412313084339,
				75.23255813953489,
				3.319556356155643,
				1.0620155038759689,
				.6971508099449448,
				4.77633694543673,
				.5353518764732391,
				1.374378107174757,
				.8348080412448576,
				1.4279653004235897,
				.8857757363486024,
				9.953534111145693,
				10.306107657870928,
				1.2760096553010236,
				9.650933379716797,
				9.298380539267672,
				.8857757363486024,
				.11248523631210577,
				45822.57256000054,
				10.179418255010212,
				.2105043345120366,
				.17084045709428813,
				2.0697674418604652,
				1.0462601861070673,
				3520.813953488372,
				3.5454774889245333,
				.07886035810422456,
				.07036258708020175,
				3.058559271420463,
				.06862466902882636,
				1.2000989786158425,
				.12554421254928,
				.07184969160134493,
				2238574.406852828
			],
			scaler_scale: [
				43468.110955018936,
				66693.40038210568,
				5.612798264023307,
				.12380696658276415,
				.05033888080840221,
				21755.739063333,
				15609.187220087797,
				.12380696658276415,
				.08721515164406074,
				.6394766982126728,
				.23604016843857162,
				.16964678135547157,
				.14131683033350545,
				.22153321676862622,
				.14544184764502804,
				.48336301606573323,
				.19598683756458085,
				.6231516747429889,
				.23347911503556903,
				59.91421666493021,
				1.9242883930750867,
				63.66768272592054,
				1.9720370078600902,
				.4941822465274178,
				.22657707937345387,
				21.945509344145304,
				1.0065020502025708,
				.6394766982126728,
				.23604016843857162,
				.12380696658276415,
				.05033888080840221,
				.7802797824053423,
				.8112631380226669,
				.8962387837738194,
				.841276044629191,
				.8564976115643828,
				.05033888080840221,
				.076530705146375,
				66209.67125938559,
				.9852697125276325,
				.2538511405761554,
				.19664190478049298,
				1.3188322677914255,
				.37122137966779756,
				7832.697923198901,
				3.983688334644014,
				.11977771922575586,
				.10256917352535876,
				3.7388637825236395,
				.07486406893026765,
				.3841215840043817,
				.10630825516298101,
				.11012210526134425,
				8348187.2730846405
			],
			classes: [
				"bidirectional-astar",
				"adaptive-barrier",
				"delta-stepping",
				"ultra-dijkstra"
			],
			fallbackEngine: "adaptive-barrier",
			minConfidence: .36,
			minMargin: .04,
			regressors: {
				"bidirectional-astar": {
					coefficients: [
						.1684660616620416,
						0,
						.032391574227357625,
						0,
						0,
						0,
						-.017624818125046255,
						0,
						0,
						-.15588884218125998,
						0,
						0,
						0,
						0,
						.047725131248075835,
						-.15618713665529707,
						-.15618713665528644,
						.28026389601568363,
						-.11559553379038798,
						-.1917800231662427,
						.055895631608454274,
						.14186651173796608,
						-.05947834723567894,
						.12431764886212064,
						.2081966634451041,
						0,
						.0679344676570621,
						0,
						0,
						0,
						0,
						.22200947173142932,
						.17622713892288358,
						0,
						-.040219149290666514,
						-.004178064579950128,
						0,
						0,
						0,
						.19917206596864545,
						.1254119513613888,
						0,
						.16837593658297936,
						-.12435750329862638,
						0,
						.06553162902435615,
						0,
						-.04658829234886771,
						0,
						-.08480120283697098,
						.19680186729463675,
						-.01536061765477211,
						0,
						0
					],
					intercept: 1.8891424845125149
				},
				"adaptive-barrier": {
					coefficients: [
						.032644917748469136,
						0,
						-.07298439917381098,
						0,
						0,
						0,
						-.052231463366428005,
						0,
						0,
						-.11424749802049329,
						0,
						0,
						0,
						0,
						.04704702705276934,
						-.016468490302968396,
						-.01646849030298061,
						-.036525829158913774,
						-.12318230709162031,
						-.02977942416600117,
						-.1225820943874817,
						.09660939312994982,
						.005208643393779445,
						-.0952138139667475,
						.0377708290650164,
						0,
						.05482193366998291,
						0,
						0,
						0,
						0,
						.25867747155526327,
						.300851338272686,
						0,
						.053598658225041174,
						.0033354481017503312,
						0,
						0,
						0,
						.125562930204136,
						.10571243964938123,
						0,
						.09758495149322041,
						-.0290188566466423,
						0,
						.029478917438227795,
						0,
						.12650570193466956,
						0,
						-.0942489682994541,
						.14742984466494521,
						-.02756477595533866,
						0,
						0
					],
					intercept: 1.8041389179526628
				},
				"delta-stepping": {
					coefficients: [
						.07633876429748082,
						0,
						-.10466755323739724,
						0,
						0,
						0,
						-.08083943578169091,
						0,
						0,
						-.02712564208012691,
						0,
						0,
						0,
						0,
						.13913064806821882,
						.0044116231388824055,
						.00441162313888682,
						.027976238510035965,
						-.02980947570028348,
						-.4156713353619224,
						.027848274172829073,
						-.002096124648665258,
						.07545634155749252,
						.008765945763254087,
						.0611748355168238,
						0,
						.0738593154100619,
						0,
						0,
						0,
						0,
						.26482847465994336,
						.1911997391896807,
						0,
						-.009581231312212186,
						.05074076475684758,
						0,
						0,
						0,
						.3023676699870633,
						.15659210393671325,
						0,
						-.03263248001488759,
						-.00671766493388961,
						0,
						.041676453575614794,
						0,
						-.00757952308692386,
						0,
						-.07944332241855762,
						.040540462655707966,
						-.06968017018511266,
						0,
						0
					],
					intercept: 2.239791239480427
				},
				"ultra-dijkstra": {
					coefficients: [
						.006019598201543182,
						0,
						-.1180600458840195,
						0,
						0,
						0,
						-.0745711754635445,
						0,
						0,
						.005546372081151986,
						0,
						0,
						0,
						0,
						-.03265895169725758,
						-.025615078832684327,
						-.025615078832688754,
						.002202925674888062,
						-.10494155074265968,
						-.041838000626448275,
						-.05037097506665974,
						.002768878081292754,
						.046958885893579695,
						-.0778817302451126,
						.04456230466097306,
						0,
						.03403425213603531,
						0,
						0,
						0,
						0,
						.2580133701950583,
						.21209209042942048,
						0,
						.03129232405473484,
						.06489516252266019,
						0,
						0,
						0,
						.21869088785752874,
						.0398505652087684,
						0,
						.0965581390388645,
						-.027842139633572988,
						0,
						-.016654790255373177,
						0,
						.13366867738685667,
						0,
						-.14893909279909187,
						-.049784706324219934,
						.1406670490390348,
						0,
						0
					],
					intercept: 1.832018974842811
				}
			},
			runtimeRegressors: {
				"bidirectional-astar": {
					coefficients: [
						.22200947173142932,
						.17622713892288358,
						.19917206596864545,
						-.1917800231662427,
						.19680186729463675,
						.16837593658297936,
						-.11559553379038798,
						-.017624818125046255,
						.2081966634451041,
						-.08480120283697098,
						.28026389601568363,
						.12431764886212064,
						.0679344676570621,
						-.01536061765477211,
						.032391574227357625,
						.055895631608454274,
						-.15618713665528644,
						-.15618713665529707,
						-.12435750329862638,
						.14186651173796608,
						.1254119513613888,
						-.040219149290666514,
						.06553162902435615,
						-.05947834723567894,
						-.04658829234886771,
						-.004178064579950128,
						.1684660616620416,
						.047725131248075835,
						-.15588884218125998
					],
					intercept: 1.8891424845125149
				},
				"adaptive-barrier": {
					coefficients: [
						.25867747155526327,
						.300851338272686,
						.125562930204136,
						-.02977942416600117,
						.14742984466494521,
						.09758495149322041,
						-.12318230709162031,
						-.052231463366428005,
						.0377708290650164,
						-.0942489682994541,
						-.036525829158913774,
						-.0952138139667475,
						.05482193366998291,
						-.02756477595533866,
						-.07298439917381098,
						-.1225820943874817,
						-.01646849030298061,
						-.016468490302968396,
						-.0290188566466423,
						.09660939312994982,
						.10571243964938123,
						.053598658225041174,
						.029478917438227795,
						.005208643393779445,
						.12650570193466956,
						.0033354481017503312,
						.032644917748469136,
						.04704702705276934,
						-.11424749802049329
					],
					intercept: 1.8041389179526628
				},
				"delta-stepping": {
					coefficients: [
						.26482847465994336,
						.1911997391896807,
						.3023676699870633,
						-.4156713353619224,
						.040540462655707966,
						-.03263248001488759,
						-.02980947570028348,
						-.08083943578169091,
						.0611748355168238,
						-.07944332241855762,
						.027976238510035965,
						.008765945763254087,
						.0738593154100619,
						-.06968017018511266,
						-.10466755323739724,
						.027848274172829073,
						.00441162313888682,
						.0044116231388824055,
						-.00671766493388961,
						-.002096124648665258,
						.15659210393671325,
						-.009581231312212186,
						.041676453575614794,
						.07545634155749252,
						-.00757952308692386,
						.05074076475684758,
						.07633876429748082,
						.13913064806821882,
						-.02712564208012691
					],
					intercept: 2.239791239480427
				},
				"ultra-dijkstra": {
					coefficients: [
						.2580133701950583,
						.21209209042942048,
						.21869088785752874,
						-.041838000626448275,
						-.049784706324219934,
						.0965581390388645,
						-.10494155074265968,
						-.0745711754635445,
						.04456230466097306,
						-.14893909279909187,
						.002202925674888062,
						-.0778817302451126,
						.03403425213603531,
						.1406670490390348,
						-.1180600458840195,
						-.05037097506665974,
						-.025615078832688754,
						-.025615078832684327,
						-.027842139633572988,
						.002768878081292754,
						.0398505652087684,
						.03129232405473484,
						-.016654790255373177,
						.046958885893579695,
						.13366867738685667,
						.06489516252266019,
						.006019598201543182,
						-.03265895169725758,
						.005546372081151986
					],
					intercept: 1.832018974842811
				}
			}
		},
		sabOn: {
			modelType: "runtime-linear",
			runtimeFeatureOrder: /* @__PURE__ */ "logN.logE.sourceCentrality.logDensityBySize.logCentralityProduct.safeBeelineKm.densityBySizeTimesSourceCentrality.safeBeelineKmOverSizeRatioEN.safeN.logBeelineKm.logTargetCentrality.safeE.sourceTargetDegreeRatio.densityBySize.beelinePerNodeTimesSourceTargetDegreeRatio.beelinePerNode.logEdgesPerKm.logNodesPerKm.edgesPerKm.coverageDensity.targetDegree.targetCentrality.sourceTargetCentralityRatio.logCoverageDensity.centralityProduct.degreeProduct.logBeelinePerNode.logSourceTargetCentralityRatio.logEmptyRatio.globalCoverageTimesEmptyRatio.logTargetDegree.logSourceDegree.emptyRatio.nodesPerKm.logRelativeDensity.logGraphDensity".split("."),
			runtimeScalerMean: [
				9.953534111145693,
				10.306107657870928,
				35.23255813953488,
				10.179418255010212,
				3.5454774889245333,
				4.48686046511628,
				2238574.406852828,
				3.058559271420463,
				32026.95348837209,
				1.2760096553010236,
				3.319556356155643,
				47081.53488372093,
				1.0620155038759689,
				45822.57256000054,
				.12554421254928,
				.12236987517754519,
				9.650933379716797,
				9.298380539267672,
				22674.918175575764,
				.2105043345120366,
				1.4651162790697674,
				75.23255813953489,
				4.77633694543673,
				.17084045709428813,
				3520.813953488372,
				2.0697674418604652,
				.11248523631210577,
				.5353518764732391,
				.48884699873646015,
				.06862466902882636,
				.8735181818435295,
				.8440179184606578,
				.6468584102887971,
				16146.147553997811,
				.8348080412448576,
				.8348080412448576
			],
			runtimeScalerScale: [
				.7802797824053423,
				.8112631380226669,
				59.91421666493021,
				.9852697125276325,
				3.983688334644014,
				5.612798264023307,
				8348187.2730846405,
				3.7388637825236395,
				43468.110955018936,
				.8962387837738194,
				1.9720370078600902,
				66693.40038210568,
				.4941822465274178,
				66209.67125938559,
				.10630825516298101,
				.08721515164406074,
				.841276044629191,
				.8564976115643828,
				21755.739063333,
				.2538511405761554,
				.6231516747429889,
				63.66768272592054,
				21.945509344145304,
				.19664190478049298,
				7832.697923198901,
				1.3188322677914255,
				.076530705146375,
				1.0065020502025708,
				.14544184764502804,
				.07486406893026765,
				.23347911503556903,
				.19598683756458085,
				.22153321676862622,
				15609.187220087797,
				.23604016843857162,
				.23604016843857162
			],
			scaler_mean: [
				32026.95348837209,
				47081.53488372093,
				4.48686046511628,
				1.4279653004235897,
				.8857757363486024,
				22674.918175575764,
				16146.147553997811,
				1.4279653004235897,
				.12236987517754519,
				1.374378107174757,
				.8348080412448576,
				.14748502713305092,
				.12727839311720254,
				.6468584102887971,
				.48884699873646015,
				1.372093023255814,
				.8440179184606578,
				1.4651162790697674,
				.8735181818435295,
				35.23255813953488,
				1.782412313084339,
				75.23255813953489,
				3.319556356155643,
				1.0620155038759689,
				.6971508099449448,
				4.77633694543673,
				.5353518764732391,
				1.374378107174757,
				.8348080412448576,
				1.4279653004235897,
				.8857757363486024,
				9.953534111145693,
				10.306107657870928,
				1.2760096553010236,
				9.650933379716797,
				9.298380539267672,
				.8857757363486024,
				.11248523631210577,
				45822.57256000054,
				10.179418255010212,
				.2105043345120366,
				.17084045709428813,
				2.0697674418604652,
				1.0462601861070673,
				3520.813953488372,
				3.5454774889245333,
				.07886035810422456,
				.07036258708020175,
				3.058559271420463,
				.06862466902882636,
				1.2000989786158425,
				.12554421254928,
				.07184969160134493,
				2238574.406852828
			],
			scaler_scale: [
				43468.110955018936,
				66693.40038210568,
				5.612798264023307,
				.12380696658276415,
				.05033888080840221,
				21755.739063333,
				15609.187220087797,
				.12380696658276415,
				.08721515164406074,
				.6394766982126728,
				.23604016843857162,
				.16964678135547157,
				.14131683033350545,
				.22153321676862622,
				.14544184764502804,
				.48336301606573323,
				.19598683756458085,
				.6231516747429889,
				.23347911503556903,
				59.91421666493021,
				1.9242883930750867,
				63.66768272592054,
				1.9720370078600902,
				.4941822465274178,
				.22657707937345387,
				21.945509344145304,
				1.0065020502025708,
				.6394766982126728,
				.23604016843857162,
				.12380696658276415,
				.05033888080840221,
				.7802797824053423,
				.8112631380226669,
				.8962387837738194,
				.841276044629191,
				.8564976115643828,
				.05033888080840221,
				.076530705146375,
				66209.67125938559,
				.9852697125276325,
				.2538511405761554,
				.19664190478049298,
				1.3188322677914255,
				.37122137966779756,
				7832.697923198901,
				3.983688334644014,
				.11977771922575586,
				.10256917352535876,
				3.7388637825236395,
				.07486406893026765,
				.3841215840043817,
				.10630825516298101,
				.11012210526134425,
				8348187.2730846405
			],
			classes: [
				"bidirectional-astar",
				"adaptive-barrier",
				"delta-stepping",
				"ultra-dijkstra"
			],
			fallbackEngine: "adaptive-barrier",
			minConfidence: .36,
			minMargin: .04,
			regressors: {
				"bidirectional-astar": {
					coefficients: [
						.04845016537541562,
						.10499035451522305,
						.011605208263651936,
						0,
						0,
						.16556801365070903,
						-.1051406091541065,
						0,
						-.07171212483422999,
						0,
						-.01049195875950214,
						0,
						0,
						-.02824227209442571,
						.004881114078220385,
						0,
						-.15922935364156365,
						.16328424139629383,
						-.08212175959548336,
						-.08045675772931728,
						0,
						.1183818545519568,
						-.1794496130984801,
						.1321265313741427,
						0,
						-.034500296928899124,
						.009062922207228787,
						0,
						-.010491958759502136,
						0,
						0,
						.1313458641774951,
						.3684295336865369,
						.07269795858931105,
						.05544841193889123,
						-.17485379285182817,
						0,
						-.029266085975624776,
						.025646750086230158,
						.0819187712751888,
						-.005722886359024794,
						-.03924156852345127,
						.02649249335775743,
						0,
						-.03427123860043879,
						.12879308852094434,
						0,
						0,
						-.037234292191745184,
						.04757502287716094,
						0,
						.03145177953885545,
						0,
						-.00023817661832604132
					],
					intercept: 1.952335006512615
				},
				"adaptive-barrier": {
					coefficients: [
						.0883384003525242,
						.09979588376732011,
						-.04690857232671382,
						0,
						0,
						.12158372034537382,
						.00920556298360845,
						0,
						-.06006881922016567,
						0,
						-.048772021243140666,
						0,
						0,
						.02509484421500592,
						-.011203261621711053,
						0,
						-.11668927409573746,
						.09080740027926082,
						.0018800675786380188,
						.04604927636722012,
						0,
						.07465775770864938,
						-.09538218637979677,
						.12525307864262777,
						0,
						.020646142922246313,
						-.013224344691400243,
						0,
						-.048772021243140666,
						0,
						0,
						.17703160067354823,
						.26543300648548185,
						.1422847663322637,
						-.030129546611271076,
						-.11973502892484279,
						0,
						-.015464969372282592,
						.06303261733873228,
						.12213710074154793,
						.03848679291507266,
						.0449933067900683,
						-.011792611097076649,
						0,
						-.045636548530713826,
						.09193051685284985,
						0,
						0,
						-.05116832355773985,
						-.0069285570020666,
						0,
						-.028824316362121145,
						0,
						-.1359753341087808
					],
					intercept: 1.8253442421464459
				},
				"delta-stepping": {
					coefficients: [
						.16871225416792962,
						.14937951592198545,
						-.3654748076217951,
						0,
						0,
						-.03097945269172864,
						-.012408912157337706,
						0,
						-.09378808183707839,
						0,
						-.02855814206468489,
						0,
						0,
						.02842395206249757,
						.11203801391658985,
						0,
						.034680712889110586,
						-.001197629305245047,
						.07146156211863265,
						-.407732238358142,
						0,
						.05973550590083194,
						-.04628352899924939,
						.10912655780971561,
						0,
						-.07495553920195822,
						.05181449800405871,
						0,
						-.028558142064684867,
						0,
						0,
						.34772842220249894,
						.2807321599052594,
						.06253187201370455,
						-.091736039633533,
						-.03923656289692361,
						0,
						-.08740316425215947,
						.17224101797921298,
						.35763809937727453,
						.1878890213674323,
						.15768744533966234,
						-.13369876643293732,
						0,
						-.1519713331741133,
						.13354465344742789,
						0,
						0,
						-.312716665486618,
						.10475514332499121,
						0,
						-.155807582881681,
						0,
						-.2845967003442695
					],
					intercept: 2.6707308399691922
				},
				"ultra-dijkstra": {
					coefficients: [
						.03009470144724754,
						.025749883920062052,
						-.06040782484712936,
						0,
						0,
						.10985214922956242,
						.016303474544398646,
						0,
						-.08715867244092802,
						0,
						-.07369595530440924,
						0,
						0,
						-.040540266584543336,
						-.006838706036656292,
						0,
						-.04314069909553735,
						.03960193714478251,
						.013967592110843231,
						-.144457228465764,
						0,
						.035003118948704864,
						-.06411858283145122,
						-.012342851326987914,
						0,
						-.08229583686448201,
						.10609601568310244,
						0,
						-.0736959553044092,
						0,
						0,
						.22954228183518088,
						.2555971784719244,
						.09425232545196363,
						-.05460065306677854,
						-.08661498746075129,
						0,
						-.05920427375923116,
						.015723956927354336,
						.14122507679715482,
						.018679386182335715,
						.01382770872343134,
						-.03323360952019476,
						0,
						-.01930307281421111,
						.07445185608978928,
						0,
						0,
						-.03870015900652404,
						.03641577806817927,
						0,
						.08704223402097289,
						0,
						.03903381737376651
					],
					intercept: 1.8421103468548197
				}
			},
			runtimeRegressors: {
				"bidirectional-astar": {
					coefficients: [
						.1313458641774951,
						.3684295336865369,
						-.08045675772931728,
						.0819187712751888,
						.12879308852094434,
						.011605208263651936,
						-.00023817661832604132,
						-.037234292191745184,
						.04845016537541562,
						.07269795858931105,
						-.1794496130984801,
						.10499035451522305,
						.1321265313741427,
						.025646750086230158,
						.03145177953885545,
						-.07171212483422999,
						.05544841193889123,
						-.17485379285182817,
						.16556801365070903,
						-.005722886359024794,
						.16328424139629383,
						.1183818545519568,
						-.034500296928899124,
						-.03924156852345127,
						-.03427123860043879,
						.02649249335775743,
						-.029266085975624776,
						.009062922207228787,
						.004881114078220385,
						.04757502287716094,
						-.08212175959548336,
						-.15922935364156365,
						-.02824227209442571,
						-.1051406091541065,
						-.01049195875950214,
						-.010491958759502136
					],
					intercept: 1.952335006512615
				},
				"adaptive-barrier": {
					coefficients: [
						.17703160067354823,
						.26543300648548185,
						.04604927636722012,
						.12213710074154793,
						.09193051685284985,
						-.04690857232671382,
						-.1359753341087808,
						-.05116832355773985,
						.0883384003525242,
						.1422847663322637,
						-.09538218637979677,
						.09979588376732011,
						.12525307864262777,
						.06303261733873228,
						-.028824316362121145,
						-.06006881922016567,
						-.030129546611271076,
						-.11973502892484279,
						.12158372034537382,
						.03848679291507266,
						.09080740027926082,
						.07465775770864938,
						.020646142922246313,
						.0449933067900683,
						-.045636548530713826,
						-.011792611097076649,
						-.015464969372282592,
						-.013224344691400243,
						-.011203261621711053,
						-.0069285570020666,
						.0018800675786380188,
						-.11668927409573746,
						.02509484421500592,
						.00920556298360845,
						-.048772021243140666,
						-.048772021243140666
					],
					intercept: 1.8253442421464459
				},
				"delta-stepping": {
					coefficients: [
						.34772842220249894,
						.2807321599052594,
						-.407732238358142,
						.35763809937727453,
						.13354465344742789,
						-.3654748076217951,
						-.2845967003442695,
						-.312716665486618,
						.16871225416792962,
						.06253187201370455,
						-.04628352899924939,
						.14937951592198545,
						.10912655780971561,
						.17224101797921298,
						-.155807582881681,
						-.09378808183707839,
						-.091736039633533,
						-.03923656289692361,
						-.03097945269172864,
						.1878890213674323,
						-.001197629305245047,
						.05973550590083194,
						-.07495553920195822,
						.15768744533966234,
						-.1519713331741133,
						-.13369876643293732,
						-.08740316425215947,
						.05181449800405871,
						.11203801391658985,
						.10475514332499121,
						.07146156211863265,
						.034680712889110586,
						.02842395206249757,
						-.012408912157337706,
						-.02855814206468489,
						-.028558142064684867
					],
					intercept: 2.6707308399691922
				},
				"ultra-dijkstra": {
					coefficients: [
						.22954228183518088,
						.2555971784719244,
						-.144457228465764,
						.14122507679715482,
						.07445185608978928,
						-.06040782484712936,
						.03903381737376651,
						-.03870015900652404,
						.03009470144724754,
						.09425232545196363,
						-.06411858283145122,
						.025749883920062052,
						-.012342851326987914,
						.015723956927354336,
						.08704223402097289,
						-.08715867244092802,
						-.05460065306677854,
						-.08661498746075129,
						.10985214922956242,
						.018679386182335715,
						.03960193714478251,
						.035003118948704864,
						-.08229583686448201,
						.01382770872343134,
						-.01930307281421111,
						-.03323360952019476,
						-.05920427375923116,
						.10609601568310244,
						-.006838706036656292,
						.03641577806817927,
						.013967592110843231,
						-.04314069909553735,
						-.040540266584543336,
						.016303474544398646,
						-.07369595530440924,
						-.0736959553044092
					],
					intercept: 1.8421103468548197
				}
			}
		}
	}
}), It = .36, Lt = .04, Rt = Object.freeze({
	"adaptive-barrier": Object.freeze({
		fallbackUseParallel: !1,
		policy: Object.freeze({
			minNodesForParallel: 13e3,
			minFrontierForParallel: 256
		})
	}),
	"delta-stepping": Object.freeze({
		fallbackUseParallel: !0,
		policy: Object.freeze({ minFrontierForParallel: 256 })
	})
}), zt = Object.freeze({ parallelization: Rt }), Bt = typeof window < "u" && typeof navigator < "u", Vt = Bt && typeof SharedArrayBuffer < "u" && typeof Worker < "u" && typeof crossOriginIsolated == "boolean" && crossOriginIsolated, I = (e, t) => Number.isFinite(e) ? e : t, Ht = (e) => Number.isFinite(e) && Math.abs(e) > 1e-12 ? e : 1, Ut = (() => {
	let e = Ft?.profiles ?? {}, t = Array.isArray(Ft?.featureOrder) ? Ft.featureOrder : [], n = {};
	for (let r in e) {
		let i = e[r];
		if (!i || typeof i != "object") continue;
		let a = Array.isArray(i.runtimeFeatureOrder) ? i.runtimeFeatureOrder : t, o = Array.isArray(i.runtimeScalerMean) ? i.runtimeScalerMean : Array.isArray(i.scaler_mean) ? i.scaler_mean : null, s = Array.isArray(i.runtimeScalerScale) ? i.runtimeScalerScale : Array.isArray(i.scaler_scale) ? i.scaler_scale : null, c = Array.isArray(i.classes) ? i.classes : null, l = i.runtimeRegressors || i.regressors, u = typeof i.fallbackEngine == "string" ? i.fallbackEngine : null, d = i.modelType === "runtime-linear", f = Array.isArray(o) && Array.isArray(s) && Array.isArray(c) && c.length > 0 && a.length === o.length && a.length === s.length, p = d && f && l && typeof l == "object" && c.every((e) => {
			let t = l[e];
			return t && Array.isArray(t.coefficients) && t.coefficients.length === a.length;
		});
		n[r] = Object.freeze({
			runtimeFeatureOrder: a,
			means: o,
			scales: s,
			classes: c,
			fallbackEngine: u,
			regressors: l,
			isRuntimeLinear: d,
			hasValidScaler: f,
			hasValidRegressors: p,
			minConfidence: Math.max(It, Number.isFinite(i.minConfidence) ? i.minConfidence : 0),
			minMargin: Math.max(Lt, Number.isFinite(i.minMargin) ? i.minMargin : 0)
		});
	}
	return Object.freeze(n);
})();
function Wt(e) {
	if (!Array.isArray(e) || e.length === 0) return [];
	let t = -Infinity, n = e.length;
	for (let r = 0; r < n; r += 1) {
		let n = e[r];
		n > t && (t = n);
	}
	let r = 0;
	for (let i = 0; i < n; i += 1) {
		let n = Math.exp(e[i] - t);
		e[i] = n, r += n;
	}
	if (!Number.isFinite(r) || r <= 0) {
		for (let t = 0; t < n; t += 1) e[t] = 0;
		return e;
	}
	for (let t = 0; t < n; t += 1) e[t] /= r;
	return e;
}
function Gt(e) {
	if (!Array.isArray(e) || e.length === 0) return {
		bestIndex: -1,
		secondIndex: -1
	};
	if (e.length === 1) return {
		bestIndex: 0,
		secondIndex: 0
	};
	let t = 0, n = 1;
	e[1] > e[0] && (t = 1, n = 0);
	for (let r = 2; r < e.length; r += 1) {
		let i = e[r];
		i > e[t] ? (n = t, t = r) : i > e[n] && (n = r);
	}
	return {
		bestIndex: t,
		secondIndex: n
	};
}
function Kt(e = {}) {
	let { safeN: t, safeE: n, safeBeelineKm: r, beelinePerNode: i, edgesPerKm: a, nodesPerKm: o, sizeRatioEN: s, globalCoverage: c, emptyRatio: l, avgBranchFactor: u, avgOutDegree: d, relativeDensity: f, graphDensity: p, sourceDegree: m, targetDegree: h, sourceCentrality: g, targetCentrality: _, sourceTargetDegreeRatio: v, sourceTargetCentralityRatio: y, nodeDegreeSource: b, nodeDegreeTarget: x, nodeCentralitySource: S, nodeCentralityTarget: C, nodeCount: w, edgeCount: T, averageNodeDegree: E, haversineDistance: D } = e, O = I(t, I(w, 1)), k = I(n, I(T, O)), A = I(r, Math.max(.25, I(D, 0) / 1e3)), ee = I(i, A / O), j = I(a, k / A), M = I(o, O / A), te = I(s, k / O), ne = I(c, 0), re = I(l, 1), ie = I(u, I(d, I(E, k / O))), ae = I(f, I(p, 0)), oe = I(m, I(b, 0)), N = I(h, I(x, 0)), P = I(g, I(S, 0)), se = I(_, I(C, 0)), ce = I(v, N > 0 ? oe / N : 0), le = I(y, se > 0 ? P / se : 0), ue = Math.log1p(O), de = Math.log1p(k), fe = Math.log1p(A), pe = Math.log1p(j), me = Math.log1p(M), F = Math.log1p(te), he = Math.log1p(ee), ge = Math.log1p(ie), _e = Math.log1p(re), ve = Math.log1p(ne), ye = Math.log1p(ae), be = ye, xe = ge, Se = ae * O, Ce = ne * ae, we = oe * N, Te = P * se, Ee = ne * Math.max(0, 1 - re);
	return {
		safeN: O,
		safeE: k,
		safeBeelineKm: A,
		beelinePerNode: ee,
		edgesPerKm: j,
		nodesPerKm: M,
		sizeRatioEN: te,
		globalCoverage: ne,
		emptyRatio: re,
		avgBranchFactor: ie,
		relativeDensity: ae,
		sourceDegree: oe,
		targetDegree: N,
		sourceCentrality: P,
		targetCentrality: se,
		sourceTargetDegreeRatio: ce,
		sourceTargetCentralityRatio: le,
		logN: ue,
		logE: de,
		logBeelineKm: fe,
		logEdgesPerKm: pe,
		logNodesPerKm: me,
		logEoverN: F,
		logBeelinePerNode: he,
		logAvgOutDegree: ge,
		logEmptyRatio: _e,
		logGlobalCoverage: ve,
		logRelativeDensity: ye,
		logGraphDensity: be,
		logAvgBranchFactor: xe,
		densityBySize: Se,
		coverageDensity: Ce,
		degreeProduct: we,
		centralityProduct: Te,
		coverageEmptyContrast: Ee,
		logDensityBySize: Math.log1p(Math.max(0, Se)),
		logCoverageDensity: Math.log1p(Math.max(0, Ce)),
		logDegreeProduct: Math.log1p(Math.max(0, we)),
		logCentralityProduct: Math.log1p(Math.max(0, Te)),
		logCoverageEmptyContrast: Math.log1p(Math.max(0, Ee)),
		logSourceDegree: Math.log1p(Math.max(0, oe)),
		logTargetDegree: Math.log1p(Math.max(0, N)),
		logSourceCentrality: Math.log1p(Math.max(0, P)),
		logTargetCentrality: Math.log1p(Math.max(0, se)),
		logSourceTargetDegreeRatio: Math.log1p(Math.max(0, ce)),
		logSourceTargetCentralityRatio: Math.log1p(Math.max(0, le)),
		avgOutDegree: ie,
		graphDensity: ae
	};
}
function qt(e, t, n) {
	if (!e || typeof e != "object" || !Array.isArray(n)) return null;
	let r = n.length, i = t.length, a = Array(r);
	for (let o = 0; o < r; o += 1) {
		let r = e[n[o]], s = Number.isFinite(r.intercept) ? r.intercept : 0, c = r.coefficients, l = s;
		for (let e = 0; e < i; e += 1) l += t[e] * c[e];
		a[o] = l;
	}
	for (let e = 0; e < r; e += 1) {
		let t = a[e];
		a[e] = Number.isFinite(t) ? -t : t;
	}
	return Wt(a);
}
function Jt(e, t) {
	if (!Bt) return null;
	let n = Ut[t];
	if (!n) return null;
	if (!n.isRuntimeLinear || !n.hasValidScaler) return n.fallbackEngine;
	let { runtimeFeatureOrder: r, means: i, scales: a, classes: o, fallbackEngine: s, regressors: c, minConfidence: l, minMargin: u, hasValidRegressors: d } = n;
	if (!d) return s;
	let f = Array(r.length), p = Kt(e || {}), m = r.length;
	for (let e = 0; e < m; e += 1) {
		let t = r[e];
		f[e] = (I(p[t], 0) - I(i[e], 0)) / Ht(a[e]);
	}
	let h = qt(c, f, o);
	if (!h || !h.length) return s;
	let { bestIndex: g, secondIndex: _ } = Gt(h), v = h[g], y = h[g] - h[_];
	if (v < l || y < u) return s;
	let b = o[g];
	return typeof b == "string" ? b : s;
}
function Yt(e, t) {
	return e === "adaptive-barrier" || e === "ultra-dijkstra" ? e : t;
}
function Xt() {
	return Vt;
}
function Zt(e) {
	return Yt(Jt(e, "sabOff"), "adaptive-barrier");
}
function Qt(e) {
	return Yt(Jt(e, "sabOn"), "ultra-dijkstra");
}
function $t(e, t) {
	if (!t) return !1;
	let n = zt.parallelization[e];
	return n ? !!n.fallbackUseParallel : !1;
}
function en(e, t) {
	return $t(e, t) ? zt.parallelization[e]?.policy ?? null : null;
}
function tn(e) {
	return Xt() ? Qt(e) : Zt(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/checkPrivateRedeclaration.js
function nn(e, t) {
	if (t.has(e)) throw TypeError("Cannot initialize the same private elements twice on an object");
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateMethodInitSpec.js
function rn(e, t) {
	nn(e, t), t.add(e);
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldInitSpec.js
function an(e, t, n) {
	nn(e, t), t.set(e, n);
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/assertClassBrand.js
function on(e, t, n) {
	if (typeof e == "function" ? e === t : e.has(t)) return arguments.length < 3 ? t : n;
	throw TypeError("Private element is not present on this object");
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldSet2.js
function sn(e, t, n) {
	return e.set(on(e, t), n), n;
}
//#endregion
//#region \0@oxc-project+runtime@0.129.0/helpers/classPrivateFieldGet2.js
function L(e, t) {
	return e.get(on(e, t));
}
//#endregion
//#region src/engines/BidirectionalAStar/index.js
var cn = 10, ln = 2e9, R = /* @__PURE__ */ new WeakMap(), z = /* @__PURE__ */ new WeakMap(), un = /* @__PURE__ */ new WeakMap(), dn = /* @__PURE__ */ new WeakMap(), fn = /* @__PURE__ */ new WeakSet(), pn = class {
	constructor(e = 256) {
		rn(this, fn), an(this, R, void 0), an(this, z, void 0), an(this, un, 0), an(this, dn, void 0), sn(dn, this, e), sn(R, this, new Float64Array(e)), sn(z, this, new Int32Array(e));
	}
	push(e, t) {
		var n, r;
		L(un, this) === L(dn, this) && on(fn, this, mn).call(this);
		let i = (sn(un, this, (n = L(un, this), r = n++, n)), r);
		for (L(R, this)[i] = e, L(z, this)[i] = t; i > 0;) {
			let e = i - 1 >> 1;
			if (L(R, this)[e] <= L(R, this)[i]) break;
			let t = L(R, this)[e];
			L(R, this)[e] = L(R, this)[i], L(R, this)[i] = t;
			let n = L(z, this)[e];
			L(z, this)[e] = L(z, this)[i], L(z, this)[i] = n, i = e;
		}
	}
	pop() {
		var e;
		let t = L(R, this)[0], n = L(z, this)[0], r = sn(un, this, (e = L(un, this), --e));
		if (r > 0) {
			L(R, this)[0] = L(R, this)[r], L(z, this)[0] = L(z, this)[r];
			let e = 0;
			for (;;) {
				let t = e, n = 2 * e + 1, r = 2 * e + 2;
				if (n < L(un, this) && L(R, this)[n] < L(R, this)[t] && (t = n), r < L(un, this) && L(R, this)[r] < L(R, this)[t] && (t = r), t === e) break;
				let i = L(R, this)[t];
				L(R, this)[t] = L(R, this)[e], L(R, this)[e] = i;
				let a = L(z, this)[t];
				L(z, this)[t] = L(z, this)[e], L(z, this)[e] = a, e = t;
			}
		}
		return {
			cost: t,
			node: n
		};
	}
	peek() {
		return L(un, this) > 0 ? L(R, this)[0] : Infinity;
	}
	get size() {
		return L(un, this);
	}
};
function mn() {
	sn(dn, this, L(dn, this) * 2);
	let e = new Float64Array(L(dn, this)), t = new Int32Array(L(dn, this));
	e.set(L(R, this)), t.set(L(z, this)), sn(R, this, e), sn(z, this, t);
}
function hn(e, t, n) {
	let { adjPtr: r, adjTo: i, adjCost: a, revAdjPtr: o, revAdjFrom: s, revAdjCost: c, N: l, coordsArr: u, costField: d } = n, f = u[e], p = u[t], m = d !== "travelTime", h = m ? (e) => Math.round(F(u[e], p) * cn) : () => 0, g = m ? (e) => Math.round(F(u[e], f) * cn) : () => 0, _ = new Int32Array(l).fill(ln), v = new Int32Array(l).fill(ln), y = new Int32Array(l).fill(-1), b = new Int32Array(l).fill(-1);
	_[e] = 0, v[t] = 0;
	let x = new pn(), S = new pn();
	x.push(h(e), e), S.push(g(t), t);
	let C = new Uint8Array(l), w = ln, T = -1;
	for (; x.size > 0 || S.size > 0;) {
		let e = x.size > 0 ? x.peek() : ln, t = S.size > 0 ? S.peek() : ln;
		if (e >= w && t >= w) break;
		if (e <= t) {
			let { cost: e, node: t } = x.pop();
			if (e - h(t) > _[t] || C[t] & 1) continue;
			if (C[t] |= 1, C[t] & 2) {
				let e = _[t] + v[t];
				e < w && (w = e, T = t);
			}
			for (let e = r[t], n = r[t + 1]; e < n; e++) {
				let n = i[e], r = _[t] + a[e];
				if (r < _[n] && (_[n] = r, y[n] = t, x.push(r + h(n), n), C[n] & 2)) {
					let e = r + v[n];
					e < w && (w = e, T = n);
				}
			}
		} else {
			let { cost: e, node: t } = S.pop();
			if (e - g(t) > v[t] || C[t] & 2) continue;
			if (C[t] |= 2, C[t] & 1) {
				let e = _[t] + v[t];
				e < w && (w = e, T = t);
			}
			for (let e = o[t], n = o[t + 1]; e < n; e++) {
				let n = s[e], r = v[t] + c[e];
				if (r < v[n] && (v[n] = r, b[n] = t, S.push(r + g(n), n), C[n] & 1)) {
					let e = _[n] + r;
					e < w && (w = e, T = n);
				}
			}
		}
	}
	if (T === -1 || w >= ln) return {
		path: [],
		cost: Infinity,
		found: !1,
		engine: "cpu"
	};
	let E = [T], D = T, O = l;
	for (; D !== e && O-- > 0;) {
		let e = y[D];
		if (e === -1) return {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "cpu"
		};
		E.push(e), D = e;
	}
	if (D !== e) return {
		path: [],
		cost: Infinity,
		found: !1,
		engine: "cpu"
	};
	E.reverse();
	let k = [];
	for (D = T, O = l; D !== t && O-- > 0;) {
		let e = b[D];
		if (e === -1) return {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "cpu"
		};
		k.push(e), D = e;
	}
	return D === t ? {
		path: [...E, ...k],
		cost: w / cn,
		found: !0,
		engine: "cpu"
	} : {
		path: [],
		cost: Infinity,
		found: !1,
		engine: "cpu"
	};
}
//#endregion
//#region src/engines/AdaptiveBarrierSSSP/sssp-worker.js?worker&inline
var gn = "(function(){self.onmessage=async({data:e})=>{let{sab:t,start:n,end:r,currQOff:i,nextQOff:a,distOff:o,headOff:s,nextOff:c,targetsOff:l,weightsOff:u,inQueueOff:d,stateOff:f,n:p,m}=e,h=new Int32Array(t,o,p),g=new Int32Array(t,s,p),_=new Int32Array(t,c,m),v=new Int32Array(t,l,m),y=new Int32Array(t,u,m),b=new Int32Array(t,i,p),x=new Int32Array(t,a,p),S=new Uint8Array(t,d,p),C=new Int32Array(t,f,8),w=1073741823,T=(e,t,n)=>{let r=Atomics.load(e,t);for(;n<r;){let i=Atomics.compareExchange(e,t,r,n);if(i===r)return!0;r=i}return!1};for(let e=n;e<r;e++){let t=b[e],n=Atomics.load(h,t),r=g[t];for(;r!==-1;){let e=v[r],t=n+y[r];if(T(h,e,t>w?w:t)&&Atomics.compareExchange(S,e,0,1)===0){let t=Atomics.add(C,0,1);x[t]=e}r=_[r]}}self.postMessage(`done`)}})();", _n = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", gn], { type: "text/javascript;charset=utf-8" });
function vn(e) {
	let t;
	try {
		if (t = _n && (self.URL || self.webkitURL).createObjectURL(_n), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(gn), { name: e?.name });
	}
}
//#endregion
//#region src/engines/AdaptiveBarrierSSSP/index.js
var yn = 8, bn = null, xn = 0;
function Sn(e) {
	return (!bn || xn !== e) && (bn?.terminate(), bn = new Re(vn, {
		size: 2,
		maxSize: e,
		lazy: !0,
		idleTimeout: 6e4,
		autoScale: {
			intervalMs: 750,
			targetMs: 140,
			alpha: .12,
			cooldownMs: 4e3,
			hysteresis: .3,
			stepUp: 1,
			stepDown: 1,
			backoffFactor: 2,
			backoffMaxMultiplier: 8,
			backoffResetMs: 16e3
		}
	}), xn = e), bn;
}
var Cn = class {
	constructor(e, t, { forceSerialRouting: n = !1, minNodesForParallel: r, minFrontierForParallel: i } = {}) {
		this.n = e, this.m = t, this.INF_DISTANCE = 1073741823, this.STATE_NEXT_SIZE = 0, this.hasParallelSupport = !n && typeof SharedArrayBuffer < "u", this.hasWorkerSupport = typeof Worker < "u";
		let a = this.hasParallelSupport ? SharedArrayBuffer : ArrayBuffer, o = (e) => e + 3 & -4, s = 0;
		this.distOff = s, s += e * 4, this.headOff = s, s += e * 4, this.nextOff = s, s += t * 4, this.targetsOff = s, s += t * 4, this.weightsOff = s, s += t * 4, this.q1Off = s, s += e * 4, this.q2Off = s, s += e * 4, this.inQueueOff = s, s += e, this.stateOff = o(s);
		let c = this.stateOff + 64;
		this.buffer = new a(c), this.dist = new Int32Array(this.buffer, this.distOff, e), this.head = new Int32Array(this.buffer, this.headOff, e), this.next = new Int32Array(this.buffer, this.nextOff, t), this.targets = new Int32Array(this.buffer, this.targetsOff, t), this.weights = new Int32Array(this.buffer, this.weightsOff, t), this.q1 = new Int32Array(this.buffer, this.q1Off, e), this.q2 = new Int32Array(this.buffer, this.q2Off, e), this.inQueue = new Uint8Array(this.buffer, this.inQueueOff, e), this.state = new Int32Array(this.buffer, this.stateOff, 8);
		let l = typeof navigator < "u" ? navigator.hardwareConcurrency ?? 4 : 4, u = Math.max(1, l - 1), d = Math.max(1, Math.min(yn, u));
		this.workerCount = d;
		let f = Math.max(1024, Math.min(5e3, Math.floor(e / 64)));
		this.MIN_NODES_FOR_INDUSTRIAL = Number.isFinite(r) ? Math.max(1, Math.floor(r)) : 5e4, this.MIN_FRONTIER_FOR_PARALLEL = Number.isFinite(i) ? Math.max(1, Math.floor(i)) : f, this.pool = this.hasParallelSupport && this.hasWorkerSupport && d > 1 && e >= this.MIN_NODES_FOR_INDUSTRIAL ? Sn(d) : null, this.head.fill(-1), this.edgeIdx = 0, this.lastParallelUsed = !1;
	}
	loadState(e) {
		return this.hasParallelSupport ? Atomics.load(this.state, e) : this.state[e];
	}
	storeState(e, t) {
		if (this.hasParallelSupport) {
			Atomics.store(this.state, e, t);
			return;
		}
		this.state[e] = t;
	}
	addState(e, t) {
		if (this.hasParallelSupport) return Atomics.add(this.state, e, t);
		let n = this.state[e];
		return this.state[e] += t, n;
	}
	loadGraph(e, t, n) {
		if (typeof e == "number") {
			let r = this.edgeIdx++;
			this.targets[r] = t, this.weights[r] = n, this.next[r] = this.head[e], this.head[e] = r;
			return;
		}
		for (let r = 0; r < e.length; r++) {
			let i = this.edgeIdx++;
			this.targets[i] = t[r], this.weights[i] = n[r], this.next[i] = this.head[e[r]], this.head[e[r]] = i;
		}
	}
	async solve(e, t = -1) {
		this.dist.fill(this.INF_DISTANCE), this.inQueue.fill(0), this.dist[e] = 0, this.storeState(this.STATE_NEXT_SIZE, 0), this.lastParallelUsed = !1;
		let n = this.q1Off, r = this.q2Off, i = 1;
		for (this.q1[0] = e, this.inQueue[e] = 1; i > 0;) {
			let e = new Int32Array(this.buffer, n, i);
			for (let t = 0; t < i; t++) this.inQueue[e[t]] = 0;
			if (this.storeState(this.STATE_NEXT_SIZE, 0), this.pool && i >= this.MIN_FRONTIER_FOR_PARALLEL) try {
				this.lastParallelUsed = !0, await this.dispatchParallel(i, n, r);
			} catch {
				this.dispatchSerial(i, n, r);
			}
			else this.dispatchSerial(i, n, r);
			i = this.loadState(this.STATE_NEXT_SIZE), [n, r] = [r, n];
		}
		return t === -1 ? this.dist : this.dist[t];
	}
	terminate() {
		this.pool = null;
	}
	dispatchSerial(e, t, n) {
		let r = new Int32Array(this.buffer, t, e), i = new Int32Array(this.buffer, n, this.n);
		for (let t = 0; t < e; t++) {
			let e = r[t], n = this.dist[e];
			for (let t = this.head[e]; t !== -1; t = this.next[t]) {
				let e = this.targets[t], r = n + this.weights[t], a = r > this.INF_DISTANCE ? this.INF_DISTANCE : r;
				if (a < this.dist[e] && (this.dist[e] = a, this.inQueue[e] === 0)) {
					this.inQueue[e] = 1;
					let t = this.addState(this.STATE_NEXT_SIZE, 1);
					i[t] = e;
				}
			}
		}
	}
	async dispatchParallel(e, t, n) {
		let r = this.workerCount, i = Math.ceil(e / r), a = [];
		for (let o = 0; o < r; o++) {
			let r = o * i;
			if (r >= e) break;
			a.push({
				sab: this.buffer,
				start: r,
				end: Math.min(r + i, e),
				currQOff: t,
				nextQOff: n,
				distOff: this.distOff,
				headOff: this.headOff,
				nextOff: this.nextOff,
				targetsOff: this.targetsOff,
				weightsOff: this.weightsOff,
				inQueueOff: this.inQueueOff,
				stateOff: this.stateOff,
				n: this.n,
				m: this.m
			});
		}
		return await this.pool.executeBatch(a);
	}
};
async function wn(e, t, n, { forceSerialRouting: r = !1, minNodesForParallel: i, minFrontierForParallel: a } = {}) {
	let { adjPtr: o, adjTo: s, adjCost: c, revAdjPtr: l, revAdjFrom: u, revAdjCost: d, N: f } = n, p = new Cn(f, c.length, {
		forceSerialRouting: r,
		minNodesForParallel: i,
		minFrontierForParallel: a
	});
	for (let e = 0; e < f; e++) for (let t = o[e]; t < o[e + 1]; t++) {
		let n = s[t], r = c[t];
		p.loadGraph(e, n, r);
	}
	try {
		await p.solve(e, t);
		let n = p.dist, r = n[t], i = p.lastParallelUsed;
		if (r >= p.INF_DISTANCE) return {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "adaptiveBarrier",
			parallelUsed: !1
		};
		let a = [t], o = t, s = f;
		for (; o !== e && s-- > 0;) {
			let e = !1;
			for (let t = l[o]; t < l[o + 1]; t++) {
				let r = u[t], i = d[t];
				if (n[r] + i === n[o]) {
					a.push(r), o = r, e = !0;
					break;
				}
			}
			if (!e) break;
		}
		return o === e ? (a.reverse(), {
			path: a,
			cost: r / 10,
			found: !0,
			engine: "adaptiveBarrier",
			parallelUsed: i
		}) : {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "adaptiveBarrier",
			parallelUsed: i
		};
	} finally {
		p.terminate();
	}
}
//#endregion
//#region src/engines/DeltaStepping/delta-worker.js?worker&inline
var Tn = "(function(){let e=1073741823;self.onmessage=async({data:t})=>{let{sab:n,start:r,end:i,currQOff:a,nextQOff:o,distOff:s,prevOff:c,headOff:l,nextOff:u,targetsOff:d,weightsOff:f,inQueueOff:p,stateOff:m,n:h,m:g,delta:_,mode:v}=t,y=new Int32Array(n,s,h),b=new Int32Array(n,c,h),x=new Int32Array(n,l,h),S=new Int32Array(n,u,g),C=new Int32Array(n,d,g),w=new Int32Array(n,f,g),T=new Int32Array(n,a,h),E=new Int32Array(n,o,h),D=new Uint8Array(n,p,h),O=new Int32Array(n,m,8),k=v===`light`,A=(e,t,n)=>{let r=Atomics.load(e,t);for(;n<r;){let i=Atomics.compareExchange(e,t,r,n);if(i===r)return!0;r=i}return!1};for(let t=r;t<i;t++){let n=T[t],r=Atomics.load(y,n);if(!(r>=e))for(let t=x[n];t!==-1;t=S[t]){let i=w[t];if(k?i>_:i<=_)continue;let a=C[t],o=r+i;if(A(y,a,o>e?e:o)&&(Atomics.store(b,a,n),Atomics.compareExchange(D,a,0,1)===0)){let e=Atomics.add(O,0,1);E[e]=a}}}self.postMessage(`done`)}})();", En = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", Tn], { type: "text/javascript;charset=utf-8" });
function Dn(e) {
	let t;
	try {
		if (t = En && (self.URL || self.webkitURL).createObjectURL(En), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Tn), { name: e?.name });
	}
}
//#endregion
//#region src/engines/DeltaStepping/index.js
var On = 1073741823, kn = 0, An = 8, jn = null, Mn = 0;
function Nn(e) {
	return (!jn || Mn !== e) && (jn?.terminate(), jn = new Re(Dn, {
		size: 2,
		maxSize: e,
		lazy: !0,
		idleTimeout: 6e4,
		autoScale: {
			intervalMs: 300,
			targetMs: 60,
			alpha: .22,
			cooldownMs: 1800,
			hysteresis: .25,
			stepUp: 2,
			stepDown: 1,
			backoffFactor: 2,
			backoffMaxMultiplier: 8,
			backoffResetMs: 1e4
		}
	}), Mn = e), jn;
}
var Pn = class {
	constructor(e, t, n = 200, { forceSerialRouting: r = !1, minFrontierForParallel: i } = {}) {
		this.n = e, this.m = t, this.delta = Math.max(1, n | 0), this.hasParallelSupport = !r && typeof SharedArrayBuffer < "u", this.hasWorkerSupport = typeof Worker < "u";
		let a = this.hasParallelSupport ? SharedArrayBuffer : ArrayBuffer, o = (e) => e + 3 & -4, s = 0;
		this.distOff = s, s += e * 4, this.prevOff = s, s += e * 4, this.headOff = s, s += e * 4, this.nextOff = s, s += t * 4, this.targetsOff = s, s += t * 4, this.weightsOff = s, s += t * 4, this.qCurrOff = s, s += e * 4, this.qNextOff = s, s += e * 4, this.inQueueOff = s, s += e, this.stateOff = o(s);
		let c = this.stateOff + 64;
		this.buffer = new a(c), this.dist = new Int32Array(this.buffer, this.distOff, e), this.prev = new Int32Array(this.buffer, this.prevOff, e), this.head = new Int32Array(this.buffer, this.headOff, e), this.next = new Int32Array(this.buffer, this.nextOff, t), this.targets = new Int32Array(this.buffer, this.targetsOff, t), this.weights = new Int32Array(this.buffer, this.weightsOff, t), this.qCurr = new Int32Array(this.buffer, this.qCurrOff, e), this.qNext = new Int32Array(this.buffer, this.qNextOff, e), this.inQueue = new Uint8Array(this.buffer, this.inQueueOff, e), this.state = new Int32Array(this.buffer, this.stateOff, 8);
		let l = typeof navigator < "u" ? navigator.hardwareConcurrency ?? 4 : 4, u = Math.max(1, l - 1), d = Math.max(1, Math.min(An, u));
		this.workerCount = d, this.MIN_FRONTIER_FOR_PARALLEL = Number.isFinite(i) ? Math.max(1, Math.floor(i)) : 128, this.pool = this.hasParallelSupport && this.hasWorkerSupport && d > 1 ? Nn(d) : null, this.buckets = /* @__PURE__ */ new Map(), this.head.fill(-1), this.edgeIdx = 0, this.lastParallelUsed = !1;
	}
	addEdge(e, t, n) {
		let r = this.edgeIdx++;
		this.targets[r] = t, this.weights[r] = n, this.next[r] = this.head[e], this.head[e] = r;
	}
	loadGraph(e, t, n) {
		if (typeof e == "number") {
			this.addEdge(e, t, n);
			return;
		}
		for (let r = 0; r < e.length; r++) this.addEdge(e[r], t[r], n[r]);
	}
	getState(e) {
		return this.hasParallelSupport ? Atomics.load(this.state, e) : this.state[e];
	}
	setState(e, t) {
		if (this.hasParallelSupport) {
			Atomics.store(this.state, e, t);
			return;
		}
		this.state[e] = t;
	}
	addState(e, t) {
		if (this.hasParallelSupport) return Atomics.add(this.state, e, t);
		let n = this.state[e];
		return this.state[e] += t, n;
	}
	takeSmallestBucketIndex() {
		let e = Infinity;
		for (let t of this.buckets.keys()) t < e && (e = t);
		return e;
	}
	async solve(e) {
		for (this.dist.fill(On), this.prev.fill(-1), this.inQueue.fill(0), this.buckets.clear(), this.dist[e] = 0, this.prev[e] = e, this.lastParallelUsed = !1, this.addToBucket(0, e); this.buckets.size > 0;) {
			let e = this.takeSmallestBucketIndex();
			if (!Number.isFinite(e)) break;
			let t = Array.from(this.buckets.get(e));
			this.buckets.delete(e);
			let n = [];
			for (; t.length > 0;) {
				n.push(...t);
				let r = await this.relaxFrontier(t, "light");
				t = [];
				for (let n = 0; n < r.length; n++) {
					let i = r[n], a = Math.floor(this.dist[i] / this.delta);
					a === e ? t.push(i) : this.addToBucket(a, i);
				}
			}
			let r = await this.relaxFrontier(n, "heavy");
			for (let e = 0; e < r.length; e++) {
				let t = r[e], n = Math.floor(this.dist[t] / this.delta);
				this.addToBucket(n, t);
			}
		}
		return this.dist;
	}
	async relaxFrontier(e, t) {
		if (e.length === 0) return [];
		if (this.setState(kn, 0), this.qCurr.set(e, 0), this.inQueue.fill(0), this.pool && e.length >= this.MIN_FRONTIER_FOR_PARALLEL) try {
			this.lastParallelUsed = !0, await this.dispatchParallel(e.length, t);
		} catch {
			this.dispatchSerial(e.length, t);
		}
		else this.dispatchSerial(e.length, t);
		let n = this.getState(kn), r = Array.from(this.qNext.subarray(0, n));
		for (let e = 0; e < r.length; e++) this.inQueue[r[e]] = 0;
		return r;
	}
	async dispatchParallel(e, t) {
		let n = this.workerCount, r = Math.ceil(e / n), i = [];
		for (let a = 0; a < n; a++) {
			let n = a * r;
			if (n >= e) break;
			i.push({
				sab: this.buffer,
				start: n,
				end: Math.min(n + r, e),
				currQOff: this.qCurrOff,
				nextQOff: this.qNextOff,
				distOff: this.distOff,
				prevOff: this.prevOff,
				headOff: this.headOff,
				nextOff: this.nextOff,
				targetsOff: this.targetsOff,
				weightsOff: this.weightsOff,
				inQueueOff: this.inQueueOff,
				stateOff: this.stateOff,
				n: this.n,
				m: this.m,
				delta: this.delta,
				mode: t
			});
		}
		await this.pool.executeBatch(i);
	}
	dispatchSerial(e, t) {
		let n = t === "light";
		for (let t = 0; t < e; t++) {
			let e = this.qCurr[t], r = this.dist[e];
			if (!(r >= On)) for (let t = this.head[e]; t !== -1; t = this.next[t]) {
				let i = this.weights[t];
				if (n ? i > this.delta : i <= this.delta) continue;
				let a = this.targets[t], o = r + i, s = o > On ? On : o;
				if (s < this.dist[a] && (this.dist[a] = s, this.prev[a] = e, this.inQueue[a] === 0)) {
					this.inQueue[a] = 1;
					let e = this.addState(kn, 1);
					this.qNext[e] = a;
				}
			}
		}
	}
	addToBucket(e, t) {
		Number.isFinite(e) && (this.buckets.has(e) || this.buckets.set(e, /* @__PURE__ */ new Set()), this.buckets.get(e).add(t));
	}
	terminate() {
		this.pool = null;
	}
};
async function Fn(e, t, n, { forceSerialRouting: r = !1, minFrontierForParallel: i } = {}) {
	let { adjPtr: a, adjTo: o, adjCost: s, N: c } = n, l = n.costField === "travelTime" ? 300 : 200, u = new Pn(c, s.length, l, {
		forceSerialRouting: r,
		minFrontierForParallel: i
	});
	for (let e = 0; e < c; e++) for (let t = a[e]; t < a[e + 1]; t++) u.addEdge(e, o[t], s[t]);
	try {
		await u.solve(e);
		let n = u.dist[t], r = u.lastParallelUsed;
		if (n >= On) return {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "deltaStepping",
			parallelUsed: r
		};
		let i = [t], a = t, o = c;
		for (; a !== e && o-- > 0;) {
			let e = u.prev[a];
			if (e === -1) break;
			i.push(e), a = e;
		}
		return a === e ? (i.reverse(), {
			path: i,
			cost: n / 10,
			found: !0,
			engine: "deltaStepping",
			parallelUsed: r
		}) : {
			path: [],
			cost: Infinity,
			found: !1,
			engine: "deltaStepping",
			parallelUsed: r
		};
	} finally {
		u.terminate();
	}
}
//#endregion
//#region src/engines/UltraDijkstra/heap.js
var In = class {
	constructor(e) {
		this.pos = new Int32Array(e).fill(-1), this.heap = new Int32Array(e), this.keys = new Float64Array(e), this.size = 0;
	}
	isEmpty() {
		return this.size === 0;
	}
	pushOrReduce(e, t) {
		let n = this.pos[e];
		if (n === -1) {
			let n = this.size++;
			this.heap[n] = e, this.pos[e] = n, this.keys[e] = t, this._bubbleUp(n);
		} else t < this.keys[e] && (this.keys[e] = t, this._bubbleUp(n));
	}
	pop() {
		if (this.size === 0) return -1;
		let e = this.heap[0];
		if (this.pos[e] = -1, this.size--, this.size > 0) {
			let e = this.heap[this.size];
			this.heap[0] = e, this.pos[e] = 0, this._bubbleDown(0);
		}
		return e;
	}
	_bubbleUp(e) {
		let t = this.heap, n = this.pos, r = this.keys, i = t[e], a = r[i];
		for (; e > 0;) {
			let i = e - 1 >> 2, o = t[i];
			if (a < r[o]) t[e] = o, n[o] = e, e = i;
			else break;
		}
		t[e] = i, n[i] = e;
	}
	_bubbleDown(e) {
		let t = this.heap, n = this.pos, r = this.keys, i = this.size, a = t[e], o = r[a];
		for (;;) {
			let a = (e << 2) + 1;
			if (a >= i) break;
			let s = a, c = r[t[a]], l = a + 1;
			if (l < i) {
				let e = r[t[l]];
				e < c && (c = e, s = l);
			}
			let u = a + 2;
			if (u < i) {
				let e = r[t[u]];
				e < c && (c = e, s = u);
			}
			let d = a + 3;
			if (d < i) {
				let e = r[t[d]];
				e < c && (c = e, s = d);
			}
			if (c < o) {
				let r = t[s];
				t[e] = r, n[r] = e, e = s;
			} else break;
		}
		t[e] = a, n[a] = e;
	}
}, Ln = class {
	constructor(e, t) {
		this.n = e, this.head = new Int32Array(e).fill(-1), this.next = new Int32Array(t), this.to = new Int32Array(t), this.weight = new Float64Array(t), this.edgeCount = 0, this.dists = new Float64Array(e).fill(Infinity), this.prev = new Int32Array(e).fill(-1), this.heap = new In(e);
	}
	addEdge(e, t, n) {
		let r = this.edgeCount++;
		this.to[r] = t, this.weight[r] = n, this.next[r] = this.head[e], this.head[e] = r;
	}
	solve(e, t = -1) {
		let n = this.dists, r = this.head, i = this.next, a = this.to, o = this.weight, s = this.heap, c = this.prev;
		for (n.fill(Infinity), c.fill(-1), n[e] = 0, c[e] = e, s.pushOrReduce(e, 0); !s.isEmpty();) {
			let e = s.pop() | 0, l = +n[e];
			if (e === t) return l;
			for (let t = r[e] | 0; t !== -1; t = i[t] | 0) {
				let r = a[t] | 0, i = l + o[t];
				i < n[r] && (n[r] = i, c[r] = e, s.pushOrReduce(r, i));
			}
		}
		return t === -1 ? n : n[t];
	}
};
async function Rn(e, t, n) {
	let { adjPtr: r, adjTo: i, adjCost: a, N: o } = n, s = new Ln(o, a.length);
	for (let e = 0; e < o; e++) for (let t = r[e]; t < r[e + 1]; t++) {
		let n = i[t], r = a[t] / 10;
		s.addEdge(e, n, r);
	}
	s.solve(e);
	let c = s.dists, l = s.prev;
	if (c[t] === Infinity) return {
		path: [],
		cost: Infinity,
		found: !1,
		engine: "ultraDijkstra"
	};
	let u = [t], d = t, f = o;
	for (; d !== e && f-- > 0;) {
		let e = l[d];
		if (e === -1) break;
		u.push(e), d = e;
	}
	return d === e ? (u.reverse(), {
		path: u,
		cost: c[t],
		found: !0,
		engine: "ultraDijkstra"
	}) : {
		path: [],
		cost: Infinity,
		found: !1,
		engine: "ultraDijkstra"
	};
}
//#endregion
//#region src/engines/engineMainWorker.js?worker&inline
var zn = "(function(){let e=6371e3;e*e;let t=Math.PI/180;function n([e,t],[n,i]){return r(e,t,n,i)}function r(n,r,i,a){let o=(a-r)*t,s=(i-n)*t,c=r*t,l=a*t,u=Math.sin(o/2),d=Math.sin(s/2),f=Math.hypot(u,Math.cos(c)*Math.cos(l)*d);return 2*e*Math.asin(f)}function i(e,t){if(t.has(e))throw TypeError(`Cannot initialize the same private elements twice on an object`)}function a(e,t){i(e,t),t.add(e)}function o(e,t,n){i(e,t),t.set(e,n)}function s(e,t,n){if(typeof e==`function`?e===t:e.has(t))return arguments.length<3?t:n;throw TypeError(`Private element is not present on this object`)}function c(e,t,n){return e.set(s(e,t),n),n}function l(e,t){return e.get(s(e,t))}let u=2e9;var d=new WeakMap,f=new WeakMap,p=new WeakMap,m=new WeakMap,h=new WeakSet,g=class{constructor(e=256){a(this,h),o(this,d,void 0),o(this,f,void 0),o(this,p,0),o(this,m,void 0),c(m,this,e),c(d,this,new Float64Array(e)),c(f,this,new Int32Array(e))}push(e,t){var n,r;l(p,this)===l(m,this)&&s(h,this,_).call(this);let i=(c(p,this,(n=l(p,this),r=n++,n)),r);for(l(d,this)[i]=e,l(f,this)[i]=t;i>0;){let e=i-1>>1;if(l(d,this)[e]<=l(d,this)[i])break;let t=l(d,this)[e];l(d,this)[e]=l(d,this)[i],l(d,this)[i]=t;let n=l(f,this)[e];l(f,this)[e]=l(f,this)[i],l(f,this)[i]=n,i=e}}pop(){var e;let t=l(d,this)[0],n=l(f,this)[0],r=c(p,this,(e=l(p,this),--e));if(r>0){l(d,this)[0]=l(d,this)[r],l(f,this)[0]=l(f,this)[r];let e=0;for(;;){let t=e,n=2*e+1,r=2*e+2;if(n<l(p,this)&&l(d,this)[n]<l(d,this)[t]&&(t=n),r<l(p,this)&&l(d,this)[r]<l(d,this)[t]&&(t=r),t===e)break;let i=l(d,this)[t];l(d,this)[t]=l(d,this)[e],l(d,this)[e]=i;let a=l(f,this)[t];l(f,this)[t]=l(f,this)[e],l(f,this)[e]=a,e=t}}return{cost:t,node:n}}peek(){return l(p,this)>0?l(d,this)[0]:1/0}get size(){return l(p,this)}};function _(){c(m,this,l(m,this)*2);let e=new Float64Array(l(m,this)),t=new Int32Array(l(m,this));e.set(l(d,this)),t.set(l(f,this)),c(d,this,e),c(f,this,t)}function v(e,t,r){let{adjPtr:i,adjTo:a,adjCost:o,revAdjPtr:s,revAdjFrom:c,revAdjCost:l,N:d,coordsArr:f,costField:p}=r,m=f[e],h=f[t],_=p!==`travelTime`,v=_?e=>Math.round(n(f[e],h)*10):()=>0,y=_?e=>Math.round(n(f[e],m)*10):()=>0,b=new Int32Array(d).fill(u),x=new Int32Array(d).fill(u),S=new Int32Array(d).fill(-1),C=new Int32Array(d).fill(-1);b[e]=0,x[t]=0;let w=new g,T=new g;w.push(v(e),e),T.push(y(t),t);let E=new Uint8Array(d),D=u,O=-1;for(;w.size>0||T.size>0;){let e=w.size>0?w.peek():u,t=T.size>0?T.peek():u;if(e>=D&&t>=D)break;if(e<=t){let{cost:e,node:t}=w.pop();if(e-v(t)>b[t]||E[t]&1)continue;if(E[t]|=1,E[t]&2){let e=b[t]+x[t];e<D&&(D=e,O=t)}for(let e=i[t],n=i[t+1];e<n;e++){let n=a[e],r=b[t]+o[e];if(r<b[n]&&(b[n]=r,S[n]=t,w.push(r+v(n),n),E[n]&2)){let e=r+x[n];e<D&&(D=e,O=n)}}}else{let{cost:e,node:t}=T.pop();if(e-y(t)>x[t]||E[t]&2)continue;if(E[t]|=2,E[t]&1){let e=b[t]+x[t];e<D&&(D=e,O=t)}for(let e=s[t],n=s[t+1];e<n;e++){let n=c[e],r=x[t]+l[e];if(r<x[n]&&(x[n]=r,C[n]=t,T.push(r+y(n),n),E[n]&1)){let e=b[n]+r;e<D&&(D=e,O=n)}}}}if(O===-1||D>=u)return{path:[],cost:1/0,found:!1,engine:`cpu`};let k=[O],A=O,j=d;for(;A!==e&&j-- >0;){let e=S[A];if(e===-1)return{path:[],cost:1/0,found:!1,engine:`cpu`};k.push(e),A=e}if(A!==e)return{path:[],cost:1/0,found:!1,engine:`cpu`};k.reverse();let M=[];for(A=O,j=d;A!==t&&j-- >0;){let e=C[A];if(e===-1)return{path:[],cost:1/0,found:!1,engine:`cpu`};M.push(e),A=e}return A===t?{path:[...k,...M],cost:D/10,found:!0,engine:`cpu`}:{path:[],cost:1/0,found:!1,engine:`cpu`}}let y,b;function x(){return y===void 0?typeof TextEncoder<`u`?(y=new TextEncoder,y):typeof Buffer<`u`&&typeof Buffer.from==`function`?(y={encode:e=>new Uint8Array(Buffer.from(e))},y):(y=!1,null):y===!1?null:y}function S(){return b===void 0?typeof TextDecoder<`u`?(b=new TextDecoder,b):typeof Buffer<`u`&&typeof Buffer.from==`function`?(b={decode:e=>Buffer.from(e).toString(`utf8`)},b):(b=!1,null):b===!1?null:b}let C=e=>{if(e instanceof Uint8Array)return e;if(ArrayBuffer.isView(e))return new Uint8Array(e.buffer,e.byteOffset,e.byteLength);if(e instanceof ArrayBuffer)return new Uint8Array(e);let t=JSON.stringify(e),n=x();if(typeof n?.encode==`function`)return n.encode(t);throw Error(`No TextEncoder or Buffer available to encode object`)},w=e=>{let t;if(e instanceof Uint8Array)t=e;else if(ArrayBuffer.isView(e))t=new Uint8Array(e.buffer,e.byteOffset,e.byteLength);else if(e instanceof ArrayBuffer)t=new Uint8Array(e);else if(typeof Buffer<`u`&&typeof Buffer.isBuffer==`function`&&Buffer.isBuffer(e))t=new Uint8Array(e);else throw TypeError(`Unsupported input to u82o, expected ArrayBuffer/TypedArray/Buffer`);let n=S();if(typeof n?.decode==`function`)return JSON.parse(n.decode(t));if(typeof TextDecoder<`u`)return JSON.parse(new TextDecoder().decode(t));throw Error(`No TextDecoder or Buffer available to decode object`)},T=null;if(typeof process<`u`&&process?.hrtime&&typeof process.hrtime.bigint==`function`)try{let e=Number(process.hrtime.bigint()/1000000n);T=Date.now()-e}catch{T=null}let E=()=>{let e=Date.now();if(typeof performance<`u`&&typeof performance?.now==`function`&&typeof performance?.timeOrigin==`number`)try{let t=performance.timeOrigin+performance.now();return Math.abs(t-e)<1e3?t:e}catch{}if(T!=null)try{let t=Number(process.hrtime.bigint()/1000000n)+T;return Math.abs(t-e)<1e3?t:e}catch{return e}return e};var D=class{constructor(e=16){let t=Math.max(2,Number(e)||16);for(this._capacity=1;this._capacity<t;)this._capacity<<=1;this._mask=this._capacity-1,this._buffer=Array(this._capacity),this._head=0,this._tail=0,this._size=0}push(e){return this._size===this._capacity&&this._grow(),this._buffer[this._tail]=e,this._tail=this._tail+1&this._mask,this._size++,this._size}shift(){if(this._size===0)return;let e=this._buffer[this._head];return this._buffer[this._head]=void 0,this._head=this._head+1&this._mask,this._size--,e}peek(){return this._size===0?void 0:this._buffer[this._head]}clear(){if(this._size===0)return;let e=this._head;for(let t=0;t<this._size;t++)this._buffer[e]=void 0,e=e+1&this._mask;this._head=this._tail=0,this._size=0}get capacity(){return this._capacity}get isEmpty(){return this._size===0}*[Symbol.iterator](){let e=this._head;for(let t=0;t<this._size;t++)yield this._buffer[e+t&this._mask]}values(){return this[Symbol.iterator]()}*keys(){for(let e=0;e<this._size;e++)yield e}*entries(){for(let e=0;e<this._size;e++)yield[e,this._buffer[this._head+e&this._mask]]}*drain(){for(;this._size>0;)yield this.shift()}toArray(){let e=Array(this._size);for(let t=0;t<this._size;t++)e[t]=this._buffer[this._head+t&this._mask];return e}_grow(){let e=this._buffer,t=this._capacity<<1,n=Array(t);for(let t=0;t<this._size;t++)n[t]=e[this._head+t&this._mask];this._buffer=n,this._capacity=t,this._mask=t-1,this._head=0,this._tail=this._size&this._mask}pushMany(e){if(!Array.isArray(e)||e.length===0)return this._size;let t=this._size+e.length;for(;this._capacity<t;)this._grow();let n=Math.min(e.length,this._capacity-this._tail);for(let t=0;t<n;t++)this._buffer[this._tail+t]=e[t];this._tail=this._tail+n&this._mask;let r=n;for(;r<e.length;){let t=Math.min(e.length-r,this._capacity-this._tail);for(let n=0;n<t;n++)this._buffer[this._tail+n]=e[r+n];this._tail=this._tail+t&this._mask,r+=t}return this._size=t,this._size}get length(){return this._size}unshiftMany(e){if(!Array.isArray(e)||e.length===0)return this._size;let t=this._size+e.length;for(;this._capacity<t;)this._grow();let n=this._head-e.length&this._mask;for(let t=0;t<e.length;t++)this._buffer[n+t&this._mask]=e[t];return this._head=n,this._size=t,this._size}};function O(e,t=`ERR_ITEM`){return!e||typeof e!=`object`?{error:!0,code:t,message:e?String(e):void 0,stack:void 0}:{error:!0,code:e.code||t,message:e.message,stack:e.stack}}function k(e){return!e||!e.error?String(e):`${e.code||`ERR`}: ${e.message||``}`}let A=Object.freeze({error:`error`,warn:`warn`,info:`info`,log:`log`,debug:`debug`,table:`table`}),j=typeof globalThis<`u`&&globalThis?.console?globalThis.console:typeof self<`u`&&self?.console?self.console:typeof window<`u`&&window?.console?window.console:typeof global<`u`&&global?.console?global.console:null;function M(e){try{return JSON.stringify(e)}catch{try{let t=typeof WeakSet==`function`?new WeakSet:new Set;return JSON.stringify(e,function(e,n){if(n&&typeof n==`object`){if(t.has(n))return`[Circular]`;t.add(n)}return typeof n==`function`?`[Function: ${n.name||`anonymous`}]`:typeof n==`symbol`?String(n):typeof n==`bigint`?n.toString()+`n`:n})}catch{try{return String(e)}catch{return`[Unserializable]`}}}}var ee=class{constructor(e=0,t={}){this._debugLevel=0,this._counters=Object.create(null),this._format=t?.format||`text`,this.name=t?.name||null,this._formatter=typeof t?.formatter==`function`?t.formatter:null,this._output=typeof t?.output==`function`?t.output:null,this.setDebugLevel(e)}setDebugLevel(e){let t=NaN;typeof e==`number`?t=e:typeof e==`string`||typeof e==`boolean`?t=Number(e):(e instanceof Number||e instanceof String||e instanceof Boolean)&&(t=Number(e.valueOf())),this._debugLevel=Number.isFinite(t)&&t>=0?Math.max(0,Math.min(3,Math.floor(t))):0}getDebugLevel(){return this._debugLevel}isDebugLevel(e=1){return Number(this._debugLevel)>=Number(e||1)}isDebug(){return this.isDebugLevel(1)}_resolveLogArgs(e){return e.map(e=>{if(typeof e==`function`)try{return e()}catch(e){return e}return e})}_emit(e,t,n,r,i={}){if(!this.isDebugLevel(e))return;let a=this._resolveLogArgs(r),o={level:n,msg:i.msgArray?a:a.length===1?a[0]:a,ts:E(),format:this._format};if(this.name&&(o.name=this.name),this._formatter)try{let e=this._formatter(o);if(e!=null){if(typeof e==`string`){if(this._output){try{this._output(e)}catch{}return}typeof j?.[t]==`function`&&j[t](e);return}o=e}}catch{}if(this._output){try{this._output(o)}catch{}return}if(typeof j?.[t]==`function`)if(this._format===`json`)try{let e=typeof o==`string`?o:M(o);j[t](e)}catch{try{j[t](...Array.isArray(a)?a:[a])}catch{}}else j[t](...a)}error(...e){let t=e.map(e=>{try{if(e?.error)return k(e);if(e instanceof Error||e&&typeof e==`object`)return k(O(e))}catch{}return e});this._emit(1,`error`,A.error,t)}warn(...e){this._emit(2,`warn`,A.warn,e)}info(...e){this._emit(3,`info`,A.info,e)}log(...e){this._emit(3,`log`,A.log,e)}debug(...e){this._emit(3,`debug`,A.debug,e)}table(...e){if(!this.isDebugLevel(3)||!j)return;if(this._format===`json`){this._emit(3,`log`,A.table,e,{msgArray:!0});return}let t=this._resolveLogArgs(e);typeof j.table==`function`?j.table(...t):typeof j.log==`function`&&j.log(...t)}incrementCounter(e){if(!this.isDebug())return;let t=String(e||``);t&&(this._counters[t]=(this._counters[t]||0)+1)}getDebugCounters(){return Object.assign({},this._counters)}resetDebugCounters(){this._counters=Object.create(null)}};let te=Symbol(`PowerSubscriberSet.original`);var N=class{constructor(e={}){let{weak:t=!1,maxListeners:n=0}=e||{};this._weak=!!t,this._maxListeners=Number.isFinite(Number(n))?Math.max(0,Math.floor(Number(n))):0,this._listeners=new Set,this._onceMap=new WeakMap,this._finalization=null,this._weak&&typeof WeakRef<`u`&&typeof FinalizationRegistry<`u`&&(this._finalization=new FinalizationRegistry(e=>{this._listeners.delete(e.ref)}))}get size(){return this._cleanup(),this._listeners.size}add(e){if(typeof e!=`function`){if(!this._weak||!e||typeof e.deref!=`function`)throw TypeError(`listener must be a function`);if(this._maxListeners>0&&this.size+1>this._maxListeners)throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);return this._listeners.add(e),()=>this.delete(e)}if(this._maxListeners>0&&this.size+1>this._maxListeners)throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);let t=this._makeEntry(e);return this._listeners.add(t),()=>this.delete(e)}addOnce(e){if(typeof e!=`function`)throw TypeError(`listener must be a function`);let t=(...t)=>{try{e(...t)}finally{this.delete(e)}};try{t[te]=e}catch{}if(this._onceMap.set(e,t),this._maxListeners>0&&this.size+1>this._maxListeners)throw Error(`PowerSubscriberSet: adding listener exceeds maxListeners (${this._maxListeners})`);let n=this._makeEntry(t);return this._listeners.add(n),()=>this.delete(e)}delete(e){let t=e,n=this._onceMap.get(e);n&&(t=n,this._onceMap.delete(e));for(let e of this._listeners){if(e===t)return this._listeners.delete(e),this._finalization&&typeof e.deref==`function`&&this._finalization.unregister(e),!0;let n=this._deref(e);if(!n){this._listeners.delete(e);continue}if(n===t)return this._listeners.delete(e),this._finalization&&typeof e.deref==`function`&&this._finalization.unregister(e),!0}return!1}forEach(e){for(let t of this._listeners){let n=this._deref(t);if(!n){this._listeners.delete(t);continue}e(n)}}clear(){this._listeners.clear(),this._onceMap=new WeakMap}values(){this._cleanup();let e=[];for(let t of this._listeners){let n=this._deref(t);n&&e.push(n)}return e}*[Symbol.iterator](){for(let e of this._listeners){let t=this._deref(e);if(!t){this._listeners.delete(e);continue}yield t}}_cleanup(){if(!(!this._weak||typeof WeakRef>`u`))for(let e of this._listeners)typeof e?.deref==`function`&&!e.deref()&&this._listeners.delete(e)}_makeEntry(e){if(this._weak&&typeof WeakRef<`u`){let t=new WeakRef(e);if(this._finalization)try{this._finalization.register(e,{ref:t},t)}catch{}return t}return e}_deref(e){return typeof e?.deref==`function`?e.deref():e}};function P(e){if(e){if(typeof e.cleanup==`function`){try{e.cleanup()}catch{}return}if(typeof e._cleanup==`function`){try{e._cleanup()}catch{}return}if(typeof e[Symbol.iterator]==`function`&&typeof e.delete==`function`)for(let t of e)(typeof t?.deref==`function`?t.deref():t)||e.delete(t)}}var ne=class{constructor(e={}){this._listeners=new Map,this._maxListeners=Number.isFinite(Number(e.maxListeners))?Math.max(0,Number(e.maxListeners)):0,this._weak=!!e.weak,this._fr=null,this._finalizationRefs=new WeakMap,this._eventFinalizationRefs=new Map}_ensureFinalizationRegistry(){return!this._weak||typeof FinalizationRegistry>`u`?null:(this._fr||(this._fr=new FinalizationRegistry(e=>{try{let{event:t,ref:n}=e,r=this._listeners.get(t),i=this._eventFinalizationRefs.get(t);if(i&&n&&(i.delete(n),i.size===0&&this._eventFinalizationRefs.delete(t)),!r)return;P(r),r.size===0&&(this._listeners.delete(t),this._eventFinalizationRefs.delete(t))}catch{}})),this._fr)}cleanup(){if(this._weak)for(let[e,t]of this._listeners)P(t),t.size===0&&(this._clearWeakListenerEvent(e),this._listeners.delete(e))}on(e,t){if(typeof t!=`function`)throw TypeError(`listener must be a function`);let n=this._getBucket(e);n||(n=new N({maxListeners:this._maxListeners,weak:this._weak}),this._listeners.set(e,n));let r=n.add(t);return this._registerWeakListener(t,e)?()=>{r(),this._unregisterWeakListener(t,e)}:r}_getBucket(e){let t=this._listeners.get(e);if(!t)return null;if(t instanceof N)return t;if(typeof t?.[Symbol.iterator]==`function`){let n=new N({maxListeners:this._maxListeners,weak:this._weak});for(let e of t){let t=typeof e?.deref==`function`?e.deref():e;t&&n.add(t)}return this._listeners.set(e,n),n}return null}_registerWeakListener(e,t){let n=this._ensureFinalizationRegistry();if(!n||typeof WeakRef>`u`)return null;let r=new WeakRef(e);try{n.register(e,{event:t,ref:r},r);let i=this._finalizationRefs.get(e);i||(i=new Map,this._finalizationRefs.set(e,i));let a=i.get(t);a||(a=new Set,i.set(t,a)),a.add(r);let o=this._eventFinalizationRefs.get(t);o||(o=new Set,this._eventFinalizationRefs.set(t,o)),o.add(r)}catch{return null}return r}_unregisterWeakListener(e,t){if(!this._fr||!this._finalizationRefs.has(e))return;let n=this._finalizationRefs.get(e);if(!n||n.size===0){this._finalizationRefs.delete(e);return}let r=t===void 0?Array.from(n.keys()):[t];for(let e of r){let t=n.get(e);if(!t||t.size===0){n.delete(e);continue}for(let n of t){try{this._fr.unregister(n)}catch{}let t=this._eventFinalizationRefs.get(e);t&&(t.delete(n),t.size===0&&this._eventFinalizationRefs.delete(e))}n.delete(e)}n.size===0&&this._finalizationRefs.delete(e)}_clearWeakListenerEvent(e){if(!this._fr)return;let t=this._eventFinalizationRefs.get(e);if(t){for(let e of t)try{this._fr.unregister(e)}catch{}this._eventFinalizationRefs.delete(e)}}once(e,t){if(typeof t!=`function`)throw TypeError(`listener must be a function`);let n=this._getBucket(e);n||(n=new N({maxListeners:this._maxListeners,weak:this._weak}),this._listeners.set(e,n));let r=n.addOnce(t);return this._registerWeakListener(t,e)?()=>{r(),this._unregisterWeakListener(t,e)}:r}off(e,t){let n=this._getBucket(e);n&&(n.delete(t),this._unregisterWeakListener(t,e),n.size===0&&(this._clearWeakListenerEvent(e),this._listeners.delete(e)))}emit(e,t){let n=this._listeners.get(e);if(!n||n.size===0)return!1;if(n instanceof N){let r=!1;return n.forEach(e=>{r=!0;try{e(t)}catch{}}),n.size===0&&(this._clearWeakListenerEvent(e),this._listeners.delete(e)),r}let r=n.size>0;for(let e of n){let r=typeof e?.deref==`function`?e.deref():e;if(!r){n.delete(e);continue}try{r(t)}catch{}}return n.size===0&&(this._clearWeakListenerEvent(e),this._listeners.delete(e)),r}*_iterBucketListeners(e){if(e instanceof N){yield*e;return}for(let t of e){let n=typeof t?.deref==`function`?t.deref():t;if(!n){e.delete(t);continue}yield n}}async emitAsync(e,t,{concurrency:n=1/0}={}){let r=this._listeners.get(e);if(!r||r.size===0)return!1;let i=Number.isFinite(+n)&&+n>0?Math.max(1,Math.floor(+n)):1/0,a=async e=>{try{await e(t)}catch{}},o=new Set,s=!1;for(let e of this._iterBucketListeners(r)){if(!e)continue;s=!0;let t=Promise.resolve().then(()=>a(e)).finally(()=>{o.delete(t)});o.add(t),Number.isFinite(i)&&o.size>=i&&await Promise.race(o)}return o.size&&await Promise.all(o),r.size===0&&(this._clearWeakListenerEvent(e),this._listeners.delete(e)),s}listeners(e){let t=this._listeners.get(e);return t?t instanceof N?t.values():Array.from(t).map(e=>typeof e?.deref==`function`?e.deref():e).filter(Boolean):[]}clear(e){if(e===void 0){for(let e of this._eventFinalizationRefs.keys())this._clearWeakListenerEvent(e);this._eventFinalizationRefs.clear(),this._finalizationRefs=new WeakMap,this._listeners.clear();return}this._clearWeakListenerEvent(e),this._listeners.delete(e)}};let F=1e3;60*F;let I=30*F,L=1e3;var R=class{constructor(e,t,n){this._underlying=e,this._logger=t,this._pool=n,this.onmessage=null,this.onerror=null,this.onmessageerror=null}postMessage(e,t){let n=e,r=t;if(n instanceof Uint8Array||ArrayBuffer.isView(n)||n instanceof ArrayBuffer){if(Array.isArray(r))try{r.length?this._underlying.postMessage(n,r):this._underlying.postMessage(n);return}catch(e){throw this._logger.error(e,`Failed to postMessage to underlying worker`),e}if(!r){let e=n instanceof ArrayBuffer?n:n.buffer;e?.byteLength>0&&(r=[e])}try{r?.length?this._underlying.postMessage(n,r):this._underlying.postMessage(n)}catch(e){throw this._logger.error(e,`Failed to postMessage to underlying worker`),e}return}if(typeof n==`object`&&n&&!ArrayBuffer.isView(n)&&!(n instanceof ArrayBuffer))try{let t=this._pool._encodeForTransfer(e);if(!r)r=[t.buffer];else if(Array.isArray(r))r.includes(t.buffer)||r.push(t.buffer);else{let e=Array.from(r);e.includes(t.buffer)||e.push(t.buffer),r=e}n=t}catch{r=t,n=e}try{r?.length?this._underlying.postMessage(n,r):this._underlying.postMessage(n)}catch(e){throw this._logger.error(e,`Failed to postMessage to underlying worker`),e}}addEventListener(...e){return this._underlying.addEventListener(...e)}removeEventListener(...e){return this._underlying.removeEventListener(...e)}terminate(){typeof this._underlying.terminate==`function`&&this._underlying.terminate()}},z=class extends Error{constructor(e=`PowerPool has been shut down`){super(e),this.name=`PowerPoolShutdownError`}},B=class{constructor(e,t={}){let n=typeof navigator<`u`&&navigator.hardwareConcurrency||2,{size:r=Math.min(n,2),minSize:i=2,maxSize:a=Math.max(r,n),workerOptions:o={},maxTasksPerWorker:s,idleTimeout:c=6e4,taskQueue:l=!0,queuePolicy:u=`enqueue`,lazy:d=!0,awaitResponseTimeout:f=I,autoScale:p=!1}=t,m=s===void 0&&p?1:s??1/0;if(typeof e!=`function`&&typeof e!=`string`)throw TypeError(`PowerPool workerSource must be a function or string`);this._workerSource=e,this._workerOptions=o,this._maxTasksPerWorker=m,this.minSize=Math.max(0,i),this.maxSize=Math.max(this.minSize,a),this.idleTimeout=Math.max(0,c),this.taskQueueEnabled=!!l,this._queuePolicy=[`enqueue`,`drop-oldest`,`drop-newest`,`reject`].includes(u)?u:`enqueue`,this._createdAt=E(),this._totalWorkersCreated=0,this._totalTasksCompleted=0,this._taskDurationsWelfordCount=0,this._taskDurationsWelfordMean=0,this._taskDurationsWelfordM2=0,this._taskDurationsMin=1/0,this._taskDurationsMax=-1/0,this._ewmaLatency=null,this._autoScale=null,this._autoScaleInterval=null,this._lastAutoScaleAt=0,this._terminatedWorkerTaskCountsTotal=0,this._terminatedWorkerTaskCountsCount=0,this.workers=[],this.queue=new D;let h={maxListeners:t?.listenerMaxListeners??t?.maxListeners,weak:!!t?.weakListeners};this._bus=new ne(h),this._queueHighThreshold=Number.isFinite(Number(t?.queueHighThreshold))?Math.max(0,Math.floor(Number(t?.queueHighThreshold))):1/0,this._queueHighCrossed=!1,this._onmessage=null,this._onerror=null,this._onidle=null,this._onresize=null,this._nextIndex=0,this._nextWorkerId=0,this._correlationCounter=0,this._activeTasks=0,this._isIdle=!0,this._queuePaused=!1;let g=typeof t?.debugLevel==`number`?t.debugLevel:1;if(this._logger=new ee(g,{name:`powerPool`}),arguments.length>1&&arguments[1]!=null&&typeof arguments[1]!=`object`)throw TypeError(`PowerPool options must be an object`);this._pendingResponses=new Map,this._underlyingToWorkerObj=new Map,this._defaultAwaitResponseTimeout=Number.isFinite(Number(f))?Math.max(0,Math.floor(Number(f))):I;let _=Math.min(d?this.minSize:Math.max(r,this.minSize),this.maxSize);for(let e=0;e<_;e++)try{this._addWorkerInstance()}catch(e){try{if((e?.message?String(e.message):``).includes(`Invalid workerSource`))throw e}catch(e){throw e}try{this._logger.error(e,`Initial worker creation failed`)}catch(e){this._debugLog?.(e,`Initial worker creation: logger error`)}try{this._bus.emit(`pool:error`,{phase:`init`,error:e})}catch(e){this._debugLog?.(e,`Initial worker creation: bus.emit failed`)}break}if(this._reaperInterval=setInterval(()=>this._reapIdleWorkers(),Math.max(L,Math.floor(this.idleTimeout/2))),this._encodeCache=new Map,this._encodeCacheLimit=Math.max(16,t?.encodeCacheLimit?t.encodeCacheLimit:64),this._encodeCacheByteLimit=Number.isFinite(Number(t?.encodeCacheByteLimit))?Math.max(0,Number(t?.encodeCacheByteLimit)):1/0,this._encodeCacheBytes=0,t?.autoScale){let e=typeof t.autoScale==`object`?t.autoScale:{},n=Number.isFinite(Number(e.intervalMs))?Math.max(100,Math.floor(e.intervalMs)):1e3,r=Number.isFinite(Number(e.targetMs))?Math.max(1,Number(e.targetMs)):50,i=Number.isFinite(Number(e.alpha))?Math.max(0,Math.min(1,Number(e.alpha))):.2,a=Number.isFinite(Number(e.cooldownMs))?Math.max(0,Math.floor(e.cooldownMs)):5e3,o=Number.isFinite(Number(e.hysteresis))?Math.max(0,Math.min(1,Number(e.hysteresis))):.2,s=Number.isFinite(Number(e.stepUp))?Math.max(1,Math.floor(Number(e.stepUp))):1,c=Number.isFinite(Number(e.stepDown))?Math.max(1,Math.floor(Number(e.stepDown))):1,l=Number.isFinite(Number(e.backoffFactor))?Math.max(1,Number(e.backoffFactor)):1,u=Number.isFinite(Number(e.backoffMaxMultiplier))?Math.max(1,Number(e.backoffMaxMultiplier)):8,d=Number.isFinite(Number(e.backoffResetMs))?Math.max(0,Math.floor(Number(e.backoffResetMs))):a*4;this._autoScale={enabled:!0,intervalMs:n,targetMs:r,alpha:i,cooldownMs:a,hysteresis:o,stepUp:s,stepDown:c,backoffFactor:l,backoffMaxMultiplier:u,backoffResetMs:d},this._autoScaleBackoffMultiplier=1;try{this._autoScaleInterval=setInterval(()=>this._autoScaleTick(),n)}catch(e){this._debugLog?.(e,`autoScale: interval setup failed`)}}}_debugLog(e,t){try{typeof this._logger?.debug==`function`&&(e?this._logger.debug(e,t||`swallowed error`):this._logger.debug(t||`swallowed error`))}catch(e){try{typeof console<`u`&&typeof console.debug==`function`&&console.debug(e,t||`swallowed error`)}catch{}}}_ensureReaper(){try{this._reaperInterval||(this._reaperInterval=setInterval(()=>this._reapIdleWorkers(),Math.max(L,Math.floor(this.idleTimeout/2))))}catch(e){this._debugLog?.(e,`_ensureReaper: setInterval failed`)}}_createPendingResponsePromise(e,t){let n=e==null?e:String(e),r=null;return{pendingPromise:new Promise((e,i)=>{r={resolve:e,reject:i,timer:null};let a=Number.isFinite(Number(t?.timeout))?Math.max(0,Math.floor(Number(t?.timeout))):Number.isFinite(Number(this._defaultAwaitResponseTimeout))?this._defaultAwaitResponseTimeout:void 0;Number.isFinite(a)&&a>0&&(r.timer=setTimeout(()=>{try{this._cleanupPendingResponse(n,{rejectWith:Error(`postMessage response timeout`)})}catch{try{i(Error(`postMessage response timeout`))}catch(e){this._debugLog?.(e,`createPendingResponsePromise: reject fallback failed`)}}},a)),this._pendingResponses.set(n,r)}),correlationKey:n}}_postToWorkerObj(e,t,n,r,i,a){try{return t.transfer?.length?e.worker.postMessage(t.message,t.transfer):e.worker.postMessage(t.message),typeof e._startTimes?.push==`function`&&e._startTimes.push(n),e.tasks++,this._activeTasks++,e.lastActive=n,this._isIdle&&this._updateIdleState(),r?a:!0}catch(e){if(r&&i){try{this._cleanupPendingResponse(i,{rejectWith:e})}catch(e){this._debugLog?.(e,`postToWorkerObj: cleanupPendingResponse failed`)}try{this._logger.error(e,`Failed to postMessage to worker`)}catch(e){this._debugLog?.(e,`postToWorkerObj: logger.error failed`)}return a}try{this._logger.error(e,`Failed to postMessage to worker`)}catch(e){this._debugLog?.(e,`postToWorkerObj: logger.error failed`)}return!1}}_tryGrowPool(e,t,n,r,i,a,o){let s;try{s=this._addWorkerInstance()}catch(e){try{this._logger.error(e,`Failed to grow pool`)}catch(e){this._debugLog?.(e,`tryGrowPool: logger.error failed`)}try{this._bus.emit(`pool:error`,{phase:`grow`,error:e})}catch(e){this._debugLog?.(e,`tryGrowPool: bus.emit failed`)}if(i&&a){try{this._cleanupPendingResponse(a,{rejectWith:e})}catch(e){this._debugLog?.(e,`tryGrowPool: cleanupPendingResponse failed`)}return o}return!1}if(!s){if(i&&a){try{this._cleanupPendingResponse(a,{rejectWith:Error(`failed to add worker`)})}catch(e){this._debugLog?.(e,`tryGrowPool: cleanupPendingResponse failed`)}return o}return!1}let c=this._prepareForTransfer(e,t,n);return this._postToWorkerObj(s,c,r,i,a,o)}_enqueueOrReject(e,t,n,r){let i=this._queuePolicy;if(i===`reject`||i===`drop-newest`&&this.queue.length>0)return t&&n?(this._cleanupPendingResponse(n,{rejectWith:Error(`postMessage rejected by queue policy`)}),r):!1;if(i===`drop-oldest`&&this.queue.length>0){let e=this.queue.shift();e?.correlationId!=null&&this._cleanupPendingResponse(e.correlationId,{rejectWith:Error(`postMessage queued task dropped by policy`)})}let a={message:e.message,transfer:e.transfer};t&&n&&(a.correlationId=n),this.queue.push(a);try{Number.isFinite(this._queueHighThreshold)&&this.queue.length>this._queueHighThreshold&&!this._queueHighCrossed&&(this._queueHighCrossed=!0,this._bus.emit(`pool:queue:high`,{length:this.queue.length,threshold:this._queueHighThreshold}))}catch(e){this._debugLog?.(e,`enqueueOrReject: bus.emit failed`)}return this._updateIdleState(),t?r:!0}_clearLifecycleIntervals(){try{this._reaperInterval&&(clearInterval(this._reaperInterval),this._reaperInterval=null)}catch(e){this._debugLog?.(e,`clearLifecycleIntervals: clearInterval(reaper) failed`)}try{this._autoScaleInterval&&(clearInterval(this._autoScaleInterval),this._autoScaleInterval=null)}catch(e){this._debugLog?.(e,`clearLifecycleIntervals: clearInterval(autoScale) failed`)}}shutdown(){this._clearLifecycleIntervals();try{for(let[e]of this._pendingResponses)try{this._cleanupPendingResponse(e,{rejectWith:new z(`pool:shutdown`)})}catch(e){this._debugLog?.(e,`shutdown: cleanup pending response`)}try{typeof this._pendingResponses?.clear==`function`&&this._pendingResponses.clear()}catch(e){this._debugLog?.(e,`shutdown: pendingResponses.clear failed`)}}catch(e){this._debugLog?.(e,`shutdown: iterate pending responses`)}try{for(let e of this.workers)try{e.worker.terminate()}catch(e){this._debugLog?.(e,`shutdown: terminate worker`)}}catch(e){this._debugLog?.(e,`shutdown: terminate workers loop`)}try{this._underlyingToWorkerObj&&this._underlyingToWorkerObj.clear()}catch(e){this._debugLog?.(e,`shutdown: underlyingToWorkerObj.clear failed`)}let e=this.workers.map(e=>e?.id).filter(e=>e!=null);e?.length&&this._bus.emit(`pool:scale`,{action:`remove`,terminated:e,count:e.length}),this.workers=[],this.queue=new D,this._queueHighCrossed=!1,this._activeTasks=0}_encodeForTransfer(e){try{let t=JSON.stringify(e);if(typeof t==`string`&&t.length>2048)return C(e);let n=this._encodeCache.get(t);if(n){try{this._encodeCache.delete(t),this._encodeCache.set(t,n)}catch{}return n}let r=C(e),i=r?.byteLength||0,a=()=>this._encodeCache.size>=this._encodeCacheLimit||this._encodeCacheByteLimit!==1/0&&this._encodeCacheBytes+i>this._encodeCacheByteLimit;for(;a();){let e=[],t=this._encodeCache.keys();for(;a()&&e.length<10;){let n=t.next();if(n.done)break;e.push(n.value)}if(!e.length)break;for(let t of e){try{let e=this._encodeCache.get(t),n=typeof e?.byteLength==`number`?e.byteLength:0;this._encodeCacheBytes=Math.max(0,this._encodeCacheBytes-n)}catch{}this._encodeCache.delete(t)}}return this._encodeCache.set(t,r),r?.byteLength&&(this._encodeCacheBytes+=r.byteLength),r}catch{return C(e)}}prepareBuffer(e,t={}){let{clone:n=!0}=t,r=this._encodeForTransfer(e);return n?r.slice():r}prepareBuffers(e,t={}){if(!Array.isArray(e))throw Error(`prepareBuffers expects an array`);let{clone:n=!0,zeroCopy:r=!1}=t,i=Array(e.length);for(let t=0;t<e.length;t++){let a=e[t]&&typeof e[t]==`object`&&`message`in e[t]?e[t]:{message:e[t]},o=a.message,s=a.transfer;if(s){i[t]={message:o,transfer:s};continue}if(typeof o==`object`&&o&&!ArrayBuffer.isView(o)&&!(o instanceof ArrayBuffer)){if(r){i[t]={message:o,transfer:void 0};continue}try{let e=this._encodeForTransfer(o),r=n?e.slice():e;i[t]={message:r,transfer:n?[r.buffer]:void 0};continue}catch{i[t]={message:o,transfer:void 0};continue}}if(o instanceof ArrayBuffer||ArrayBuffer.isView(o)){i[t]={message:o,transfer:[o instanceof ArrayBuffer?o:o.buffer]};continue}i[t]={message:o,transfer:void 0}}return i}_prepareForTransfer(e,t,n){let r=!!n?.zeroCopy;if(e instanceof Uint8Array||ArrayBuffer.isView(e)||e instanceof ArrayBuffer){let n=e instanceof ArrayBuffer?e:e.buffer;if(!t){if(n?.byteLength===0)try{let t=e instanceof ArrayBuffer?e.slice(0):new Uint8Array(e);return{message:t,transfer:[t.buffer]}}catch{return{message:e,transfer:void 0}}return{message:e,transfer:[n]}}if(Array.isArray(t))return{message:e,transfer:t};if(t.length===0)return{message:e,transfer:[n]};let r=[],i=!1;for(let e of t)r.push(e),e===n&&(i=!0);return i||r.push(n),{message:e,transfer:r}}if(typeof e==`object`&&e&&!ArrayBuffer.isView(e)&&!(e instanceof ArrayBuffer)){if(r)return{message:e,transfer:t};try{let n=this._encodeForTransfer(e).slice(),r=t;if(!r||Array.isArray(r)&&r.length===0)r=[n.buffer];else if(Array.isArray(r)){let e=!1;for(let t of r)if(t===n.buffer){e=!0;break}e||(r=[...r,n.buffer])}else if(r.length===0)r=[n.buffer];else{let e=[],t=!1;for(let i of r)e.push(i),i===n.buffer&&(t=!0);t||e.push(n.buffer),r=e}return{message:n,transfer:r}}catch{return{message:e,transfer:t}}}return{message:e,transfer:t}}_decrementActiveTasks(e=1){try{let t=Number.isFinite(Number(e))?Math.max(0,Math.floor(Number(e))):1;this._activeTasks=Math.max(0,this._activeTasks-t)}catch{this._activeTasks=0}}resize(e){let t=this.minSize,n=this.maxSize;if(typeof e==`object`&&e)Number.isFinite(e.minSize)&&(t=Math.max(0,Math.floor(e.minSize))),Number.isFinite(e.maxSize)&&(n=Math.max(t,Math.floor(e.maxSize)));else{let r=Number(e);if(!Number.isFinite(r))return;n=Math.max(t,Math.floor(r))}this.minSize=Math.max(0,t),this.maxSize=Math.max(this.minSize,n);let r=0;for(;this.workers.length<this.minSize&&this.workers.length<this.maxSize;)try{let e=this.workers.length;if(this._addWorkerInstance(),this.workers.length===e)break;r++}catch(e){try{this._logger.error(e,`resize: add worker failed`)}catch(e){this._debugLog?.(e,`resize: logger.error failed`)}try{this._bus.emit(`pool:error`,{phase:`resize`,error:e})}catch(e){this._debugLog?.(e,`resize: bus.emit failed`)}break}let i=[];for(;this.workers.length>this.maxSize;){let e=this.workers.pop();if(e){this._decrementActiveTasks(e.tasks||0);try{e.worker.terminate()}catch(e){this._debugLog?.(e,`resize: worker.terminate failed`)}this._deleteWorkerUnderlyingMapping(e),this._terminatedWorkerTaskCountsTotal+=e.completedTasks||0,this._terminatedWorkerTaskCountsCount+=1,i.push(e.id)}}if(i.length||r){let e={data:{type:`pool:resize`,terminated:i,added:r}};if(this._onresize)try{this._onresize(e)}catch(e){this._logger.error(e,`Pool onresize handler error`)}this._bus.emit(`resize`,e),this._bus.emit(`pool:scale`,{added:r,terminated:i,minSize:this.minSize,maxSize:this.maxSize})}this._updateIdleState()}_createWorkerInstance(){if(typeof this._workerSource==`function`){let e=this._workerSource;if(e.prototype===void 0)return e();try{return new e}catch(t){let n=String(t?.message);if(t instanceof TypeError&&/not a constructor|cannot be invoked without\\s*'new'|Class constructor|not constructable/i.test(n))return e();throw t}}if(typeof this._workerSource==`string`){let e;try{e=Function(`try { return import.meta?.url } catch (e) { return undefined }`)()}catch{e=void 0}if(!e&&typeof document<`u`){let t=document.currentScript;t?.src&&(e=t.src)}!e&&typeof location<`u`&&location.href&&(e=location.href);try{if(e)return new Worker(new URL(this._workerSource,e),this._workerOptions)}catch{}return new Worker(this._workerSource,this._workerOptions)}throw Error(`Invalid workerSource: expected Worker factory or relative path string`)}_deleteWorkerUnderlyingMapping(e){try{let t=e?.worker?._underlying;t&&this._underlyingToWorkerObj&&this._underlyingToWorkerObj.delete(t)}catch(e){this._debugLog?.(e,`_deleteWorkerUnderlyingMapping failed`)}}_addWorkerInstance(e){e??(e=this._nextWorkerId++);let t=this._createWorkerInstance(),n=new R(t,this._logger,this),r={id:e,worker:n,tasks:0,lastActive:E(),latencyEwma:null,_startTimes:new D};r.completedTasks=0,this.workers.push(r),this._totalWorkersCreated++,this._bus.emit(`pool:scale`,{action:`add`,id:r.id,minSize:this.minSize,maxSize:this.maxSize});try{this._underlyingToWorkerObj.set(t,r)}catch{}n.onmessage=e=>{let t=E();r.tasks=Math.max(0,r.tasks-1),this._decrementActiveTasks(1),r.lastActive=t;try{let t=e?.data;if(t&&typeof t==`object`&&t.correlationId!=null){let e=String(t.correlationId),n=Object.prototype.hasOwnProperty.call(t,`response`)?t.response:t;this._cleanupPendingResponse(e,{resolveWith:n})}}catch(e){this._debugLog?.(e,`worker.onmessage: resolve pending response`)}try{let n=r._startTimes?.length?r._startTimes.shift():null,i=null;try{let a=e?.data;if(typeof a?.duration==`number`&&Number.isFinite(a.duration)?i=Math.max(0,Number(a.duration)):n!=null&&(i=Math.max(0,t-n)),i!=null){let e=this._autoScale?.alpha||.2;r.latencyEwma==null?r.latencyEwma=i:r.latencyEwma=e*i+(1-e)*r.latencyEwma,this._ewmaLatency==null?this._ewmaLatency=i:this._ewmaLatency=e*i+(1-e)*this._ewmaLatency,this._totalTasksCompleted=(this._totalTasksCompleted||0)+1,r.completedTasks=(r.completedTasks||0)+1;let t=this._taskDurationsWelfordCount;this._taskDurationsWelfordCount=t+1;let n=i-this._taskDurationsWelfordMean;this._taskDurationsWelfordMean+=n*1/this._taskDurationsWelfordCount;let a=i-this._taskDurationsWelfordMean;this._taskDurationsWelfordM2+=n*a,i<this._taskDurationsMin&&(this._taskDurationsMin=i),i>this._taskDurationsMax&&(this._taskDurationsMax=i)}}catch(e){this._debugLog?.(e,`worker.onmessage: latency tracking inner`)}}catch(e){this._debugLog?.(e,`worker.onmessage: latency tracking outer`)}if(!this._queuePaused&&this.queue.length>0&&r.tasks<this._maxTasksPerWorker){let e=this.queue.shift();try{e.transfer?n.postMessage(e.message,e.transfer):n.postMessage(e.message),r._startTimes.push(t),r.tasks++,this._activeTasks++}catch(e){this._debugLog?.(e,`dispatch queued message to worker failed`),this._logger.error(e,`Failed to dispatch queued message to worker`)}this._queueHighCrossed&&this.queue.length<=this._queueHighThreshold&&(this._queueHighCrossed=!1)}if(this._onmessage)try{this._onmessage(e)}catch(e){this._logger.error(e,`Pool onmessage handler error`)}this._bus.emit(`message`,e),this._updateIdleState()};let i=e=>{let t=e?.data===void 0?e:e.data,r=t;if(t&&(t instanceof ArrayBuffer||ArrayBuffer.isView(t)))try{r=w(t)}catch(e){try{o(e)}catch(e){this._debugLog?.(e,`_handleMessage: _handleMessageError failed`)}r=t}let i=e?.data!==void 0&&r===t?e:{data:r,originalEvent:e};if(typeof n.onmessage==`function`)try{n.onmessage(i)}catch(e){this._logger.error(e,`worker wrapper onmessage error`)}},a=e=>{if(typeof n.onerror==`function`)try{n.onerror(e)}catch(e){this._logger.error(e,`worker wrapper onerror error`)}this._bus.emit(`error`,e)},o=e=>{if(typeof n.onmessageerror==`function`)try{n.onmessageerror(e)}catch(e){this._logger.error(e,`worker wrapper onmessageerror error`)}this._bus.emit(`messageerror`,e)};if(typeof t.addEventListener==`function`){try{t.addEventListener(`message`,i)}catch(e){this._debugLog?.(e,`attach addEventListener message`)}try{t.addEventListener(`error`,a)}catch(e){this._debugLog?.(e,`attach addEventListener error`)}try{t.addEventListener(`messageerror`,o)}catch(e){this._debugLog?.(e,`attach addEventListener messageerror`)}}else if(typeof t.on==`function`){try{t.on(`message`,i)}catch(e){this._debugLog?.(e,`attach underlying.on message`)}try{t.on(`error`,a)}catch(e){this._debugLog?.(e,`attach underlying.on error`)}try{t.on(`messageerror`,o)}catch(e){this._debugLog?.(e,`attach underlying.on messageerror`)}}else{try{t.onmessage=i}catch(e){this._debugLog?.(e,`assign underlying.onmessage`)}try{t.onerror=a}catch(e){this._debugLog?.(e,`assign underlying.onerror`)}try{t.onmessageerror=o}catch(e){this._debugLog?.(e,`assign underlying.onmessageerror`)}}return r}_findLeastLoadedWorker(){if(!this.workers.length)return null;let e=null,t=1/0,n=1/0;for(let r=0;r<this.workers.length;r++){let i=this.workers[r],a=i.latencyEwma==null?1/0:i.latencyEwma;(i.tasks<t||i.tasks===t&&a<n)&&(e=i,t=i.tasks,n=a)}return e}postMessage(e,t,n){n=n||void 0;let r=E(),i=n?.workerId==null?null:n.workerId,a=i==null&&this.workers.length===1&&this._maxTasksPerWorker===1/0,o=i==null?a?this.workers[0]:this._findLeastLoadedWorker():this.workers.find(e=>e.id===i),s=!!(n?.awaitResponse||n?.correlationId!=null),c,l;if(s){if(c=n.correlationId==null?this._generateCorrelationId():String(n.correlationId),!(typeof e==`object`&&e&&!ArrayBuffer.isView(e)&&!(e instanceof ArrayBuffer)))throw Error(`postMessage awaitResponse requires a plain-object message`);e=Object.assign({},e,{correlationId:c});let t=this._createPendingResponsePromise(c,n);l=t.pendingPromise,c=t.correlationKey}if(o?.tasks<this._maxTasksPerWorker)try{let i=r,a=this._prepareForTransfer(e,t,n);return this._postToWorkerObj(o,a,i,s,c,l)}catch(e){if(s&&c){try{this._cleanupPendingResponse(c,{rejectWith:e})}catch(e){this._debugLog?.(e,`postMessage: cleanupPendingResponse failed`)}try{this._logger.error(e,`Failed to postMessage to worker`)}catch(e){this._debugLog?.(e,`postMessage: logger.error failed`)}return l}try{this._logger.error(e,`Failed to postMessage to worker`)}catch(e){this._debugLog?.(e,`postMessage: logger.error failed`)}return!1}if(i!=null&&(!o||o.tasks>=this._maxTasksPerWorker)){if(s&&c){try{this._cleanupPendingResponse(c,{rejectWith:Error(`targeted worker unavailable`)})}catch(e){this._debugLog?.(e,`postMessage: cleanupPendingResponse failed`)}return l}return!1}if(i==null&&this.workers.length<this.maxSize){let i=r;return this._tryGrowPool(e,t,n,i,s,c,l)}if(this.taskQueueEnabled){let r=this._prepareForTransfer(e,t,n);return this._enqueueOrReject(r,s,c,l)}if(!this.workers.length)return s?l:!1;let u=this._nextIndex%this.workers.length;this._nextIndex=(this._nextIndex+1)%this.workers.length;let d=this.workers[u];try{let n=r,i=this._prepareForTransfer(e,t);return this._postToWorkerObj(d,i,n,s,c,l)}catch(e){if(s&&c){try{this._cleanupPendingResponse(c,{rejectWith:e})}catch(e){this._debugLog?.(e,`postMessage: cleanupPendingResponse failed`)}try{this._logger.error(e,`Failed to postMessage to fallback worker`)}catch(e){this._debugLog?.(e,`postMessage: logger.error failed`)}return l}try{this._logger.error(e,`Failed to postMessage to fallback worker`)}catch(e){this._debugLog?.(e,`postMessage: logger.error failed`)}return!1}}_generateCorrelationId(){try{let e=typeof globalThis<`u`?globalThis.crypto:void 0;if(typeof e?.randomUUID==`function`)return String(`${e.randomUUID()}-${this._correlationCounter++}`)}catch{}try{let e=typeof globalThis<`u`?globalThis.crypto:void 0;if(typeof e?.getRandomValues==`function`){let t=new Uint8Array(16);e.getRandomValues(t);let n=Array.from(t).map(e=>e.toString(16).padStart(2,`0`)).join(``);return String(`${n}-${this._correlationCounter++}`)}}catch{}let e=Math.floor(Math.random()*4294967295).toString(16);return String(`cid-${Math.floor(E()).toString(36)}-${e}-${this._correlationCounter++}`)}_cleanupPendingResponse(e,t={}){let n=e==null?e:String(e),r=this._pendingResponses.get(n);if(!r)return!1;try{if(r.timer)try{clearTimeout(r.timer)}catch(e){this._debugLog?.(e,`_cleanupPendingResponse: clearTimeout failed`)}}catch(e){this._debugLog?.(e,`_cleanupPendingResponse: timer check failed`)}try{Object.prototype.hasOwnProperty.call(t,`resolveWith`)?r.resolve(t.resolveWith):Object.prototype.hasOwnProperty.call(t,`rejectWith`)&&r.reject(t.rejectWith)}catch(e){this._debugLog?.(e,`_cleanupPendingResponse: resolve/reject failed`)}finally{try{this._pendingResponses.delete(n)}catch(e){this._debugLog?.(e,`_cleanupPendingResponse: delete failed`)}}return!0}broadcast(e,t){let n=E(),r=null,i=typeof e==`object`&&!!e&&!ArrayBuffer.isView(e)&&!(e instanceof ArrayBuffer);for(let a of this.workers)try{let o=e,s=t;if(!s&&i)try{r??(r=this._encodeForTransfer(e));let t=r.slice();o=t,s=[t.buffer]}catch{o=e,s=void 0}s?.length?a.worker.postMessage(o,s):a.worker.postMessage(o),typeof a._startTimes?.push==`function`&&a._startTimes.push(n),a.tasks++,this._activeTasks++,a.lastActive=n}catch(e){this._logger.error(e,`broadcast error`)}this._updateIdleState()}_normalizeStopThePressOptions(e){let t=e?.recreateWorkers===void 0?!0:!!e.recreateWorkers,n=typeof e==`object`?Object.assign({},e):void 0;return n&&delete n.recreateWorkers,{recreate:t,fwdOptions:n}}_resetPoolForStopThePress({recreate:e,scope:t}){try{typeof this.queue?.clear==`function`&&this.queue.clear()}catch(e){this._logger.error(e,`${t}: failed to clear queue`)}try{this._queueHighCrossed=!1}catch(e){this._debugLog?.(e,`_resetPoolForStopThePress: queueHighCrossed reset failed`)}try{for(let[e]of this._pendingResponses)try{this._cleanupPendingResponse(e,{rejectWith:Error(`${t}: cancelled pending response`)})}catch(e){this._debugLog?.(e,`_resetPoolForStopThePress: cleanupPendingResponse failed`)}}catch(e){this._logger.error(e,`${t}: failed to cancel pending responses`)}let n=0,r=[];try{let e=this.workers;if(n=Number(e?.length)||0,Array.isArray(e))r=e.slice();else{r=Array(n);for(let t=0;t<n;t++)r[t]=e[t]}}catch(e){this._logger.error(e,`${t}: failed to snapshot workers`),n=0,r=[]}let i=r.map(e=>e?.id).filter(e=>e!=null);try{for(let e=r.length-1;e>=0;e--){let t=r[e];this._terminatedWorkerTaskCountsTotal+=t.completedTasks||0,this._terminatedWorkerTaskCountsCount+=1;try{t.worker.terminate()}catch(e){this._debugLog?.(e,`_resetPoolForStopThePress: worker.terminate failed`)}this._deleteWorkerUnderlyingMapping(t)}this.workers.length=0,this._activeTasks=0}catch(e){this._logger.error(e,`${t}: failed while terminating workers`)}if(e||this._clearLifecycleIntervals(),e){let e=Math.max(this.minSize,Math.min(n,this.maxSize));for(let t=0;t<e;t++)try{let e=this.workers.length;if(this._addWorkerInstance(),this.workers.length===e)break}catch(e){try{this._logger.error(e,`recreate: add worker failed`)}catch(e){this._debugLog?.(e,`recreate: logger.error failed`)}try{this._bus.emit(`pool:error`,{phase:`recreate`,error:e})}catch(e){this._debugLog?.(e,`recreate: bus.emit failed`)}break}try{this._ensureReaper()}catch(e){this._debugLog?.(e,`recreate: ensureReaper failed`)}}return this._updateIdleState(),{currentCount:n,terminatedIds:i}}stopThePress(e,t,n){let{recreate:r,fwdOptions:i}=this._normalizeStopThePressOptions(n),{currentCount:a,terminatedIds:o}=this._resetPoolForStopThePress({recreate:r,scope:`stopThePress`});try{o?.length&&this._bus.emit(`pool:scale`,{action:`remove`,terminated:o,count:a})}catch(e){this._logger.error(e,`pool scale stopThePress listener error`)}return this.postMessage(e,t,i)}postMessageBatch(e,t){if(!Array.isArray(e))throw Error(`postMessageBatch expects an array of {message, transfer?}`);let n=!!(t?.awaitResponse||t?.correlationId!=null),r=typeof t?.correlationIdFactory==`function`?t.correlationIdFactory:null;if(n){if(t?.correlationId!=null&&e.length>1&&!r)throw Error(`postMessageBatch cannot use a fixed correlationId for multiple items; provide options.correlationIdFactory or omit correlationId`);let n=Array(e.length);for(let i=0;i<e.length;i++){let a=e[i]||{},o=Object.assign({},t);r&&(o.correlationId=String(r(i,a))),n[i]=this.postMessage(a.message,a.transfer,o)}return n}let i=Array(e.length),a=[],o=t?.workerId==null?null:t.workerId,s=this.prepareBuffers(e,{clone:!0,zeroCopy:!!t?.zeroCopy});if(o==null&&this.workers.length===1&&this._maxTasksPerWorker===1/0){let t=this.workers[0],n=!1;for(let r=0;r<e.length;r++){let a=s[r]||{message:e[r]?.message,transfer:e[r]?.transfer};try{let e=E();a.transfer?.length?t.worker.postMessage(a.message,a.transfer):t.worker.postMessage(a.message),typeof t._startTimes?.push==`function`&&t._startTimes.push(e),t.tasks++,this._activeTasks++,t.lastActive=e,n=!0,i[r]=!0}catch{i[r]=!1}}return n&&this._updateIdleState(),i}let c=o!=null,l=null;if(c){if(l=this.workers.find(e=>e.id===o),!l)return e.map(()=>!1)}else l=this._findLeastLoadedWorker();let u=!1;for(let t=0;t<e.length;t++){let n=e[t]||{},r=s[t]||{message:n.message,transfer:n.transfer},d=!1;l?.tasks>=this._maxTasksPerWorker&&(l=null);let f=l;if(!f&&!c&&(f=this._findLeastLoadedWorker()),f?.tasks<this._maxTasksPerWorker)try{let e=E();r.transfer?.length?f.worker.postMessage(r.message,r.transfer):f.worker.postMessage(r.message),typeof f._startTimes?.push==`function`&&f._startTimes.push(e),f.tasks++,this._activeTasks++,f.lastActive=e,u=!0,i[t]=!0,d=!0,l=f.tasks<this._maxTasksPerWorker?f:null}catch{i[t]=!1,d=!0}if(!d&&o==null&&this.workers.length<this.maxSize)try{let e=this._addWorkerInstance();if(!e)i[t]=!1,d=!0;else{let n=E();r.transfer?.length?e.worker.postMessage(r.message,r.transfer):e.worker.postMessage(r.message),typeof e._startTimes?.push==`function`&&e._startTimes.push(n),e.tasks++,this._activeTasks++,e.lastActive=n,u=!0,i[t]=!0,d=!0,l=e.tasks<this._maxTasksPerWorker?e:null}}catch(e){try{this._logger.error(e,`postMessageBatch: add worker failed`)}catch{}try{this._bus.emit(`pool:error`,{phase:`postMessageBatch`,error:e})}catch{}i[t]=!1,d=!0}if(!d){if(o!=null){i[t]=!1;continue}if(this.taskQueueEnabled){let e=this._queuePolicy;if(e===`reject`||e===`drop-newest`&&this.queue.length>0)i[t]=!1;else{if(e===`drop-oldest`&&this.queue.length>0){let e=this.queue.shift();e?.correlationId!=null&&this._cleanupPendingResponse(e.correlationId,{rejectWith:Error(`postMessage queued task dropped by policy`)})}a.push({message:r.message,transfer:r.transfer}),i[t]=!0}}else if(!this.workers.length)i[t]=!1;else{let e=this._nextIndex%this.workers.length;this._nextIndex=(this._nextIndex+1)%this.workers.length;let n=this.workers[e];try{let e=E();r.transfer?.length?n.worker.postMessage(r.message,r.transfer):n.worker.postMessage(r.message),typeof n._startTimes?.push==`function`&&n._startTimes.push(e),n.tasks++,this._activeTasks++,n.lastActive=e,u=!0,i[t]=!0}catch(e){i[t]=!1,this._logger.error(e,`Failed to postMessage to fallback worker`)}}}}if(a.length)try{this.queue.pushMany(a),u=!0;try{Number.isFinite(this._queueHighThreshold)&&this.queue.length>this._queueHighThreshold&&!this._queueHighCrossed&&(this._queueHighCrossed=!0,this._bus.emit(`pool:queue:high`,{length:this.queue.length,threshold:this._queueHighThreshold}))}catch(e){this._debugLog?.(e,`postMessageBatch: bus.emit pool:queue:high failed`)}}catch(e){this._logger.error(e,`postMessageBatch: failed to enqueue prepared items`)}return u&&this._updateIdleState(),i}stopThePressBatch(e,t){let{recreate:n,fwdOptions:r}=this._normalizeStopThePressOptions(t);this._resetPoolForStopThePress({recreate:n,scope:`stopThePressBatch`});try{return this.postMessageBatch(e,r)}catch(t){try{this._logger.error(t,`stopThePressBatch: postMessageBatch failed`)}catch(e){this._debugLog?.(e,`stopThePressBatch: logger.error failed`)}try{return Array(e?e.length:0).fill(!1)}catch{return[]}}}addWorker(){try{return this._addWorkerInstance()}catch(e){try{this._logger.error(e,`addWorker: failed`)}catch(e){this._debugLog?.(e,`addWorker: logger.error failed`)}try{this._bus.emit(`pool:error`,{phase:`addWorker`,error:e})}catch(e){this._debugLog?.(e,`addWorker: bus.emit failed`)}return null}}removeWorker(){let e=this.workers.pop();if(e){this._decrementActiveTasks(e.tasks||0);try{e.worker.terminate()}catch(e){this._debugLog?.(e,`removeWorker: worker.terminate failed`)}this._deleteWorkerUnderlyingMapping(e),this._terminatedWorkerTaskCountsTotal+=e.completedTasks||0,this._terminatedWorkerTaskCountsCount+=1}}_reapIdleWorkers(){if(this.idleTimeout<=0)return;let e=E();for(let t=this.workers.length-1;t>=0;t--){let n=this.workers[t];if(this.workers.length<=this.minSize)break;if(n.tasks===0&&e-(n.lastActive||0)>this.idleTimeout){try{n.worker.terminate()}catch(e){this._debugLog?.(e,`_reapIdleWorkers: worker.terminate failed`)}try{let e=n.worker?._underlying;e&&this._underlyingToWorkerObj&&this._underlyingToWorkerObj.delete(e)}catch(e){this._debugLog?.(e,`_reapIdleWorkers: underlyingToWorkerObj.delete failed`)}let e=this.workers.length-1;t===e?this.workers.pop():this.workers[t]=this.workers.pop()}}this._updateIdleState()}_autoScaleTick(){try{if(!this._autoScale||!this._autoScale.enabled)return;let e=E(),t=this._autoScale;this._lastAutoScaleAt&&t.backoffResetMs&&e-this._lastAutoScaleAt>t.backoffResetMs&&(this._autoScaleBackoffMultiplier=1);let n=Math.floor((t.cooldownMs||0)*(this._autoScaleBackoffMultiplier||1));if(this._lastAutoScaleAt&&e-this._lastAutoScaleAt<n)return;let r=t.targetMs,i=t.hysteresis||.2,a=this._ewmaLatency,o=this.workers.length,s=r*(1+i),c=a==null?!1:a>s,l=this.queue.length>Math.ceil(o*(1+i));if(c||l){if(o<this.maxSize)try{let n=Math.min(this.maxSize-o,t.stepUp||1);for(let e=0;e<n;e++)try{let e=this.workers.length;if(this._addWorkerInstance(),this.workers.length===e)break}catch(e){this._debugLog?.(e,`autoScale: addWorker failed`);try{this._bus.emit(`pool:error`,{phase:`autoScale:add`,error:e})}catch(e){this._debugLog?.(e,`autoScale: bus.emit failed`)}break}this._lastAutoScaleAt=e,this._autoScaleBackoffMultiplier=Math.min((this._autoScaleBackoffMultiplier||1)*(t.backoffFactor||1),t.backoffMaxMultiplier||8)}catch(e){this._debugLog?.(e,`autoScale: addWorker failed outer`)}return}let u=r*Math.max(0,1-i);if(a!=null&&a<u&&this.queue.length===0&&o>this.minSize)try{let n=Math.min(o-this.minSize,t.stepDown||1),r=0;for(let e=this.workers.length-1;e>=0&&r<n;e--){let t=this.workers[e];if(!t||t.tasks>0)continue;try{t.worker.terminate()}catch(e){this._debugLog?.(e,`autoScale: terminate worker`)}this._deleteWorkerUnderlyingMapping(t),this._terminatedWorkerTaskCountsTotal+=t.completedTasks||0,this._terminatedWorkerTaskCountsCount+=1;let n=this.workers.length-1;e===n?this.workers.pop():this.workers[e]=this.workers.pop(),r++}r>0&&(this._lastAutoScaleAt=e,this._autoScaleBackoffMultiplier=Math.min((this._autoScaleBackoffMultiplier||1)*(t.backoffFactor||1),t.backoffMaxMultiplier||8))}catch(e){this._debugLog?.(e,`autoScale: remove worker failed`)}}catch(e){this._debugLog?.(e,`autoScaleTick outer`)}}_emitIdle(){let e={data:{type:`pool:idle`,stats:this.getStats()}};if(this._isIdle=!0,this._onmessage)try{this._onmessage(e)}catch(e){this._logger.error(e,`Pool onmessage handler error`)}if(this._onidle)try{this._onidle(e)}catch(e){this._logger.error(e,`Pool onidle handler error`)}try{this._bus.emit(`message`,e)}catch(e){this._logger.error(e,`pool listener error`)}try{this._bus.emit(`idle`,e)}catch(e){this._logger.error(e,`pool idle listener error`)}}_updateIdleState(){let e=this.queue.length===0,t=this._activeTasks===0&&e;t&&!this._isIdle?this._emitIdle():!t&&this._isIdle&&(this._isIdle=!1)}terminate(){try{this.shutdown()}catch{}}async[Symbol.dispose](){if(typeof this[Symbol.asyncDispose]==`function`){await this[Symbol.asyncDispose]();return}this.terminate()}async[Symbol.asyncDispose](){try{await this.drain()}catch{}this.terminate()}getStats(){let e=this.workers.map(e=>({id:e.id,tasks:e.tasks,lastActive:e.lastActive})),t=E(),n=this._createdAt==null?0:Math.max(0,t-this._createdAt),r=this._totalWorkersCreated||this.workers.length,i=this._totalTasksCompleted||0,a=this._terminatedWorkerTaskCountsCount||0,o=this._terminatedWorkerTaskCountsTotal||0,s=0;for(let e of this.workers)s+=e.completedTasks||0;let c=a+(this.workers.length||0),l=c>0?(o+s)/c:0,u=0,d=0,f=0,p=0,m=0,h=this._taskDurationsWelfordCount||0;if(h>0){u=this._taskDurationsMin===1/0?0:this._taskDurationsMin,d=this._taskDurationsMax===-1/0?0:this._taskDurationsMax,f=this._taskDurationsWelfordMean;let e=h>1?this._taskDurationsWelfordM2/h:0;p=Math.sqrt(e),m=0}return{status:e,performance:{poolLiveDuration:n,totalWorkersCreated:r,totalTasksPerformed:i,averageTasksPerWorkerUntilTermination:l,timePerTask:{max:d,min:u,average:f,stddev:p},percentSlowTasks:m},queueLength:this.queue.length,activeTasks:this._activeTasks,workerCount:this.workers.length,minSize:this.minSize,maxSize:this.maxSize,isIdle:this._activeTasks===0&&this.queue.length===0}}drain(){let e=this.queue.length===0;return this._activeTasks===0&&e?Promise.resolve(this.getStats()):new Promise(e=>{let t=()=>{try{this.removeEventListener(`idle`,t)}catch(e){this._debugLog?.(e,`drain: removeEventListener failed`)}e(this.getStats())};this.addEventListener(`idle`,t)})}addEventListener(e,t){if(typeof t==`function`&&(this._bus.on(e,t),e===`idle`)){let e=this.queue.length===0;if(this._activeTasks===0&&e){let e={data:{type:`pool:idle`,stats:this.getStats()}};try{t(e)}catch(e){this._logger.error(e,`pool idle listener error`)}}}}removeEventListener(e,t){!t||typeof t!=`function`||this._bus.off(e,t)}get onresize(){return this._onresize}set onresize(e){this._onresize=e}get onmessage(){return this._onmessage}set onmessage(e){this._onmessage=e}get onerror(){return this._onerror}set onerror(e){this._onerror=e}get onidle(){return this._onidle}set onidle(e){if(this._onidle=e,typeof e==`function`){let t=this.queue.length===0;if(this._activeTasks===0&&t){let t={data:{type:`pool:idle`,stats:this.getStats()}};try{e(t)}catch(e){this._logger.error(e,`Pool onidle handler error`)}}}}pauseQueue(){this._queuePaused=!0}resumeQueue(){this._queuePaused&&(this._queuePaused=!1,this._dispatchQueuedTasks())}pause(){return this.pauseQueue()}resume(){return this.resumeQueue()}get queuePaused(){return this._queuePaused}_dispatchQueuedTasks(){if(this._queuePaused||!this.taskQueueEnabled||this.queue.length===0)return;let e=this.queue,t=this._maxTasksPerWorker,n=E(),r=!1;for(let i of this.workers){let a=t-i.tasks;for(;a>0&&e.length>0;){let t=e.shift();try{t.transfer?.length?i.worker.postMessage(t.message,t.transfer):i.worker.postMessage(t.message),typeof i._startTimes?.push==`function`&&i._startTimes.push(n),i.tasks++,a--,this._activeTasks++,i.lastActive=n,r=!0}catch(e){this._debugLog?.(e,`dispatch queued message to worker failed`),this._logger.error(e,`Failed to dispatch queued message to worker`);break}}}this._queueHighCrossed&&this.queue.length<=this._queueHighThreshold&&(this._queueHighCrossed=!1),r&&this._updateIdleState()}};let V=typeof self<`u`&&self.Blob&&new Blob([`(self.URL || self.webkitURL).revokeObjectURL(self.location.href);`,\"(function(){self.onmessage=async({data:e})=>{let{sab:t,start:n,end:r,currQOff:i,nextQOff:a,distOff:o,headOff:s,nextOff:c,targetsOff:l,weightsOff:u,inQueueOff:d,stateOff:f,n:p,m}=e,h=new Int32Array(t,o,p),g=new Int32Array(t,s,p),_=new Int32Array(t,c,m),v=new Int32Array(t,l,m),y=new Int32Array(t,u,m),b=new Int32Array(t,i,p),x=new Int32Array(t,a,p),S=new Uint8Array(t,d,p),C=new Int32Array(t,f,8),w=1073741823,T=(e,t,n)=>{let r=Atomics.load(e,t);for(;n<r;){let i=Atomics.compareExchange(e,t,r,n);if(i===r)return!0;r=i}return!1};for(let e=n;e<r;e++){let t=b[e],n=Atomics.load(h,t),r=g[t];for(;r!==-1;){let e=v[r],t=n+y[r];if(T(h,e,t>w?w:t)&&Atomics.compareExchange(S,e,0,1)===0){let t=Atomics.add(C,0,1);x[t]=e}r=_[r]}}self.postMessage(`done`)}})();\"],{type:`text/javascript;charset=utf-8`});function re(e){let t;try{if(t=V&&(self.URL||self.webkitURL).createObjectURL(V),!t)throw``;let n=new Worker(t,{name:e?.name});return n.addEventListener(`error`,()=>{(self.URL||self.webkitURL).revokeObjectURL(t)}),n}catch{return new Worker(`data:text/javascript;charset=utf-8,(function()%7Bself.onmessage%3Dasync(%7Bdata%3Ae%7D)%3D%3E%7Blet%7Bsab%3At%2Cstart%3An%2Cend%3Ar%2CcurrQOff%3Ai%2CnextQOff%3Aa%2CdistOff%3Ao%2CheadOff%3As%2CnextOff%3Ac%2CtargetsOff%3Al%2CweightsOff%3Au%2CinQueueOff%3Ad%2CstateOff%3Af%2Cn%3Ap%2Cm%7D%3De%2Ch%3Dnew%20Int32Array(t%2Co%2Cp)%2Cg%3Dnew%20Int32Array(t%2Cs%2Cp)%2C_%3Dnew%20Int32Array(t%2Cc%2Cm)%2Cv%3Dnew%20Int32Array(t%2Cl%2Cm)%2Cy%3Dnew%20Int32Array(t%2Cu%2Cm)%2Cb%3Dnew%20Int32Array(t%2Ci%2Cp)%2Cx%3Dnew%20Int32Array(t%2Ca%2Cp)%2CS%3Dnew%20Uint8Array(t%2Cd%2Cp)%2CC%3Dnew%20Int32Array(t%2Cf%2C8)%2Cw%3D1073741823%2CT%3D(e%2Ct%2Cn)%3D%3E%7Blet%20r%3DAtomics.load(e%2Ct)%3Bfor(%3Bn%3Cr%3B)%7Blet%20i%3DAtomics.compareExchange(e%2Ct%2Cr%2Cn)%3Bif(i%3D%3D%3Dr)return!0%3Br%3Di%7Dreturn!1%7D%3Bfor(let%20e%3Dn%3Be%3Cr%3Be%2B%2B)%7Blet%20t%3Db%5Be%5D%2Cn%3DAtomics.load(h%2Ct)%2Cr%3Dg%5Bt%5D%3Bfor(%3Br!%3D%3D-1%3B)%7Blet%20e%3Dv%5Br%5D%2Ct%3Dn%2By%5Br%5D%3Bif(T(h%2Ce%2Ct%3Ew%3Fw%3At)%26%26Atomics.compareExchange(S%2Ce%2C0%2C1)%3D%3D%3D0)%7Blet%20t%3DAtomics.add(C%2C0%2C1)%3Bx%5Bt%5D%3De%7Dr%3D_%5Br%5D%7D%7Dself.postMessage(%60done%60)%7D%7D)()%3B`,{name:e?.name})}}let H=null,U=0;function ie(e){return(!H||U!==e)&&(H?.terminate(),H=new B(re,{size:2,maxSize:e,lazy:!0,idleTimeout:6e4,autoScale:{intervalMs:750,targetMs:140,alpha:.12,cooldownMs:4e3,hysteresis:.3,stepUp:1,stepDown:1,backoffFactor:2,backoffMaxMultiplier:8,backoffResetMs:16e3}}),U=e),H}var ae=class{constructor(e,t,{forceSerialRouting:n=!1,minNodesForParallel:r,minFrontierForParallel:i}={}){this.n=e,this.m=t,this.INF_DISTANCE=1073741823,this.STATE_NEXT_SIZE=0,this.hasParallelSupport=!n&&typeof SharedArrayBuffer<`u`,this.hasWorkerSupport=typeof Worker<`u`;let a=this.hasParallelSupport?SharedArrayBuffer:ArrayBuffer,o=e=>e+3&-4,s=0;this.distOff=s,s+=e*4,this.headOff=s,s+=e*4,this.nextOff=s,s+=t*4,this.targetsOff=s,s+=t*4,this.weightsOff=s,s+=t*4,this.q1Off=s,s+=e*4,this.q2Off=s,s+=e*4,this.inQueueOff=s,s+=e,this.stateOff=o(s);let c=this.stateOff+64;this.buffer=new a(c),this.dist=new Int32Array(this.buffer,this.distOff,e),this.head=new Int32Array(this.buffer,this.headOff,e),this.next=new Int32Array(this.buffer,this.nextOff,t),this.targets=new Int32Array(this.buffer,this.targetsOff,t),this.weights=new Int32Array(this.buffer,this.weightsOff,t),this.q1=new Int32Array(this.buffer,this.q1Off,e),this.q2=new Int32Array(this.buffer,this.q2Off,e),this.inQueue=new Uint8Array(this.buffer,this.inQueueOff,e),this.state=new Int32Array(this.buffer,this.stateOff,8);let l=typeof navigator<`u`?navigator.hardwareConcurrency??4:4,u=Math.max(1,l-1),d=Math.max(1,Math.min(8,u));this.workerCount=d;let f=Math.max(1024,Math.min(5e3,Math.floor(e/64)));this.MIN_NODES_FOR_INDUSTRIAL=Number.isFinite(r)?Math.max(1,Math.floor(r)):5e4,this.MIN_FRONTIER_FOR_PARALLEL=Number.isFinite(i)?Math.max(1,Math.floor(i)):f,this.pool=this.hasParallelSupport&&this.hasWorkerSupport&&d>1&&e>=this.MIN_NODES_FOR_INDUSTRIAL?ie(d):null,this.head.fill(-1),this.edgeIdx=0,this.lastParallelUsed=!1}loadState(e){return this.hasParallelSupport?Atomics.load(this.state,e):this.state[e]}storeState(e,t){if(this.hasParallelSupport){Atomics.store(this.state,e,t);return}this.state[e]=t}addState(e,t){if(this.hasParallelSupport)return Atomics.add(this.state,e,t);let n=this.state[e];return this.state[e]+=t,n}loadGraph(e,t,n){if(typeof e==`number`){let r=this.edgeIdx++;this.targets[r]=t,this.weights[r]=n,this.next[r]=this.head[e],this.head[e]=r;return}for(let r=0;r<e.length;r++){let i=this.edgeIdx++;this.targets[i]=t[r],this.weights[i]=n[r],this.next[i]=this.head[e[r]],this.head[e[r]]=i}}async solve(e,t=-1){this.dist.fill(this.INF_DISTANCE),this.inQueue.fill(0),this.dist[e]=0,this.storeState(this.STATE_NEXT_SIZE,0),this.lastParallelUsed=!1;let n=this.q1Off,r=this.q2Off,i=1;for(this.q1[0]=e,this.inQueue[e]=1;i>0;){let e=new Int32Array(this.buffer,n,i);for(let t=0;t<i;t++)this.inQueue[e[t]]=0;if(this.storeState(this.STATE_NEXT_SIZE,0),this.pool&&i>=this.MIN_FRONTIER_FOR_PARALLEL)try{this.lastParallelUsed=!0,await this.dispatchParallel(i,n,r)}catch{this.dispatchSerial(i,n,r)}else this.dispatchSerial(i,n,r);i=this.loadState(this.STATE_NEXT_SIZE),[n,r]=[r,n]}return t===-1?this.dist:this.dist[t]}terminate(){this.pool=null}dispatchSerial(e,t,n){let r=new Int32Array(this.buffer,t,e),i=new Int32Array(this.buffer,n,this.n);for(let t=0;t<e;t++){let e=r[t],n=this.dist[e];for(let t=this.head[e];t!==-1;t=this.next[t]){let e=this.targets[t],r=n+this.weights[t],a=r>this.INF_DISTANCE?this.INF_DISTANCE:r;if(a<this.dist[e]&&(this.dist[e]=a,this.inQueue[e]===0)){this.inQueue[e]=1;let t=this.addState(this.STATE_NEXT_SIZE,1);i[t]=e}}}}async dispatchParallel(e,t,n){let r=this.workerCount,i=Math.ceil(e/r),a=[];for(let o=0;o<r;o++){let r=o*i;if(r>=e)break;a.push({sab:this.buffer,start:r,end:Math.min(r+i,e),currQOff:t,nextQOff:n,distOff:this.distOff,headOff:this.headOff,nextOff:this.nextOff,targetsOff:this.targetsOff,weightsOff:this.weightsOff,inQueueOff:this.inQueueOff,stateOff:this.stateOff,n:this.n,m:this.m})}return await this.pool.executeBatch(a)}};async function oe(e,t,n,{forceSerialRouting:r=!1,minNodesForParallel:i,minFrontierForParallel:a}={}){let{adjPtr:o,adjTo:s,adjCost:c,revAdjPtr:l,revAdjFrom:u,revAdjCost:d,N:f}=n,p=new ae(f,c.length,{forceSerialRouting:r,minNodesForParallel:i,minFrontierForParallel:a});for(let e=0;e<f;e++)for(let t=o[e];t<o[e+1];t++){let n=s[t],r=c[t];p.loadGraph(e,n,r)}try{await p.solve(e,t);let n=p.dist,r=n[t],i=p.lastParallelUsed;if(r>=p.INF_DISTANCE)return{path:[],cost:1/0,found:!1,engine:`adaptiveBarrier`,parallelUsed:!1};let a=[t],o=t,s=f;for(;o!==e&&s-- >0;){let e=!1;for(let t=l[o];t<l[o+1];t++){let r=u[t],i=d[t];if(n[r]+i===n[o]){a.push(r),o=r,e=!0;break}}if(!e)break}return o===e?(a.reverse(),{path:a,cost:r/10,found:!0,engine:`adaptiveBarrier`,parallelUsed:i}):{path:[],cost:1/0,found:!1,engine:`adaptiveBarrier`,parallelUsed:i}}finally{p.terminate()}}let W=typeof self<`u`&&self.Blob&&new Blob([`(self.URL || self.webkitURL).revokeObjectURL(self.location.href);`,\"(function(){let e=1073741823;self.onmessage=async({data:t})=>{let{sab:n,start:r,end:i,currQOff:a,nextQOff:o,distOff:s,prevOff:c,headOff:l,nextOff:u,targetsOff:d,weightsOff:f,inQueueOff:p,stateOff:m,n:h,m:g,delta:_,mode:v}=t,y=new Int32Array(n,s,h),b=new Int32Array(n,c,h),x=new Int32Array(n,l,h),S=new Int32Array(n,u,g),C=new Int32Array(n,d,g),w=new Int32Array(n,f,g),T=new Int32Array(n,a,h),E=new Int32Array(n,o,h),D=new Uint8Array(n,p,h),O=new Int32Array(n,m,8),k=v===`light`,A=(e,t,n)=>{let r=Atomics.load(e,t);for(;n<r;){let i=Atomics.compareExchange(e,t,r,n);if(i===r)return!0;r=i}return!1};for(let t=r;t<i;t++){let n=T[t],r=Atomics.load(y,n);if(!(r>=e))for(let t=x[n];t!==-1;t=S[t]){let i=w[t];if(k?i>_:i<=_)continue;let a=C[t],o=r+i;if(A(y,a,o>e?e:o)&&(Atomics.store(b,a,n),Atomics.compareExchange(D,a,0,1)===0)){let e=Atomics.add(O,0,1);E[e]=a}}}self.postMessage(`done`)}})();\"],{type:`text/javascript;charset=utf-8`});function se(e){let t;try{if(t=W&&(self.URL||self.webkitURL).createObjectURL(W),!t)throw``;let n=new Worker(t,{name:e?.name});return n.addEventListener(`error`,()=>{(self.URL||self.webkitURL).revokeObjectURL(t)}),n}catch{return new Worker(`data:text/javascript;charset=utf-8,(function()%7Blet%20e%3D1073741823%3Bself.onmessage%3Dasync(%7Bdata%3At%7D)%3D%3E%7Blet%7Bsab%3An%2Cstart%3Ar%2Cend%3Ai%2CcurrQOff%3Aa%2CnextQOff%3Ao%2CdistOff%3As%2CprevOff%3Ac%2CheadOff%3Al%2CnextOff%3Au%2CtargetsOff%3Ad%2CweightsOff%3Af%2CinQueueOff%3Ap%2CstateOff%3Am%2Cn%3Ah%2Cm%3Ag%2Cdelta%3A_%2Cmode%3Av%7D%3Dt%2Cy%3Dnew%20Int32Array(n%2Cs%2Ch)%2Cb%3Dnew%20Int32Array(n%2Cc%2Ch)%2Cx%3Dnew%20Int32Array(n%2Cl%2Ch)%2CS%3Dnew%20Int32Array(n%2Cu%2Cg)%2CC%3Dnew%20Int32Array(n%2Cd%2Cg)%2Cw%3Dnew%20Int32Array(n%2Cf%2Cg)%2CT%3Dnew%20Int32Array(n%2Ca%2Ch)%2CE%3Dnew%20Int32Array(n%2Co%2Ch)%2CD%3Dnew%20Uint8Array(n%2Cp%2Ch)%2CO%3Dnew%20Int32Array(n%2Cm%2C8)%2Ck%3Dv%3D%3D%3D%60light%60%2CA%3D(e%2Ct%2Cn)%3D%3E%7Blet%20r%3DAtomics.load(e%2Ct)%3Bfor(%3Bn%3Cr%3B)%7Blet%20i%3DAtomics.compareExchange(e%2Ct%2Cr%2Cn)%3Bif(i%3D%3D%3Dr)return!0%3Br%3Di%7Dreturn!1%7D%3Bfor(let%20t%3Dr%3Bt%3Ci%3Bt%2B%2B)%7Blet%20n%3DT%5Bt%5D%2Cr%3DAtomics.load(y%2Cn)%3Bif(!(r%3E%3De))for(let%20t%3Dx%5Bn%5D%3Bt!%3D%3D-1%3Bt%3DS%5Bt%5D)%7Blet%20i%3Dw%5Bt%5D%3Bif(k%3Fi%3E_%3Ai%3C%3D_)continue%3Blet%20a%3DC%5Bt%5D%2Co%3Dr%2Bi%3Bif(A(y%2Ca%2Co%3Ee%3Fe%3Ao)%26%26(Atomics.store(b%2Ca%2Cn)%2CAtomics.compareExchange(D%2Ca%2C0%2C1)%3D%3D%3D0))%7Blet%20e%3DAtomics.add(O%2C0%2C1)%3BE%5Be%5D%3Da%7D%7D%7Dself.postMessage(%60done%60)%7D%7D)()%3B`,{name:e?.name})}}let G=1073741823,K=null,q=0;function ce(e){return(!K||q!==e)&&(K?.terminate(),K=new B(se,{size:2,maxSize:e,lazy:!0,idleTimeout:6e4,autoScale:{intervalMs:300,targetMs:60,alpha:.22,cooldownMs:1800,hysteresis:.25,stepUp:2,stepDown:1,backoffFactor:2,backoffMaxMultiplier:8,backoffResetMs:1e4}}),q=e),K}var le=class{constructor(e,t,n=200,{forceSerialRouting:r=!1,minFrontierForParallel:i}={}){this.n=e,this.m=t,this.delta=Math.max(1,n|0),this.hasParallelSupport=!r&&typeof SharedArrayBuffer<`u`,this.hasWorkerSupport=typeof Worker<`u`;let a=this.hasParallelSupport?SharedArrayBuffer:ArrayBuffer,o=e=>e+3&-4,s=0;this.distOff=s,s+=e*4,this.prevOff=s,s+=e*4,this.headOff=s,s+=e*4,this.nextOff=s,s+=t*4,this.targetsOff=s,s+=t*4,this.weightsOff=s,s+=t*4,this.qCurrOff=s,s+=e*4,this.qNextOff=s,s+=e*4,this.inQueueOff=s,s+=e,this.stateOff=o(s);let c=this.stateOff+64;this.buffer=new a(c),this.dist=new Int32Array(this.buffer,this.distOff,e),this.prev=new Int32Array(this.buffer,this.prevOff,e),this.head=new Int32Array(this.buffer,this.headOff,e),this.next=new Int32Array(this.buffer,this.nextOff,t),this.targets=new Int32Array(this.buffer,this.targetsOff,t),this.weights=new Int32Array(this.buffer,this.weightsOff,t),this.qCurr=new Int32Array(this.buffer,this.qCurrOff,e),this.qNext=new Int32Array(this.buffer,this.qNextOff,e),this.inQueue=new Uint8Array(this.buffer,this.inQueueOff,e),this.state=new Int32Array(this.buffer,this.stateOff,8);let l=typeof navigator<`u`?navigator.hardwareConcurrency??4:4,u=Math.max(1,l-1),d=Math.max(1,Math.min(8,u));this.workerCount=d,this.MIN_FRONTIER_FOR_PARALLEL=Number.isFinite(i)?Math.max(1,Math.floor(i)):128,this.pool=this.hasParallelSupport&&this.hasWorkerSupport&&d>1?ce(d):null,this.buckets=new Map,this.head.fill(-1),this.edgeIdx=0,this.lastParallelUsed=!1}addEdge(e,t,n){let r=this.edgeIdx++;this.targets[r]=t,this.weights[r]=n,this.next[r]=this.head[e],this.head[e]=r}loadGraph(e,t,n){if(typeof e==`number`){this.addEdge(e,t,n);return}for(let r=0;r<e.length;r++)this.addEdge(e[r],t[r],n[r])}getState(e){return this.hasParallelSupport?Atomics.load(this.state,e):this.state[e]}setState(e,t){if(this.hasParallelSupport){Atomics.store(this.state,e,t);return}this.state[e]=t}addState(e,t){if(this.hasParallelSupport)return Atomics.add(this.state,e,t);let n=this.state[e];return this.state[e]+=t,n}takeSmallestBucketIndex(){let e=1/0;for(let t of this.buckets.keys())t<e&&(e=t);return e}async solve(e){for(this.dist.fill(G),this.prev.fill(-1),this.inQueue.fill(0),this.buckets.clear(),this.dist[e]=0,this.prev[e]=e,this.lastParallelUsed=!1,this.addToBucket(0,e);this.buckets.size>0;){let e=this.takeSmallestBucketIndex();if(!Number.isFinite(e))break;let t=Array.from(this.buckets.get(e));this.buckets.delete(e);let n=[];for(;t.length>0;){n.push(...t);let r=await this.relaxFrontier(t,`light`);t=[];for(let n=0;n<r.length;n++){let i=r[n],a=Math.floor(this.dist[i]/this.delta);a===e?t.push(i):this.addToBucket(a,i)}}let r=await this.relaxFrontier(n,`heavy`);for(let e=0;e<r.length;e++){let t=r[e],n=Math.floor(this.dist[t]/this.delta);this.addToBucket(n,t)}}return this.dist}async relaxFrontier(e,t){if(e.length===0)return[];if(this.setState(0,0),this.qCurr.set(e,0),this.inQueue.fill(0),this.pool&&e.length>=this.MIN_FRONTIER_FOR_PARALLEL)try{this.lastParallelUsed=!0,await this.dispatchParallel(e.length,t)}catch{this.dispatchSerial(e.length,t)}else this.dispatchSerial(e.length,t);let n=this.getState(0),r=Array.from(this.qNext.subarray(0,n));for(let e=0;e<r.length;e++)this.inQueue[r[e]]=0;return r}async dispatchParallel(e,t){let n=this.workerCount,r=Math.ceil(e/n),i=[];for(let a=0;a<n;a++){let n=a*r;if(n>=e)break;i.push({sab:this.buffer,start:n,end:Math.min(n+r,e),currQOff:this.qCurrOff,nextQOff:this.qNextOff,distOff:this.distOff,prevOff:this.prevOff,headOff:this.headOff,nextOff:this.nextOff,targetsOff:this.targetsOff,weightsOff:this.weightsOff,inQueueOff:this.inQueueOff,stateOff:this.stateOff,n:this.n,m:this.m,delta:this.delta,mode:t})}await this.pool.executeBatch(i)}dispatchSerial(e,t){let n=t===`light`;for(let t=0;t<e;t++){let e=this.qCurr[t],r=this.dist[e];if(!(r>=G))for(let t=this.head[e];t!==-1;t=this.next[t]){let i=this.weights[t];if(n?i>this.delta:i<=this.delta)continue;let a=this.targets[t],o=r+i,s=o>G?G:o;if(s<this.dist[a]&&(this.dist[a]=s,this.prev[a]=e,this.inQueue[a]===0)){this.inQueue[a]=1;let e=this.addState(0,1);this.qNext[e]=a}}}}addToBucket(e,t){Number.isFinite(e)&&(this.buckets.has(e)||this.buckets.set(e,new Set),this.buckets.get(e).add(t))}terminate(){this.pool=null}};async function ue(e,t,n,{forceSerialRouting:r=!1,minFrontierForParallel:i}={}){let{adjPtr:a,adjTo:o,adjCost:s,N:c}=n,l=n.costField===`travelTime`?300:200,u=new le(c,s.length,l,{forceSerialRouting:r,minFrontierForParallel:i});for(let e=0;e<c;e++)for(let t=a[e];t<a[e+1];t++)u.addEdge(e,o[t],s[t]);try{await u.solve(e);let n=u.dist[t],r=u.lastParallelUsed;if(n>=G)return{path:[],cost:1/0,found:!1,engine:`deltaStepping`,parallelUsed:r};let i=[t],a=t,o=c;for(;a!==e&&o-- >0;){let e=u.prev[a];if(e===-1)break;i.push(e),a=e}return a===e?(i.reverse(),{path:i,cost:n/10,found:!0,engine:`deltaStepping`,parallelUsed:r}):{path:[],cost:1/0,found:!1,engine:`deltaStepping`,parallelUsed:r}}finally{u.terminate()}}var de=class{constructor(e){this.pos=new Int32Array(e).fill(-1),this.heap=new Int32Array(e),this.keys=new Float64Array(e),this.size=0}isEmpty(){return this.size===0}pushOrReduce(e,t){let n=this.pos[e];if(n===-1){let n=this.size++;this.heap[n]=e,this.pos[e]=n,this.keys[e]=t,this._bubbleUp(n)}else t<this.keys[e]&&(this.keys[e]=t,this._bubbleUp(n))}pop(){if(this.size===0)return-1;let e=this.heap[0];if(this.pos[e]=-1,this.size--,this.size>0){let e=this.heap[this.size];this.heap[0]=e,this.pos[e]=0,this._bubbleDown(0)}return e}_bubbleUp(e){let t=this.heap,n=this.pos,r=this.keys,i=t[e],a=r[i];for(;e>0;){let i=e-1>>2,o=t[i];if(a<r[o])t[e]=o,n[o]=e,e=i;else break}t[e]=i,n[i]=e}_bubbleDown(e){let t=this.heap,n=this.pos,r=this.keys,i=this.size,a=t[e],o=r[a];for(;;){let a=(e<<2)+1;if(a>=i)break;let s=a,c=r[t[a]],l=a+1;if(l<i){let e=r[t[l]];e<c&&(c=e,s=l)}let u=a+2;if(u<i){let e=r[t[u]];e<c&&(c=e,s=u)}let d=a+3;if(d<i){let e=r[t[d]];e<c&&(c=e,s=d)}if(c<o){let r=t[s];t[e]=r,n[r]=e,e=s}else break}t[e]=a,n[a]=e}},fe=class{constructor(e,t){this.n=e,this.head=new Int32Array(e).fill(-1),this.next=new Int32Array(t),this.to=new Int32Array(t),this.weight=new Float64Array(t),this.edgeCount=0,this.dists=new Float64Array(e).fill(1/0),this.prev=new Int32Array(e).fill(-1),this.heap=new de(e)}addEdge(e,t,n){let r=this.edgeCount++;this.to[r]=t,this.weight[r]=n,this.next[r]=this.head[e],this.head[e]=r}solve(e,t=-1){let n=this.dists,r=this.head,i=this.next,a=this.to,o=this.weight,s=this.heap,c=this.prev;for(n.fill(1/0),c.fill(-1),n[e]=0,c[e]=e,s.pushOrReduce(e,0);!s.isEmpty();){let e=s.pop()|0,l=+n[e];if(e===t)return l;for(let t=r[e]|0;t!==-1;t=i[t]|0){let r=a[t]|0,i=l+o[t];i<n[r]&&(n[r]=i,c[r]=e,s.pushOrReduce(r,i))}}return t===-1?n:n[t]}};async function J(e,t,n){let{adjPtr:r,adjTo:i,adjCost:a,N:o}=n,s=new fe(o,a.length);for(let e=0;e<o;e++)for(let t=r[e];t<r[e+1];t++){let n=i[t],r=a[t]/10;s.addEdge(e,n,r)}s.solve(e);let c=s.dists,l=s.prev;if(c[t]===1/0)return{path:[],cost:1/0,found:!1,engine:`ultraDijkstra`};let u=[t],d=t,f=o;for(;d!==e&&f-- >0;){let e=l[d];if(e===-1)break;u.push(e),d=e}return d===e?(u.reverse(),{path:u,cost:c[t],found:!0,engine:`ultraDijkstra`}):{path:[],cost:1/0,found:!1,engine:`ultraDijkstra`}}let pe=Object.freeze({cpu:`bidirectional-astar`,bidirectionalAStar:`bidirectional-astar`,adaptiveBarrier:`adaptive-barrier`,deltaStepping:`delta-stepping`,ultraDijkstra:`ultra-dijkstra`}),Y=null,X=null;function Z(e,t=`bidirectional-astar`){return typeof e!=`string`||!e?t:pe[e]??e}function Q(e){if(!e||!e.N)return e;if(e.coordsX instanceof Float32Array&&e.coordsY instanceof Float32Array&&e.coordsX.length===e.coordsY.length){let t=Array(e.coordsX.length);for(let n=0;n<e.coordsX.length;n+=1)t[n]=[e.coordsX[n],e.coordsY[n]];e.coordsArr=t,delete e.coordsX,delete e.coordsY}return e}async function $(e,t,n,r,{forceSerialRouting:i=!1,parallelPolicy:a=null}={}){switch(Z(e,`ultra-dijkstra`)){case`bidirectional-astar`:return v(t,n,r);case`adaptive-barrier`:return await oe(t,n,r,{forceSerialRouting:i,minNodesForParallel:a?.minNodesForParallel,minFrontierForParallel:a?.minFrontierForParallel});case`delta-stepping`:return await ue(t,n,r,{forceSerialRouting:i,minFrontierForParallel:a?.minFrontierForParallel});case`ultra-dijkstra`:return await J(t,n,r);default:return await J(t,n,r)}}self.onmessage=async e=>{let t=e.data??{};if(t.type===`prepare`){let e=Q(t.prepared);if(!e||typeof e.N!=`number`||!Number.isFinite(e.N)||e.N<=0){self.postMessage({type:`status`,state:`error`,error:`Invalid prepared graph: missing or invalid N`});return}e?.preparedId&&(Y=e,X=e.preparedId);return}if(t.type===`prepareAndRun`){let{requestId:e,engineId:n,startId:r,endId:i,prepared:a,forceSerialRouting:o=!1,parallelPolicy:s=null}=t,c=t.correlationId??null,l=Q(a);if(!l||typeof l.N!=`number`||!Number.isFinite(l.N)||l.N<=0){let t={type:`result`,requestId:e,ok:!1,error:{name:`Error`,message:`engine worker missing or invalid prepared graph`}};c!=null&&(t.correlationId=c),self.postMessage(t);return}l?.preparedId&&(Y=l,X=l.preparedId);try{let t={type:`result`,requestId:e,ok:!0,result:await $(n,r,i,l,{forceSerialRouting:o,parallelPolicy:s})};c!=null&&(t.correlationId=c),self.postMessage(t)}catch(t){let n={type:`result`,requestId:e,ok:!1,error:{name:t?.name??`Error`,message:t?.message??String(t)}};c!=null&&(n.correlationId=c),self.postMessage(n)}return}if(t.type!==`run`)return;let{requestId:n,engineId:r,startId:i,endId:a,prepared:o,preparedId:s,forceSerialRouting:c=!1,parallelPolicy:l=null}=t,u=t.correlationId??null;if(typeof n!=`string`&&typeof n!=`number`){self.postMessage({type:`status`,state:`error`,error:`Missing or invalid requestId`});return}let d=null;if(o?(d=Q(o),d?.preparedId&&(Y=d,X=d.preparedId)):s&&s===X&&(d=Y),!d||typeof d.N!=`number`||!Number.isFinite(d.N)||d.N<=0){self.postMessage({type:`result`,requestId:n,ok:!1,error:{name:`Error`,message:`engine worker missing or invalid prepared graph`}}),self.postMessage({type:`status`,requestId:n,state:`error`,engineId:null,error:`engine worker missing or invalid prepared graph`});return}if(!Number.isFinite(i)||!Number.isFinite(a)||i<0||a<0||i>=d.N||a>=d.N){self.postMessage({type:`result`,requestId:n,ok:!1,error:{name:`Error`,message:`Invalid startId or endId`}}),self.postMessage({type:`status`,requestId:n,state:`error`,engineId:null,error:`Invalid startId or endId`});return}self.postMessage({type:`status`,requestId:n,state:`running`,engineId:Z(r,null)});try{let e={type:`result`,requestId:n,ok:!0,result:await $(r,i,a,d,{forceSerialRouting:c,parallelPolicy:l})};u!=null&&(e.correlationId=u),self.postMessage(e),self.postMessage({type:`status`,requestId:n,state:`idle`,engineId:null})}catch(e){let t={type:`result`,requestId:n,ok:!1,error:{name:e?.name??`Error`,message:e?.message??String(e)}};u!=null&&(t.correlationId=u),self.postMessage(t),self.postMessage({type:`status`,requestId:n,state:`error`,engineId:null,error:e?.message??String(e)})}}})();", Bn = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", zn], { type: "text/javascript;charset=utf-8" });
function Vn(e) {
	let t;
	try {
		if (t = Bn && (self.URL || self.webkitURL).createObjectURL(Bn), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(zn), { name: e?.name });
	}
}
//#endregion
//#region src/graphs/graphMetrics.js
function Hn(e, t, n, r, i = {}) {
	let { mode: a = "distance", densityOpts: o = {} } = i, s = e.N ?? e.coordsArr?.length ?? 0, c = e.E ?? e.edges?.length ?? 0, l = e.coordsArr?.[n], u = e.coordsArr?.[r], d = l && u ? F(l, u) : 0, { sourceCentrality: f, targetCentrality: p } = Gn(a === "car" && t?.edges ? t : e, n, r, a), m = s ? c / s : 0, h = e.adjPtr, g = h && n >= 0 && n + 1 < h.length ? h[n + 1] - h[n] : Wn(e, n), _ = h && r >= 0 && r + 1 < h.length ? h[r + 1] - h[r] : Wn(e, r), v = 0, y = 0, b = 0;
	if (d) {
		let t = Kn(e, l, u, o);
		v = t.emptyRatio, y = t.globalCoverage, b = t.relativeDensity;
	}
	return {
		nodeCount: s,
		edgeCount: c,
		safeN: s,
		safeE: c,
		safeBeelineKm: d / 1e3,
		averageNodeDegree: m,
		avgOutDegree: m,
		graphDensity: b,
		beelinePerNode: d ? d / (s || 1) : 0,
		nodeDegreeSource: g,
		nodeDegreeTarget: _,
		nodeCentralitySource: f,
		nodeCentralityTarget: p,
		emptyRatio: v,
		globalCoverage: y,
		relativeDensity: b,
		haversineDistance: d
	};
}
function Un(e) {
	return e.N ?? e.nodes?.size ?? 0;
}
function Wn(e, t) {
	return !e.adjPtr || t < 0 || t >= Un(e) ? 0 : e.adjPtr[t + 1] - e.adjPtr[t];
}
function Gn(e, t, n, r = "") {
	if (e.adjPtr) {
		let r = e.adjPtr;
		return {
			sourceCentrality: t >= 0 && t + 1 < r.length ? r[t + 1] - r[t] : 0,
			targetCentrality: n >= 0 && n + 1 < r.length ? r[n + 1] - r[n] : 0
		};
	}
	if (!e.edges) return {
		sourceCentrality: 0,
		targetCentrality: 0
	};
	if (r === "car" && e.outCarCentrality) return {
		sourceCentrality: e.outCarCentrality[t] ?? 0,
		targetCentrality: e.outCarCentrality[n] ?? 0
	};
	if (e.outDegree) return {
		sourceCentrality: e.outDegree[t] ?? 0,
		targetCentrality: e.outDegree[n] ?? 0
	};
	let i = 0, a = 0, o = r === "car", s = e.edges;
	if (t === n) {
		for (let e of s) e.source === t && (i += o ? e.fibonacciScore ?? 1 : 1);
		return {
			sourceCentrality: i,
			targetCentrality: i
		};
	}
	for (let e of s) e.source === t ? i += o ? e.fibonacciScore ?? 1 : 1 : e.source === n && (a += o ? e.fibonacciScore ?? 1 : 1);
	return {
		sourceCentrality: i,
		targetCentrality: a
	};
}
function Kn(e, t, n, r = {}) {
	let i = r.maxRes || 256, a = e.N || 0;
	if (!a || !e.coordsArr) return {
		emptyRatio: 1,
		globalCoverage: 0,
		relativeDensity: 0
	};
	let o = a * 2, s = e.coordsArr, c = e.coordsFloat32;
	if (!c || c.length !== o) {
		c = new Float32Array(o);
		for (let e = 0; e < a; e++) {
			let t = s[e];
			c[e * 2] = t[0], c[e * 2 + 1] = t[1];
		}
		e.coordsFloat32 = c;
	}
	let l = e._densitySamplerByRes, u = e._densitySampler;
	l || (l = e._densitySamplerByRes = /* @__PURE__ */ new Map());
	let d = u?.maxRes === i ? u : l.get(i);
	return d || (d = new qn(c, i), l.set(i, d), e._densitySampler = d), d.getDensityFeatures(t[0], t[1], n[0], n[1]);
}
var qn = class {
	constructor(e, t = 512) {
		this.maxRes = t;
		let n = {
			minX: Infinity,
			minY: Infinity,
			maxX: -Infinity,
			maxY: -Infinity
		};
		for (let t = 0; t < e.length; t += 2) {
			let r = e[t], i = e[t + 1];
			r < n.minX && (n.minX = r), r > n.maxX && (n.maxX = r), i < n.minY && (n.minY = i), i > n.maxY && (n.maxY = i);
		}
		this.bounds = n;
		let r = n.maxX - n.minX, i = n.maxY - n.minY;
		r >= i ? (this.resX = t, this.resY = Math.max(1, Math.floor(i / r * t))) : (this.resY = t, this.resX = Math.max(1, Math.floor(r / i * t))), this.scaleX = (this.resX - 1) / (r || 1), this.scaleY = (this.resY - 1) / (i || 1), this.totalCells = this.resX * this.resY, this.sat = new Uint32Array(this.totalCells), this._build(e);
	}
	_build(e) {
		let t = new Uint8Array(this.totalCells), n = this.sat, { minX: r, minY: i } = this.bounds, a = this.scaleX, o = this.scaleY, s = this.resX, c = this.resY, l = e.length;
		for (let n = 0; n < l; n += 2) {
			let c = Math.floor((e[n] - r) * a), l = Math.floor((e[n + 1] - i) * o);
			t[l * s + c] = 1;
		}
		for (let e = 0; e < c; e++) {
			let r = 0, i = e * s, a = i - s;
			for (let o = 0; o < s; o++) {
				r += t[i + o];
				let s = e > 0 ? n[a + o] : 0;
				n[i + o] = r + s;
			}
		}
		this.totalOccupiedCells = this.sat[this.totalCells - 1], this.invTotalOccupiedCells = 1 / (this.totalOccupiedCells || 1), this.globalAreaScale = this.totalCells * this.invTotalOccupiedCells;
	}
	getDensityFeatures(e, t, n, r) {
		let { minX: i, minY: a } = this.bounds, o = this.resX, s = this.resY, c = this.scaleX, l = this.scaleY, u = this.sat, d = this.invTotalOccupiedCells, f = this.globalAreaScale, p = Math.floor((e - i) * c), m = Math.floor((t - a) * l), h = Math.floor((n - i) * c), g = Math.floor((r - a) * l), _ = p < h ? p : h, v = p < h ? h : p, y = m < g ? m : g, b = m < g ? g : m;
		_ < 0 ? _ = 0 : _ >= o && (_ = o - 1), v < 0 ? v = 0 : v >= o && (v = o - 1), y < 0 ? y = 0 : y >= s && (y = s - 1), b < 0 ? b = 0 : b >= s && (b = s - 1);
		let x = b * o, S = u[x + v], C = y > 0 ? u[(y - 1) * o + v] : 0, w = _ > 0 ? u[x + _ - 1] : 0, T = _ > 0 && y > 0 ? u[(y - 1) * o + _ - 1] : 0, E = S - C - w + T, D = (v - _ + 1) * (b - y + 1);
		return {
			emptyRatio: 1 - E / D,
			globalCoverage: E * d,
			relativeDensity: E * f / D
		};
	}
}, B = new ce(0, { name: "omt-router" }), Jn = 10, Yn = Xt(), Xn = 200, Zn = 10 * 6e4, Qn = "v2", V = Object.freeze({
	IDLE: "idle",
	RUNNING: "running",
	CANCELLING: "cancelling",
	ERROR: "error"
}), $n = Object.freeze({
	cpu: "bidirectional-astar",
	bidirectionalAStar: "bidirectional-astar",
	adaptiveBarrier: "adaptive-barrier",
	deltaStepping: "delta-stepping",
	ultraDijkstra: "ultra-dijkstra"
}), H = Object.freeze({
	MISSING_RESULT: "missing_result",
	ENDPOINT_MISMATCH: "endpoint_mismatch",
	INVALID_PATH: "invalid_path",
	COST_MISMATCH: "cost_mismatch",
	NO_PATH: "no_path",
	NO_NODE: "no_node",
	POOR_SNAP: "poor_snap",
	INCOMPLETE_PATH: "incomplete_path",
	TILE_CORS: "tile_cors",
	NO_ROUTE: "no_route",
	INVALID_ROUTE: "invalid_route"
}), er = Object.freeze({
	ENGINE_ERROR: "engine_error",
	ENGINE_WORKER_FAILED: "engine_worker_failed",
	ENGINE_WORKER_CRASHED: "engine_worker_crashed",
	ENGINE_WORKER_UNAVAILABLE: "engine_worker_unavailable",
	ENGINE_CANCELLED: "engine_cancelled",
	ENGINE_SHUTDOWN: "engine_shutdown",
	ENGINE_WORKER_BUSY: "engine_worker_busy"
});
function tr(e, t = "bidirectional-astar") {
	return typeof e != "string" || !e ? t : $n[e] ?? e;
}
var nr = .7;
function rr(e) {
	return e === "travelTime" || e === "optimal";
}
function ir(e, t) {
	let n = e.properties?.class ?? "", r = ue[t];
	return r ? Number(r[n] ?? 1) : 1;
}
function ar(e, t) {
	let n = ir(e, t);
	return e.travelTime * (1 + nr * (n - 1));
}
function or(e, t, n, r, i, a = {}) {
	let o = Or(t, n), s = e._prepared?.[t]?.[o];
	if (!s) {
		var c;
		s = Nr(e, t, n), (c = e._prepared ?? (e._prepared = {}))[t] ?? (c[t] = {}), e._prepared[t][o] = s;
	}
	return s.metrics = Hn(s, e, r, i, a), s;
}
var sr = null, cr = 0, U = /* @__PURE__ */ new Map(), lr = null, ur = 0, W = {
	state: V.IDLE,
	running: !1,
	engineId: null,
	requestId: null,
	requestCount: 0,
	startedAt: null,
	lastError: null
}, dr = /* @__PURE__ */ new Set();
function G(e) {
	W = {
		...W,
		...e
	};
	for (let e of dr) try {
		e({ ...W });
	} catch {}
}
function fr(e) {
	for (let t of U.values()) t.reject(e);
	U.clear();
}
function pr() {
	if (sr) {
		try {
			sr.terminate();
		} catch {}
		sr = null, lr = null;
	}
}
function mr(e, t = er.ENGINE_ERROR) {
	let n = Error(e);
	return n.code = t, n;
}
function hr() {
	return sr || (typeof Worker > "u" ? null : (sr = new Vn(), sr.onmessage = (e) => {
		let t = e.data ?? {};
		if (t.type === "status") {
			let e = t.requestId == null ? null : U.get(t.requestId), n = U.size;
			t.state === V.RUNNING ? G({
				state: V.RUNNING,
				running: !0,
				engineId: tr(t.engineId, e?.engineId ?? null),
				requestId: e?.requestId ?? null,
				requestCount: n,
				startedAt: e?.startedAt ?? Date.now(),
				lastError: null
			}) : t.state === V.ERROR ? G({
				state: V.ERROR,
				running: n > 0,
				engineId: null,
				requestId: null,
				requestCount: n,
				startedAt: null,
				lastError: t.error ?? "engine worker error"
			}) : t.state === V.IDLE && G({
				state: n > 0 ? V.RUNNING : V.IDLE,
				running: n > 0,
				engineId: n > 0 ? W.engineId : null,
				requestId: n > 0 ? W.requestId : null,
				requestCount: n,
				startedAt: n > 0 ? W.startedAt : null,
				lastError: null
			});
			return;
		}
		if (t.type !== "result") return;
		let n = U.get(t.requestId);
		if (!n) return;
		U.delete(t.requestId);
		let { resolve: r, reject: i } = n;
		if (t.ok) {
			G({
				state: U.size > 0 ? V.RUNNING : V.IDLE,
				running: U.size > 0,
				engineId: U.size > 0 ? W.engineId : null,
				requestId: U.size > 0 ? W.requestId : null,
				requestCount: U.size,
				startedAt: U.size > 0 ? W.startedAt : null,
				lastError: null
			}), r(t.result);
			return;
		}
		G({
			state: V.ERROR,
			running: !1,
			engineId: null,
			requestId: null,
			startedAt: null,
			lastError: t.error?.message ?? "engine worker error"
		}), i(mr(t.error?.message ?? "engine worker failed", er.ENGINE_WORKER_FAILED));
	}, sr.onerror = (e) => {
		let t = e?.message ?? "engine worker crashed", n = mr(t, er.ENGINE_WORKER_CRASHED);
		G({
			state: V.ERROR,
			running: !1,
			engineId: null,
			requestId: null,
			requestCount: 0,
			startedAt: null,
			lastError: t
		}), pr(), fr(n);
	}, sr));
}
function gr(e) {
	return e._engineWorkerPreparedId || (e._engineWorkerPreparedId = `prepared-${++ur}`), e._engineWorkerPreparedId;
}
function _r(e) {
	return e._engineWorkerBackup || (e._engineWorkerBackup = {
		adjPtr: e.adjPtr.slice(),
		adjTo: e.adjTo.slice(),
		adjCost: e.adjCost.slice(),
		revAdjPtr: e.revAdjPtr.slice(),
		revAdjFrom: e.revAdjFrom.slice(),
		revAdjCost: e.revAdjCost.slice()
	}), e._engineWorkerBackup;
}
function vr(e) {
	let t = e._engineWorkerBackup;
	t && (e.adjPtr = t.adjPtr, e.adjTo = t.adjTo, e.adjCost = t.adjCost, e.revAdjPtr = t.revAdjPtr, e.revAdjFrom = t.revAdjFrom, e.revAdjCost = t.revAdjCost);
}
function yr(e) {
	if (!e._coordsX || !e._coordsY) {
		let t = new Float32Array(e.N), n = new Float32Array(e.N);
		for (let r = 0; r < e.N; r += 1) {
			let i = e.coordsArr[r];
			t[r] = i?.[0] ?? 0, n[r] = i?.[1] ?? 0;
		}
		e._coordsX = t, e._coordsY = n;
	}
	return _r(e), {
		preparedId: gr(e),
		adjPtr: e.adjPtr,
		adjTo: e.adjTo,
		adjCost: e.adjCost,
		revAdjPtr: e.revAdjPtr,
		revAdjFrom: e.revAdjFrom,
		revAdjCost: e.revAdjCost,
		N: e.N,
		E: e.E,
		coordsX: e._coordsX,
		coordsY: e._coordsY,
		costField: e.costField
	};
}
function br(e) {
	return [
		e.adjPtr.buffer,
		e.adjTo.buffer,
		e.adjCost.buffer,
		e.revAdjPtr.buffer,
		e.revAdjFrom.buffer,
		e.revAdjCost.buffer,
		e.coordsX.buffer,
		e.coordsY.buffer
	];
}
async function xr(e, t, n, r, i, { forceSerialRouting: a = !1, parallelPolicy: o = null } = {}) {
	switch (e) {
		case "bidirectional-astar": return B.log(() => `bidirectional A* (E=${r.E}, beeline=${i.toFixed(0)} m)`), hn(t, n, r);
		case "adaptive-barrier": return B.log(() => `adaptive barrier SSP (E=${r.E}, beeline=${i.toFixed(0)} m)`), wn(t, n, r, {
			forceSerialRouting: a,
			minNodesForParallel: o?.minNodesForParallel,
			minFrontierForParallel: o?.minFrontierForParallel
		});
		case "delta-stepping": return B.log(() => `delta stepping (E=${r.E}, beeline=${i.toFixed(0)} m)`), Fn(t, n, r, {
			forceSerialRouting: a,
			minFrontierForParallel: o?.minFrontierForParallel
		});
		case "ultra-dijkstra": return B.log(() => `ultra dijkstra (E=${r.E}, beeline=${i.toFixed(0)} m)`), Rn(t, n, r);
		default: return B.warn(`unknown selectedEngine: ${e}, falling back to ultra-dijkstra`), Rn(t, n, r);
	}
}
async function Sr(e, t, n, r, { forceSerialRouting: i = !1, parallelPolicy: a = null } = {}) {
	let o = hr();
	if (!o) throw mr("engine worker is unavailable", er.ENGINE_WORKER_UNAVAILABLE);
	let s = ++cr, c = Date.now();
	return await new Promise((l, u) => {
		U.set(s, {
			requestId: s,
			resolve: l,
			reject: u,
			engineId: e,
			startedAt: c
		}), G({
			state: V.RUNNING,
			running: !0,
			engineId: e,
			requestId: s,
			requestCount: U.size,
			startedAt: c,
			lastError: null
		});
		let d = gr(r);
		if (lr !== d) {
			let e = yr(r);
			try {
				o.postMessage({
					type: "prepare",
					prepared: e
				}, br(e));
			} finally {
				vr(r);
			}
			lr = d;
		}
		o.postMessage({
			type: "run",
			requestId: s,
			engineId: e,
			startId: t,
			endId: n,
			forceSerialRouting: i,
			parallelPolicy: a,
			preparedId: d
		});
	});
}
function Cr() {
	return { ...W };
}
function wr(e) {
	return typeof e == "function" ? (dr.add(e), e({ ...W }), () => {
		dr.delete(e);
	}) : () => {};
}
function Tr(e = "cancelled") {
	return U.size === 0 ? !1 : (G({
		state: V.CANCELLING,
		running: !0,
		lastError: e,
		requestCount: U.size
	}), pr(), fr(mr(`routing cancelled: ${e}`, er.ENGINE_CANCELLED)), G({
		state: V.IDLE,
		running: !1,
		engineId: null,
		requestId: null,
		requestCount: 0,
		startedAt: null,
		lastError: e
	}), !0);
}
function Er(e = "shutdown") {
	U.size > 0 && (G({
		state: V.CANCELLING,
		running: !0,
		lastError: e,
		requestCount: U.size
	}), fr(mr(`engine shutdown: ${e}`, er.ENGINE_SHUTDOWN))), pr(), G({
		state: V.IDLE,
		running: !1,
		engineId: null,
		requestId: null,
		requestCount: 0,
		startedAt: null,
		lastError: null
	});
}
function Dr(e, t, n, r) {
	return [
		Qn,
		e.N,
		e.E,
		t,
		n,
		e.costField,
		e.penaltyKey,
		r
	].join(":");
}
function Or(e, t = {}) {
	if (!rr(e)) return "none";
	let { intersectionPenaltySec: n } = at(t);
	return `i${n}`;
}
function kr(e, t) {
	return Math.max(1, Math.max(Math.abs(e), Math.abs(t)) * .02);
}
function Ar(e, t) {
	return !Number.isFinite(e) || !Number.isFinite(t) ? !0 : Math.abs(e - t) > kr(e, t);
}
function jr(e, t) {
	if (!Array.isArray(e) || e.length === 0) return null;
	let { adjPtr: n, adjTo: r, adjCost: i, adjCostMap: a } = t, o = 0, s = e.length;
	for (let t = 1; t < s; t++) {
		let s = e[t - 1], c = e[t], l = -1;
		if (a) {
			let e = a[s];
			if (Array.isArray(e)) e[0] === c && (l = e[1]);
			else if (e instanceof Map) {
				let t = e.get(c);
				t !== void 0 && (l = t);
			}
		}
		if (l < 0) {
			let e = n[s], t = n[s + 1];
			for (let n = e; n < t; n++) if (r[n] === c) {
				l = i[n];
				break;
			}
		}
		if (l < 0) return null;
		o += l;
	}
	return o / Jn;
}
function Mr(e, t, n = null) {
	if (!e?.found) return {
		valid: !!e,
		actualCost: e?.cost ?? null,
		reason: e ? null : H.MISSING_RESULT
	};
	let r = Array.isArray(e.path) ? e.path : [];
	if (n && r.length > 0) {
		let { startId: e, endId: t } = n;
		if (r[0] !== e || r[r.length - 1] !== t) return {
			valid: !1,
			actualCost: null,
			reason: H.ENDPOINT_MISMATCH
		};
	}
	let i = jr(r, t);
	return Number.isFinite(i) ? Ar(i, e.cost) ? {
		valid: !1,
		actualCost: i,
		reason: H.COST_MISMATCH
	} : {
		valid: !0,
		actualCost: i,
		reason: null
	} : {
		valid: !1,
		actualCost: null,
		reason: H.INVALID_PATH
	};
}
function Nr(e, t = "distance", n = {}) {
	let { nodes: r, edges: i } = e, a = r.size, o = at(n), s = rr(t) && o.intersectionPenaltySec > 0, c = null;
	if (s) {
		let e = new Int32Array(a);
		for (let t of i) t.cost !== -1 && (e[t.source]++, e[t.target]++), t.reverseCost !== -1 && (e[t.target]++, e[t.source]++);
		c = new Uint8Array(a);
		for (let t = 0; t < a; t++) c[t] = +(e[t] >= 3);
	}
	let l = i.length * 2, u = new Int32Array(l), d = new Int32Array(l), f = new Int32Array(l), p = new Int32Array(l * 3), m = new Int32Array(l * 3), h = 0, g = 0, _ = 0, v = /* @__PURE__ */ new Map(), y = (e, t, n) => {
		let r = s && c && c[t] ? o.intersectionPenaltySec : 0, i = v.get(e);
		if (i || (i = /* @__PURE__ */ new Set(), v.set(e, i)), i.has(t)) return;
		i.add(t);
		let a = Math.round((n + r) * Jn);
		u[h] = e, d[h] = t, f[h] = a, h++, p[g++] = e, p[g++] = t, p[g++] = a, m[_++] = t, m[_++] = e, m[_++] = a;
	};
	for (let n of i) {
		let r = rr(t), i = n.cost === -1 ? -1 : r ? t === "optimal" ? ar(n, e.mode) : n.travelTime : n.length, a = n.reverseCost === -1 ? -1 : r ? t === "optimal" ? ar(n, e.mode) : n.travelTime : n.length;
		i !== -1 && y(n.source, n.target, i), a !== -1 && y(n.target, n.source, a);
	}
	let b = h, x = u.subarray(0, b), S = d.subarray(0, b), C = f.subarray(0, b), w = new Int32Array(a + 1), T = new Int32Array(b), E = new Int32Array(b);
	for (let e = 0; e < g; e += 3) w[p[e] + 1]++;
	for (let e = 0; e < a; e++) w[e + 1] += w[e];
	let D = w.slice(0, a);
	for (let e = 0; e < g; e += 3) {
		let t = p[e], n = p[e + 1], r = p[e + 2], i = D[t]++;
		T[i] = n, E[i] = r;
	}
	let O = new Int32Array(a + 1), k = new Int32Array(b), A = new Int32Array(b);
	for (let e = 0; e < _; e += 3) O[m[e] + 1]++;
	for (let e = 0; e < a; e++) O[e + 1] += O[e];
	let ee = O.slice(0, a);
	for (let e = 0; e < _; e += 3) {
		let t = m[e], n = m[e + 1], r = m[e + 2], i = ee[t]++;
		k[i] = n, A[i] = r;
	}
	let j = Array(a);
	for (let e = 0; e < a; e++) j[e] = r.get(e).coords;
	let M = Array(a);
	for (let e = 0; e < a; e++) {
		let t = w[e], n = w[e + 1], r = n - t;
		if (r === 0) continue;
		if (r === 1) {
			M[e] = [T[t], E[t]];
			continue;
		}
		let i = /* @__PURE__ */ new Map();
		for (let e = t; e < n; e++) i.set(T[e], E[e]);
		M[e] = i;
	}
	let te = x, ne = S, re = C;
	if (e.mode === "pedestrian") {
		let e = /* @__PURE__ */ new Map();
		for (let t = 0; t < x.length; t++) {
			let n = x[t], r = S[t], i = n < r ? n : r, a = n < r ? r : n, o = i + ":" + a, s = C[t], c = e.get(o);
			(c === void 0 || s < c) && e.set(o, s);
		}
		let t = Array.from(e.entries()), n = t.length, r = new Int32Array(n), i = new Int32Array(n), a = new Int32Array(n), o = 0;
		for (let [e, n] of t) {
			let [t, s] = e.split(":").map(Number);
			r[o] = t, i[o] = s, a[o] = n, o++;
		}
		te = r, ne = i, re = a;
	}
	return {
		edgeSrc: te,
		edgeTgt: ne,
		edgeCostInt: re,
		adjPtr: w,
		adjTo: T,
		adjCost: E,
		adjCostMap: M,
		revAdjPtr: O,
		revAdjFrom: k,
		revAdjCost: A,
		N: a,
		E: b,
		nodes: r,
		coordsArr: j,
		costField: t,
		penalties: o,
		penaltyKey: Or(t, o),
		distScale: Jn,
		coordsAreGeographic: e.coordsAreGeographic === !0
	};
}
async function Pr(e, t, n, { forceEngine: r = null, engineId: i = "auto", graphCategory: a = "", costField: o = n.costField ?? "distance", useCache: s = !0, allowFallback: c = !0, forceSerialRouting: l = !1 } = {}) {
	if (!Number.isInteger(e) || e < 0) throw Error("Invalid startId: expected a non-negative integer.");
	if (!Number.isInteger(t) || t < 0) throw Error("Invalid endId: expected a non-negative integer.");
	if (!n || typeof n != "object" || !Array.isArray(n.coordsArr) || !ArrayBuffer.isView(n.adjPtr)) throw Error("Invalid prepared graph object: expected result of buildCH().");
	s && (n._routeCache ?? (n._routeCache = new b({
		maxEntries: Xn,
		defaultTTL: Zn
	})));
	let u = n.coordsArr[e], d = n.coordsArr[t], f = F(u, d), p = Yn, m = i === "auto" ? tn(n.metrics) : i, h = tr(m, "bidirectional-astar"), g = !!l, _ = null;
	g || (_ = en(h, p), g = !_);
	let v = Dr(n, e, t, h);
	if (s) {
		let r = n._routeCache.get(v);
		if (r) {
			if (r._routeValidated) {
				B.log(() => `route cache hit (${v})`);
				let { _routeValidated: e, ...t } = r;
				return {
					...t,
					engine: tr(t.engine, h),
					cost: Number.isFinite(t.cost) ? t.cost : Infinity
				};
			}
			let i = Mr(r, n, {
				startId: e,
				endId: t
			});
			if (i.valid) {
				r._routeValidated = !0, B.log(() => `route cache hit (${v})`);
				let { _routeValidated: e, ...t } = r;
				return {
					...t,
					engine: tr(t.engine, h),
					cost: Number.isFinite(i.actualCost) ? i.actualCost : t.cost
				};
			}
			B.warn(`route cache stale/invalid (${i.reason ?? "unknown"}), recomputing (${v})`);
		}
	}
	r === "gpu" && B.warn("forceEngine=\"gpu\" requested, but GPU routing has been removed; using CPU routing");
	let y, x = null;
	if (typeof Worker > "u") y = await xr(h, e, t, n, f, {
		forceSerialRouting: g,
		parallelPolicy: _
	});
	else try {
		y = await Sr(h, e, t, n, {
			forceSerialRouting: g,
			parallelPolicy: _
		});
	} catch (r) {
		if (r?.code === er.ENGINE_CANCELLED || r?.code === er.ENGINE_WORKER_BUSY) throw r;
		B.warn(`engine worker unavailable (${r?.code ?? "unknown_error"}), falling back to main thread execution`), y = await xr(h, e, t, n, f, {
			forceSerialRouting: g,
			parallelPolicy: _
		});
	}
	y = {
		...y,
		engine: tr(y?.engine, m)
	};
	let S = Mr(y, n, {
		startId: e,
		endId: t
	});
	if (y?.found && !S.valid && c) {
		B.warn(`engine "${h}" returned an invalid route (${S.reason}), retrying with bidirectional A*`), x = {
			from: h,
			to: "bidirectional-astar",
			reason: H.INVALID_ROUTE,
			detail: S.reason
		};
		try {
			y = await Sr("bidirectional-astar", e, t, n, { forceSerialRouting: g });
		} catch {
			y = hn(e, t, n);
		}
		y = {
			...y,
			engine: "bidirectional-astar"
		}, S = Mr(y, n, {
			startId: e,
			endId: t
		}), S.valid || (B.warn("bidirectional A* fallback also returned an invalid route; returning no_path"), y = {
			found: !1,
			path: [],
			cost: Infinity,
			engine: "bidirectional-astar"
		});
	}
	if (y?.found && Number.isFinite(S.actualCost) && (y = {
		...y,
		cost: S.actualCost
	}), !y?.found && h !== "bidirectional-astar" && c) {
		B.warn(`engine "${h}" returned no path, retrying with bidirectional A* for correctness`), x = {
			from: h,
			to: "bidirectional-astar",
			reason: H.NO_PATH,
			detail: null
		};
		try {
			y = await Sr("bidirectional-astar", e, t, n, { forceSerialRouting: g });
		} catch {
			y = hn(e, t, n);
		}
		y = {
			...y,
			engine: "bidirectional-astar"
		};
	}
	return x && (y = {
		...y,
		fallback: x
	}), y?.found || (y = {
		...y,
		reason: y?.reason ?? H.NO_PATH
	}), s && n._routeCache.set(v, {
		...y,
		_routeValidated: !0
	}), y;
}
async function Fr(e, t, n, r = {}) {
	if (!n || typeof n != "object" || !(n.nodes instanceof Map) || !Array.isArray(n.edges)) throw Error("Invalid graph: expected object with nodes Map and edges array.");
	let { costField: i = "distance", penalties: a = {}, snapDistancesM: o, graphCategory: s = "", maxAcceptableSnapDistanceM: c = 60, engineId: l = "auto" } = r, u = at(a);
	rr(i) && u.turnPenaltySec > 0 && B.warn("turn penalties are currently ignored; using standard engine routing"), B.log(() => `computeRoute: graph has ${n.nodes.size} nodes, ${n.edges.length} edges`);
	let d = Array.isArray(o) && o.length > 0 ? o : [
		250,
		500,
		800
	], f = -1, p = -1, m = d[d.length - 1];
	if (!bt(e) || !bt(t)) return {
		path: [],
		coordinates: [],
		cost: Infinity,
		costField: i,
		found: !1,
		reason: "no_node"
	};
	let h = n;
	for (let n of d) if (f = Ct(e, h, n), p = Ct(t, h, n), m = n, f !== -1 && p !== -1) break;
	if (B.log(() => `nearestNode: start=${f}, end=${p}, snap=${m} m`), !bt(e) || !bt(t)) return {
		path: [],
		coordinates: [],
		cost: Infinity,
		costField: i,
		found: !1,
		reason: H.NO_NODE
	};
	(f === -1 || p === -1) && B.warn(() => `No node found within ${m} m of start or end coordinates`);
	let g = f === -1 ? Infinity : F(e, h.nodes.get(f).coords), _ = p === -1 ? Infinity : F(t, h.nodes.get(p).coords), v = Pt(e, h, d, c), y = Pt(t, h, d, c), b = v.segmentSnap, x = y.segmentSnap, S = !1, C = !1, w = h, T = f, E = p, D = g, O = _;
	if (v.type === "segment" ? (h = Mt(h, v.segmentSnap), f = h._lastAddedNodeId ?? h.nodes.size - 1, g = v.snapDistanceM, S = !0, y = Pt(t, h, d, c), x = y.segmentSnap, _ = y.snapDistanceM) : v.type === "node" && (f = v.nodeId, g = v.snapDistanceM), y.type === "segment" ? (h = Mt(h, y.segmentSnap), p = h._lastAddedNodeId ?? h.nodes.size - 1, _ = y.snapDistanceM, C = !0) : y.type === "node" && (p = y.nodeId, _ = y.snapDistanceM), f === -1 || p === -1) return {
		path: [],
		coordinates: [],
		cost: Infinity,
		costField: i,
		found: !1,
		reason: H.NO_NODE
	};
	if (g > c || _ > c) return B.warn(() => `Poor snap quality: start=${g.toFixed(0)} m, end=${_.toFixed(0)} m`), {
		path: [],
		coordinates: [],
		cost: Infinity,
		costField: i,
		found: !1,
		reason: H.POOR_SNAP,
		startSnapDistanceM: g,
		endSnapDistanceM: _
	};
	if (f === p) {
		let e = h.nodes.get(f).coords;
		return {
			path: [f],
			coordinates: [e],
			cost: 0,
			costField: i,
			found: !0,
			engine: "bidirectional-astar",
			startSnapDistanceM: g,
			endSnapDistanceM: _
		};
	}
	let k = or(h, i, u, f, p);
	B.log("dispatching route query...");
	let A = await Pr(f, p, k, {
		engineId: l,
		graphCategory: s,
		costField: i
	});
	if (!A.found) {
		let e = b && !S && b.distanceM <= c, t = x && !C && x.distanceM <= c;
		if ((A.reason === H.NO_PATH || A.reason === H.INCOMPLETE_PATH) && (e || t)) {
			let n = h, r = f, a = p;
			if (e && (n = Mt(n, b), r = n._lastAddedNodeId ?? n.nodes.size - 1), t && (n = Mt(n, x), a = n._lastAddedNodeId ?? n.nodes.size - 1), n !== h) {
				let e = or(n, i, u, r, a), t = await Pr(r, a, e, {
					graphCategory: s,
					costField: i
				});
				if (t.found) {
					let e = t.path.map((e) => n.nodes.get(e).coords);
					return {
						...t,
						coordinates: e,
						costField: i,
						engine: tr(t.engine, "bidirectional-astar"),
						startSnapDistanceM: g,
						endSnapDistanceM: _
					};
				}
			}
		}
		if ((S || C) && (A.reason === H.NO_PATH || A.reason === H.INCOMPLETE_PATH)) {
			let e = await Pr(T, E, or(w, i, u, T, E), {
				graphCategory: s,
				costField: i
			});
			if (e.found) {
				let t = e.path.map((e) => w.nodes.get(e).coords);
				return {
					...e,
					coordinates: t,
					costField: i,
					engine: tr(e.engine, "bidirectional-astar"),
					startSnapDistanceM: D,
					endSnapDistanceM: O
				};
			}
		}
		return {
			...A,
			coordinates: [],
			costField: i,
			reason: H.NO_PATH
		};
	}
	let ee = A.path.length, j = Array(ee);
	for (let e = 0; e < ee; e++) {
		let t = A.path[e], n = h.nodes.get(t);
		if (!n?.coords) return B.warn(() => `incomplete path: missing node ${t}`), {
			path: [],
			coordinates: [],
			cost: Infinity,
			costField: i,
			found: !1,
			reason: H.INCOMPLETE_PATH,
			startSnapDistanceM: g,
			endSnapDistanceM: _
		};
		j[e] = n.coords;
	}
	if (j.length !== A.path.length) return B.warn("incomplete path: path/coordinates length mismatch"), {
		path: [],
		coordinates: [],
		cost: Infinity,
		costField: i,
		found: !1,
		reason: H.INCOMPLETE_PATH,
		startSnapDistanceM: g,
		endSnapDistanceM: _
	};
	let M = tr(A.engine, "bidirectional-astar");
	return {
		...A,
		coordinates: j,
		costField: i,
		engine: M,
		startSnapDistanceM: g,
		endSnapDistanceM: _
	};
}
var Ir = {
	en: {
		title: "Route Planner",
		tabs: {
			routing: "Routing",
			isolines: "Isolines"
		},
		modes: {
			pedestrian: "Walk",
			car: "Car",
			bicycle: "Bike"
		},
		modeTitles: {
			pedestrian: "Walking",
			car: "Driving",
			bicycle: "Cycling"
		},
		optimizeFor: "Optimize for",
		costLabels: {
			distance: "Shortest",
			travelTime: "Fastest",
			optimal: "Optimal"
		},
		costTitles: {
			distance: "Shortest route",
			travelTime: "Fastest route",
			optimal: "Optimal route"
		},
		originPlaceholder: "Origin (lat, lng)",
		destinationPlaceholder: "Destination (lat, lng)",
		reverseRoute: "Reverse route direction",
		leftClick: "Left-click",
		rightClick: "Right-click",
		setOrigin: "set origin",
		setDestination: "set destination",
		stats: {
			distance: "Distance",
			estTime: "Est. time",
			travelTime: "Travel time"
		},
		isoline: {
			heading: "Isolines",
			from: "From",
			to: "To",
			pointPlaceholder: "Point (lat, lng)",
			calculate: "Calculate",
			hint: ""
		},
		status: {
			tileMetadata: "Failed to load tile metadata. Check the configured url and network.",
			waitingStyle: "Waiting for map style to finish loading before displaying the route.",
			tileUrl: "Tile URL not yet available. Provide urlTemplate or valid tileJsonUrl.",
			engineBusy: "Routing engine is busy. Waiting for the current route to finish…",
			calculating: "Calculating route…",
			timedOut: "Routing timed out and was cancelled. Try a shorter route or retry.",
			cancelled: "Routing was cancelled.",
			tileCors: "Tile request blocked. Check that your tile server allows requests from this origin.",
			poorSnap: "No route found because one or both points snapped poorly. Try placing points closer to roads.",
			noNode: "No route found because one endpoint could not snap to the loaded graph. Try moving the points closer to roads or a different area.",
			noPath: "No route found because the loaded graph is disconnected or the corridor is too narrow for the requested path.",
			incompletePath: "Routing engine returned an incomplete path. This can happen when the graph data is inconsistent or a path is missing.",
			noRoute: "No route found between these points. This can be caused by a disconnected graph, snapping issue, or another routing failure.",
			routeErrorPrefix: "Routing error —"
		}
	},
	es: {
		title: "Planificador",
		tabs: {
			routing: "Rutas",
			isolines: "Isolíneas"
		},
		modes: {
			pedestrian: "Caminar",
			car: "Coche",
			bicycle: "Bici"
		},
		modeTitles: {
			pedestrian: "Caminando",
			car: "Conducción",
			bicycle: "Ciclismo"
		},
		optimizeFor: "Optimizar",
		costLabels: {
			distance: "Más corta",
			travelTime: "Más rápida",
			optimal: "Óptima"
		},
		costTitles: {
			distance: "Ruta más corta",
			travelTime: "Ruta más rápida",
			optimal: "Ruta óptima"
		},
		originPlaceholder: "Origen (lat, lng)",
		destinationPlaceholder: "Destino (lat, lng)",
		reverseRoute: "Invertir dirección",
		leftClick: "Clic izq.",
		rightClick: "Clic der.",
		setOrigin: "fijar origen",
		setDestination: "fijar destino",
		stats: {
			distance: "Distancia",
			estTime: "Tiempo",
			travelTime: "Duración"
		},
		isoline: {
			heading: "Isolíneas",
			from: "Desde",
			to: "Hasta",
			pointPlaceholder: "Punto (lat, lng)",
			calculate: "Calcular",
			hint: ""
		},
		status: {
			tileMetadata: "Error al cargar metadatos de mosaicos. Revisa la URL y la red.",
			waitingStyle: "Esperando que el estilo del mapa termine de cargar antes de mostrar la ruta.",
			tileUrl: "URL de mosaico no disponible. Proporciona urlTemplate o tileJsonUrl válido.",
			engineBusy: "Motor ocupado. Esperando a que termine la ruta actual…",
			calculating: "Calculando ruta…",
			timedOut: "El enrutamiento agotó el tiempo y fue cancelado. Prueba una ruta más corta o reintenta.",
			cancelled: "Enrutamiento cancelado.",
			tileCors: "Solicitud de mosaico bloqueada. Comprueba que el servidor permita solicitudes desde este origen.",
			poorSnap: "No se encontró ruta porque uno o ambos puntos encajaron mal. Acerca los puntos a las vías.",
			noNode: "No se encontró ruta porque un punto no pudo enlazar con la red cargada. Mueve los puntos más cerca de vías o a otra zona.",
			noPath: "No se encontró ruta porque la red está desconectada o el corredor es muy estrecho.",
			incompletePath: "El motor devolvió una ruta incompleta. Puede ocurrir cuando los datos de la red son inconsistentes.",
			noRoute: "No hay ruta entre estos puntos. Puede deberse a una red desconectada, problema de encaje o fallo de enrutamiento.",
			routeErrorPrefix: "Error de enrutamiento —"
		}
	},
	ca: {
		title: "Planificador",
		tabs: {
			routing: "Rutes",
			isolines: "Isolinies"
		},
		modes: {
			pedestrian: "Caminar",
			car: "Cotxe",
			bicycle: "Bici"
		},
		modeTitles: {
			pedestrian: "Caminant",
			car: "Conducció",
			bicycle: "Ciclisme"
		},
		optimizeFor: "Optimitza",
		costLabels: {
			distance: "Més curta",
			travelTime: "Més ràpida",
			optimal: "Òptima"
		},
		costTitles: {
			distance: "Ruta més curta",
			travelTime: "Ruta més ràpida",
			optimal: "Ruta òptima"
		},
		originPlaceholder: "Origen (lat, lng)",
		destinationPlaceholder: "Destí (lat, lng)",
		reverseRoute: "Canvia direcció",
		leftClick: "Clic esq.",
		rightClick: "Clic dret",
		setOrigin: "fixa origen",
		setDestination: "fixa destí",
		stats: {
			distance: "Distància",
			estTime: "Temps",
			travelTime: "Durada"
		},
		isoline: {
			heading: "Isolinies",
			from: "Des de",
			to: "Fins a",
			pointPlaceholder: "Punt (lat, lng)",
			calculate: "Calcula",
			hint: ""
		},
		status: {
			tileMetadata: "Error en carregar metadades de mosaics. Revisa la URL i la xarxa.",
			waitingStyle: "Esperant que l’estil del mapa acabi de carregar abans de mostrar la ruta.",
			tileUrl: "URL de mosaic no disponible. Proporciona urlTemplate o tileJsonUrl vàlid.",
			engineBusy: "Motor ocupat. Esperant que acabi la ruta actual…",
			calculating: "Calculant ruta…",
			timedOut: "Temps esgotat i enrutament cancel·lat. Prova una ruta més curta o reintenta.",
			cancelled: "Enrutament cancel·lat.",
			tileCors: "Sol·licitud de mosaic bloquejada. Comprova que el servidor permeti sol·licituds des d’aquest origen.",
			poorSnap: "No s’ha trobat ruta perquè un o ambdós punts s’han ajustat malament. Acosta els punts a la via.",
			noNode: "No s’ha trobat ruta perquè un punt no ha pogut ajustar-se a la xarxa carregada. Mou els punts més a prop de la via o a una altra zona.",
			noPath: "No s’ha trobat ruta perquè la xarxa està desconnectada o el corredor és massa estret.",
			incompletePath: "El motor ha retornat una ruta incompleta. Pot passar quan les dades de la xarxa són inconsistents.",
			noRoute: "No hi ha ruta entre aquests punts. Pot ser a causa d’una xarxa desconnectada, un problema d’ajust o un error d’enrutament.",
			routeErrorPrefix: "Error d’enrutament —"
		}
	},
	gl: {
		title: "Planificador",
		tabs: {
			routing: "Rutas",
			isolines: "Isolíneas"
		},
		modes: {
			pedestrian: "Caminar",
			car: "Coche",
			bicycle: "Bici"
		},
		modeTitles: {
			pedestrian: "Caminando",
			car: "Condución",
			bicycle: "Ciclismo"
		},
		optimizeFor: "Optimizar",
		costLabels: {
			distance: "Máis curta",
			travelTime: "Máis rápida",
			optimal: "Óptima"
		},
		costTitles: {
			distance: "Ruta máis curta",
			travelTime: "Ruta máis rápida",
			optimal: "Ruta óptima"
		},
		originPlaceholder: "Origen (lat, lng)",
		destinationPlaceholder: "Destino (lat, lng)",
		reverseRoute: "Invertir dirección",
		leftClick: "Clic izq.",
		rightClick: "Clic der.",
		setOrigin: "fijar orixe",
		setDestination: "fijar destino",
		stats: {
			distance: "Distancia",
			estTime: "Tempo",
			travelTime: "Duración"
		},
		isoline: {
			heading: "Isolíneas",
			from: "Desde",
			to: "Hasta",
			pointPlaceholder: "Punto (lat, lng)",
			calculate: "Calcular",
			hint: ""
		},
		status: {
			tileMetadata: "Erro ao cargar metadatos de mosaicos. Revisa a URL e a rede.",
			waitingStyle: "Agardando a que o estilo do mapa remate de cargarse antes de mostrar a ruta.",
			tileUrl: "URL de mosaico non dispoñible. Proporciona urlTemplate ou tileJsonUrl válido.",
			engineBusy: "Motor ocupado. Agardando a que remate a ruta actual…",
			calculating: "Calculando ruta…",
			timedOut: "Tempo esgotado e enrutamento cancelado. Proba unha ruta máis curta ou reintenta.",
			cancelled: "Enrutamento cancelado.",
			tileCors: "Solicitude de mosaico bloqueada. Comproba que o servidor permita solicitudes desde esta orixe.",
			poorSnap: "Non se atopou ruta porque un ou ambos os puntos axustáronse mal. Acerca os puntos ás vías.",
			noNode: "Non se atopou ruta porque un punto non puido axustarse á rede cargada. Move os puntos máis cerca das vías ou a outra zona.",
			noPath: "Non se atopou ruta porque a rede está desconectada ou o corredor é demasiado estreito.",
			incompletePath: "O motor devolveu unha ruta incompleta. Pode ocorrer cando os datos da rede son inconsistentes.",
			noRoute: "Non hai ruta entre estes puntos. Pode deberse a unha rede desconectada, problema de axuste ou fallo de enrutamento.",
			routeErrorPrefix: "Erro de enrutamento —"
		}
	},
	eu: {
		title: "Ibilbidea",
		tabs: {
			routing: "Ibilbidea",
			isolines: "Isolinak"
		},
		modes: {
			pedestrian: "Oinez",
			car: "Auto",
			bicycle: "Bizikleta"
		},
		modeTitles: {
			pedestrian: "Oinez",
			car: "Autoan",
			bicycle: "Bizikletan"
		},
		optimizeFor: "Optimiza",
		costLabels: {
			distance: "Laburrena",
			travelTime: "Azkarena",
			optimal: "Egokiena"
		},
		costTitles: {
			distance: "Laburrena",
			travelTime: "Azkarena",
			optimal: "Egokiena"
		},
		originPlaceholder: "Jatorria (lat, lng)",
		destinationPlaceholder: "Helmuga (lat, lng)",
		reverseRoute: "Norabidea aldatu",
		leftClick: "Ezker klik",
		rightClick: "Eskuin klik",
		setOrigin: "jatorria ezarri",
		setDestination: "helmuga ezarri",
		stats: {
			distance: "Distantzia",
			estTime: "Denbora",
			travelTime: "Bidai denbora"
		},
		isoline: {
			heading: "Isolinak",
			from: "From",
			to: "To",
			pointPlaceholder: "Puntu (lat, lng)",
			calculate: "Kalkulatu",
			hint: ""
		},
		status: {
			tileMetadata: "Tile metadatuak kargatzea huts egin du. Egiaztatu URLa eta sare konektibitatea.",
			waitingStyle: "Mapa estiloaren kargatzea amaitu arte itxaroten, ibilbidea erakutsi aurretik.",
			tileUrl: "Tile URLa oraindik ez dago eskuragarri. Jarri urlTemplate edo baliozko tileJsonUrl.",
			engineBusy: "Motorra lanpetuta dago. Orain arteko ibilbidea amaitu arte itxaroten…",
			calculating: "Ibilbidea kalkulatzen…",
			timedOut: "Denbora agortu da eta ibilbidea bertan behera utzi da. Saiatu ibilbide laburrago batekin edo berriro.",
			cancelled: "Ibilbidea bertan behera utzi da.",
			tileCors: "Tile eskaera blokeatuta. Egiaztatu tile zerbitzariak iturri hau baimentzen duen.",
			poorSnap: "Ez da ibilbiderik aurkitu puntuak gaizki lotu direlako. Gertuago jarri puntuak bideak.",
			noNode: "Ez da ibilbiderik aurkitu puntuak ez direlako sareko puntuarekin lotu. Mugitu puntuak bide gehiago dituzten eremura.",
			noPath: "Ez da ibilbiderik aurkitu sareak konektatu ez duelako edo korridorea ezinbestez estua delako.",
			incompletePath: "Motorak ibilbide osatu gabeko bat itzuli du. Sarea desegonkorrak direnean gertatu daiteke.",
			noRoute: "Puntu hauen artean ez dago ibilbiderik. Sare deskonektatu, lotura arazo edo ibilbide hutsaren ondorio izan daiteke.",
			routeErrorPrefix: "Ibilbide errorea —"
		}
	},
	fr: {
		title: "Plan de route",
		tabs: {
			routing: "Itinéraire",
			isolines: "Isolignes"
		},
		modes: {
			pedestrian: "Marche",
			car: "Voiture",
			bicycle: "Vélo"
		},
		modeTitles: {
			pedestrian: "À pied",
			car: "Conduite",
			bicycle: "Cyclisme"
		},
		optimizeFor: "Optimiser",
		costLabels: {
			distance: "Plus court",
			travelTime: "Plus rapide",
			optimal: "Optimal"
		},
		costTitles: {
			distance: "Trajet le plus court",
			travelTime: "Trajet le plus rapide",
			optimal: "Trajet optimal"
		},
		originPlaceholder: "Origine (lat, lng)",
		destinationPlaceholder: "Destination (lat, lng)",
		reverseRoute: "Inverser sens",
		leftClick: "Clic gauche",
		rightClick: "Clic droit",
		setOrigin: "placer origine",
		setDestination: "placer destination",
		stats: {
			distance: "Distance",
			estTime: "Temps",
			travelTime: "Durée"
		},
		isoline: {
			heading: "Isolignes",
			from: "Depuis",
			to: "Vers",
			pointPlaceholder: "Point (lat, lng)",
			calculate: "Calculer",
			hint: ""
		},
		status: {
			tileMetadata: "Impossible de charger les métadonnées des tuiles. Vérifiez l’URL et le réseau.",
			waitingStyle: "En attente de la fin du chargement du style avant d’afficher l’itinéraire.",
			tileUrl: "URL de tuile non disponible. Fournissez urlTemplate ou tileJsonUrl valide.",
			engineBusy: "Moteur occupé. En attente de la fin du calcul en cours…",
			calculating: "Calcul de l’itinéraire…",
			timedOut: "Le routage a expiré et a été annulé. Essayez un itinéraire plus court ou réessayez.",
			cancelled: "Routage annulé.",
			tileCors: "Requête de tuile bloquée. Vérifiez que votre serveur autorise les requêtes de cette origine.",
			poorSnap: "Aucun itinéraire trouvé car un ou plusieurs points ont mal accroché. Placez-les plus près des routes.",
			noNode: "Aucun itinéraire trouvé car un point n’a pas pu s’accrocher au graphe chargé. Déplacez-les près des routes ou ailleurs.",
			noPath: "Aucun itinéraire trouvé car le graphe est déconnecté ou le corridor trop étroit.",
			incompletePath: "Le moteur a retourné un itinéraire incomplet. Cela peut arriver lorsque les données du graphe sont incohérentes.",
			noRoute: "Aucun itinéraire entre ces points. Cela peut être causé par un graphe déconnecté, un problème d’accrochage ou un autre échec.",
			routeErrorPrefix: "Erreur de routage —"
		}
	},
	de: {
		title: "Routenplaner",
		tabs: {
			routing: "Routen",
			isolines: "Isolinien"
		},
		modes: {
			pedestrian: "Zu Fuß",
			car: "Auto",
			bicycle: "Rad"
		},
		modeTitles: {
			pedestrian: "Zu Fuß",
			car: "Fahren",
			bicycle: "Radfahren"
		},
		optimizeFor: "Optimieren",
		costLabels: {
			distance: "Kürzeste",
			travelTime: "Schnellste",
			optimal: "Optimal"
		},
		costTitles: {
			distance: "Kürzeste Route",
			travelTime: "Schnellste Route",
			optimal: "Optimale Route"
		},
		originPlaceholder: "Start (lat, lng)",
		destinationPlaceholder: "Ziel (lat, lng)",
		reverseRoute: "Richtung wechseln",
		leftClick: "Links-Klick",
		rightClick: "Rechts-Klick",
		setOrigin: "Start setzen",
		setDestination: "Ziel setzen",
		stats: {
			distance: "Distanz",
			estTime: "Zeit",
			travelTime: "Fahrzeit"
		},
		isoline: {
			heading: "Isolinien",
			from: "Von",
			to: "Bis",
			pointPlaceholder: "Punkt (lat, lng)",
			calculate: "Berechnen",
			hint: ""
		},
		status: {
			tileMetadata: "Kachel-Metadaten konnten nicht geladen werden. Prüfe URL und Netzwerk.",
			waitingStyle: "Warten auf das Laden des Kartenstils, bevor die Route angezeigt wird.",
			tileUrl: "Kachel-URL noch nicht verfügbar. Gib urlTemplate oder gültige tileJsonUrl an.",
			engineBusy: "Routing-Engine ist beschäftigt. Warte auf Abschluss der aktuellen Route…",
			calculating: "Route wird berechnet…",
			timedOut: "Routing-Zeitüberschreitung. Versuche eine kürzere Route oder erneut.",
			cancelled: "Routing abgebrochen.",
			tileCors: "Kachelanforderung blockiert. Prüfe, ob der Server Anfragen von dieser Herkunft erlaubt.",
			poorSnap: "Keine Route gefunden, da ein oder beide Punkte schlecht geclippt wurden. Platziere Punkte näher an Straßen.",
			noNode: "Keine Route gefunden, weil ein Punkt nicht am geladenen Graph befestigt werden konnte. Verschiebe die Punkte näher an Straßen oder in einen anderen Bereich.",
			noPath: "Keine Route gefunden, weil der Graph getrennt ist oder der Korridor zu schmal ist.",
			incompletePath: "Die Engine lieferte einen unvollständigen Pfad. Dies kann bei inkonsistenten Graphdaten passieren.",
			noRoute: "Zwischen diesen Punkten wurde keine Route gefunden. Ursache kann ein getrennter Graph, ein Snap-Problem oder ein anderer Fehler sein.",
			routeErrorPrefix: "Routing-Fehler —"
		}
	},
	ru: {
		title: "Маршрут",
		tabs: {
			routing: "Маршрут",
			isolines: "Изолинии"
		},
		modes: {
			pedestrian: "Пешком",
			car: "Авто",
			bicycle: "Вело"
		},
		modeTitles: {
			pedestrian: "Пешком",
			car: "Вождение",
			bicycle: "Велосипед"
		},
		optimizeFor: "Оптимизировать",
		costLabels: {
			distance: "Кратчайший",
			travelTime: "Самый быстрый",
			optimal: "Оптимальный"
		},
		costTitles: {
			distance: "Кратчайший маршрут",
			travelTime: "Самый быстрый маршрут",
			optimal: "Оптимальный маршрут"
		},
		originPlaceholder: "Начало (lat, lng)",
		destinationPlaceholder: "Финиш (lat, lng)",
		reverseRoute: "Поменять направление",
		leftClick: "Левый клик",
		rightClick: "Правый клик",
		setOrigin: "установить начало",
		setDestination: "установить финиш",
		stats: {
			distance: "Дистанция",
			estTime: "Время",
			travelTime: "Длительность"
		},
		isoline: {
			heading: "Изолинии",
			from: "От",
			to: "До",
			pointPlaceholder: "Точка (lat, lng)",
			calculate: "Вычислить",
			hint: ""
		},
		status: {
			tileMetadata: "Не удалось загрузить метаданные плиток. Проверьте URL и сеть.",
			waitingStyle: "Ожидание загрузки стиля карты перед отображением маршрута.",
			tileUrl: "URL плитки еще недоступен. Укажите urlTemplate или допустимый tileJsonUrl.",
			engineBusy: "Движок занят. Ожидание завершения текущего маршрута…",
			calculating: "Вычисление маршрута…",
			timedOut: "Время маршрутизации истекло, действие отменено. Попробуйте более короткий маршрут или повторите.",
			cancelled: "Маршрутизация отменена.",
			tileCors: "Запрос плитки заблокирован. Проверьте, что сервер разрешает запросы с этого источника.",
			poorSnap: "Маршрут не найден, потому что одна или обе точки плохо привязались. Поместите точки ближе к дорогам.",
			noNode: "Маршрут не найден, потому что одна точка не смогла привязаться к загруженному графу. Переместите точки ближе к дорогам или в другой район.",
			noPath: "Маршрут не найден, потому что граф разомкнут или коридор слишком узкий.",
			incompletePath: "Движок вернул неполный маршрут. Это может случиться при неконсистентных данных графа.",
			noRoute: "Между этими точками нет маршрута. Это может быть из-за разомкнутого графа, проблемы привязки или другой ошибки.",
			routeErrorPrefix: "Ошибка маршрутизации —"
		}
	},
	ja: {
		title: "ルート",
		tabs: {
			routing: "ルート",
			isolines: "等値線"
		},
		modes: {
			pedestrian: "徒歩",
			car: "車",
			bicycle: "自転車"
		},
		modeTitles: {
			pedestrian: "徒歩",
			car: "運転",
			bicycle: "サイクリング"
		},
		optimizeFor: "最適化",
		costLabels: {
			distance: "最短",
			travelTime: "最速",
			optimal: "最適"
		},
		costTitles: {
			distance: "最短ルート",
			travelTime: "最速ルート",
			optimal: "最適ルート"
		},
		originPlaceholder: "出発地 (lat, lng)",
		destinationPlaceholder: "目的地 (lat, lng)",
		reverseRoute: "方向を反転",
		leftClick: "左クリック",
		rightClick: "右クリック",
		setOrigin: "出発地設定",
		setDestination: "目的地設定",
		stats: {
			distance: "距離",
			estTime: "時間",
			travelTime: "所要時間"
		},
		isoline: {
			heading: "等値線",
			from: "始点",
			to: "終点",
			pointPlaceholder: "点 (lat, lng)",
			calculate: "計算",
			hint: ""
		},
		status: {
			tileMetadata: "タイルメタデータの読み込みに失敗しました。URLとネットワークを確認してください。",
			waitingStyle: "ルートを表示する前に地図スタイルの読み込み完了を待機しています。",
			tileUrl: "タイルURLがまだ利用できません。urlTemplate または有効な tileJsonUrl を指定してください。",
			engineBusy: "ルーティングエンジンが忙しいです。現在のルートの完了を待っています…",
			calculating: "ルートを計算中…",
			timedOut: "ルーティングがタイムアウトし、キャンセルされました。短いルートを試すか再度実行してください。",
			cancelled: "ルーティングがキャンセルされました。",
			tileCors: "タイルリクエストがブロックされました。このオリジンからのリクエストをタイルサーバーが許可しているか確認してください。",
			poorSnap: "ポイントのスナップが不適切なため、ルートが見つかりませんでした。道路に近い場所にポイントを配置してください。",
			noNode: "ポイントの 1 つが読み込まれたグラフにスナップできなかったため、ルートが見つかりませんでした。道路に近い場所または別の領域に移動してください。",
			noPath: "グラフが切断されているか、通路が狭すぎるため、ルートが見つかりませんでした。",
			incompletePath: "ルーティングエンジンが不完全な経路を返しました。グラフデータが一貫していない場合に発生することがあります。",
			noRoute: "これらのポイント間にルートが見つかりませんでした。切断されたグラフ、スナップの問題、またはその他のルーティング失敗が原因となる可能性があります。",
			routeErrorPrefix: "ルーティングエラー —"
		}
	},
	zh: {
		title: "路线",
		tabs: {
			routing: "路线",
			isolines: "等值线"
		},
		modes: {
			pedestrian: "步行",
			car: "汽车",
			bicycle: "自行车"
		},
		modeTitles: {
			pedestrian: "步行",
			car: "驾驶",
			bicycle: "骑行"
		},
		optimizeFor: "优化",
		costLabels: {
			distance: "最短",
			travelTime: "最快",
			optimal: "最佳"
		},
		costTitles: {
			distance: "最短路线",
			travelTime: "最快路线",
			optimal: "最佳路线"
		},
		originPlaceholder: "起点 (lat, lng)",
		destinationPlaceholder: "终点 (lat, lng)",
		reverseRoute: "反转方向",
		leftClick: "左键单击",
		rightClick: "右键单击",
		setOrigin: "设置起点",
		setDestination: "设置终点",
		stats: {
			distance: "距离",
			estTime: "时间",
			travelTime: "行程时长"
		},
		isoline: {
			heading: "等值线",
			from: "起点",
			to: "终点",
			pointPlaceholder: "点 (lat, lng)",
			calculate: "计算",
			hint: ""
		},
		status: {
			tileMetadata: "加载瓦片元数据失败。请检查 URL 和网络。",
			waitingStyle: "正在等待地图样式加载完成，以显示路线。",
			tileUrl: "瓦片 URL 尚不可用。请提供 urlTemplate 或有效的 tileJsonUrl。",
			engineBusy: "路由引擎忙碌中。正在等待当前路线完成…",
			calculating: "计算路线中…",
			timedOut: "路由超时并已取消。请尝试更短的路线或重试。",
			cancelled: "路由已取消。",
			tileCors: "瓦片请求被阻止。请检查瓦片服务器是否允许来自此来源的请求。",
			poorSnap: "未找到路线，因为一个或多个点捕捉不良。请将点放置在更靠近道路的位置。",
			noNode: "未找到路线，因为一个端点无法捕捉到加载的图。请将点移动到更靠近道路或其他区域的位置。",
			noPath: "未找到路线，因为加载的图已断开连接或通道太窄。",
			incompletePath: "路由引擎返回了不完整路径。出现此情况可能是由于图数据不一致。",
			noRoute: "这些点之间未找到路线。可能是由于图断开、捕捉问题或其他路由失败。",
			routeErrorPrefix: "路由错误 —"
		}
	}
}, Lr = {
	"en-us": "en",
	"en-gb": "en",
	"es-es": "es",
	"es-mx": "es",
	"ca-es": "ca",
	"gl-es": "gl",
	"eu-es": "eu",
	"fr-fr": "fr",
	"de-de": "de",
	"ru-ru": "ru",
	"ja-jp": "ja",
	"zh-cn": "zh",
	"zh-sg": "zh",
	"zh-tw": "zh",
	"zh-hk": "zh"
};
function Rr(e) {
	if (!e || typeof e != "string") return "en";
	let t = e.trim().toLowerCase();
	if (Lr[t]) return Lr[t];
	let n = t.split(/[-_]/)[0];
	return Ir[n] ? n : "en";
}
function zr(e = "auto") {
	return e && typeof e == "string" && e.toLowerCase() !== "auto" ? Rr(e) : typeof navigator < "u" ? Rr(navigator.language || navigator.userLanguage || "") : "en";
}
//#endregion
//#region node_modules/tinyqueue/index.js
var Br = class {
	constructor(e = [], t = (e, t) => e < t ? -1 : +(e > t)) {
		if (this.data = e, this.length = this.data.length, this.compare = t, this.length > 0) for (let e = (this.length >> 1) - 1; e >= 0; e--) this._down(e);
	}
	push(e) {
		this.data.push(e), this._up(this.length++);
	}
	pop() {
		if (this.length === 0) return;
		let e = this.data[0], t = this.data.pop();
		return --this.length > 0 && (this.data[0] = t, this._down(0)), e;
	}
	peek() {
		return this.data[0];
	}
	_up(e) {
		let { data: t, compare: n } = this, r = t[e];
		for (; e > 0;) {
			let i = e - 1 >> 1, a = t[i];
			if (n(r, a) >= 0) break;
			t[e] = a, e = i;
		}
		t[e] = r;
	}
	_down(e) {
		let { data: t, compare: n } = this, r = this.length >> 1, i = t[e];
		for (; e < r;) {
			let r = (e << 1) + 1, a = r + 1;
			if (a < this.length && n(t[a], t[r]) < 0 && (r = a), n(t[r], i) >= 0) break;
			t[e] = t[r], e = r;
		}
		t[e] = i;
	}
}, Vr = 6371, Hr = Math.PI / 180;
function Ur(e, t, n, r = Infinity, i = Infinity, a) {
	let o = 1, s = [];
	r === void 0 && (r = Infinity), i !== void 0 && (o = Kr(i / Vr));
	let c = new Br([], Gr), l = {
		left: 0,
		right: e.ids.length - 1,
		axis: 0,
		dist: 0,
		minLng: -180,
		minLat: -90,
		maxLng: 180,
		maxLat: 90
	}, u = Math.cos(n * Hr);
	for (; l;) {
		let i = l.right, d = l.left;
		if (i - d <= e.nodeSize) for (let r = d; r <= i; r++) {
			let i = e.ids[r];
			if (!a || a(i)) {
				let a = Jr(t, n, e.coords[2 * r], e.coords[2 * r + 1], u);
				c.push({
					id: i,
					dist: a
				});
			}
		}
		else {
			let r = d + i >> 1, o = e.coords[2 * r], s = e.coords[2 * r + 1], f = e.ids[r];
			if (!a || a(f)) {
				let e = Jr(t, n, o, s, u);
				c.push({
					id: f,
					dist: e
				});
			}
			let p = (l.axis + 1) % 2, m = {
				left: d,
				right: r - 1,
				axis: p,
				minLng: l.minLng,
				minLat: l.minLat,
				maxLng: l.axis === 0 ? o : l.maxLng,
				maxLat: l.axis === 1 ? s : l.maxLat,
				dist: 0
			}, h = {
				left: r + 1,
				right: i,
				axis: p,
				minLng: l.axis === 0 ? o : l.minLng,
				minLat: l.axis === 1 ? s : l.minLat,
				maxLng: l.maxLng,
				maxLat: l.maxLat,
				dist: 0
			};
			m.dist = Wr(t, n, u, m), h.dist = Wr(t, n, u, h), c.push(m), c.push(h);
		}
		let f;
		for (; (f = c.pop()) && "id" in f;) if (f.dist > o || (s.push(f.id), s.length === r)) return s;
		l = f;
	}
	return s;
}
function Wr(e, t, n, r) {
	let i = r.minLng, a = r.maxLng, o = r.minLat, s = r.maxLat;
	if (e >= i && e <= a) return t < o ? Kr((t - o) * Hr) : t > s ? Kr((t - s) * Hr) : 0;
	let c = Math.min(Kr((e - i) * Hr), Kr((e - a) * Hr)), l = Yr(t, c);
	return l > o && l < s ? qr(c, n, t, l) : Math.min(qr(c, n, t, o), qr(c, n, t, s));
}
function Gr(e, t) {
	return e.dist - t.dist;
}
function Kr(e) {
	let t = Math.sin(e / 2);
	return t * t;
}
function qr(e, t, n, r) {
	return t * Math.cos(r * Hr) * e + Kr((n - r) * Hr);
}
function Jr(e, t, n, r, i) {
	return qr(Kr((e - n) * Hr), i, t, r);
}
function Yr(e, t) {
	let n = 1 - 2 * t;
	return n <= 0 ? e > 0 ? 90 : -90 : Math.atan(Math.tan(e * Hr) / n) / Hr;
}
//#endregion
//#region node_modules/contraction-hierarchy-js/src/coordinateLookup.js
function Xr(e) {
	if (!e._geoJsonFlag) throw Error("Cannot use Coordinate Lookup on a non-GeoJson network.");
	let t = /* @__PURE__ */ new Set();
	Object.keys(e._nodeToIndexLookup).forEach((e) => {
		t.add(e);
	});
	let n = [];
	t.forEach((e) => {
		n.push(e.split(",").map((e) => Number(e)));
	}), this.coordinate_list = n, this.index = new lt(n.length);
	for (let e of n) this.index.add(e[0], e[1]);
	this.index.finish();
}
Xr.prototype.getClosestNetworkPt = function(e, t) {
	let n = Ur(this.index, e, t, 1)[0];
	return this.coordinate_list[n];
};
//#endregion
//#region node_modules/contraction-hierarchy-js/src/buildOutputs.js
function Zr(e, t, n, r) {
	if (e.length === 0) return [n[r]];
	let i = [], a = r;
	i.push(n[a]);
	for (let r of e) {
		let e = t[r];
		a = a === e._start_index ? e._end_index : a === e._end_index ? e._start_index : e._end_index, i.push(n[a]);
	}
	return i;
}
function Qr(e, t, n, r, i, a, o, s) {
	let c = [], l = [a], u = r[a], d = i[a];
	if (u) for (; u.attrs != null;) c.push({
		id: u.attrs,
		direction: "f"
	}), l.push(u.prev), u = r[u.prev];
	if (c.reverse(), l.reverse(), d) for (; d.attrs != null;) c.push({
		id: d.attrs,
		direction: "b"
	}), l.push(d.prev), d = i[d.prev];
	let f = s, p = c.map((e) => {
		let n = e.direction === "f" ? t[e.id]._start_index : t[e.id]._end_index, r = e.direction === "f" ? t[e.id]._end_index : t[e.id]._start_index, i = [...t[e.id]._ordered];
		return f === n ? f = r : (i.reverse(), f = n), i;
	}), m = [].concat(...p), h = m.map((e) => t[e]._id), g, _, v, y;
	return e.nodes && (y = Zr(m, t, o, s)), (e.properties || e.path) && (_ = m.map((e) => {
		let { _start_index: n, _end_index: r, _ordered: i, ...a } = t[e];
		return a;
	})), e.path && (v = {
		type: "FeatureCollection",
		features: m.map((e, t) => ({
			type: "Feature",
			properties: _[t],
			geometry: {
				type: "LineString",
				coordinates: n[e]
			}
		}))
	}), e.properties && (g = _), {
		ids: h,
		path: v,
		properties: g,
		nodes: y
	};
}
//#endregion
//#region node_modules/contraction-hierarchy-js/src/queue.js
function $r(e) {
	if (!(this instanceof $r)) return new $r(e);
	if (e = e || {}, !e.compare) throw Error("Please supply a comparison function to NodeHeap");
	if (this.data = [], this.length = this.data.length, this.compare = e.compare, this.setNodeId = function(e, t) {
		e.heapIndex = t;
	}, this.length > 0) for (var t = this.length >> 1; t >= 0; t--) this._down(t);
	if (e.setNodeId) for (var t = 0; t < this.length; ++t) this.setNodeId(this.data[t], t);
}
$r.prototype = {
	push: function(e) {
		this.data.push(e), this.setNodeId(e, this.length), this.length++, this._up(this.length - 1);
	},
	pop: function() {
		if (this.length !== 0) {
			var e = this.data[0];
			return this.length--, this.length > 0 && (this.data[0] = this.data[this.length], this.setNodeId(this.data[0], 0), this._down(0)), this.data.pop(), e;
		}
	},
	peek: function() {
		return this.data[0];
	},
	updateItem: function(e) {
		this._down(e), this._up(e);
	},
	_up: function(e) {
		for (var t = this.data, n = this.compare, r = this.setNodeId, i = t[e]; e > 0;) {
			var a = e - 1 >> 1, o = t[a];
			if (n(i, o) >= 0) break;
			t[e] = o, r(o, e), e = a;
		}
		t[e] = i, r(i, e);
	},
	_down: function(e) {
		for (var t = this.data, n = this.compare, r = this.length >> 1, i = t[e], a = this.setNodeId; e < r;) {
			var o = (e << 1) + 1, s = o + 1, c = t[o];
			if (s < this.length && n(t[s], c) < 0 && (o = s, c = t[s]), n(c, i) >= 0) break;
			t[e] = c, a(c, e), e = o;
		}
		t[e] = i, a(i, e);
	}
};
//#endregion
//#region node_modules/contraction-hierarchy-js/src/pathfinding.js
var ei = function(e) {
	let t = this.adjacency_list, n = this.reverse_adjacency_list, r = this._edgeProperties, i = this._edgeGeometry, a = this._createNodePool(), o = this._nodeToIndexLookup, s = this._indexToNodeLookup;
	return e || (e = {}), { queryContractionHierarchy: c };
	function c(c, l) {
		a.reset();
		let u = o[String(c)], d = o[String(l)], f = [], p = [], m = {}, h = {}, g = a.createNewState({
			id: u,
			dist: 0
		});
		f[u] = g, g.opened = 1, m[g.id] = 0;
		let _ = a.createNewState({
			id: d,
			dist: 0
		});
		p[d] = _, _.opened = 1, h[_.id] = 0;
		let v = O(t, g, f, m, p, h), y = O(n, _, p, h, f, m), b = !1, x = !1, S, C, w = Infinity, T = null;
		if (u !== d) do
			b || (S = v.next(), S.done && (b = !0)), x || (C = y.next(), C.done && (x = !0));
		while (m[S.value.id] < w || h[C.value.id] < w);
		else w = 0;
		let E = { total_cost: w === Infinity ? 0 : w }, D;
		if (e.ids || e.path || e.nodes || e.properties) if (T != null) D = Qr(e, r, i, f, p, T, s, u);
		else {
			let t, n, r, i;
			e.ids && (t = []), e.path && (n = {}), e.properties && (r = []), e.nodes && (i = []), D = {
				ids: t,
				path: n,
				properties: r,
				nodes: i
			};
		}
		return Object.assign(E, { ...D });
		function* O(e, t, n, r, i, o) {
			var s = new $r({ compare(e, t) {
				return e.dist - t.dist;
			} });
			do {
				if ((e[t.id] || []).forEach((e) => {
					let i = n[e.end];
					if (i === void 0 && (i = a.createNewState({ id: e.end }), i.attrs = e.attrs, n[e.end] = i), i.visited === !0) return;
					i.opened || (s.push(i), i.opened = !0);
					let c = t.dist + e.cost;
					if (c >= i.dist) return;
					i.dist = c, r[i.id] = c, i.attrs = e.attrs, i.prev = t.id, s.updateItem(i.heapIndex);
					let l = o[e.end];
					if (l >= 0) {
						let t = c + l;
						w > t && (w = t, T = e.end);
					}
				}), t.visited = !0, t = s.pop(), !t) return "";
				yield t;
			} while (!0);
		}
	}
}, ti;
try {
	ti = Map;
} catch {}
var ni;
try {
	ni = Set;
} catch {}
function ri(e, t, n) {
	if (!e || typeof e != "object" || typeof e == "function") return e;
	if (e.nodeType && "cloneNode" in e) return e.cloneNode(!0);
	if (e instanceof Date) return new Date(e.getTime());
	if (e instanceof RegExp) return new RegExp(e);
	if (Array.isArray(e)) return e.map(ii);
	if (ti && e instanceof ti) return new Map(Array.from(e.entries()));
	if (ni && e instanceof ni) return new Set(Array.from(e.values()));
	if (e instanceof Object) {
		t.push(e);
		var r = Object.create(e);
		for (var i in n.push(r), e) {
			var a = t.findIndex(function(t) {
				return t === e[i];
			});
			r[i] = a > -1 ? n[a] : ri(e[i], t, n);
		}
		return r;
	}
	return e;
}
function ii(e) {
	return ri(e, [], []);
}
//#endregion
//#region node_modules/contraction-hierarchy-js/src/geojson.js
var ai = function(e) {
	if (this._locked) throw Error("Cannot add GeoJSON to a contracted network");
	if (this._geoJsonFlag) throw Error("Cannot load more than one GeoJSON file.");
	if (this._manualAdd) throw Error("Cannot load GeoJSON file after adding Edges manually via the API.");
	let t = ii(e);
	this._cleanseGeoJsonNetwork(t).forEach((e, t) => {
		let n = e.geometry.coordinates, r = e.properties;
		if (!r || !n || !r._cost) {
			this.debugMode && console.log("invalid feature detected.  skipping...");
			return;
		}
		let i = n[0], a = n[n.length - 1];
		this._addEdge(i, a, r, ii(n)), this._addEdge(a, i, r, ii(n).reverse());
	}), this._geoJsonFlag = !0;
}, oi = function(e) {
	let t = {}, n = e.features;
	return n.forEach((e) => {
		let n = e.geometry.coordinates[0].join(","), r = e.geometry.coordinates[e.geometry.coordinates.length - 1].join(","), i = `${n}|${r}`, a = `${r}|${n}`;
		if (!t[i]) t[i] = e;
		else {
			this.debugMode && console.log("Duplicate feature found, choosing shortest.");
			let n = t[i].properties._cost;
			e.properties._cost < n ? (t[i].properties.__markDelete = !0, t[i] = e) : e.properties.__markDelete = !0;
		}
		if (!t[a]) t[a] = e;
		else {
			let n = t[a].properties._cost;
			e.properties._cost < n ? (t[a].properties.__markDelete = !0, t[a] = e) : e.properties.__markDelete = !0;
		}
	}), n.filter((e) => !e.properties.__markDelete);
}, si = function(e, t, n, r, i) {
	if (this._locked) throw Error("Graph has been contracted.  No additional edges can be added.");
	if (this._geoJsonFlag) throw Error("Can not add additional edges manually to a GeoJSON network.");
	this._manualAdd = !0, this._addEdge(e, t, n, r, i);
}, ci = function(e, t, n, r, i) {
	let a = String(e), o = String(t);
	if (a === o) {
		this.debugMode && console.log("Start and End Nodes are the same.  Ignoring.");
		return;
	}
	this._nodeToIndexLookup[a] ?? (this._currentNodeIndex++, this._nodeToIndexLookup[a] = this._currentNodeIndex, this._indexToNodeLookup[this._currentNodeIndex] = a), this._nodeToIndexLookup[o] ?? (this._currentNodeIndex++, this._nodeToIndexLookup[o] = this._currentNodeIndex, this._indexToNodeLookup[this._currentNodeIndex] = o);
	let s = this._nodeToIndexLookup[a], c = this._nodeToIndexLookup[o];
	this._currentEdgeIndex++, this._edgeProperties[this._currentEdgeIndex] = JSON.parse(JSON.stringify(n)), this._edgeProperties[this._currentEdgeIndex]._start_index = s, this._edgeProperties[this._currentEdgeIndex]._end_index = c, r && (this._edgeGeometry[this._currentEdgeIndex] = JSON.parse(JSON.stringify(r)));
	let l = {
		end: c,
		cost: n._cost,
		attrs: this._currentEdgeIndex
	};
	this.adjacency_list[s] ? this.adjacency_list[s].push(l) : this.adjacency_list[s] = [l];
	let u = {
		end: s,
		cost: n._cost,
		attrs: this._currentEdgeIndex
	};
	this.reverse_adjacency_list[c] ? this.reverse_adjacency_list[c].push(u) : this.reverse_adjacency_list[c] = [u], i && (this.adjacency_list[c] ? this.adjacency_list[c].push(u) : this.adjacency_list[c] = [u], this.reverse_adjacency_list[s] ? this.reverse_adjacency_list[s].push(l) : this.reverse_adjacency_list[s] = [l]);
}, li = function(e, t, n) {
	this._currentEdgeIndex++, this._edgeProperties[this._currentEdgeIndex] = n, this._edgeProperties[this._currentEdgeIndex]._start_index = e, this._edgeProperties[this._currentEdgeIndex]._end_index = t;
	let r = {
		end: t,
		cost: n._cost,
		attrs: this._currentEdgeIndex
	};
	this.adjacency_list[e] ? this.adjacency_list[e].push(r) : this.adjacency_list[e] = [r];
	let i = {
		end: e,
		cost: n._cost,
		attrs: this._currentEdgeIndex
	};
	this.reverse_adjacency_list[t] ? this.reverse_adjacency_list[t].push(i) : this.reverse_adjacency_list[t] = [i];
}, K = {};
K.read = function(e, t) {
	return e.readFields(K._readField, {
		_locked: !1,
		_geoJsonFlag: !1,
		adjacency_list: [],
		reverse_adjacency_list: [],
		_nodeToIndexLookup: {},
		_edgeProperties: [],
		_edgeGeometry: []
	}, t);
}, K._readField = function(e, t, n) {
	if (e === 1) t._locked = n.readBoolean();
	else if (e === 2) t._geoJsonFlag = n.readBoolean();
	else if (e === 3) t.adjacency_list.push(K.AdjList.read(n, n.readVarint() + n.pos));
	else if (e === 4) t.reverse_adjacency_list.push(K.AdjList.read(n, n.readVarint() + n.pos));
	else if (e === 5) {
		var r = K._FieldEntry5.read(n, n.readVarint() + n.pos);
		t._nodeToIndexLookup[r.key] = r.value;
	} else e === 6 ? t._edgeProperties.push(n.readString()) : e === 7 && t._edgeGeometry.push(K.GeometryArray.read(n, n.readVarint() + n.pos));
}, K.write = function(e, t) {
	if (e._locked && t.writeBooleanField(1, e._locked), e._geoJsonFlag && t.writeBooleanField(2, e._geoJsonFlag), e.adjacency_list) for (var n = 0; n < e.adjacency_list.length; n++) t.writeMessage(3, K.AdjList.write, e.adjacency_list[n]);
	if (e.reverse_adjacency_list) for (n = 0; n < e.reverse_adjacency_list.length; n++) t.writeMessage(4, K.AdjList.write, e.reverse_adjacency_list[n]);
	if (e._nodeToIndexLookup) for (n in e._nodeToIndexLookup) Object.prototype.hasOwnProperty.call(e._nodeToIndexLookup, n) && t.writeMessage(5, K._FieldEntry5.write, {
		key: n,
		value: e._nodeToIndexLookup[n]
	});
	if (e._edgeProperties) for (n = 0; n < e._edgeProperties.length; n++) t.writeStringField(6, e._edgeProperties[n]);
	if (e._edgeGeometry) for (n = 0; n < e._edgeGeometry.length; n++) t.writeMessage(7, K.GeometryArray.write, e._edgeGeometry[n]);
}, K.EdgeAttrs = {}, K.EdgeAttrs.read = function(e, t) {
	return e.readFields(K.EdgeAttrs._readField, {
		end: 0,
		cost: 0,
		attrs: 0
	}, t);
}, K.EdgeAttrs._readField = function(e, t, n) {
	e === 1 ? t.end = n.readVarint() : e === 2 ? t.cost = n.readDouble() : e === 3 && (t.attrs = n.readVarint());
}, K.EdgeAttrs.write = function(e, t) {
	e.end && t.writeVarintField(1, e.end), e.cost && t.writeDoubleField(2, e.cost), e.attrs && t.writeVarintField(3, e.attrs);
}, K.AdjList = {}, K.AdjList.read = function(e, t) {
	return e.readFields(K.AdjList._readField, { edges: [] }, t);
}, K.AdjList._readField = function(e, t, n) {
	e === 1 && t.edges.push(K.EdgeAttrs.read(n, n.readVarint() + n.pos));
}, K.AdjList.write = function(e, t) {
	if (e.edges) for (var n = 0; n < e.edges.length; n++) t.writeMessage(1, K.EdgeAttrs.write, e.edges[n]);
}, K.LineStringAray = {}, K.LineStringAray.read = function(e, t) {
	return e.readFields(K.LineStringAray._readField, { coords: [] }, t);
}, K.LineStringAray._readField = function(e, t, n) {
	e === 1 && n.readPackedDouble(t.coords);
}, K.LineStringAray.write = function(e, t) {
	e.coords && t.writePackedDouble(1, e.coords);
}, K.GeometryArray = {}, K.GeometryArray.read = function(e, t) {
	return e.readFields(K.GeometryArray._readField, { linestrings: [] }, t);
}, K.GeometryArray._readField = function(e, t, n) {
	e === 1 && t.linestrings.push(K.LineStringAray.read(n, n.readVarint() + n.pos));
}, K.GeometryArray.write = function(e, t) {
	if (e.linestrings) for (var n = 0; n < e.linestrings.length; n++) t.writeMessage(1, K.LineStringAray.write, e.linestrings[n]);
}, K._FieldEntry5 = {}, K._FieldEntry5.read = function(e, t) {
	return e.readFields(K._FieldEntry5._readField, {
		key: "",
		value: 0
	}, t);
}, K._FieldEntry5._readField = function(e, t, n) {
	e === 1 ? t.key = n.readString() : e === 2 && (t.value = n.readVarint());
}, K._FieldEntry5.write = function(e, t) {
	e.key && t.writeStringField(1, e.key), e.value && t.writeVarintField(2, e.value);
};
//#endregion
//#region node_modules/ieee754/index.js
var ui = /* @__PURE__ */ o(((e) => {
	e.read = function(e, t, n, r, i) {
		var a, o, s = i * 8 - r - 1, c = (1 << s) - 1, l = c >> 1, u = -7, d = n ? i - 1 : 0, f = n ? -1 : 1, p = e[t + d];
		for (d += f, a = p & (1 << -u) - 1, p >>= -u, u += s; u > 0; a = a * 256 + e[t + d], d += f, u -= 8);
		for (o = a & (1 << -u) - 1, a >>= -u, u += r; u > 0; o = o * 256 + e[t + d], d += f, u -= 8);
		if (a === 0) a = 1 - l;
		else if (a === c) return o ? NaN : (p ? -1 : 1) * Infinity;
		else o += 2 ** r, a -= l;
		return (p ? -1 : 1) * o * 2 ** (a - r);
	}, e.write = function(e, t, n, r, i, a) {
		var o, s, c, l = a * 8 - i - 1, u = (1 << l) - 1, d = u >> 1, f = i === 23 ? 2 ** -24 - 2 ** -77 : 0, p = r ? 0 : a - 1, m = r ? 1 : -1, h = +(t < 0 || t === 0 && 1 / t < 0);
		for (t = Math.abs(t), isNaN(t) || t === Infinity ? (s = +!!isNaN(t), o = u) : (o = Math.floor(Math.log(t) / Math.LN2), t * (c = 2 ** -o) < 1 && (o--, c *= 2), o + d >= 1 ? t += f / c : t += f * 2 ** (1 - d), t * c >= 2 && (o++, c /= 2), o + d >= u ? (s = 0, o = u) : o + d >= 1 ? (s = (t * c - 1) * 2 ** i, o += d) : (s = t * 2 ** (d - 1) * 2 ** i, o = 0)); i >= 8; e[n + p] = s & 255, p += m, s /= 256, i -= 8);
		for (o = o << i | s, l += i; l > 0; e[n + p] = o & 255, p += m, o /= 256, l -= 8);
		e[n + p - m] |= h * 128;
	};
})), di = /* @__PURE__ */ l((/* @__PURE__ */ o(((e, t) => {
	t.exports = r;
	var n = ui();
	function r(e) {
		this.buf = ArrayBuffer.isView && ArrayBuffer.isView(e) ? e : new Uint8Array(e || 0), this.pos = 0, this.type = 0, this.length = this.buf.length;
	}
	r.Varint = 0, r.Fixed64 = 1, r.Bytes = 2, r.Fixed32 = 5;
	var i = 65536 * 65536, a = 1 / i, o = 12, s = typeof TextDecoder > "u" ? null : new TextDecoder("utf-8");
	r.prototype = {
		destroy: function() {
			this.buf = null;
		},
		readFields: function(e, t, n) {
			for (n = n || this.length; this.pos < n;) {
				var r = this.readVarint(), i = r >> 3, a = this.pos;
				this.type = r & 7, e(i, t, this), this.pos === a && this.skip(r);
			}
			return t;
		},
		readMessage: function(e, t) {
			return this.readFields(e, t, this.readVarint() + this.pos);
		},
		readFixed32: function() {
			var e = w(this.buf, this.pos);
			return this.pos += 4, e;
		},
		readSFixed32: function() {
			var e = E(this.buf, this.pos);
			return this.pos += 4, e;
		},
		readFixed64: function() {
			var e = w(this.buf, this.pos) + w(this.buf, this.pos + 4) * i;
			return this.pos += 8, e;
		},
		readSFixed64: function() {
			var e = w(this.buf, this.pos) + E(this.buf, this.pos + 4) * i;
			return this.pos += 8, e;
		},
		readFloat: function() {
			var e = n.read(this.buf, this.pos, !0, 23, 4);
			return this.pos += 4, e;
		},
		readDouble: function() {
			var e = n.read(this.buf, this.pos, !0, 52, 8);
			return this.pos += 8, e;
		},
		readVarint: function(e) {
			var t = this.buf, n, r = t[this.pos++];
			return n = r & 127, r < 128 || (r = t[this.pos++], n |= (r & 127) << 7, r < 128) || (r = t[this.pos++], n |= (r & 127) << 14, r < 128) || (r = t[this.pos++], n |= (r & 127) << 21, r < 128) ? n : (r = t[this.pos], n |= (r & 15) << 28, c(n, e, this));
		},
		readVarint64: function() {
			return this.readVarint(!0);
		},
		readSVarint: function() {
			var e = this.readVarint();
			return e % 2 == 1 ? (e + 1) / -2 : e / 2;
		},
		readBoolean: function() {
			return !!this.readVarint();
		},
		readString: function() {
			var e = this.readVarint() + this.pos, t = this.pos;
			return this.pos = e, e - t >= o && s ? O(this.buf, t, e) : D(this.buf, t, e);
		},
		readBytes: function() {
			var e = this.readVarint() + this.pos, t = this.buf.subarray(this.pos, e);
			return this.pos = e, t;
		},
		readPackedVarint: function(e, t) {
			if (this.type !== r.Bytes) return e.push(this.readVarint(t));
			var n = l(this);
			for (e = e || []; this.pos < n;) e.push(this.readVarint(t));
			return e;
		},
		readPackedSVarint: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readSVarint());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readSVarint());
			return e;
		},
		readPackedBoolean: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readBoolean());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readBoolean());
			return e;
		},
		readPackedFloat: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readFloat());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readFloat());
			return e;
		},
		readPackedDouble: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readDouble());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readDouble());
			return e;
		},
		readPackedFixed32: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readFixed32());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readFixed32());
			return e;
		},
		readPackedSFixed32: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readSFixed32());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readSFixed32());
			return e;
		},
		readPackedFixed64: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readFixed64());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readFixed64());
			return e;
		},
		readPackedSFixed64: function(e) {
			if (this.type !== r.Bytes) return e.push(this.readSFixed64());
			var t = l(this);
			for (e = e || []; this.pos < t;) e.push(this.readSFixed64());
			return e;
		},
		skip: function(e) {
			var t = e & 7;
			if (t === r.Varint) for (; this.buf[this.pos++] > 127;);
			else if (t === r.Bytes) this.pos = this.readVarint() + this.pos;
			else if (t === r.Fixed32) this.pos += 4;
			else if (t === r.Fixed64) this.pos += 8;
			else throw Error("Unimplemented type: " + t);
		},
		writeTag: function(e, t) {
			this.writeVarint(e << 3 | t);
		},
		realloc: function(e) {
			for (var t = this.length || 16; t < this.pos + e;) t *= 2;
			if (t !== this.length) {
				var n = new Uint8Array(t);
				n.set(this.buf), this.buf = n, this.length = t;
			}
		},
		finish: function() {
			return this.length = this.pos, this.pos = 0, this.buf.subarray(0, this.length);
		},
		writeFixed32: function(e) {
			this.realloc(4), T(this.buf, e, this.pos), this.pos += 4;
		},
		writeSFixed32: function(e) {
			this.realloc(4), T(this.buf, e, this.pos), this.pos += 4;
		},
		writeFixed64: function(e) {
			this.realloc(8), T(this.buf, e & -1, this.pos), T(this.buf, Math.floor(e * a), this.pos + 4), this.pos += 8;
		},
		writeSFixed64: function(e) {
			this.realloc(8), T(this.buf, e & -1, this.pos), T(this.buf, Math.floor(e * a), this.pos + 4), this.pos += 8;
		},
		writeVarint: function(e) {
			if (e = +e || 0, e > 268435455 || e < 0) {
				d(e, this);
				return;
			}
			this.realloc(4), this.buf[this.pos++] = e & 127 | (e > 127 ? 128 : 0), !(e <= 127) && (this.buf[this.pos++] = (e >>>= 7) & 127 | (e > 127 ? 128 : 0), !(e <= 127) && (this.buf[this.pos++] = (e >>>= 7) & 127 | (e > 127 ? 128 : 0), !(e <= 127) && (this.buf[this.pos++] = e >>> 7 & 127)));
		},
		writeSVarint: function(e) {
			this.writeVarint(e < 0 ? -e * 2 - 1 : e * 2);
		},
		writeBoolean: function(e) {
			this.writeVarint(!!e);
		},
		writeString: function(e) {
			e = String(e), this.realloc(e.length * 4), this.pos++;
			var t = this.pos;
			this.pos = k(this.buf, e, this.pos);
			var n = this.pos - t;
			n >= 128 && m(t, n, this), this.pos = t - 1, this.writeVarint(n), this.pos += n;
		},
		writeFloat: function(e) {
			this.realloc(4), n.write(this.buf, e, this.pos, !0, 23, 4), this.pos += 4;
		},
		writeDouble: function(e) {
			this.realloc(8), n.write(this.buf, e, this.pos, !0, 52, 8), this.pos += 8;
		},
		writeBytes: function(e) {
			var t = e.length;
			this.writeVarint(t), this.realloc(t);
			for (var n = 0; n < t; n++) this.buf[this.pos++] = e[n];
		},
		writeRawMessage: function(e, t) {
			this.pos++;
			var n = this.pos;
			e(t, this);
			var r = this.pos - n;
			r >= 128 && m(n, r, this), this.pos = n - 1, this.writeVarint(r), this.pos += r;
		},
		writeMessage: function(e, t, n) {
			this.writeTag(e, r.Bytes), this.writeRawMessage(t, n);
		},
		writePackedVarint: function(e, t) {
			t.length && this.writeMessage(e, h, t);
		},
		writePackedSVarint: function(e, t) {
			t.length && this.writeMessage(e, g, t);
		},
		writePackedBoolean: function(e, t) {
			t.length && this.writeMessage(e, y, t);
		},
		writePackedFloat: function(e, t) {
			t.length && this.writeMessage(e, _, t);
		},
		writePackedDouble: function(e, t) {
			t.length && this.writeMessage(e, v, t);
		},
		writePackedFixed32: function(e, t) {
			t.length && this.writeMessage(e, b, t);
		},
		writePackedSFixed32: function(e, t) {
			t.length && this.writeMessage(e, x, t);
		},
		writePackedFixed64: function(e, t) {
			t.length && this.writeMessage(e, S, t);
		},
		writePackedSFixed64: function(e, t) {
			t.length && this.writeMessage(e, C, t);
		},
		writeBytesField: function(e, t) {
			this.writeTag(e, r.Bytes), this.writeBytes(t);
		},
		writeFixed32Field: function(e, t) {
			this.writeTag(e, r.Fixed32), this.writeFixed32(t);
		},
		writeSFixed32Field: function(e, t) {
			this.writeTag(e, r.Fixed32), this.writeSFixed32(t);
		},
		writeFixed64Field: function(e, t) {
			this.writeTag(e, r.Fixed64), this.writeFixed64(t);
		},
		writeSFixed64Field: function(e, t) {
			this.writeTag(e, r.Fixed64), this.writeSFixed64(t);
		},
		writeVarintField: function(e, t) {
			this.writeTag(e, r.Varint), this.writeVarint(t);
		},
		writeSVarintField: function(e, t) {
			this.writeTag(e, r.Varint), this.writeSVarint(t);
		},
		writeStringField: function(e, t) {
			this.writeTag(e, r.Bytes), this.writeString(t);
		},
		writeFloatField: function(e, t) {
			this.writeTag(e, r.Fixed32), this.writeFloat(t);
		},
		writeDoubleField: function(e, t) {
			this.writeTag(e, r.Fixed64), this.writeDouble(t);
		},
		writeBooleanField: function(e, t) {
			this.writeVarintField(e, !!t);
		}
	};
	function c(e, t, n) {
		var r = n.buf, i, a = r[n.pos++];
		if (i = (a & 112) >> 4, a < 128 || (a = r[n.pos++], i |= (a & 127) << 3, a < 128) || (a = r[n.pos++], i |= (a & 127) << 10, a < 128) || (a = r[n.pos++], i |= (a & 127) << 17, a < 128) || (a = r[n.pos++], i |= (a & 127) << 24, a < 128) || (a = r[n.pos++], i |= (a & 1) << 31, a < 128)) return u(e, i, t);
		throw Error("Expected varint not more than 10 bytes");
	}
	function l(e) {
		return e.type === r.Bytes ? e.readVarint() + e.pos : e.pos + 1;
	}
	function u(e, t, n) {
		return n ? t * 4294967296 + (e >>> 0) : (t >>> 0) * 4294967296 + (e >>> 0);
	}
	function d(e, t) {
		var n, r;
		if (e >= 0 ? (n = e % 4294967296 | 0, r = e / 4294967296 | 0) : (n = ~(-e % 4294967296), r = ~(-e / 4294967296), n ^ 4294967295 ? n = n + 1 | 0 : (n = 0, r = r + 1 | 0)), e >= 0x10000000000000000 || e < -0x10000000000000000) throw Error("Given varint doesn't fit into 10 bytes");
		t.realloc(10), f(n, r, t), p(r, t);
	}
	function f(e, t, n) {
		n.buf[n.pos++] = e & 127 | 128, e >>>= 7, n.buf[n.pos++] = e & 127 | 128, e >>>= 7, n.buf[n.pos++] = e & 127 | 128, e >>>= 7, n.buf[n.pos++] = e & 127 | 128, e >>>= 7, n.buf[n.pos] = e & 127;
	}
	function p(e, t) {
		var n = (e & 7) << 4;
		t.buf[t.pos++] |= n | ((e >>>= 3) ? 128 : 0), e && (t.buf[t.pos++] = e & 127 | ((e >>>= 7) ? 128 : 0), e && (t.buf[t.pos++] = e & 127 | ((e >>>= 7) ? 128 : 0), e && (t.buf[t.pos++] = e & 127 | ((e >>>= 7) ? 128 : 0), e && (t.buf[t.pos++] = e & 127 | ((e >>>= 7) ? 128 : 0), e && (t.buf[t.pos++] = e & 127)))));
	}
	function m(e, t, n) {
		var r = t <= 16383 ? 1 : t <= 2097151 ? 2 : t <= 268435455 ? 3 : Math.floor(Math.log(t) / (Math.LN2 * 7));
		n.realloc(r);
		for (var i = n.pos - 1; i >= e; i--) n.buf[i + r] = n.buf[i];
	}
	function h(e, t) {
		for (var n = 0; n < e.length; n++) t.writeVarint(e[n]);
	}
	function g(e, t) {
		for (var n = 0; n < e.length; n++) t.writeSVarint(e[n]);
	}
	function _(e, t) {
		for (var n = 0; n < e.length; n++) t.writeFloat(e[n]);
	}
	function v(e, t) {
		for (var n = 0; n < e.length; n++) t.writeDouble(e[n]);
	}
	function y(e, t) {
		for (var n = 0; n < e.length; n++) t.writeBoolean(e[n]);
	}
	function b(e, t) {
		for (var n = 0; n < e.length; n++) t.writeFixed32(e[n]);
	}
	function x(e, t) {
		for (var n = 0; n < e.length; n++) t.writeSFixed32(e[n]);
	}
	function S(e, t) {
		for (var n = 0; n < e.length; n++) t.writeFixed64(e[n]);
	}
	function C(e, t) {
		for (var n = 0; n < e.length; n++) t.writeSFixed64(e[n]);
	}
	function w(e, t) {
		return (e[t] | e[t + 1] << 8 | e[t + 2] << 16) + e[t + 3] * 16777216;
	}
	function T(e, t, n) {
		e[n] = t, e[n + 1] = t >>> 8, e[n + 2] = t >>> 16, e[n + 3] = t >>> 24;
	}
	function E(e, t) {
		return (e[t] | e[t + 1] << 8 | e[t + 2] << 16) + (e[t + 3] << 24);
	}
	function D(e, t, n) {
		for (var r = "", i = t; i < n;) {
			var a = e[i], o = null, s = a > 239 ? 4 : a > 223 ? 3 : a > 191 ? 2 : 1;
			if (i + s > n) break;
			var c, l, u;
			s === 1 ? a < 128 && (o = a) : s === 2 ? (c = e[i + 1], (c & 192) == 128 && (o = (a & 31) << 6 | c & 63, o <= 127 && (o = null))) : s === 3 ? (c = e[i + 1], l = e[i + 2], (c & 192) == 128 && (l & 192) == 128 && (o = (a & 15) << 12 | (c & 63) << 6 | l & 63, (o <= 2047 || o >= 55296 && o <= 57343) && (o = null))) : s === 4 && (c = e[i + 1], l = e[i + 2], u = e[i + 3], (c & 192) == 128 && (l & 192) == 128 && (u & 192) == 128 && (o = (a & 15) << 18 | (c & 63) << 12 | (l & 63) << 6 | u & 63, (o <= 65535 || o >= 1114112) && (o = null))), o === null ? (o = 65533, s = 1) : o > 65535 && (o -= 65536, r += String.fromCharCode(o >>> 10 & 1023 | 55296), o = 56320 | o & 1023), r += String.fromCharCode(o), i += s;
		}
		return r;
	}
	function O(e, t, n) {
		return s.decode(e.subarray(t, n));
	}
	function k(e, t, n) {
		for (var r = 0, i, a; r < t.length; r++) {
			if (i = t.charCodeAt(r), i > 55295 && i < 57344) if (a) if (i < 56320) {
				e[n++] = 239, e[n++] = 191, e[n++] = 189, a = i;
				continue;
			} else i = a - 55296 << 10 | i - 56320 | 65536, a = null;
			else {
				i > 56319 || r + 1 === t.length ? (e[n++] = 239, e[n++] = 191, e[n++] = 189) : a = i;
				continue;
			}
			else a && (e[n++] = 239, e[n++] = 191, e[n++] = 189, a = null);
			i < 128 ? e[n++] = i : (i < 2048 ? e[n++] = i >> 6 | 192 : (i < 65536 ? e[n++] = i >> 12 | 224 : (e[n++] = i >> 18 | 240, e[n++] = i >> 12 & 63 | 128), e[n++] = i >> 6 & 63 | 128), e[n++] = i & 63 | 128);
		}
		return n;
	}
})))(), 1), fi = function(e) {
	let t = typeof e == "object" ? e : JSON.parse(e);
	this._locked = t._locked, this._geoJsonFlag = t._geoJsonFlag, this.adjacency_list = t.adjacency_list, this.reverse_adjacency_list = t.reverse_adjacency_list, this._nodeToIndexLookup = t._nodeToIndexLookup, this._edgeProperties = t._edgeProperties, this._edgeGeometry = t._edgeGeometry;
}, pi = function() {
	if (!this._locked) throw Error("No sense in saving network before it is contracted.");
	return JSON.stringify({
		_locked: this._locked,
		_geoJsonFlag: this._geoJsonFlag,
		adjacency_list: this.adjacency_list,
		reverse_adjacency_list: this.reverse_adjacency_list,
		_nodeToIndexLookup: this._nodeToIndexLookup,
		_edgeProperties: this._edgeProperties,
		_edgeGeometry: this._edgeGeometry
	});
}, mi = function(e) {
	var t = new di.default(e), n = K.read(t);
	n.adjacency_list = n.adjacency_list.map((e) => e.edges), n.reverse_adjacency_list = n.reverse_adjacency_list.map((e) => e.edges), n._edgeGeometry = n._edgeGeometry.map((e) => e.linestrings.map((e) => e.coords)), n._edgeProperties = n._edgeProperties.map((e) => JSON.parse(e)), this._locked = n._locked, this._geoJsonFlag = n._geoJsonFlag, this.adjacency_list = n.adjacency_list, this.reverse_adjacency_list = n.reverse_adjacency_list, this._nodeToIndexLookup = n._nodeToIndexLookup, this._edgeProperties = n._edgeProperties, this._edgeGeometry = n._edgeGeometry, this._indexToNodeLookup = {};
	for (let [e, t] of Object.entries(this._nodeToIndexLookup)) this._indexToNodeLookup[t] = e;
	console.log("done loading pbf");
}, hi = async function(e) {
	if (!this._locked) throw Error("No sense in saving network before it is contracted.");
	let t;
	try {
		t = await import("fs");
	} catch {
		console.log("saving as PBF only works in NodeJS");
		return;
	}
	let n = {
		_locked: this._locked,
		_geoJsonFlag: this._geoJsonFlag,
		adjacency_list: this.adjacency_list,
		reverse_adjacency_list: this.reverse_adjacency_list,
		_nodeToIndexLookup: this._nodeToIndexLookup,
		_edgeProperties: this._edgeProperties,
		_edgeGeometry: this._edgeGeometry
	};
	n.adjacency_list = n.adjacency_list.map((e) => ({ edges: e.map((e) => e) })), n.reverse_adjacency_list = n.reverse_adjacency_list.map((e) => ({ edges: e.map((e) => e) })), n._edgeGeometry = n._edgeGeometry.map((e) => ({ linestrings: e.map((e) => ({ coords: e })) })), n._edgeProperties = n._edgeProperties.map((e) => JSON.stringify(e));
	var r = new di.default();
	K.write(n, r);
	var i = r.finish();
	t.writeFileSync(e, i), console.log(`done saving ${e}`);
};
//#endregion
//#region node_modules/contraction-hierarchy-js/src/nodePool.js
function gi(e) {
	this.id = e.id, this.dist = e.dist === void 0 ? Infinity : e.dist, this.prev = void 0, this.visited = void 0, this.opened = !1, this.heapIndex = -1;
}
function _i() {
	var e = 0, t = [];
	return {
		createNewState: r,
		reset: n
	};
	function n() {
		e = 0;
	}
	function r(n) {
		var r = t[e];
		return r ? (r.id = n.id, r.dist = n.dist === void 0 ? Infinity : n.dist, r.prev = void 0, r.visited = void 0, r.opened = !1, r.heapIndex = -1) : (r = new gi(n), t[e] = r), e++, r;
	}
}
//#endregion
//#region node_modules/contraction-hierarchy-js/src/contract.js
var vi = function() {
	if (this._locked) throw Error("Network has already been contracted");
	this._locked = !0, this._maxUncontractedEdgeIndex = this._currentEdgeIndex;
	let e = this._createChShortcutter(), t = (t) => this._contract(t, !0, e) - (this.adjacency_list[t] || []).length + n(t), n = (e) => (this.adjacency_list[e] || []).reduce((e, t) => e + (this.contracted_nodes[t.end] == null ? 0 : 1), 0), r = new $r({ compare(e, t) {
		return e.score - t.score;
	} });
	this.contracted_nodes = [], Object.keys(this._nodeToIndexLookup).forEach((e) => {
		let n = this._nodeToIndexLookup[e], i = new Si(t(n), n);
		r.push(i);
	});
	let i = 1, a = r.length;
	for (; r.length > 0;) {
		let n = r.length;
		n % 50 == 0 && (this.debugMode && console.log(n / a), this._cleanAdjList(this.adjacency_list), this._cleanAdjList(this.reverse_adjacency_list));
		let o = !1, s = r.peek(), c = s.score;
		do {
			let e = s.id, n = t(e);
			n > c && (s.score = n, r.updateItem(s.heapIndex)), s = r.peek(), s.id === e && (o = !0);
		} while (o === !1);
		let l = r.pop();
		this._contract(l.id, !1, e), this.contracted_nodes[l.id] = i, i++;
	}
	this._cleanAdjList(this.adjacency_list), this._cleanAdjList(this.reverse_adjacency_list), this._arrangeContractedPaths(this.adjacency_list), this._arrangeContractedPaths(this.reverse_adjacency_list), this.debugMode && console.log("Contraction complete");
}, yi = function(e) {
	e.forEach((e, t) => {
		e.forEach((e) => {
			let n = t, r = [], i = [];
			for (i = [e.attrs]; i.length;) {
				let e = i.pop();
				e <= this._maxUncontractedEdgeIndex ? r.push(e) : i.push(...this._edgeProperties[e]._id);
			}
			let a = {};
			r.forEach((e) => {
				let t = this._edgeProperties[e], n = t._start_index, r = t._end_index;
				a[n] ? a[n].push(e) : a[n] = [e], a[r] ? a[r].push(e) : a[r] = [e];
			});
			let o = [], s = String(n), c = a[s][0];
			for (; c != null;) {
				o.push(c);
				let e = this._edgeProperties[c], t = String(e._start_index), n = String(e._end_index), r = t === s ? n : t;
				s = r;
				let i = a[r];
				if (i.length === 1) break;
				i.length > 2 && (console.error("too many edges in array. unexpected. unrecoverable."), process.exit()), c = i[0] === c ? i[1] : i[0];
			}
			this._edgeProperties[e.attrs]._ordered = o;
		});
	});
}, bi = function(e) {
	e.forEach((t, n) => {
		let r = this.contracted_nodes[n];
		r != null && (e[n] = e[n].filter((e) => {
			let t = this.contracted_nodes[e.end];
			return t == null ? !0 : r < t;
		}));
	});
}, xi = function(e, t, n) {
	let r = (this.reverse_adjacency_list[e] || []).filter((e) => !this.contracted_nodes[e.end]), i = (this.adjacency_list[e] || []).filter((e) => !this.contracted_nodes[e.end]), a = 0;
	return r.forEach((r) => {
		let o = 0, s = r.cost;
		if (i.forEach((e) => {
			if (r.end === e.end) return;
			let t = s + e.cost;
			t > o && (o = t);
		}), !i.length) return;
		let c = n.runDijkstra(r.end, null, e, o);
		i.forEach((e) => {
			if (r.end === e.end) return;
			let n = s + e.cost;
			if (n < (c.distances[e.end] || Infinity) && (a++, !t)) {
				let t = {
					_cost: n,
					_id: [r.attrs, e.attrs],
					_start_index: r.end,
					_end_index: e.end
				};
				this._addContractedEdge(r.end, e.end, t);
			}
		});
	}), a;
};
function Si(e, t) {
	this.score = e, this.id = t;
}
var Ci = function() {
	let e = this._createNodePool(), t = this.adjacency_list;
	return { runDijkstra: n };
	function n(n, r, i, a) {
		e.reset();
		let o = [], s = {};
		var c = new $r({ compare(e, t) {
			return e.dist - t.dist;
		} });
		let l = e.createNewState({
			id: n,
			dist: 0
		});
		for (o[n] = l, l.opened = 1, s[l.id] = 0, n === r && (l = ""); l;) {
			(t[l.id] || []).filter((e) => e.end !== i).forEach((t) => {
				let n = o[t.end];
				if (n === void 0 && (n = e.createNewState({ id: t.end }), o[t.end] = n), n.visited === !0) return;
				n.opened || (c.push(n), n.opened = !0);
				let r = l.dist + t.cost;
				r >= n.dist || (n.dist = r, s[n.id] = r, n.prev = l.id, c.updateItem(n.heapIndex));
			}), l.visited = !0;
			let n = l.dist;
			l = c.pop(), l && l.id === r && (l = ""), n > a && (l = "");
		}
		return {
			distances: s,
			nodeState: o
		};
	}
};
//#endregion
//#region node_modules/contraction-hierarchy-js/main.js
function q(e, t) {
	let n = t || {};
	this.debugMode = n.debugMode || !1, this.adjacency_list = [], this.reverse_adjacency_list = [], this._createNodePool = _i, this._currentNodeIndex = -1, this._nodeToIndexLookup = {}, this._indexToNodeLookup = {}, this._currentEdgeIndex = -1, this._edgeProperties = [], this._edgeGeometry = [], this._maxUncontractedEdgeIndex = 0, this._locked = !1, this._geoJsonFlag = !1, this._manualAdd = !1, e && (this._loadFromGeoJson(e), this.debugMode && (console.log("Nodes: ", this._currentNodeIndex), console.log("Edges: ", this._currentEdgeIndex)));
}
q.prototype.createPathfinder = ei, q.prototype._loadFromGeoJson = ai, q.prototype._cleanseGeoJsonNetwork = oi, q.prototype._addContractedEdge = li, q.prototype.addEdge = si, q.prototype._addEdge = ci, q.prototype.loadCH = fi, q.prototype.saveCH = pi, q.prototype.loadPbfCH = mi, q.prototype.savePbfCH = hi, q.prototype.contractGraph = vi, q.prototype._arrangeContractedPaths = yi, q.prototype._cleanAdjList = bi, q.prototype._contract = xi, q.prototype._createChShortcutter = Ci;
//#endregion
//#region src/isolines/chShim.js
function wi(e) {
	let t = e.prototype._arrangeContractedPaths;
	return e.prototype._arrangeContractedPaths = function(e) {
		let t = this;
		e.forEach((e, n) => {
			e.forEach((e) => {
				let r = n, i = [], a = [e.attrs];
				for (; a.length;) {
					let e = a.pop();
					if (e <= t._maxUncontractedEdgeIndex) i.push(e);
					else {
						let n = t._edgeProperties[e];
						n && Array.isArray(n._id) && a.push(...n._id);
					}
				}
				let o = {};
				if (i.forEach((e) => {
					let n = t._edgeProperties[e], r = String(n._start_index), i = String(n._end_index);
					o[r] || (o[r] = []), o[r].push(e), o[i] || (o[i] = []), o[i].push(e);
				}), i.length <= 1) {
					t._edgeProperties[e.attrs]._ordered = i;
					return;
				}
				let s = i.length, c = /* @__PURE__ */ new Set(), l = null, u = (e, n) => {
					if (n.length === s) return l = n.slice(), !0;
					let r = o[e] || [];
					for (let i of r) {
						if (c.has(i)) continue;
						c.add(i);
						let r = t._edgeProperties[i], a = String(r._start_index), o = String(r._end_index), s = e === a ? o : a;
						if (n.push(i), u(s, n)) return !0;
						n.pop(), c.delete(i);
					}
					return !1;
				};
				if (u(String(r), []), l) {
					t._edgeProperties[e.attrs]._ordered = l;
					return;
				}
				let d = [], f = String(r), p = o[f] || [], m = p.length ? p[0] : null;
				for (; m != null;) {
					d.push(m);
					let e = t._edgeProperties[m], n = String(e._start_index), r = String(e._end_index), i = n === f ? r : n;
					f = i;
					let a = o[i] || [];
					if (a.length === 1) break;
					let s = null;
					for (let e of a) if (e !== m && !d.includes(e)) {
						s = e;
						break;
					}
					if (s == null) break;
					m = s;
				}
				for (let e of i) d.includes(e) || d.push(e);
				t._edgeProperties[e.attrs]._ordered = d;
			});
		});
	}, function() {
		t ? e.prototype._arrangeContractedPaths = t : delete e.prototype._arrangeContractedPaths;
	};
}
//#endregion
//#region src/isolines/isoPHAST.js
function Ti(e, t, n, r = {}) {
	if (!e || typeof e != "object") throw Error("Invalid prepared graph for isoPHAST");
	let { N: i } = e;
	if (!Number.isInteger(i)) throw Error("Prepared graph missing node count `N`.");
	let { direction: a = "from", mode: o = "car", outputUnscaled: s = !1 } = r;
	if (a !== "from" && a !== "to") throw Error("Invalid direction: expected \"from\" or \"to\".");
	if (!Number.isInteger(t) || t < 0 || t >= i) throw Error(`Invalid startId ${t}: expected integer in range 0..${i - 1}`);
	let c = new Float64Array(i).fill(Infinity), l = o === "pedestrian", u = e.distScale && Number.isFinite(e.distScale) ? e.distScale : 10;
	if (!e._chGraph || e._chGraphMode !== o || e._chGraphIsUndirected !== l || e._chGraphCostField !== e.costField || e._chGraphPenaltyKey !== e.penaltyKey) {
		let t = new q(), n = 0, r = e.edgeSrc || null, a = e.edgeTgt || null, s = e.edgeCostInt || null;
		if (r && a && s) for (let e = 0; e < r.length; e++) {
			let i = r[e], o = a[e], c = s[e] / u;
			t.addEdge(String(i), String(o), {
				_id: n++,
				_cost: c
			}, null, l);
		}
		else {
			let { adjPtr: r, adjTo: a, adjCost: o } = e;
			for (let e = 0; e < i; e++) for (let i = r[e]; i < r[e + 1]; i++) {
				let r = a[i], s = o[i] / u;
				t.addEdge(String(e), String(r), {
					_id: n++,
					_cost: s
				}, null, l);
			}
		}
		let c = wi(q);
		try {
			t.contractGraph();
		} finally {
			c();
		}
		e._chGraph = t, e._chGraphMode = o, e._chGraphIsUndirected = l, e._chGraphCostField = e.costField, e._chGraphPenaltyKey = e.penaltyKey, e._chFinder = e._chGraph.createPathfinder({});
	}
	let d = e._chFinder || e._chGraph.createPathfinder({});
	e._chFinder = d;
	let f = s && e.coordsArr && e.coordsArr[t] && e.costField === "distance" && e.coordsAreGeographic === !0, p = f ? e.coordsArr[t] : null;
	if (a === "from") for (let r = 0; r < i; r++) {
		if (r === t) {
			c[r] = 0;
			continue;
		}
		if (f) {
			let t = e.coordsArr[r];
			if (!t) {
				c[r] = Infinity;
				continue;
			}
			if (F(p, t) > n) {
				c[r] = Infinity;
				continue;
			}
		}
		try {
			let e = d.queryContractionHierarchy(String(t), String(r));
			e && Number.isFinite(e.total_cost) ? c[r] = e.total_cost === 0 && r !== t ? Infinity : e.total_cost : c[r] = Infinity;
		} catch {
			c[r] = Infinity;
		}
	}
	else for (let r = 0; r < i; r++) {
		if (r === t) {
			c[r] = 0;
			continue;
		}
		if (f) {
			let t = e.coordsArr[r];
			if (!t) {
				c[r] = Infinity;
				continue;
			}
			if (F(p, t) > n) {
				c[r] = Infinity;
				continue;
			}
		}
		try {
			let e = d.queryContractionHierarchy(String(r), String(t));
			e && Number.isFinite(e.total_cost) ? c[r] = e.total_cost === 0 && r !== t ? Infinity : e.total_cost : c[r] = Infinity;
		} catch {
			c[r] = Infinity;
		}
	}
	let m = [];
	for (let e = 0; e < i; e++) {
		let t = c[e];
		Number.isFinite(t) && t <= n && m.push(e);
	}
	if (!s) {
		let e = new Float64Array(i);
		for (let t = 0; t < i; t++) {
			let n = c[t];
			e[t] = Number.isFinite(n) ? Math.round(n * u) : Infinity;
		}
		return {
			distances: e,
			reachable: m
		};
	}
	return {
		distances: c,
		reachable: m
	};
}
//#endregion
//#region node_modules/robust-predicates/esm/util.js
var J = 11102230246251565e-32, Y = 134217729, Ei = (3 + 8 * J) * J;
function Di(e, t, n, r, i) {
	let a, o, s, c, l = t[0], u = r[0], d = 0, f = 0;
	u > l == u > -l ? (a = l, l = t[++d]) : (a = u, u = r[++f]);
	let p = 0;
	if (d < e && f < n) for (u > l == u > -l ? (o = l + a, s = a - (o - l), l = t[++d]) : (o = u + a, s = a - (o - u), u = r[++f]), a = o, s !== 0 && (i[p++] = s); d < e && f < n;) u > l == u > -l ? (o = a + l, c = o - a, s = a - (o - c) + (l - c), l = t[++d]) : (o = a + u, c = o - a, s = a - (o - c) + (u - c), u = r[++f]), a = o, s !== 0 && (i[p++] = s);
	for (; d < e;) o = a + l, c = o - a, s = a - (o - c) + (l - c), l = t[++d], a = o, s !== 0 && (i[p++] = s);
	for (; f < n;) o = a + u, c = o - a, s = a - (o - c) + (u - c), u = r[++f], a = o, s !== 0 && (i[p++] = s);
	return (a !== 0 || p === 0) && (i[p++] = a), p;
}
function Oi(e, t) {
	let n = t[0];
	for (let r = 1; r < e; r++) n += t[r];
	return n;
}
function X(e) {
	return new Float64Array(e);
}
//#endregion
//#region node_modules/robust-predicates/esm/orient2d.js
var ki = (3 + 16 * J) * J, Ai = (2 + 12 * J) * J, ji = (9 + 64 * J) * J * J, Mi = X(4), Ni = X(8), Pi = X(12), Fi = X(16), Z = X(4);
function Ii(e, t, n, r, i, a, o) {
	let s, c, l, u, d, f, p, m, h, g, _, v, y, b, x, S, C, w, T = e - i, E = n - i, D = t - a, O = r - a;
	b = T * O, f = Y * T, p = f - (f - T), m = T - p, f = Y * O, h = f - (f - O), g = O - h, x = m * g - (b - p * h - m * h - p * g), S = D * E, f = Y * D, p = f - (f - D), m = D - p, f = Y * E, h = f - (f - E), g = E - h, C = m * g - (S - p * h - m * h - p * g), _ = x - C, d = x - _, Mi[0] = x - (_ + d) + (d - C), v = b + _, d = v - b, y = b - (v - d) + (_ - d), _ = y - S, d = y - _, Mi[1] = y - (_ + d) + (d - S), w = v + _, d = w - v, Mi[2] = v - (w - d) + (_ - d), Mi[3] = w;
	let k = Oi(4, Mi), A = Ai * o;
	if (k >= A || -k >= A || (d = e - T, s = e - (T + d) + (d - i), d = n - E, l = n - (E + d) + (d - i), d = t - D, c = t - (D + d) + (d - a), d = r - O, u = r - (O + d) + (d - a), s === 0 && c === 0 && l === 0 && u === 0) || (A = ji * o + Ei * Math.abs(k), k += T * u + O * s - (D * l + E * c), k >= A || -k >= A)) return k;
	b = s * O, f = Y * s, p = f - (f - s), m = s - p, f = Y * O, h = f - (f - O), g = O - h, x = m * g - (b - p * h - m * h - p * g), S = c * E, f = Y * c, p = f - (f - c), m = c - p, f = Y * E, h = f - (f - E), g = E - h, C = m * g - (S - p * h - m * h - p * g), _ = x - C, d = x - _, Z[0] = x - (_ + d) + (d - C), v = b + _, d = v - b, y = b - (v - d) + (_ - d), _ = y - S, d = y - _, Z[1] = y - (_ + d) + (d - S), w = v + _, d = w - v, Z[2] = v - (w - d) + (_ - d), Z[3] = w;
	let ee = Di(4, Mi, 4, Z, Ni);
	b = T * u, f = Y * T, p = f - (f - T), m = T - p, f = Y * u, h = f - (f - u), g = u - h, x = m * g - (b - p * h - m * h - p * g), S = D * l, f = Y * D, p = f - (f - D), m = D - p, f = Y * l, h = f - (f - l), g = l - h, C = m * g - (S - p * h - m * h - p * g), _ = x - C, d = x - _, Z[0] = x - (_ + d) + (d - C), v = b + _, d = v - b, y = b - (v - d) + (_ - d), _ = y - S, d = y - _, Z[1] = y - (_ + d) + (d - S), w = v + _, d = w - v, Z[2] = v - (w - d) + (_ - d), Z[3] = w;
	let j = Di(ee, Ni, 4, Z, Pi);
	return b = s * u, f = Y * s, p = f - (f - s), m = s - p, f = Y * u, h = f - (f - u), g = u - h, x = m * g - (b - p * h - m * h - p * g), S = c * l, f = Y * c, p = f - (f - c), m = c - p, f = Y * l, h = f - (f - l), g = l - h, C = m * g - (S - p * h - m * h - p * g), _ = x - C, d = x - _, Z[0] = x - (_ + d) + (d - C), v = b + _, d = v - b, y = b - (v - d) + (_ - d), _ = y - S, d = y - _, Z[1] = y - (_ + d) + (d - S), w = v + _, d = w - v, Z[2] = v - (w - d) + (_ - d), Z[3] = w, Fi[Di(j, Pi, 4, Z, Fi) - 1];
}
function Li(e, t, n, r, i, a) {
	let o = (t - a) * (n - i), s = (e - i) * (r - a), c = o - s, l = Math.abs(o + s);
	return Math.abs(c) >= ki * l ? c : -Ii(e, t, n, r, i, a, l);
}
(7 + 56 * J) * J, (3 + 28 * J) * J, (26 + 288 * J) * J * J, X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(8), X(8), X(8), X(4), X(8), X(8), X(16), X(12), X(192), X(192), (10 + 96 * J) * J, (4 + 48 * J) * J, (44 + 576 * J) * J * J, X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(8), X(8), X(8), X(8), X(8), X(8), X(8), X(8), X(8), X(4), X(4), X(4), X(8), X(16), X(16), X(16), X(32), X(32), X(48), X(64), X(1152), X(1152), (16 + 224 * J) * J, (5 + 72 * J) * J, (71 + 1408 * J) * J * J, X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(4), X(24), X(24), X(24), X(24), X(24), X(24), X(24), X(24), X(24), X(24), X(1152), X(1152), X(1152), X(1152), X(1152), X(2304), X(2304), X(3456), X(5760), X(8), X(8), X(8), X(16), X(24), X(48), X(48), X(96), X(192), X(384), X(384), X(384), X(768), X(96), X(96), X(96), X(1152);
//#endregion
//#region node_modules/delaunator/index.js
var Ri = 2 ** -52, zi = new Uint32Array(512), Bi = class e {
	static from(t, n = Ji, r = Yi) {
		let i = t.length, a = new Float64Array(i * 2);
		for (let e = 0; e < i; e++) {
			let i = t[e];
			a[2 * e] = n(i), a[2 * e + 1] = r(i);
		}
		return new e(a);
	}
	constructor(e) {
		let t = e.length >> 1;
		if (t > 0 && typeof e[0] != "number") throw Error("Expected coords to contain numbers.");
		this.coords = e;
		let n = Math.max(2 * t - 5, 0);
		this._triangles = new Uint32Array(n * 3), this._halfedges = new Int32Array(n * 3), this._hashSize = Math.ceil(Math.sqrt(t)), this._hullPrev = new Uint32Array(t), this._hullNext = new Uint32Array(t), this._hullTri = new Uint32Array(t), this._hullHash = new Int32Array(this._hashSize), this._ids = new Uint32Array(t), this._dists = new Float64Array(t), this.trianglesLen = 0, this._cx = 0, this._cy = 0, this._hullStart = 0, this.hull = this._triangles, this.triangles = this._triangles, this.halfedges = this._halfedges, this.update();
	}
	update() {
		let { coords: e, _hullPrev: t, _hullNext: n, _hullTri: r, _hullHash: i } = this, a = e.length >> 1, o = Infinity, s = Infinity, c = -Infinity, l = -Infinity;
		for (let t = 0; t < a; t++) {
			let n = e[2 * t], r = e[2 * t + 1];
			n < o && (o = n), r < s && (s = r), n > c && (c = n), r > l && (l = r), this._ids[t] = t;
		}
		let u = (o + c) / 2, d = (s + l) / 2, f = 0, p = 0, m = 0;
		for (let t = 0, n = Infinity; t < a; t++) {
			let r = Hi(u, d, e[2 * t], e[2 * t + 1]);
			r < n && (f = t, n = r);
		}
		let h = e[2 * f], g = e[2 * f + 1];
		for (let t = 0, n = Infinity; t < a; t++) {
			if (t === f) continue;
			let r = Hi(h, g, e[2 * t], e[2 * t + 1]);
			r < n && r > 0 && (p = t, n = r);
		}
		let _ = e[2 * p], v = e[2 * p + 1], y = Infinity;
		for (let t = 0; t < a; t++) {
			if (t === f || t === p) continue;
			let n = Wi(h, g, _, v, e[2 * t], e[2 * t + 1]);
			n < y && (m = t, y = n);
		}
		let b = e[2 * m], x = e[2 * m + 1];
		if (y === Infinity) {
			for (let t = 0; t < a; t++) this._dists[t] = e[2 * t] - e[0] || e[2 * t + 1] - e[1];
			Ki(this._ids, this._dists, 0, a - 1);
			let t = new Uint32Array(a), n = 0;
			for (let e = 0, r = -Infinity; e < a; e++) {
				let i = this._ids[e], a = this._dists[i];
				a > r && (t[n++] = i, r = a);
			}
			this.hull = t.subarray(0, n), this.triangles = new Uint32Array(), this.halfedges = new Int32Array();
			return;
		}
		if (Li(h, g, _, v, b, x) < 0) {
			let e = p, t = _, n = v;
			p = m, _ = b, v = x, m = e, b = t, x = n;
		}
		let S = Gi(h, g, _, v, b, x);
		this._cx = S.x, this._cy = S.y;
		for (let t = 0; t < a; t++) this._dists[t] = Hi(e[2 * t], e[2 * t + 1], S.x, S.y);
		Ki(this._ids, this._dists, 0, a - 1), this._hullStart = f;
		let C = 3;
		n[f] = t[m] = p, n[p] = t[f] = m, n[m] = t[p] = f, r[f] = 0, r[p] = 1, r[m] = 2, i.fill(-1), i[this._hashKey(h, g)] = f, i[this._hashKey(_, v)] = p, i[this._hashKey(b, x)] = m, this.trianglesLen = 0, this._addTriangle(f, p, m, -1, -1, -1);
		for (let a = 0, o = 0, s = 0; a < this._ids.length; a++) {
			let c = this._ids[a], l = e[2 * c], u = e[2 * c + 1];
			if (a > 0 && Math.abs(l - o) <= Ri && Math.abs(u - s) <= Ri || (o = l, s = u, c === f || c === p || c === m)) continue;
			let d = 0;
			for (let e = 0, t = this._hashKey(l, u); e < this._hashSize && (d = i[(t + e) % this._hashSize], !(d !== -1 && d !== n[d])); e++);
			d = t[d];
			let h = d, g;
			for (; g = n[h], Li(l, u, e[2 * h], e[2 * h + 1], e[2 * g], e[2 * g + 1]) >= 0;) if (h = g, h === d) {
				h = -1;
				break;
			}
			if (h === -1) continue;
			let _ = this._addTriangle(h, c, n[h], -1, -1, r[h]);
			r[c] = this._legalize(_ + 2), r[h] = _, C++;
			let v = n[h];
			for (; g = n[v], Li(l, u, e[2 * v], e[2 * v + 1], e[2 * g], e[2 * g + 1]) < 0;) _ = this._addTriangle(v, c, g, r[c], -1, r[v]), r[c] = this._legalize(_ + 2), n[v] = v, C--, v = g;
			if (h === d) for (; g = t[h], Li(l, u, e[2 * g], e[2 * g + 1], e[2 * h], e[2 * h + 1]) < 0;) _ = this._addTriangle(g, c, h, -1, r[h], r[g]), this._legalize(_ + 2), r[g] = _, n[h] = h, C--, h = g;
			this._hullStart = t[c] = h, n[h] = t[v] = c, n[c] = v, i[this._hashKey(l, u)] = c, i[this._hashKey(e[2 * h], e[2 * h + 1])] = h;
		}
		this.hull = new Uint32Array(C);
		for (let e = 0, t = this._hullStart; e < C; e++) this.hull[e] = t, t = n[t];
		this.triangles = this._triangles.subarray(0, this.trianglesLen), this.halfedges = this._halfedges.subarray(0, this.trianglesLen);
	}
	_hashKey(e, t) {
		return Math.floor(Vi(e - this._cx, t - this._cy) * this._hashSize) % this._hashSize;
	}
	_legalize(e) {
		let { _triangles: t, _halfedges: n, coords: r } = this, i = 0, a = 0;
		for (;;) {
			let o = n[e], s = e - e % 3;
			if (a = s + (e + 2) % 3, o === -1) {
				if (i === 0) break;
				e = zi[--i];
				continue;
			}
			let c = o - o % 3, l = s + (e + 1) % 3, u = c + (o + 2) % 3, d = t[a], f = t[e], p = t[l], m = t[u];
			if (Ui(r[2 * d], r[2 * d + 1], r[2 * f], r[2 * f + 1], r[2 * p], r[2 * p + 1], r[2 * m], r[2 * m + 1])) {
				t[e] = m, t[o] = d;
				let r = n[u];
				if (r === -1) {
					let t = this._hullStart;
					do {
						if (this._hullTri[t] === u) {
							this._hullTri[t] = e;
							break;
						}
						t = this._hullPrev[t];
					} while (t !== this._hullStart);
				}
				this._link(e, r), this._link(o, n[a]), this._link(a, u);
				let s = c + (o + 1) % 3;
				i < zi.length && (zi[i++] = s);
			} else {
				if (i === 0) break;
				e = zi[--i];
			}
		}
		return a;
	}
	_link(e, t) {
		this._halfedges[e] = t, t !== -1 && (this._halfedges[t] = e);
	}
	_addTriangle(e, t, n, r, i, a) {
		let o = this.trianglesLen;
		return this._triangles[o] = e, this._triangles[o + 1] = t, this._triangles[o + 2] = n, this._link(o, r), this._link(o + 1, i), this._link(o + 2, a), this.trianglesLen += 3, o;
	}
};
function Vi(e, t) {
	let n = e / (Math.abs(e) + Math.abs(t));
	return (t > 0 ? 3 - n : 1 + n) / 4;
}
function Hi(e, t, n, r) {
	let i = e - n, a = t - r;
	return i * i + a * a;
}
function Ui(e, t, n, r, i, a, o, s) {
	let c = e - o, l = t - s, u = n - o, d = r - s, f = i - o, p = a - s, m = c * c + l * l, h = u * u + d * d, g = f * f + p * p;
	return c * (d * g - h * p) - l * (u * g - h * f) + m * (u * p - d * f) < 0;
}
function Wi(e, t, n, r, i, a) {
	let o = n - e, s = r - t, c = i - e, l = a - t, u = o * o + s * s, d = c * c + l * l, f = .5 / (o * l - s * c), p = (l * u - s * d) * f, m = (o * d - c * u) * f;
	return p * p + m * m;
}
function Gi(e, t, n, r, i, a) {
	let o = n - e, s = r - t, c = i - e, l = a - t, u = o * o + s * s, d = c * c + l * l, f = .5 / (o * l - s * c);
	return {
		x: e + (l * u - s * d) * f,
		y: t + (o * d - c * u) * f
	};
}
function Ki(e, t, n, r) {
	if (r - n <= 20) for (let i = n + 1; i <= r; i++) {
		let r = e[i], a = t[r], o = i - 1;
		for (; o >= n && t[e[o]] > a;) e[o + 1] = e[o--];
		e[o + 1] = r;
	}
	else {
		let i = n + r >> 1, a = n + 1, o = r;
		qi(e, i, a), t[e[n]] > t[e[r]] && qi(e, n, r), t[e[a]] > t[e[r]] && qi(e, a, r), t[e[n]] > t[e[a]] && qi(e, n, a);
		let s = e[a], c = t[s];
		for (;;) {
			do
				a++;
			while (t[e[a]] < c);
			do
				o--;
			while (t[e[o]] > c);
			if (o < a) break;
			qi(e, a, o);
		}
		e[n + 1] = e[o], e[o] = s, r - a + 1 >= o - n ? (Ki(e, t, a, r), Ki(e, t, n, o - 1)) : (Ki(e, t, n, o - 1), Ki(e, t, a, r));
	}
}
function qi(e, t, n) {
	let r = e[t];
	e[t] = e[n], e[n] = r;
}
function Ji(e) {
	return e[0];
}
function Yi(e) {
	return e[1];
}
//#endregion
//#region node_modules/d3-delaunay/src/path.js
var Xi = 1e-6, Zi = class {
	constructor() {
		this._x0 = this._y0 = this._x1 = this._y1 = null, this._ = "";
	}
	moveTo(e, t) {
		this._ += `M${this._x0 = this._x1 = +e},${this._y0 = this._y1 = +t}`;
	}
	closePath() {
		this._x1 !== null && (this._x1 = this._x0, this._y1 = this._y0, this._ += "Z");
	}
	lineTo(e, t) {
		this._ += `L${this._x1 = +e},${this._y1 = +t}`;
	}
	arc(e, t, n) {
		e = +e, t = +t, n = +n;
		let r = e + n, i = t;
		if (n < 0) throw Error("negative radius");
		this._x1 === null ? this._ += `M${r},${i}` : (Math.abs(this._x1 - r) > Xi || Math.abs(this._y1 - i) > Xi) && (this._ += "L" + r + "," + i), n && (this._ += `A${n},${n},0,1,1,${e - n},${t}A${n},${n},0,1,1,${this._x1 = r},${this._y1 = i}`);
	}
	rect(e, t, n, r) {
		this._ += `M${this._x0 = this._x1 = +e},${this._y0 = this._y1 = +t}h${+n}v${+r}h${-n}Z`;
	}
	value() {
		return this._ || null;
	}
}, Qi = class {
	constructor() {
		this._ = [];
	}
	moveTo(e, t) {
		this._.push([e, t]);
	}
	closePath() {
		this._.push(this._[0].slice());
	}
	lineTo(e, t) {
		this._.push([e, t]);
	}
	value() {
		return this._.length ? this._ : null;
	}
}, $i = class {
	constructor(e, [t, n, r, i] = [
		0,
		0,
		960,
		500
	]) {
		if (!((r = +r) >= (t = +t)) || !((i = +i) >= (n = +n))) throw Error("invalid bounds");
		this.delaunay = e, this._circumcenters = new Float64Array(e.points.length * 2), this.vectors = new Float64Array(e.points.length * 2), this.xmax = r, this.xmin = t, this.ymax = i, this.ymin = n, this._init();
	}
	update() {
		return this.delaunay.update(), this._init(), this;
	}
	_init() {
		let { delaunay: { points: e, hull: t, triangles: n }, vectors: r } = this, i, a, o = this.circumcenters = this._circumcenters.subarray(0, n.length / 3 * 2);
		for (let r = 0, s = 0, c = n.length, l, u; r < c; r += 3, s += 2) {
			let c = n[r] * 2, d = n[r + 1] * 2, f = n[r + 2] * 2, p = e[c], m = e[c + 1], h = e[d], g = e[d + 1], _ = e[f], v = e[f + 1], y = h - p, b = g - m, x = _ - p, S = v - m, C = (y * S - b * x) * 2;
			if (Math.abs(C) < 1e-9) {
				if (i === void 0) {
					i = a = 0;
					for (let n of t) i += e[n * 2], a += e[n * 2 + 1];
					i /= t.length, a /= t.length;
				}
				let n = 1e9 * Math.sign((i - p) * S - (a - m) * x);
				l = (p + _) / 2 - n * S, u = (m + v) / 2 + n * x;
			} else {
				let e = 1 / C, t = y * y + b * b, n = x * x + S * S;
				l = p + (S * t - b * n) * e, u = m + (y * n - x * t) * e;
			}
			o[s] = l, o[s + 1] = u;
		}
		let s = t[t.length - 1], c, l = s * 4, u, d = e[2 * s], f, p = e[2 * s + 1];
		r.fill(0);
		for (let n = 0; n < t.length; ++n) s = t[n], c = l, u = d, f = p, l = s * 4, d = e[2 * s], p = e[2 * s + 1], r[c + 2] = r[l] = f - p, r[c + 3] = r[l + 1] = d - u;
	}
	render(e) {
		let t = e == null ? e = new Zi() : void 0, { delaunay: { halfedges: n, inedges: r, hull: i }, circumcenters: a, vectors: o } = this;
		if (i.length <= 1) return null;
		for (let t = 0, r = n.length; t < r; ++t) {
			let r = n[t];
			if (r < t) continue;
			let i = Math.floor(t / 3) * 2, o = Math.floor(r / 3) * 2, s = a[i], c = a[i + 1], l = a[o], u = a[o + 1];
			this._renderSegment(s, c, l, u, e);
		}
		let s, c = i[i.length - 1];
		for (let t = 0; t < i.length; ++t) {
			s = c, c = i[t];
			let n = Math.floor(r[c] / 3) * 2, l = a[n], u = a[n + 1], d = s * 4, f = this._project(l, u, o[d + 2], o[d + 3]);
			f && this._renderSegment(l, u, f[0], f[1], e);
		}
		return t && t.value();
	}
	renderBounds(e) {
		let t = e == null ? e = new Zi() : void 0;
		return e.rect(this.xmin, this.ymin, this.xmax - this.xmin, this.ymax - this.ymin), t && t.value();
	}
	renderCell(e, t) {
		let n = t == null ? t = new Zi() : void 0, r = this._clip(e);
		if (r === null || !r.length) return;
		t.moveTo(r[0], r[1]);
		let i = r.length;
		for (; r[0] === r[i - 2] && r[1] === r[i - 1] && i > 1;) i -= 2;
		for (let e = 2; e < i; e += 2) (r[e] !== r[e - 2] || r[e + 1] !== r[e - 1]) && t.lineTo(r[e], r[e + 1]);
		return t.closePath(), n && n.value();
	}
	*cellPolygons() {
		let { delaunay: { points: e } } = this;
		for (let t = 0, n = e.length / 2; t < n; ++t) {
			let e = this.cellPolygon(t);
			e && (e.index = t, yield e);
		}
	}
	cellPolygon(e) {
		let t = new Qi();
		return this.renderCell(e, t), t.value();
	}
	_renderSegment(e, t, n, r, i) {
		let a, o = this._regioncode(e, t), s = this._regioncode(n, r);
		o === 0 && s === 0 ? (i.moveTo(e, t), i.lineTo(n, r)) : (a = this._clipSegment(e, t, n, r, o, s)) && (i.moveTo(a[0], a[1]), i.lineTo(a[2], a[3]));
	}
	contains(e, t, n) {
		return (t = +t, t !== t) || (n = +n, n !== n) ? !1 : this.delaunay._step(e, t, n) === e;
	}
	*neighbors(e) {
		let t = this._clip(e);
		if (t) for (let n of this.delaunay.neighbors(e)) {
			let e = this._clip(n);
			if (e) {
				loop: for (let r = 0, i = t.length; r < i; r += 2) for (let a = 0, o = e.length; a < o; a += 2) if (t[r] === e[a] && t[r + 1] === e[a + 1] && t[(r + 2) % i] === e[(a + o - 2) % o] && t[(r + 3) % i] === e[(a + o - 1) % o]) {
					yield n;
					break loop;
				}
			}
		}
	}
	_cell(e) {
		let { circumcenters: t, delaunay: { inedges: n, halfedges: r, triangles: i } } = this, a = n[e];
		if (a === -1) return null;
		let o = [], s = a;
		do {
			let n = Math.floor(s / 3);
			if (o.push(t[n * 2], t[n * 2 + 1]), s = s % 3 == 2 ? s - 2 : s + 1, i[s] !== e) break;
			s = r[s];
		} while (s !== a && s !== -1);
		return o;
	}
	_clip(e) {
		if (e === 0 && this.delaunay.hull.length === 1) return [
			this.xmax,
			this.ymin,
			this.xmax,
			this.ymax,
			this.xmin,
			this.ymax,
			this.xmin,
			this.ymin
		];
		let t = this._cell(e);
		if (t === null) return null;
		let { vectors: n } = this, r = e * 4;
		return this._simplify(n[r] || n[r + 1] ? this._clipInfinite(e, t, n[r], n[r + 1], n[r + 2], n[r + 3]) : this._clipFinite(e, t));
	}
	_clipFinite(e, t) {
		let n = t.length, r = null, i, a, o = t[n - 2], s = t[n - 1], c, l = this._regioncode(o, s), u, d = 0;
		for (let f = 0; f < n; f += 2) if (i = o, a = s, o = t[f], s = t[f + 1], c = l, l = this._regioncode(o, s), c === 0 && l === 0) u = d, d = 0, r ? r.push(o, s) : r = [o, s];
		else {
			let t, n, f, p, m;
			if (c === 0) {
				if ((t = this._clipSegment(i, a, o, s, c, l)) === null) continue;
				[n, f, p, m] = t;
			} else {
				if ((t = this._clipSegment(o, s, i, a, l, c)) === null) continue;
				[p, m, n, f] = t, u = d, d = this._edgecode(n, f), u && d && this._edge(e, u, d, r, r.length), r ? r.push(n, f) : r = [n, f];
			}
			u = d, d = this._edgecode(p, m), u && d && this._edge(e, u, d, r, r.length), r ? r.push(p, m) : r = [p, m];
		}
		if (r) u = d, d = this._edgecode(r[0], r[1]), u && d && this._edge(e, u, d, r, r.length);
		else if (this.contains(e, (this.xmin + this.xmax) / 2, (this.ymin + this.ymax) / 2)) return [
			this.xmax,
			this.ymin,
			this.xmax,
			this.ymax,
			this.xmin,
			this.ymax,
			this.xmin,
			this.ymin
		];
		return r;
	}
	_clipSegment(e, t, n, r, i, a) {
		let o = i < a;
		for (o && ([e, t, n, r, i, a] = [
			n,
			r,
			e,
			t,
			a,
			i
		]);;) {
			if (i === 0 && a === 0) return o ? [
				n,
				r,
				e,
				t
			] : [
				e,
				t,
				n,
				r
			];
			if (i & a) return null;
			let s, c, l = i || a;
			l & 8 ? (s = e + (n - e) * (this.ymax - t) / (r - t), c = this.ymax) : l & 4 ? (s = e + (n - e) * (this.ymin - t) / (r - t), c = this.ymin) : l & 2 ? (c = t + (r - t) * (this.xmax - e) / (n - e), s = this.xmax) : (c = t + (r - t) * (this.xmin - e) / (n - e), s = this.xmin), i ? (e = s, t = c, i = this._regioncode(e, t)) : (n = s, r = c, a = this._regioncode(n, r));
		}
	}
	_clipInfinite(e, t, n, r, i, a) {
		let o = Array.from(t), s;
		if ((s = this._project(o[0], o[1], n, r)) && o.unshift(s[0], s[1]), (s = this._project(o[o.length - 2], o[o.length - 1], i, a)) && o.push(s[0], s[1]), o = this._clipFinite(e, o)) for (let t = 0, n = o.length, r, i = this._edgecode(o[n - 2], o[n - 1]); t < n; t += 2) r = i, i = this._edgecode(o[t], o[t + 1]), r && i && (t = this._edge(e, r, i, o, t), n = o.length);
		else this.contains(e, (this.xmin + this.xmax) / 2, (this.ymin + this.ymax) / 2) && (o = [
			this.xmin,
			this.ymin,
			this.xmax,
			this.ymin,
			this.xmax,
			this.ymax,
			this.xmin,
			this.ymax
		]);
		return o;
	}
	_edge(e, t, n, r, i) {
		for (; t !== n;) {
			let n, a;
			switch (t) {
				case 5:
					t = 4;
					continue;
				case 4:
					t = 6, n = this.xmax, a = this.ymin;
					break;
				case 6:
					t = 2;
					continue;
				case 2:
					t = 10, n = this.xmax, a = this.ymax;
					break;
				case 10:
					t = 8;
					continue;
				case 8:
					t = 9, n = this.xmin, a = this.ymax;
					break;
				case 9:
					t = 1;
					continue;
				case 1:
					t = 5, n = this.xmin, a = this.ymin;
					break;
			}
			(r[i] !== n || r[i + 1] !== a) && this.contains(e, n, a) && (r.splice(i, 0, n, a), i += 2);
		}
		return i;
	}
	_project(e, t, n, r) {
		let i = Infinity, a, o, s;
		if (r < 0) {
			if (t <= this.ymin) return null;
			(a = (this.ymin - t) / r) < i && (s = this.ymin, o = e + (i = a) * n);
		} else if (r > 0) {
			if (t >= this.ymax) return null;
			(a = (this.ymax - t) / r) < i && (s = this.ymax, o = e + (i = a) * n);
		}
		if (n > 0) {
			if (e >= this.xmax) return null;
			(a = (this.xmax - e) / n) < i && (o = this.xmax, s = t + (i = a) * r);
		} else if (n < 0) {
			if (e <= this.xmin) return null;
			(a = (this.xmin - e) / n) < i && (o = this.xmin, s = t + (i = a) * r);
		}
		return [o, s];
	}
	_edgecode(e, t) {
		return (e === this.xmin ? 1 : e === this.xmax ? 2 : 0) | (t === this.ymin ? 4 : t === this.ymax ? 8 : 0);
	}
	_regioncode(e, t) {
		return (e < this.xmin ? 1 : e > this.xmax ? 2 : 0) | (t < this.ymin ? 4 : t > this.ymax ? 8 : 0);
	}
	_simplify(e) {
		if (e && e.length > 4) {
			for (let t = 0; t < e.length; t += 2) {
				let n = (t + 2) % e.length, r = (t + 4) % e.length;
				(e[t] === e[n] && e[n] === e[r] || e[t + 1] === e[n + 1] && e[n + 1] === e[r + 1]) && (e.splice(n, 2), t -= 2);
			}
			e.length || (e = null);
		}
		return e;
	}
}, ea = 2 * Math.PI, ta = Math.pow;
function na(e) {
	return e[0];
}
function ra(e) {
	return e[1];
}
function ia(e) {
	let { triangles: t, coords: n } = e;
	for (let e = 0; e < t.length; e += 3) {
		let r = 2 * t[e], i = 2 * t[e + 1], a = 2 * t[e + 2];
		if ((n[a] - n[r]) * (n[i + 1] - n[r + 1]) - (n[i] - n[r]) * (n[a + 1] - n[r + 1]) > 1e-10) return !1;
	}
	return !0;
}
function aa(e, t, n) {
	return [e + Math.sin(e + t) * n, t + Math.cos(e - t) * n];
}
var oa = class e {
	static from(t, n = na, r = ra, i) {
		return new e("length" in t ? sa(t, n, r, i) : Float64Array.from(ca(t, n, r, i)));
	}
	constructor(e) {
		this._delaunator = new Bi(e), this.inedges = new Int32Array(e.length / 2), this._hullIndex = new Int32Array(e.length / 2), this.points = this._delaunator.coords, this._init();
	}
	update() {
		return this._delaunator.update(), this._init(), this;
	}
	_init() {
		let e = this._delaunator, t = this.points;
		if (e.hull && e.hull.length > 2 && ia(e)) {
			this.collinear = Int32Array.from({ length: t.length / 2 }, (e, t) => t).sort((e, n) => t[2 * e] - t[2 * n] || t[2 * e + 1] - t[2 * n + 1]);
			let e = this.collinear[0], n = this.collinear[this.collinear.length - 1], r = [
				t[2 * e],
				t[2 * e + 1],
				t[2 * n],
				t[2 * n + 1]
			], i = 1e-8 * Math.hypot(r[3] - r[1], r[2] - r[0]);
			for (let e = 0, n = t.length / 2; e < n; ++e) {
				let n = aa(t[2 * e], t[2 * e + 1], i);
				t[2 * e] = n[0], t[2 * e + 1] = n[1];
			}
			this._delaunator = new Bi(t);
		} else delete this.collinear;
		let n = this.halfedges = this._delaunator.halfedges, r = this.hull = this._delaunator.hull, i = this.triangles = this._delaunator.triangles, a = this.inedges.fill(-1), o = this._hullIndex.fill(-1);
		for (let e = 0, t = n.length; e < t; ++e) {
			let t = i[e % 3 == 2 ? e - 2 : e + 1];
			(n[e] === -1 || a[t] === -1) && (a[t] = e);
		}
		for (let e = 0, t = r.length; e < t; ++e) o[r[e]] = e;
		r.length <= 2 && r.length > 0 && (this.triangles = new Int32Array(3).fill(-1), this.halfedges = new Int32Array(3).fill(-1), this.triangles[0] = r[0], a[r[0]] = 1, r.length === 2 && (a[r[1]] = 0, this.triangles[1] = r[1], this.triangles[2] = r[1]));
	}
	voronoi(e) {
		return new $i(this, e);
	}
	*neighbors(e) {
		let { inedges: t, hull: n, _hullIndex: r, halfedges: i, triangles: a, collinear: o } = this;
		if (o) {
			let t = o.indexOf(e);
			t > 0 && (yield o[t - 1]), t < o.length - 1 && (yield o[t + 1]);
			return;
		}
		let s = t[e];
		if (s === -1) return;
		let c = s, l = -1;
		do {
			if (yield l = a[c], c = c % 3 == 2 ? c - 2 : c + 1, a[c] !== e) return;
			if (c = i[c], c === -1) {
				let t = n[(r[e] + 1) % n.length];
				t !== l && (yield t);
				return;
			}
		} while (c !== s);
	}
	find(e, t, n = 0) {
		if ((e = +e, e !== e) || (t = +t, t !== t)) return -1;
		let r = n, i;
		for (; (i = this._step(n, e, t)) >= 0 && i !== n && i !== r;) n = i;
		return i;
	}
	_step(e, t, n) {
		let { inedges: r, hull: i, _hullIndex: a, halfedges: o, triangles: s, points: c } = this;
		if (r[e] === -1 || !c.length) return (e + 1) % (c.length >> 1);
		let l = e, u = ta(t - c[e * 2], 2) + ta(n - c[e * 2 + 1], 2), d = r[e], f = d;
		do {
			let r = s[f], d = ta(t - c[r * 2], 2) + ta(n - c[r * 2 + 1], 2);
			if (d < u && (u = d, l = r), f = f % 3 == 2 ? f - 2 : f + 1, s[f] !== e) break;
			if (f = o[f], f === -1) {
				if (f = i[(a[e] + 1) % i.length], f !== r && ta(t - c[f * 2], 2) + ta(n - c[f * 2 + 1], 2) < u) return f;
				break;
			}
		} while (f !== d);
		return l;
	}
	render(e) {
		let t = e == null ? e = new Zi() : void 0, { points: n, halfedges: r, triangles: i } = this;
		for (let t = 0, a = r.length; t < a; ++t) {
			let a = r[t];
			if (a < t) continue;
			let o = i[t] * 2, s = i[a] * 2;
			e.moveTo(n[o], n[o + 1]), e.lineTo(n[s], n[s + 1]);
		}
		return this.renderHull(e), t && t.value();
	}
	renderPoints(e, t) {
		t === void 0 && (!e || typeof e.moveTo != "function") && (t = e, e = null), t = t == null ? 2 : +t;
		let n = e == null ? e = new Zi() : void 0, { points: r } = this;
		for (let n = 0, i = r.length; n < i; n += 2) {
			let i = r[n], a = r[n + 1];
			e.moveTo(i + t, a), e.arc(i, a, t, 0, ea);
		}
		return n && n.value();
	}
	renderHull(e) {
		let t = e == null ? e = new Zi() : void 0, { hull: n, points: r } = this, i = n[0] * 2, a = n.length;
		e.moveTo(r[i], r[i + 1]);
		for (let t = 1; t < a; ++t) {
			let i = 2 * n[t];
			e.lineTo(r[i], r[i + 1]);
		}
		return e.closePath(), t && t.value();
	}
	hullPolygon() {
		let e = new Qi();
		return this.renderHull(e), e.value();
	}
	renderTriangle(e, t) {
		let n = t == null ? t = new Zi() : void 0, { points: r, triangles: i } = this, a = i[e *= 3] * 2, o = i[e + 1] * 2, s = i[e + 2] * 2;
		return t.moveTo(r[a], r[a + 1]), t.lineTo(r[o], r[o + 1]), t.lineTo(r[s], r[s + 1]), t.closePath(), n && n.value();
	}
	*trianglePolygons() {
		let { triangles: e } = this;
		for (let t = 0, n = e.length / 3; t < n; ++t) yield this.trianglePolygon(t);
	}
	trianglePolygon(e) {
		let t = new Qi();
		return this.renderTriangle(e, t), t.value();
	}
};
function sa(e, t, n, r) {
	let i = e.length, a = new Float64Array(i * 2);
	for (let o = 0; o < i; ++o) {
		let i = e[o];
		a[o * 2] = t.call(r, i, o, e), a[o * 2 + 1] = n.call(r, i, o, e);
	}
	return a;
}
function* ca(e, t, n, r) {
	let i = 0;
	for (let a of e) yield t.call(r, a, i, e), yield n.call(r, a, i, e), ++i;
}
//#endregion
//#region node_modules/d3-array/src/ascending.js
function la(e, t) {
	return e == null || t == null ? NaN : e < t ? -1 : e > t ? 1 : e >= t ? 0 : NaN;
}
//#endregion
//#region node_modules/d3-array/src/descending.js
function ua(e, t) {
	return e == null || t == null ? NaN : t < e ? -1 : t > e ? 1 : t >= e ? 0 : NaN;
}
//#endregion
//#region node_modules/d3-array/src/bisector.js
function da(e) {
	let t, n, r;
	e.length === 2 ? (t = e === la || e === ua ? e : fa, n = e, r = e) : (t = la, n = (t, n) => la(e(t), n), r = (t, n) => e(t) - n);
	function i(e, r, i = 0, a = e.length) {
		if (i < a) {
			if (t(r, r) !== 0) return a;
			do {
				let t = i + a >>> 1;
				n(e[t], r) < 0 ? i = t + 1 : a = t;
			} while (i < a);
		}
		return i;
	}
	function a(e, r, i = 0, a = e.length) {
		if (i < a) {
			if (t(r, r) !== 0) return a;
			do {
				let t = i + a >>> 1;
				n(e[t], r) <= 0 ? i = t + 1 : a = t;
			} while (i < a);
		}
		return i;
	}
	function o(e, t, n = 0, a = e.length) {
		let o = i(e, t, n, a - 1);
		return o > n && r(e[o - 1], t) > -r(e[o], t) ? o - 1 : o;
	}
	return {
		left: i,
		center: o,
		right: a
	};
}
function fa() {
	return 0;
}
//#endregion
//#region node_modules/d3-array/src/number.js
function pa(e) {
	return e === null ? NaN : +e;
}
//#endregion
//#region node_modules/d3-array/src/bisect.js
var ma = da(la), ha = ma.right;
ma.left, da(pa).center;
//#endregion
//#region node_modules/d3-array/src/ticks.js
var ga = Math.sqrt(50), _a = Math.sqrt(10), va = Math.sqrt(2);
function ya(e, t, n) {
	let r = (t - e) / Math.max(0, n), i = Math.floor(Math.log10(r)), a = r / 10 ** i, o = a >= ga ? 10 : a >= _a ? 5 : a >= va ? 2 : 1, s, c, l;
	return i < 0 ? (l = 10 ** -i / o, s = Math.round(e * l), c = Math.round(t * l), s / l < e && ++s, c / l > t && --c, l = -l) : (l = 10 ** i * o, s = Math.round(e / l), c = Math.round(t / l), s * l < e && ++s, c * l > t && --c), c < s && .5 <= n && n < 2 ? ya(e, t, n * 2) : [
		s,
		c,
		l
	];
}
function ba(e, t, n) {
	if (t = +t, e = +e, n = +n, !(n > 0)) return [];
	if (e === t) return [e];
	let r = t < e, [i, a, o] = r ? ya(t, e, n) : ya(e, t, n);
	if (!(a >= i)) return [];
	let s = a - i + 1, c = Array(s);
	if (r) if (o < 0) for (let e = 0; e < s; ++e) c[e] = (a - e) / -o;
	else for (let e = 0; e < s; ++e) c[e] = (a - e) * o;
	else if (o < 0) for (let e = 0; e < s; ++e) c[e] = (i + e) / -o;
	else for (let e = 0; e < s; ++e) c[e] = (i + e) * o;
	return c;
}
function xa(e, t, n) {
	return t = +t, e = +e, n = +n, ya(e, t, n)[2];
}
function Sa(e, t, n) {
	t = +t, e = +e, n = +n;
	let r = t < e, i = r ? xa(t, e, n) : xa(e, t, n);
	return (r ? -1 : 1) * (i < 0 ? 1 / -i : i);
}
//#endregion
//#region node_modules/d3-scale/src/init.js
function Ca(e, t) {
	switch (arguments.length) {
		case 0: break;
		case 1:
			this.range(e);
			break;
		default:
			this.range(t).domain(e);
			break;
	}
	return this;
}
//#endregion
//#region node_modules/d3-color/src/define.js
function wa(e, t, n) {
	e.prototype = t.prototype = n, n.constructor = e;
}
function Ta(e, t) {
	var n = Object.create(e.prototype);
	for (var r in t) n[r] = t[r];
	return n;
}
//#endregion
//#region node_modules/d3-color/src/color.js
function Ea() {}
var Da = .7, Oa = 1 / Da, ka = "\\s*([+-]?\\d+)\\s*", Aa = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)\\s*", ja = "\\s*([+-]?(?:\\d*\\.)?\\d+(?:[eE][+-]?\\d+)?)%\\s*", Ma = /^#([0-9a-f]{3,8})$/, Na = RegExp(`^rgb\\(${ka},${ka},${ka}\\)$`), Pa = RegExp(`^rgb\\(${ja},${ja},${ja}\\)$`), Fa = RegExp(`^rgba\\(${ka},${ka},${ka},${Aa}\\)$`), Ia = RegExp(`^rgba\\(${ja},${ja},${ja},${Aa}\\)$`), La = RegExp(`^hsl\\(${Aa},${ja},${ja}\\)$`), Ra = RegExp(`^hsla\\(${Aa},${ja},${ja},${Aa}\\)$`), za = {
	aliceblue: 15792383,
	antiquewhite: 16444375,
	aqua: 65535,
	aquamarine: 8388564,
	azure: 15794175,
	beige: 16119260,
	bisque: 16770244,
	black: 0,
	blanchedalmond: 16772045,
	blue: 255,
	blueviolet: 9055202,
	brown: 10824234,
	burlywood: 14596231,
	cadetblue: 6266528,
	chartreuse: 8388352,
	chocolate: 13789470,
	coral: 16744272,
	cornflowerblue: 6591981,
	cornsilk: 16775388,
	crimson: 14423100,
	cyan: 65535,
	darkblue: 139,
	darkcyan: 35723,
	darkgoldenrod: 12092939,
	darkgray: 11119017,
	darkgreen: 25600,
	darkgrey: 11119017,
	darkkhaki: 12433259,
	darkmagenta: 9109643,
	darkolivegreen: 5597999,
	darkorange: 16747520,
	darkorchid: 10040012,
	darkred: 9109504,
	darksalmon: 15308410,
	darkseagreen: 9419919,
	darkslateblue: 4734347,
	darkslategray: 3100495,
	darkslategrey: 3100495,
	darkturquoise: 52945,
	darkviolet: 9699539,
	deeppink: 16716947,
	deepskyblue: 49151,
	dimgray: 6908265,
	dimgrey: 6908265,
	dodgerblue: 2003199,
	firebrick: 11674146,
	floralwhite: 16775920,
	forestgreen: 2263842,
	fuchsia: 16711935,
	gainsboro: 14474460,
	ghostwhite: 16316671,
	gold: 16766720,
	goldenrod: 14329120,
	gray: 8421504,
	green: 32768,
	greenyellow: 11403055,
	grey: 8421504,
	honeydew: 15794160,
	hotpink: 16738740,
	indianred: 13458524,
	indigo: 4915330,
	ivory: 16777200,
	khaki: 15787660,
	lavender: 15132410,
	lavenderblush: 16773365,
	lawngreen: 8190976,
	lemonchiffon: 16775885,
	lightblue: 11393254,
	lightcoral: 15761536,
	lightcyan: 14745599,
	lightgoldenrodyellow: 16448210,
	lightgray: 13882323,
	lightgreen: 9498256,
	lightgrey: 13882323,
	lightpink: 16758465,
	lightsalmon: 16752762,
	lightseagreen: 2142890,
	lightskyblue: 8900346,
	lightslategray: 7833753,
	lightslategrey: 7833753,
	lightsteelblue: 11584734,
	lightyellow: 16777184,
	lime: 65280,
	limegreen: 3329330,
	linen: 16445670,
	magenta: 16711935,
	maroon: 8388608,
	mediumaquamarine: 6737322,
	mediumblue: 205,
	mediumorchid: 12211667,
	mediumpurple: 9662683,
	mediumseagreen: 3978097,
	mediumslateblue: 8087790,
	mediumspringgreen: 64154,
	mediumturquoise: 4772300,
	mediumvioletred: 13047173,
	midnightblue: 1644912,
	mintcream: 16121850,
	mistyrose: 16770273,
	moccasin: 16770229,
	navajowhite: 16768685,
	navy: 128,
	oldlace: 16643558,
	olive: 8421376,
	olivedrab: 7048739,
	orange: 16753920,
	orangered: 16729344,
	orchid: 14315734,
	palegoldenrod: 15657130,
	palegreen: 10025880,
	paleturquoise: 11529966,
	palevioletred: 14381203,
	papayawhip: 16773077,
	peachpuff: 16767673,
	peru: 13468991,
	pink: 16761035,
	plum: 14524637,
	powderblue: 11591910,
	purple: 8388736,
	rebeccapurple: 6697881,
	red: 16711680,
	rosybrown: 12357519,
	royalblue: 4286945,
	saddlebrown: 9127187,
	salmon: 16416882,
	sandybrown: 16032864,
	seagreen: 3050327,
	seashell: 16774638,
	sienna: 10506797,
	silver: 12632256,
	skyblue: 8900331,
	slateblue: 6970061,
	slategray: 7372944,
	slategrey: 7372944,
	snow: 16775930,
	springgreen: 65407,
	steelblue: 4620980,
	tan: 13808780,
	teal: 32896,
	thistle: 14204888,
	tomato: 16737095,
	turquoise: 4251856,
	violet: 15631086,
	wheat: 16113331,
	white: 16777215,
	whitesmoke: 16119285,
	yellow: 16776960,
	yellowgreen: 10145074
};
wa(Ea, Wa, {
	copy(e) {
		return Object.assign(new this.constructor(), this, e);
	},
	displayable() {
		return this.rgb().displayable();
	},
	hex: Ba,
	formatHex: Ba,
	formatHex8: Va,
	formatHsl: Ha,
	formatRgb: Ua,
	toString: Ua
});
function Ba() {
	return this.rgb().formatHex();
}
function Va() {
	return this.rgb().formatHex8();
}
function Ha() {
	return no(this).formatHsl();
}
function Ua() {
	return this.rgb().formatRgb();
}
function Wa(e) {
	var t, n;
	return e = (e + "").trim().toLowerCase(), (t = Ma.exec(e)) ? (n = t[1].length, t = parseInt(t[1], 16), n === 6 ? Ga(t) : n === 3 ? new Q(t >> 8 & 15 | t >> 4 & 240, t >> 4 & 15 | t & 240, (t & 15) << 4 | t & 15, 1) : n === 8 ? Ka(t >> 24 & 255, t >> 16 & 255, t >> 8 & 255, (t & 255) / 255) : n === 4 ? Ka(t >> 12 & 15 | t >> 8 & 240, t >> 8 & 15 | t >> 4 & 240, t >> 4 & 15 | t & 240, ((t & 15) << 4 | t & 15) / 255) : null) : (t = Na.exec(e)) ? new Q(t[1], t[2], t[3], 1) : (t = Pa.exec(e)) ? new Q(t[1] * 255 / 100, t[2] * 255 / 100, t[3] * 255 / 100, 1) : (t = Fa.exec(e)) ? Ka(t[1], t[2], t[3], t[4]) : (t = Ia.exec(e)) ? Ka(t[1] * 255 / 100, t[2] * 255 / 100, t[3] * 255 / 100, t[4]) : (t = La.exec(e)) ? to(t[1], t[2] / 100, t[3] / 100, 1) : (t = Ra.exec(e)) ? to(t[1], t[2] / 100, t[3] / 100, t[4]) : za.hasOwnProperty(e) ? Ga(za[e]) : e === "transparent" ? new Q(NaN, NaN, NaN, 0) : null;
}
function Ga(e) {
	return new Q(e >> 16 & 255, e >> 8 & 255, e & 255, 1);
}
function Ka(e, t, n, r) {
	return r <= 0 && (e = t = n = NaN), new Q(e, t, n, r);
}
function qa(e) {
	return e instanceof Ea || (e = Wa(e)), e ? (e = e.rgb(), new Q(e.r, e.g, e.b, e.opacity)) : new Q();
}
function Ja(e, t, n, r) {
	return arguments.length === 1 ? qa(e) : new Q(e, t, n, r ?? 1);
}
function Q(e, t, n, r) {
	this.r = +e, this.g = +t, this.b = +n, this.opacity = +r;
}
wa(Q, Ja, Ta(Ea, {
	brighter(e) {
		return e = e == null ? Oa : Oa ** +e, new Q(this.r * e, this.g * e, this.b * e, this.opacity);
	},
	darker(e) {
		return e = e == null ? Da : Da ** +e, new Q(this.r * e, this.g * e, this.b * e, this.opacity);
	},
	rgb() {
		return this;
	},
	clamp() {
		return new Q($a(this.r), $a(this.g), $a(this.b), Qa(this.opacity));
	},
	displayable() {
		return -.5 <= this.r && this.r < 255.5 && -.5 <= this.g && this.g < 255.5 && -.5 <= this.b && this.b < 255.5 && 0 <= this.opacity && this.opacity <= 1;
	},
	hex: Ya,
	formatHex: Ya,
	formatHex8: Xa,
	formatRgb: Za,
	toString: Za
}));
function Ya() {
	return `#${eo(this.r)}${eo(this.g)}${eo(this.b)}`;
}
function Xa() {
	return `#${eo(this.r)}${eo(this.g)}${eo(this.b)}${eo((isNaN(this.opacity) ? 1 : this.opacity) * 255)}`;
}
function Za() {
	let e = Qa(this.opacity);
	return `${e === 1 ? "rgb(" : "rgba("}${$a(this.r)}, ${$a(this.g)}, ${$a(this.b)}${e === 1 ? ")" : `, ${e})`}`;
}
function Qa(e) {
	return isNaN(e) ? 1 : Math.max(0, Math.min(1, e));
}
function $a(e) {
	return Math.max(0, Math.min(255, Math.round(e) || 0));
}
function eo(e) {
	return e = $a(e), (e < 16 ? "0" : "") + e.toString(16);
}
function to(e, t, n, r) {
	return r <= 0 ? e = t = n = NaN : n <= 0 || n >= 1 ? e = t = NaN : t <= 0 && (e = NaN), new $(e, t, n, r);
}
function no(e) {
	if (e instanceof $) return new $(e.h, e.s, e.l, e.opacity);
	if (e instanceof Ea || (e = Wa(e)), !e) return new $();
	if (e instanceof $) return e;
	e = e.rgb();
	var t = e.r / 255, n = e.g / 255, r = e.b / 255, i = Math.min(t, n, r), a = Math.max(t, n, r), o = NaN, s = a - i, c = (a + i) / 2;
	return s ? (o = t === a ? (n - r) / s + (n < r) * 6 : n === a ? (r - t) / s + 2 : (t - n) / s + 4, s /= c < .5 ? a + i : 2 - a - i, o *= 60) : s = c > 0 && c < 1 ? 0 : o, new $(o, s, c, e.opacity);
}
function ro(e, t, n, r) {
	return arguments.length === 1 ? no(e) : new $(e, t, n, r ?? 1);
}
function $(e, t, n, r) {
	this.h = +e, this.s = +t, this.l = +n, this.opacity = +r;
}
wa($, ro, Ta(Ea, {
	brighter(e) {
		return e = e == null ? Oa : Oa ** +e, new $(this.h, this.s, this.l * e, this.opacity);
	},
	darker(e) {
		return e = e == null ? Da : Da ** +e, new $(this.h, this.s, this.l * e, this.opacity);
	},
	rgb() {
		var e = this.h % 360 + (this.h < 0) * 360, t = isNaN(e) || isNaN(this.s) ? 0 : this.s, n = this.l, r = n + (n < .5 ? n : 1 - n) * t, i = 2 * n - r;
		return new Q(oo(e >= 240 ? e - 240 : e + 120, i, r), oo(e, i, r), oo(e < 120 ? e + 240 : e - 120, i, r), this.opacity);
	},
	clamp() {
		return new $(io(this.h), ao(this.s), ao(this.l), Qa(this.opacity));
	},
	displayable() {
		return (0 <= this.s && this.s <= 1 || isNaN(this.s)) && 0 <= this.l && this.l <= 1 && 0 <= this.opacity && this.opacity <= 1;
	},
	formatHsl() {
		let e = Qa(this.opacity);
		return `${e === 1 ? "hsl(" : "hsla("}${io(this.h)}, ${ao(this.s) * 100}%, ${ao(this.l) * 100}%${e === 1 ? ")" : `, ${e})`}`;
	}
}));
function io(e) {
	return e = (e || 0) % 360, e < 0 ? e + 360 : e;
}
function ao(e) {
	return Math.max(0, Math.min(1, e || 0));
}
function oo(e, t, n) {
	return (e < 60 ? t + (n - t) * e / 60 : e < 180 ? n : e < 240 ? t + (n - t) * (240 - e) / 60 : t) * 255;
}
//#endregion
//#region node_modules/d3-interpolate/src/constant.js
var so = (e) => () => e;
//#endregion
//#region node_modules/d3-interpolate/src/color.js
function co(e, t) {
	return function(n) {
		return e + n * t;
	};
}
function lo(e, t, n) {
	return e **= +n, t = t ** +n - e, n = 1 / n, function(r) {
		return (e + r * t) ** +n;
	};
}
function uo(e) {
	return (e = +e) == 1 ? fo : function(t, n) {
		return n - t ? lo(t, n, e) : so(isNaN(t) ? n : t);
	};
}
function fo(e, t) {
	var n = t - e;
	return n ? co(e, n) : so(isNaN(e) ? t : e);
}
//#endregion
//#region node_modules/d3-interpolate/src/rgb.js
var po = (function e(t) {
	var n = uo(t);
	function r(e, t) {
		var r = n((e = Ja(e)).r, (t = Ja(t)).r), i = n(e.g, t.g), a = n(e.b, t.b), o = fo(e.opacity, t.opacity);
		return function(t) {
			return e.r = r(t), e.g = i(t), e.b = a(t), e.opacity = o(t), e + "";
		};
	}
	return r.gamma = e, r;
})(1);
//#endregion
//#region node_modules/d3-interpolate/src/numberArray.js
function mo(e, t) {
	t || (t = []);
	var n = e ? Math.min(t.length, e.length) : 0, r = t.slice(), i;
	return function(a) {
		for (i = 0; i < n; ++i) r[i] = e[i] * (1 - a) + t[i] * a;
		return r;
	};
}
function ho(e) {
	return ArrayBuffer.isView(e) && !(e instanceof DataView);
}
//#endregion
//#region node_modules/d3-interpolate/src/array.js
function go(e, t) {
	var n = t ? t.length : 0, r = e ? Math.min(n, e.length) : 0, i = Array(r), a = Array(n), o;
	for (o = 0; o < r; ++o) i[o] = To(e[o], t[o]);
	for (; o < n; ++o) a[o] = t[o];
	return function(e) {
		for (o = 0; o < r; ++o) a[o] = i[o](e);
		return a;
	};
}
//#endregion
//#region node_modules/d3-interpolate/src/date.js
function _o(e, t) {
	var n = /* @__PURE__ */ new Date();
	return e = +e, t = +t, function(r) {
		return n.setTime(e * (1 - r) + t * r), n;
	};
}
//#endregion
//#region node_modules/d3-interpolate/src/number.js
function vo(e, t) {
	return e = +e, t = +t, function(n) {
		return e * (1 - n) + t * n;
	};
}
//#endregion
//#region node_modules/d3-interpolate/src/object.js
function yo(e, t) {
	var n = {}, r = {}, i;
	for (i in (typeof e != "object" || !e) && (e = {}), (typeof t != "object" || !t) && (t = {}), t) i in e ? n[i] = To(e[i], t[i]) : r[i] = t[i];
	return function(e) {
		for (i in n) r[i] = n[i](e);
		return r;
	};
}
//#endregion
//#region node_modules/d3-interpolate/src/string.js
var bo = /[-+]?(?:\d+\.?\d*|\.?\d+)(?:[eE][-+]?\d+)?/g, xo = new RegExp(bo.source, "g");
function So(e) {
	return function() {
		return e;
	};
}
function Co(e) {
	return function(t) {
		return e(t) + "";
	};
}
function wo(e, t) {
	var n = bo.lastIndex = xo.lastIndex = 0, r, i, a, o = -1, s = [], c = [];
	for (e += "", t += ""; (r = bo.exec(e)) && (i = xo.exec(t));) (a = i.index) > n && (a = t.slice(n, a), s[o] ? s[o] += a : s[++o] = a), (r = r[0]) === (i = i[0]) ? s[o] ? s[o] += i : s[++o] = i : (s[++o] = null, c.push({
		i: o,
		x: vo(r, i)
	})), n = xo.lastIndex;
	return n < t.length && (a = t.slice(n), s[o] ? s[o] += a : s[++o] = a), s.length < 2 ? c[0] ? Co(c[0].x) : So(t) : (t = c.length, function(e) {
		for (var n = 0, r; n < t; ++n) s[(r = c[n]).i] = r.x(e);
		return s.join("");
	});
}
//#endregion
//#region node_modules/d3-interpolate/src/value.js
function To(e, t) {
	var n = typeof t, r;
	return t == null || n === "boolean" ? so(t) : (n === "number" ? vo : n === "string" ? (r = Wa(t)) ? (t = r, po) : wo : t instanceof Wa ? po : t instanceof Date ? _o : ho(t) ? mo : Array.isArray(t) ? go : typeof t.valueOf != "function" && typeof t.toString != "function" || isNaN(t) ? yo : vo)(e, t);
}
//#endregion
//#region node_modules/d3-interpolate/src/round.js
function Eo(e, t) {
	return e = +e, t = +t, function(n) {
		return Math.round(e * (1 - n) + t * n);
	};
}
//#endregion
//#region node_modules/d3-scale/src/constant.js
function Do(e) {
	return function() {
		return e;
	};
}
//#endregion
//#region node_modules/d3-scale/src/number.js
function Oo(e) {
	return +e;
}
//#endregion
//#region node_modules/d3-scale/src/continuous.js
var ko = [0, 1];
function Ao(e) {
	return e;
}
function jo(e, t) {
	return (t -= e = +e) ? function(n) {
		return (n - e) / t;
	} : Do(isNaN(t) ? NaN : .5);
}
function Mo(e, t) {
	var n;
	return e > t && (n = e, e = t, t = n), function(n) {
		return Math.max(e, Math.min(t, n));
	};
}
function No(e, t, n) {
	var r = e[0], i = e[1], a = t[0], o = t[1];
	return i < r ? (r = jo(i, r), a = n(o, a)) : (r = jo(r, i), a = n(a, o)), function(e) {
		return a(r(e));
	};
}
function Po(e, t, n) {
	var r = Math.min(e.length, t.length) - 1, i = Array(r), a = Array(r), o = -1;
	for (e[r] < e[0] && (e = e.slice().reverse(), t = t.slice().reverse()); ++o < r;) i[o] = jo(e[o], e[o + 1]), a[o] = n(t[o], t[o + 1]);
	return function(t) {
		var n = ha(e, t, 1, r) - 1;
		return a[n](i[n](t));
	};
}
function Fo(e, t) {
	return t.domain(e.domain()).range(e.range()).interpolate(e.interpolate()).clamp(e.clamp()).unknown(e.unknown());
}
function Io() {
	var e = ko, t = ko, n = To, r, i, a, o = Ao, s, c, l;
	function u() {
		var n = Math.min(e.length, t.length);
		return o !== Ao && (o = Mo(e[0], e[n - 1])), s = n > 2 ? Po : No, c = l = null, d;
	}
	function d(i) {
		return i == null || isNaN(i = +i) ? a : (c || (c = s(e.map(r), t, n)))(r(o(i)));
	}
	return d.invert = function(n) {
		return o(i((l || (l = s(t, e.map(r), vo)))(n)));
	}, d.domain = function(t) {
		return arguments.length ? (e = Array.from(t, Oo), u()) : e.slice();
	}, d.range = function(e) {
		return arguments.length ? (t = Array.from(e), u()) : t.slice();
	}, d.rangeRound = function(e) {
		return t = Array.from(e), n = Eo, u();
	}, d.clamp = function(e) {
		return arguments.length ? (o = e ? !0 : Ao, u()) : o !== Ao;
	}, d.interpolate = function(e) {
		return arguments.length ? (n = e, u()) : n;
	}, d.unknown = function(e) {
		return arguments.length ? (a = e, d) : a;
	}, function(e, t) {
		return r = e, i = t, u();
	};
}
function Lo() {
	return Io()(Ao, Ao);
}
//#endregion
//#region node_modules/d3-format/src/formatDecimal.js
function Ro(e) {
	return Math.abs(e = Math.round(e)) >= 1e21 ? e.toLocaleString("en").replace(/,/g, "") : e.toString(10);
}
function zo(e, t) {
	if (!isFinite(e) || e === 0) return null;
	var n = (e = t ? e.toExponential(t - 1) : e.toExponential()).indexOf("e"), r = e.slice(0, n);
	return [r.length > 1 ? r[0] + r.slice(2) : r, +e.slice(n + 1)];
}
//#endregion
//#region node_modules/d3-format/src/exponent.js
function Bo(e) {
	return e = zo(Math.abs(e)), e ? e[1] : NaN;
}
//#endregion
//#region node_modules/d3-format/src/formatGroup.js
function Vo(e, t) {
	return function(n, r) {
		for (var i = n.length, a = [], o = 0, s = e[0], c = 0; i > 0 && s > 0 && (c + s + 1 > r && (s = Math.max(1, r - c)), a.push(n.substring(i -= s, i + s)), !((c += s + 1) > r));) s = e[o = (o + 1) % e.length];
		return a.reverse().join(t);
	};
}
//#endregion
//#region node_modules/d3-format/src/formatNumerals.js
function Ho(e) {
	return function(t) {
		return t.replace(/[0-9]/g, function(t) {
			return e[+t];
		});
	};
}
//#endregion
//#region node_modules/d3-format/src/formatSpecifier.js
var Uo = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;
function Wo(e) {
	if (!(t = Uo.exec(e))) throw Error("invalid format: " + e);
	var t;
	return new Go({
		fill: t[1],
		align: t[2],
		sign: t[3],
		symbol: t[4],
		zero: t[5],
		width: t[6],
		comma: t[7],
		precision: t[8] && t[8].slice(1),
		trim: t[9],
		type: t[10]
	});
}
Wo.prototype = Go.prototype;
function Go(e) {
	this.fill = e.fill === void 0 ? " " : e.fill + "", this.align = e.align === void 0 ? ">" : e.align + "", this.sign = e.sign === void 0 ? "-" : e.sign + "", this.symbol = e.symbol === void 0 ? "" : e.symbol + "", this.zero = !!e.zero, this.width = e.width === void 0 ? void 0 : +e.width, this.comma = !!e.comma, this.precision = e.precision === void 0 ? void 0 : +e.precision, this.trim = !!e.trim, this.type = e.type === void 0 ? "" : e.type + "";
}
Go.prototype.toString = function() {
	return this.fill + this.align + this.sign + this.symbol + (this.zero ? "0" : "") + (this.width === void 0 ? "" : Math.max(1, this.width | 0)) + (this.comma ? "," : "") + (this.precision === void 0 ? "" : "." + Math.max(0, this.precision | 0)) + (this.trim ? "~" : "") + this.type;
};
//#endregion
//#region node_modules/d3-format/src/formatTrim.js
function Ko(e) {
	out: for (var t = e.length, n = 1, r = -1, i; n < t; ++n) switch (e[n]) {
		case ".":
			r = i = n;
			break;
		case "0":
			r === 0 && (r = n), i = n;
			break;
		default:
			if (!+e[n]) break out;
			r > 0 && (r = 0);
			break;
	}
	return r > 0 ? e.slice(0, r) + e.slice(i + 1) : e;
}
//#endregion
//#region node_modules/d3-format/src/formatPrefixAuto.js
var qo;
function Jo(e, t) {
	var n = zo(e, t);
	if (!n) return qo = void 0, e.toPrecision(t);
	var r = n[0], i = n[1], a = i - (qo = Math.max(-8, Math.min(8, Math.floor(i / 3))) * 3) + 1, o = r.length;
	return a === o ? r : a > o ? r + Array(a - o + 1).join("0") : a > 0 ? r.slice(0, a) + "." + r.slice(a) : "0." + Array(1 - a).join("0") + zo(e, Math.max(0, t + a - 1))[0];
}
//#endregion
//#region node_modules/d3-format/src/formatRounded.js
function Yo(e, t) {
	var n = zo(e, t);
	if (!n) return e + "";
	var r = n[0], i = n[1];
	return i < 0 ? "0." + Array(-i).join("0") + r : r.length > i + 1 ? r.slice(0, i + 1) + "." + r.slice(i + 1) : r + Array(i - r.length + 2).join("0");
}
//#endregion
//#region node_modules/d3-format/src/formatTypes.js
var Xo = {
	"%": (e, t) => (e * 100).toFixed(t),
	b: (e) => Math.round(e).toString(2),
	c: (e) => e + "",
	d: Ro,
	e: (e, t) => e.toExponential(t),
	f: (e, t) => e.toFixed(t),
	g: (e, t) => e.toPrecision(t),
	o: (e) => Math.round(e).toString(8),
	p: (e, t) => Yo(e * 100, t),
	r: Yo,
	s: Jo,
	X: (e) => Math.round(e).toString(16).toUpperCase(),
	x: (e) => Math.round(e).toString(16)
};
//#endregion
//#region node_modules/d3-format/src/identity.js
function Zo(e) {
	return e;
}
//#endregion
//#region node_modules/d3-format/src/locale.js
var Qo = Array.prototype.map, $o = [
	"y",
	"z",
	"a",
	"f",
	"p",
	"n",
	"µ",
	"m",
	"",
	"k",
	"M",
	"G",
	"T",
	"P",
	"E",
	"Z",
	"Y"
];
function es(e) {
	var t = e.grouping === void 0 || e.thousands === void 0 ? Zo : Vo(Qo.call(e.grouping, Number), e.thousands + ""), n = e.currency === void 0 ? "" : e.currency[0] + "", r = e.currency === void 0 ? "" : e.currency[1] + "", i = e.decimal === void 0 ? "." : e.decimal + "", a = e.numerals === void 0 ? Zo : Ho(Qo.call(e.numerals, String)), o = e.percent === void 0 ? "%" : e.percent + "", s = e.minus === void 0 ? "−" : e.minus + "", c = e.nan === void 0 ? "NaN" : e.nan + "";
	function l(e, l) {
		e = Wo(e);
		var u = e.fill, d = e.align, f = e.sign, p = e.symbol, m = e.zero, h = e.width, g = e.comma, _ = e.precision, v = e.trim, y = e.type;
		y === "n" ? (g = !0, y = "g") : Xo[y] || (_ === void 0 && (_ = 12), v = !0, y = "g"), (m || u === "0" && d === "=") && (m = !0, u = "0", d = "=");
		var b = (l && l.prefix !== void 0 ? l.prefix : "") + (p === "$" ? n : p === "#" && /[boxX]/.test(y) ? "0" + y.toLowerCase() : ""), x = (p === "$" ? r : /[%p]/.test(y) ? o : "") + (l && l.suffix !== void 0 ? l.suffix : ""), S = Xo[y], C = /[defgprs%]/.test(y);
		_ = _ === void 0 ? 6 : /[gprs]/.test(y) ? Math.max(1, Math.min(21, _)) : Math.max(0, Math.min(20, _));
		function w(e) {
			var n = b, r = x, o, l, p;
			if (y === "c") r = S(e) + r, e = "";
			else {
				e = +e;
				var w = e < 0 || 1 / e < 0;
				if (e = isNaN(e) ? c : S(Math.abs(e), _), v && (e = Ko(e)), w && +e == 0 && f !== "+" && (w = !1), n = (w ? f === "(" ? f : s : f === "-" || f === "(" ? "" : f) + n, r = (y === "s" && !isNaN(e) && qo !== void 0 ? $o[8 + qo / 3] : "") + r + (w && f === "(" ? ")" : ""), C) {
					for (o = -1, l = e.length; ++o < l;) if (p = e.charCodeAt(o), 48 > p || p > 57) {
						r = (p === 46 ? i + e.slice(o + 1) : e.slice(o)) + r, e = e.slice(0, o);
						break;
					}
				}
			}
			g && !m && (e = t(e, Infinity));
			var T = n.length + e.length + r.length, E = T < h ? Array(h - T + 1).join(u) : "";
			switch (g && m && (e = t(E + e, E.length ? h - r.length : Infinity), E = ""), d) {
				case "<":
					e = n + e + r + E;
					break;
				case "=":
					e = n + E + e + r;
					break;
				case "^":
					e = E.slice(0, T = E.length >> 1) + n + e + r + E.slice(T);
					break;
				default:
					e = E + n + e + r;
					break;
			}
			return a(e);
		}
		return w.toString = function() {
			return e + "";
		}, w;
	}
	function u(e, t) {
		var n = Math.max(-8, Math.min(8, Math.floor(Bo(t) / 3))) * 3, r = 10 ** -n, i = l((e = Wo(e), e.type = "f", e), { suffix: $o[8 + n / 3] });
		return function(e) {
			return i(r * e);
		};
	}
	return {
		format: l,
		formatPrefix: u
	};
}
//#endregion
//#region node_modules/d3-format/src/defaultLocale.js
var ts, ns, rs;
is({
	thousands: ",",
	grouping: [3],
	currency: ["$", ""]
});
function is(e) {
	return ts = es(e), ns = ts.format, rs = ts.formatPrefix, ts;
}
//#endregion
//#region node_modules/d3-format/src/precisionFixed.js
function as(e) {
	return Math.max(0, -Bo(Math.abs(e)));
}
//#endregion
//#region node_modules/d3-format/src/precisionPrefix.js
function os(e, t) {
	return Math.max(0, Math.max(-8, Math.min(8, Math.floor(Bo(t) / 3))) * 3 - Bo(Math.abs(e)));
}
//#endregion
//#region node_modules/d3-format/src/precisionRound.js
function ss(e, t) {
	return e = Math.abs(e), t = Math.abs(t) - e, Math.max(0, Bo(t) - Bo(e)) + 1;
}
//#endregion
//#region node_modules/d3-scale/src/tickFormat.js
function cs(e, t, n, r) {
	var i = Sa(e, t, n), a;
	switch (r = Wo(r ?? ",f"), r.type) {
		case "s":
			var o = Math.max(Math.abs(e), Math.abs(t));
			return r.precision == null && !isNaN(a = os(i, o)) && (r.precision = a), rs(r, o);
		case "":
		case "e":
		case "g":
		case "p":
		case "r":
			r.precision == null && !isNaN(a = ss(i, Math.max(Math.abs(e), Math.abs(t)))) && (r.precision = a - (r.type === "e"));
			break;
		case "f":
		case "%":
			r.precision == null && !isNaN(a = as(i)) && (r.precision = a - (r.type === "%") * 2);
			break;
	}
	return ns(r);
}
//#endregion
//#region node_modules/d3-scale/src/linear.js
function ls(e) {
	var t = e.domain;
	return e.ticks = function(e) {
		var n = t();
		return ba(n[0], n[n.length - 1], e ?? 10);
	}, e.tickFormat = function(e, n) {
		var r = t();
		return cs(r[0], r[r.length - 1], e ?? 10, n);
	}, e.nice = function(n) {
		n ?? (n = 10);
		var r = t(), i = 0, a = r.length - 1, o = r[i], s = r[a], c, l, u = 10;
		for (s < o && (l = o, o = s, s = l, l = i, i = a, a = l); u-- > 0;) {
			if (l = xa(o, s, n), l === c) return r[i] = o, r[a] = s, t(r);
			if (l > 0) o = Math.floor(o / l) * l, s = Math.ceil(s / l) * l;
			else if (l < 0) o = Math.ceil(o * l) / l, s = Math.floor(s * l) / l;
			else break;
			c = l;
		}
		return e;
	}, e;
}
function us() {
	var e = Lo();
	return e.copy = function() {
		return Fo(e, us());
	}, Ca.apply(e, arguments), ls(e);
}
//#endregion
//#region node_modules/d3-tricontour/src/extent.js
function ds(e) {
	let t, n;
	for (let r of e) r != null && (t === void 0 ? r >= r && (t = n = r) : (t > r && (t = r), n < r && (n = r)));
	return [t, n];
}
//#endregion
//#region node_modules/d3-tricontour/src/merge.js
function* fs(e) {
	for (let t of e) yield* t;
}
function ps(e) {
	return Array.from(fs(e));
}
//#endregion
//#region node_modules/d3-tricontour/src/contains.js
function ms(e, t) {
	let n = t.length, r = -1;
	for (; ++r < n;) {
		let n = hs(e, t[r]);
		if (n) return n;
	}
	return 0;
}
function hs(e, t) {
	let n = t[0], r = t[1], i = -1;
	for (let a = 0, o = e.length, s = o - 1; a < o; s = a++) {
		let o = e[a], c = o[0], l = o[1], u = e[s], d = u[0], f = u[1];
		if (gs(o, u, t)) return 0;
		l > r != f > r && n < (d - c) * (r - l) / (f - l) + c && (i = -i);
	}
	return i;
}
function gs(e, t, n) {
	let r;
	return _s(e, t, n) && vs(e[r = +(e[0] === t[0])], n[r], t[r]);
}
function _s(e, t, n) {
	return (t[0] - e[0]) * (n[1] - e[1]) === (n[0] - e[0]) * (t[1] - e[1]);
}
function vs(e, t, n) {
	return e <= t && t <= n || n <= t && t <= e;
}
//#endregion
//#region node_modules/d3-tricontour/src/area.js
function ys(e) {
	let t = 0, n = e.length, r = e[n - 1][1] * e[0][0] - e[n - 1][0] * e[0][1];
	for (; ++t < n;) r += e[t - 1][1] * e[t][0] - e[t - 1][0] * e[t][1];
	return r;
}
//#endregion
//#region node_modules/d3-tricontour/src/ringsort.js
function bs(e) {
	let t = [], n = [];
	for (let r of e) ys(r) > 0 ? t.push([r]) : n.push(r);
	return n.forEach(function(e) {
		for (let n = 0, r = t.length, i; n < r; ++n) if (ms((i = t[n])[0], e) !== -1) {
			i.push(e);
			return;
		}
	}), t;
}
//#endregion
//#region node_modules/d3-tricontour/src/tricontour.js
function xs() {
	let e = (e) => e[0], t = (e) => e[1], n = (e) => isFinite(+e[2]) ? +e[2] : 0, r = oa.from, i = (e, t, n) => {
		let { points: r } = c, i = [r[2 * e], r[2 * e + 1]], a = [r[2 * t], r[2 * t + 1]];
		return [n * a[0] + (1 - n) * i[0], n * a[1] + (1 - n) * i[1]];
	}, a = bs, o, s, c;
	function l(i) {
		c = r(i, e, t), s = Array.from(i, n), typeof o != "object" && (o = us().domain(ds(s)).nice().ticks(o));
	}
	function* u(e) {
		l(e);
		for (let e of o) yield {
			type: "MultiPolygon",
			coordinates: g(c, s, e),
			value: e
		};
	}
	function d(e, t) {
		return l(e), {
			type: "MultiPolygon",
			coordinates: g(c, s, t),
			value: t
		};
	}
	function* f(e) {
		l(e);
		let t, n, r;
		for (let e of o) n && (t = n), n = ps(g(c, s, e)), t && (yield {
			type: "MultiPolygon",
			coordinates: a(t.concat(n.map((e) => e.slice().reverse()))),
			value: r,
			valueMax: e
		}), r = e;
	}
	let p = function(e) {
		return [...u(e)];
	};
	return p.x = (t) => t ? (e = t, p) : e, p.y = (e) => e ? (t = e, p) : t, p.value = (e) => e ? (n = e, p) : n, p.thresholds = (e) => e ? (o = e, p) : o, p.triangulate = (e) => e ? (r = e, p) : r, p.pointInterpolate = (e) => e ? (i = e, p) : i, p.ringsort = (e) => e ? (a = e, p) : a, p.contours = u, p.contour = d, p.isobands = f, p._values = () => s, p._triangulation = () => c, p;
	function m(e) {
		return e % 3 == 2 ? e - 2 : e + 1;
	}
	function h(e) {
		return e % 3 == 0 ? e + 2 : e - 1;
	}
	function g(e, t, n = 0) {
		for (let e of t) if (!isFinite(e)) throw ["Invalid value", e];
		let { halfedges: r, inedges: o, triangles: s } = e, c = t.length, l = /* @__PURE__ */ new Map();
		r.forEach((e, t) => {
			e === -1 && l.set(s[t], s[t + (t % 3 == 2 ? -2 : 1)]);
		});
		function u(e) {
			return d(s[e], s[m(e)]);
		}
		function d(e, r) {
			let i = t[e], a = t[r];
			if (i <= n && a >= n && i < a) return (n - i) / (a - i);
		}
		let f = [], p = new Uint8Array(r.length).fill(0), g, _, v, y, b;
		for (y = 0; y < r.length; y++) if (!p[y]) {
			for (_ = y, g = []; (b = u(_)) > 0;) {
				let [e, i] = [s[_], s[v = m(_)]];
				if (g.length && e === g[0].ti && i === g[0].tj || g.length > 2 * c) break;
				if (p[_] = 1, g.push({
					ti: e,
					tj: i,
					a: b
				}), (v = r[_]) > -1) {
					if (u(v = m(v)) > 0) {
						_ = v;
						continue;
					}
					if (u(v = m(v)) > 0) {
						_ = v;
						continue;
					}
				} else {
					let e = s[_];
					for (; t[e] < n;) e = l.get(e);
					for (; t[e] >= n;) g.push({
						ti: e,
						tj: e,
						a: 0
					}), e = l.get(e);
					if (v = o[e], g.push({
						ti: e,
						tj: s[v],
						a: d(e, s[v])
					}), u(_ = m(v)) > 0 || u(_ = h(v)) > 0) continue;
				}
			}
			g.length && (g.push(g[0]), f.push(g.map(({ ti: e, tj: t, a: n }) => i(e, t, n))));
		}
		do {
			let e = [], r = l.keys().next().value;
			do {
				let t = l.get(r);
				e.push(r), l.delete(r), r = t;
			} while (l.has(r));
			e.every((e) => t[e] >= n) && (e.push(e[0]), f.push(e.map((e) => i(e, e, 0))));
		} while (l.size);
		return a(f);
	}
}
//#endregion
//#region src/isolines/tricontour-adapter.js
var Ss = 9;
function Cs(e) {
	if (!Array.isArray(e) || e.length === 0) return "";
	let t = e, n = t.length;
	if (n > 1) {
		let e = t[0], r = t[n - 1];
		Math.abs(e[0] - r[0]) < 1e-12 && Math.abs(e[1] - r[1]) < 1e-12 && (t = t.slice(0, n - 1));
	}
	let r = Array(t.length);
	for (let e = 0; e < t.length; e++) {
		let n = t[e];
		r[e] = `${n[0].toFixed(Ss)}:${n[1].toFixed(Ss)}`;
	}
	let i = r.length;
	if (i === 0) return "";
	if (i === 1) return r[0];
	function a(e) {
		let t = e.length, n = 0, r = 1, i = 0;
		for (; n < t && r < t && i < t;) {
			let a = e[(n + i) % t], o = e[(r + i) % t];
			if (a === o) {
				i++;
				continue;
			}
			a > o ? (n = n + i + 1, n <= r && (n = r + 1)) : (r = r + i + 1, r <= n && (r = n + 1)), i = 0;
		}
		return Math.min(n, r);
	}
	let o = a(r), s = r.slice().reverse(), c = a(s);
	for (let e = 0; e < i; e++) {
		let t = r[(o + e) % i], n = s[(c + e) % i];
		if (t !== n) return t < n ? o === 0 ? r.join("|") : r.slice(o).concat(r.slice(0, o)).join("|") : c === 0 ? s.join("|") : s.slice(c).concat(s.slice(0, c)).join("|");
	}
	return o === 0 ? r.join("|") : r.slice(o).concat(r.slice(0, o)).join("|");
}
function ws(e, t = []) {
	let n = xs(), r = 0;
	t.length > 0 && (n.thresholds(t), r = t.at(-1));
	let i = Array.from(n.isobands(e)), a = 1e-9, o = e.reduce((e, t) => {
		let n = t[0], r = t[1];
		return n < e.minX && (e.minX = n), r < e.minY && (e.minY = r), n > e.maxX && (e.maxX = n), r > e.maxY && (e.maxY = r), e;
	}, {
		minX: Infinity,
		minY: Infinity,
		maxX: -Infinity,
		maxY: -Infinity
	}), s = {
		ixMin: -1,
		ixMax: -1,
		iyMin: -1,
		iyMax: -1
	};
	for (let t = 0; t < e.length; t++) {
		let n = e[t], r = n[0], i = n[1];
		(s.ixMin === -1 || r < e[s.ixMin][0]) && (s.ixMin = t), (s.ixMax === -1 || r > e[s.ixMax][0]) && (s.ixMax = t), (s.iyMin === -1 || i < e[s.iyMin][1]) && (s.iyMin = t), (s.iyMax === -1 || i > e[s.iyMax][1]) && (s.iyMax = t);
	}
	let c = [];
	s.ixMin >= 0 && c.push([e[s.ixMin][0], e[s.ixMin][1]]), s.ixMax >= 0 && c.push([e[s.ixMax][0], e[s.ixMax][1]]), s.iyMin >= 0 && c.push([e[s.iyMin][0], e[s.iyMin][1]]), s.iyMax >= 0 && c.push([e[s.iyMax][0], e[s.iyMax][1]]);
	let l = [], u = /* @__PURE__ */ new Set();
	for (let e of c) {
		let t = `${e[0].toFixed(Ss)}|${e[1].toFixed(Ss)}`;
		u.has(t) || (u.add(t), l.push(e));
	}
	function d(e, t, n, r, i, o) {
		let s = (e - n) * (o - r) - (t - r) * (i - n);
		if (Math.abs(s) > a) return !1;
		let c = (e - n) * (i - n) + (t - r) * (o - r);
		return !(c < -a || c - ((i - n) * (i - n) + (o - r) * (o - r)) > a);
	}
	function f(e, t) {
		let n = e[0], r = e[1], i = !1;
		for (let e = 0, a = t.length - 1; e < t.length; a = e++) {
			let o = t[e][0], s = t[e][1], c = t[a][0], l = t[a][1];
			if (d(n, r, o, s, c, l)) return !0;
			s > r != l > r && n < (c - o) * (r - s) / (l - s) + o && (i = !i);
		}
		return i;
	}
	function p(e, t) {
		return Math.abs(e[0] - t[0]) <= a && Math.abs(e[1] - t[1]) <= a;
	}
	function m(e) {
		let t = e || [], n = Infinity, r = Infinity, i = -Infinity, a = -Infinity;
		for (let e of t) {
			let t = e[0], o = e[1];
			!Number.isFinite(t) || !Number.isFinite(o) || (t < n && (n = t), t > i && (i = t), o < r && (r = o), o > a && (a = o));
		}
		return {
			minX: n,
			minY: r,
			maxX: i,
			maxY: a
		};
	}
	function h(e, t) {
		return !(!e || !t || e.maxX <= t.minX + a || e.minX >= t.maxX - a || e.maxY <= t.minY + a || e.minY >= t.maxY - a);
	}
	function g(e, t, n) {
		return (t[0] - e[0]) * (n[1] - e[1]) - (t[1] - e[1]) * (n[0] - e[0]);
	}
	function _(e, t, n) {
		return d(n[0], n[1], e[0], e[1], t[0], t[1]);
	}
	function v(e, t, n, r) {
		let i = g(e, t, n), o = g(e, t, r), s = g(n, r, e), c = g(n, r, t), l = Math.abs(i) <= a ? 0 : i > 0 ? 1 : -1, u = Math.abs(o) <= a ? 0 : o > 0 ? 1 : -1, d = Math.abs(s) <= a ? 0 : s > 0 ? 1 : -1, f = Math.abs(c) <= a ? 0 : c > 0 ? 1 : -1;
		return !!(l !== 0 && u !== 0 && d !== 0 && f !== 0 && l !== u && d !== f || l === 0 && _(e, t, n) && !p(n, e) && !p(n, t) || u === 0 && _(e, t, r) && !p(r, e) && !p(r, t) || d === 0 && _(n, r, e) && !p(e, n) && !p(e, r) || f === 0 && _(n, r, t) && !p(t, n) && !p(t, r));
	}
	function y(e, t, n) {
		let r = m(e);
		if (!Number.isFinite(r.minX)) return !1;
		for (let i = 0; i < t.length; i++) {
			if (i === n) continue;
			let a = t[i];
			if (Array.isArray(a.coordinates)) for (let t = 0; t < a.coordinates.length; t++) {
				let n = a.coordinates[t];
				if (!Array.isArray(n) || n.length === 0) continue;
				let i = n[0];
				if (h(r, m(i))) {
					for (let t of e) if (f(t, i)) return !0;
					for (let t of i) if (f(t, e)) return !0;
					for (let t = 0; t < e.length; t++) {
						let n = e[t], r = e[(t + 1) % e.length];
						for (let e = 0; e < i.length; e++) {
							let t = i[e], a = i[(e + 1) % i.length];
							if (v(n, r, t, a)) return !0;
						}
					}
				}
			}
		}
		return !1;
	}
	for (let e = 0; e < i.length; e++) {
		let t = i[e];
		if (!Array.isArray(t.coordinates)) continue;
		let n = t.coordinates, r = [];
		for (let e = 0; e < n.length; e++) {
			let t = n[e];
			if (!Array.isArray(t) || t.length === 0) continue;
			let i = t[0];
			if (!Array.isArray(i) || i.length === 0) continue;
			let s = Infinity, c = Infinity, u = -Infinity, d = -Infinity;
			for (let e = 0; e < i.length; e++) {
				let t = i[e], n = t[0], r = t[1];
				n < s && (s = n), r < c && (c = r), n > u && (u = n), r > d && (d = r);
			}
			if (!(s <= o.minX + a && c <= o.minY + a && u >= o.maxX - a && d >= o.maxY - a)) {
				r.push(t);
				continue;
			}
			let p = !0;
			for (let e = 0; e < l.length; e++) {
				let t = l[e];
				if (!f(t, i)) {
					p = !1;
					break;
				}
			}
			p || r.push(t);
		}
		t.coordinates = r;
	}
	for (let e = 1; e < i.length; e++) {
		let t = i[e - 1], n = /* @__PURE__ */ new Map(), r = !1;
		if (Array.isArray(t.coordinates)) {
			let a = t.coordinates;
			for (let t = 0; t < a.length && !r; t++) {
				let n = a[t];
				if (!Array.isArray(n) || n.length === 0) continue;
				let o = n[0], s = m(o);
				for (let t = 0; t < i.length && !r; t++) {
					if (t === e - 1) continue;
					let n = i[t];
					if (Array.isArray(n.coordinates)) for (let e = 0; e < n.coordinates.length; e++) {
						let t = n.coordinates[e];
						if (!Array.isArray(t) || t.length === 0) continue;
						let i = t[0];
						if (h(s, m(i))) for (let e = 0; e < o.length && !r; e++) {
							let t = o[e], n = o[(e + 1) % o.length];
							for (let e = 0; e < i.length; e++) {
								let a = i[e], o = i[(e + 1) % i.length];
								if (v(t, n, a, o)) {
									r = !0;
									break;
								}
							}
						}
					}
				}
			}
			if (!r) for (let e = 0; e < a.length; e++) {
				let t = a[e];
				if (Array.isArray(t)) for (let e = 1, r = t.length; e < r; e++) {
					let r = t[e], i = Cs(r);
					i && !n.has(i) && n.set(i, r);
				}
			}
		}
		if (n.size === 0) continue;
		let a = i[e];
		if (!Array.isArray(a.coordinates)) continue;
		let o = a.coordinates;
		for (let t = 0; t < o.length; t++) {
			let r = o[t];
			if (!Array.isArray(r) || r.length === 0) continue;
			let a = r[0], s = Cs(a);
			if (!n.has(s)) continue;
			let c = n.get(s).slice(), l = Array.isArray(r[0]) ? r[0].map((e) => [e[0], e[1]]) : r[0];
			y(l, i, e);
			let u = Array.isArray(c) ? c.map((e) => [e[0], e[1]]) : c;
			r[0] = u, y(u, i, e) && (r[0] = l);
		}
	}
	let b = Array(i.length);
	for (let e = 0; e < i.length; e++) {
		let t = i[e];
		if (t.valueMax > r) continue;
		let n = {
			valueMin: t.value,
			valueMax: t.valueMax,
			bandIndex: e
		}, a;
		a = !Array.isArray(t.coordinates) || t.coordinates.length === 0 ? {
			type: t.type,
			coordinates: t.coordinates
		} : t.coordinates.length === 1 ? {
			type: "Polygon",
			coordinates: t.coordinates[0]
		} : {
			type: "MultiPolygon",
			coordinates: t.coordinates
		}, b[e] = {
			type: "Feature",
			geometry: a,
			properties: n
		};
	}
	return {
		type: "FeatureCollection",
		features: b
	};
}
//#endregion
//#region src/isolines/index.js
async function Ts({ point: e, direction: t = "from", mode: n = "car", costField: r = "distance", graph: i, maxCost: a = 1e3, snapMaxDistM: o = 800, penalties: s = {} } = {}) {
	if (!i || !(i.nodes instanceof Map) || !Array.isArray(i.edges)) throw Error("Invalid graph: expected object with nodes Map and edges array.");
	if (!Array.isArray(e) || e.length !== 2) throw Error("Invalid point: expected [lng, lat]");
	let c, l, u = Pt(e, i, [o], o);
	if (!u || !u.segmentSnap) throw Error("Point did not project to any graph segment within snapMaxDistM");
	c = Mt(i, u.segmentSnap), c.mode = n, l = c._lastAddedNodeId ?? c.nodes.size - 1;
	let d = Nr(c, r, s), { distances: f, reachable: p } = Ti(d, l, a, {
		outputUnscaled: !0,
		direction: t,
		mode: n
	});
	if (!p || p.length === 0) throw Error("isoPHAST returned no reachable nodes within maxCost");
	let m = d.coordsArr || [], h = [], g = _e(0, a, 7).filter((e) => e < a);
	g.shift(), g.push(a), g.sort((e, t) => e - t);
	for (let e = 0; e < f.length; e++) {
		let t = f[e];
		if (!Number.isFinite(t) || t > a * 1.1) continue;
		let n = m[e];
		!n || n.length < 2 || h.push([
			n[0],
			n[1],
			t
		]);
	}
	return h.length === 0 ? {
		type: "FeatureCollection",
		features: []
	} : ws(h, g);
}
//#endregion
//#region src/ui/MapLibreRoutingControl.isoline.worker.js?worker&inline.js
var Es = "(function(){var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,a)=>(a=n==null?{}:e(i(n)),s(r||!n||!n.__esModule?t(a,`default`,{value:n,enumerable:!0}):a,n));let l=[Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,Int32Array,Uint32Array,Float32Array,Float64Array];var u=class e{static from(t){if(!(t instanceof ArrayBuffer))throw Error(`Data must be an instance of ArrayBuffer.`);let[n,r]=new Uint8Array(t,0,2);if(n!==219)throw Error(`Data does not appear to be in a KDBush format.`);let i=r>>4;if(i!==1)throw Error(`Got v${i} data when expected v1.`);let a=l[r&15];if(!a)throw Error(`Unrecognized array type.`);let[o]=new Uint16Array(t,2,1),[s]=new Uint32Array(t,4,1);return new e(s,o,a,t)}constructor(e,t=64,n=Float64Array,r){if(isNaN(e)||e<0)throw Error(`Unpexpected numItems value: ${e}.`);this.numItems=+e,this.nodeSize=Math.min(Math.max(+t,2),65535),this.ArrayType=n,this.IndexArrayType=e<65536?Uint16Array:Uint32Array;let i=l.indexOf(this.ArrayType),a=e*2*this.ArrayType.BYTES_PER_ELEMENT,o=e*this.IndexArrayType.BYTES_PER_ELEMENT,s=(8-o%8)%8;if(i<0)throw Error(`Unexpected typed array class: ${n}.`);r&&r instanceof ArrayBuffer?(this.data=r,this.ids=new this.IndexArrayType(this.data,8,e),this.coords=new this.ArrayType(this.data,8+o+s,e*2),this._pos=e*2,this._finished=!0):(this.data=new ArrayBuffer(8+a+o+s),this.ids=new this.IndexArrayType(this.data,8,e),this.coords=new this.ArrayType(this.data,8+o+s,e*2),this._pos=0,this._finished=!1,new Uint8Array(this.data,0,2).set([219,16+i]),new Uint16Array(this.data,2,1)[0]=t,new Uint32Array(this.data,4,1)[0]=e)}add(e,t){let n=this._pos>>1;return this.ids[n]=n,this.coords[this._pos++]=e,this.coords[this._pos++]=t,n}finish(){let e=this._pos>>1;if(e!==this.numItems)throw Error(`Added ${e} items when expected ${this.numItems}.`);return d(this.ids,this.coords,this.nodeSize,0,this.numItems-1,0),this._finished=!0,this}range(e,t,n,r){if(!this._finished)throw Error(`Data not yet indexed - call index.finish().`);let{ids:i,coords:a,nodeSize:o}=this,s=[0,i.length-1,0],c=[];for(;s.length;){let l=s.pop()||0,u=s.pop()||0,d=s.pop()||0;if(u-d<=o){for(let o=d;o<=u;o++){let s=a[2*o],l=a[2*o+1];s>=e&&s<=n&&l>=t&&l<=r&&c.push(i[o])}continue}let f=d+u>>1,p=a[2*f],m=a[2*f+1];p>=e&&p<=n&&m>=t&&m<=r&&c.push(i[f]),(l===0?e<=p:t<=m)&&(s.push(d),s.push(f-1),s.push(1-l)),(l===0?n>=p:r>=m)&&(s.push(f+1),s.push(u),s.push(1-l))}return c}within(e,t,n){if(!this._finished)throw Error(`Data not yet indexed - call index.finish().`);let{ids:r,coords:i,nodeSize:a}=this,o=[0,r.length-1,0],s=[],c=n*n;for(;o.length;){let l=o.pop()||0,u=o.pop()||0,d=o.pop()||0;if(u-d<=a){for(let n=d;n<=u;n++)h(i[2*n],i[2*n+1],e,t)<=c&&s.push(r[n]);continue}let f=d+u>>1,p=i[2*f],m=i[2*f+1];h(p,m,e,t)<=c&&s.push(r[f]),(l===0?e-n<=p:t-n<=m)&&(o.push(d),o.push(f-1),o.push(1-l)),(l===0?e+n>=p:t+n>=m)&&(o.push(f+1),o.push(u),o.push(1-l))}return s}};function d(e,t,n,r,i,a){if(i-r<=n)return;let o=r+i>>1;f(e,t,o,r,i,a),d(e,t,n,r,o-1,1-a),d(e,t,n,o+1,i,1-a)}function f(e,t,n,r,i,a){for(;i>r;){if(i-r>600){let o=i-r+1,s=n-r+1,c=Math.log(o),l=.5*Math.exp(2*c/3),u=.5*Math.sqrt(c*l*(o-l)/o)*(s-o/2<0?-1:1);f(e,t,n,Math.max(r,Math.floor(n-s*l/o+u)),Math.min(i,Math.floor(n+(o-s)*l/o+u)),a)}let o=t[2*n+a],s=r,c=i;for(p(e,t,r,n),t[2*i+a]>o&&p(e,t,r,i);s<c;){for(p(e,t,s,c),s++,c--;t[2*s+a]<o;)s++;for(;t[2*c+a]>o;)c--}t[2*r+a]===o?p(e,t,r,c):(c++,p(e,t,c,i)),c<=n&&(r=c+1),n<=c&&(i=c-1)}}function p(e,t,n,r){m(e,n,r),m(t,2*n,2*r),m(t,2*n+1,2*r+1)}function m(e,t,n){let r=e[t];e[t]=e[n],e[n]=r}function h(e,t,n,r){let i=e-n,a=t-r;return i*i+a*a}var g=class{constructor(e=[],t=(e,t)=>e<t?-1:+(e>t)){if(this.data=e,this.length=this.data.length,this.compare=t,this.length>0)for(let e=(this.length>>1)-1;e>=0;e--)this._down(e)}push(e){this.data.push(e),this._up(this.length++)}pop(){if(this.length===0)return;let e=this.data[0],t=this.data.pop();return--this.length>0&&(this.data[0]=t,this._down(0)),e}peek(){return this.data[0]}_up(e){let{data:t,compare:n}=this,r=t[e];for(;e>0;){let i=e-1>>1,a=t[i];if(n(r,a)>=0)break;t[e]=a,e=i}t[e]=r}_down(e){let{data:t,compare:n}=this,r=this.length>>1,i=t[e];for(;e<r;){let r=(e<<1)+1,a=r+1;if(a<this.length&&n(t[a],t[r])<0&&(r=a),n(t[r],i)>=0)break;t[e]=t[r],e=r}t[e]=i}};let _=Math.PI/180;function v(e,t,n,r=1/0,i=1/0,a){let o=1,s=[];r===void 0&&(r=1/0),i!==void 0&&(o=x(i/6371));let c=new g([],b),l={left:0,right:e.ids.length-1,axis:0,dist:0,minLng:-180,minLat:-90,maxLng:180,maxLat:90},u=Math.cos(n*_);for(;l;){let i=l.right,d=l.left;if(i-d<=e.nodeSize)for(let r=d;r<=i;r++){let i=e.ids[r];if(!a||a(i)){let a=C(t,n,e.coords[2*r],e.coords[2*r+1],u);c.push({id:i,dist:a})}}else{let r=d+i>>1,o=e.coords[2*r],s=e.coords[2*r+1],f=e.ids[r];if(!a||a(f)){let e=C(t,n,o,s,u);c.push({id:f,dist:e})}let p=(l.axis+1)%2,m={left:d,right:r-1,axis:p,minLng:l.minLng,minLat:l.minLat,maxLng:l.axis===0?o:l.maxLng,maxLat:l.axis===1?s:l.maxLat,dist:0},h={left:r+1,right:i,axis:p,minLng:l.axis===0?o:l.minLng,minLat:l.axis===1?s:l.minLat,maxLng:l.maxLng,maxLat:l.maxLat,dist:0};m.dist=y(t,n,u,m),h.dist=y(t,n,u,h),c.push(m),c.push(h)}let f;for(;(f=c.pop())&&`id`in f;)if(f.dist>o||(s.push(f.id),s.length===r))return s;l=f}return s}function y(e,t,n,r){let i=r.minLng,a=r.maxLng,o=r.minLat,s=r.maxLat;if(e>=i&&e<=a)return t<o?x((t-o)*_):t>s?x((t-s)*_):0;let c=Math.min(x((e-i)*_),x((e-a)*_)),l=w(t,c);return l>o&&l<s?S(c,n,t,l):Math.min(S(c,n,t,o),S(c,n,t,s))}function b(e,t){return e.dist-t.dist}function x(e){let t=Math.sin(e/2);return t*t}function S(e,t,n,r){return t*Math.cos(r*_)*e+x((n-r)*_)}function C(e,t,n,r,i){return S(x((e-n)*_),i,t,r)}function w(e,t){let n=1-2*t;return n<=0?e>0?90:-90:Math.atan(Math.tan(e*_)/n)/_}function T(e){if(!e._geoJsonFlag)throw Error(`Cannot use Coordinate Lookup on a non-GeoJson network.`);let t=new Set;Object.keys(e._nodeToIndexLookup).forEach(e=>{t.add(e)});let n=[];t.forEach(e=>{n.push(e.split(`,`).map(e=>Number(e)))}),this.coordinate_list=n,this.index=new u(n.length);for(let e of n)this.index.add(e[0],e[1]);this.index.finish()}T.prototype.getClosestNetworkPt=function(e,t){let n=v(this.index,e,t,1)[0];return this.coordinate_list[n]};function E(e,t,n,r){if(e.length===0)return[n[r]];let i=[],a=r;i.push(n[a]);for(let r of e){let e=t[r];a=a===e._start_index?e._end_index:a===e._end_index?e._start_index:e._end_index,i.push(n[a])}return i}function D(e,t,n,r,i,a,o,s){let c=[],l=[a],u=r[a],d=i[a];if(u)for(;u.attrs!=null;)c.push({id:u.attrs,direction:`f`}),l.push(u.prev),u=r[u.prev];if(c.reverse(),l.reverse(),d)for(;d.attrs!=null;)c.push({id:d.attrs,direction:`b`}),l.push(d.prev),d=i[d.prev];let f=s,p=c.map(e=>{let n=e.direction===`f`?t[e.id]._start_index:t[e.id]._end_index,r=e.direction===`f`?t[e.id]._end_index:t[e.id]._start_index,i=[...t[e.id]._ordered];return f===n?f=r:(i.reverse(),f=n),i}),m=[].concat(...p),h=m.map(e=>t[e]._id),g,_,v,y;return e.nodes&&(y=E(m,t,o,s)),(e.properties||e.path)&&(_=m.map(e=>{let{_start_index:n,_end_index:r,_ordered:i,...a}=t[e];return a})),e.path&&(v={type:`FeatureCollection`,features:m.map((e,t)=>({type:`Feature`,properties:_[t],geometry:{type:`LineString`,coordinates:n[e]}}))}),e.properties&&(g=_),{ids:h,path:v,properties:g,nodes:y}}function O(e){if(!(this instanceof O))return new O(e);if(e=e||{},!e.compare)throw Error(`Please supply a comparison function to NodeHeap`);if(this.data=[],this.length=this.data.length,this.compare=e.compare,this.setNodeId=function(e,t){e.heapIndex=t},this.length>0)for(var t=this.length>>1;t>=0;t--)this._down(t);if(e.setNodeId)for(var t=0;t<this.length;++t)this.setNodeId(this.data[t],t)}O.prototype={push:function(e){this.data.push(e),this.setNodeId(e,this.length),this.length++,this._up(this.length-1)},pop:function(){if(this.length!==0){var e=this.data[0];return this.length--,this.length>0&&(this.data[0]=this.data[this.length],this.setNodeId(this.data[0],0),this._down(0)),this.data.pop(),e}},peek:function(){return this.data[0]},updateItem:function(e){this._down(e),this._up(e)},_up:function(e){for(var t=this.data,n=this.compare,r=this.setNodeId,i=t[e];e>0;){var a=e-1>>1,o=t[a];if(n(i,o)>=0)break;t[e]=o,r(o,e),e=a}t[e]=i,r(i,e)},_down:function(e){for(var t=this.data,n=this.compare,r=this.length>>1,i=t[e],a=this.setNodeId;e<r;){var o=(e<<1)+1,s=o+1,c=t[o];if(s<this.length&&n(t[s],c)<0&&(o=s,c=t[s]),n(c,i)>=0)break;t[e]=c,a(c,e),e=o}t[e]=i,a(i,e)}};let k=function(e){let t=this.adjacency_list,n=this.reverse_adjacency_list,r=this._edgeProperties,i=this._edgeGeometry,a=this._createNodePool(),o=this._nodeToIndexLookup,s=this._indexToNodeLookup;return e||(e={}),{queryContractionHierarchy:c};function c(c,l){a.reset();let u=o[String(c)],d=o[String(l)],f=[],p=[],m={},h={},g=a.createNewState({id:u,dist:0});f[u]=g,g.opened=1,m[g.id]=0;let _=a.createNewState({id:d,dist:0});p[d]=_,_.opened=1,h[_.id]=0;let v=A(t,g,f,m,p,h),y=A(n,_,p,h,f,m),b=!1,x=!1,S,C,w=1/0,T=null;if(u!==d)do b||(S=v.next(),S.done&&(b=!0)),x||(C=y.next(),C.done&&(x=!0));while(m[S.value.id]<w||h[C.value.id]<w);else w=0;let E={total_cost:w===1/0?0:w},k;if(e.ids||e.path||e.nodes||e.properties)if(T!=null)k=D(e,r,i,f,p,T,s,u);else{let t,n,r,i;e.ids&&(t=[]),e.path&&(n={}),e.properties&&(r=[]),e.nodes&&(i=[]),k={ids:t,path:n,properties:r,nodes:i}}return Object.assign(E,{...k});function*A(e,t,n,r,i,o){var s=new O({compare(e,t){return e.dist-t.dist}});do{if((e[t.id]||[]).forEach(e=>{let i=n[e.end];if(i===void 0&&(i=a.createNewState({id:e.end}),i.attrs=e.attrs,n[e.end]=i),i.visited===!0)return;i.opened||(s.push(i),i.opened=!0);let c=t.dist+e.cost;if(c>=i.dist)return;i.dist=c,r[i.id]=c,i.attrs=e.attrs,i.prev=t.id,s.updateItem(i.heapIndex);let l=o[e.end];if(l>=0){let t=c+l;w>t&&(w=t,T=e.end)}}),t.visited=!0,t=s.pop(),!t)return``;yield t}while(!0)}}};var A;try{A=Map}catch{}var j;try{j=Set}catch{}function ee(e,t,n){if(!e||typeof e!=`object`||typeof e==`function`)return e;if(e.nodeType&&`cloneNode`in e)return e.cloneNode(!0);if(e instanceof Date)return new Date(e.getTime());if(e instanceof RegExp)return new RegExp(e);if(Array.isArray(e))return e.map(M);if(A&&e instanceof A)return new Map(Array.from(e.entries()));if(j&&e instanceof j)return new Set(Array.from(e.values()));if(e instanceof Object){t.push(e);var r=Object.create(e);for(var i in n.push(r),e){var a=t.findIndex(function(t){return t===e[i]});r[i]=a>-1?n[a]:ee(e[i],t,n)}return r}return e}function M(e){return ee(e,[],[])}let te=function(e){if(this._locked)throw Error(`Cannot add GeoJSON to a contracted network`);if(this._geoJsonFlag)throw Error(`Cannot load more than one GeoJSON file.`);if(this._manualAdd)throw Error(`Cannot load GeoJSON file after adding Edges manually via the API.`);let t=M(e);this._cleanseGeoJsonNetwork(t).forEach((e,t)=>{let n=e.geometry.coordinates,r=e.properties;if(!r||!n||!r._cost){this.debugMode&&console.log(`invalid feature detected.  skipping...`);return}let i=n[0],a=n[n.length-1];this._addEdge(i,a,r,M(n)),this._addEdge(a,i,r,M(n).reverse())}),this._geoJsonFlag=!0},ne=function(e){let t={},n=e.features;return n.forEach(e=>{let n=e.geometry.coordinates[0].join(`,`),r=e.geometry.coordinates[e.geometry.coordinates.length-1].join(`,`),i=`${n}|${r}`,a=`${r}|${n}`;if(!t[i])t[i]=e;else{this.debugMode&&console.log(`Duplicate feature found, choosing shortest.`);let n=t[i].properties._cost;e.properties._cost<n?(t[i].properties.__markDelete=!0,t[i]=e):e.properties.__markDelete=!0}if(!t[a])t[a]=e;else{let n=t[a].properties._cost;e.properties._cost<n?(t[a].properties.__markDelete=!0,t[a]=e):e.properties.__markDelete=!0}}),n.filter(e=>!e.properties.__markDelete)},re=function(e,t,n,r,i){if(this._locked)throw Error(`Graph has been contracted.  No additional edges can be added.`);if(this._geoJsonFlag)throw Error(`Can not add additional edges manually to a GeoJSON network.`);this._manualAdd=!0,this._addEdge(e,t,n,r,i)},ie=function(e,t,n,r,i){let a=String(e),o=String(t);if(a===o){this.debugMode&&console.log(`Start and End Nodes are the same.  Ignoring.`);return}this._nodeToIndexLookup[a]??(this._currentNodeIndex++,this._nodeToIndexLookup[a]=this._currentNodeIndex,this._indexToNodeLookup[this._currentNodeIndex]=a),this._nodeToIndexLookup[o]??(this._currentNodeIndex++,this._nodeToIndexLookup[o]=this._currentNodeIndex,this._indexToNodeLookup[this._currentNodeIndex]=o);let s=this._nodeToIndexLookup[a],c=this._nodeToIndexLookup[o];this._currentEdgeIndex++,this._edgeProperties[this._currentEdgeIndex]=JSON.parse(JSON.stringify(n)),this._edgeProperties[this._currentEdgeIndex]._start_index=s,this._edgeProperties[this._currentEdgeIndex]._end_index=c,r&&(this._edgeGeometry[this._currentEdgeIndex]=JSON.parse(JSON.stringify(r)));let l={end:c,cost:n._cost,attrs:this._currentEdgeIndex};this.adjacency_list[s]?this.adjacency_list[s].push(l):this.adjacency_list[s]=[l];let u={end:s,cost:n._cost,attrs:this._currentEdgeIndex};this.reverse_adjacency_list[c]?this.reverse_adjacency_list[c].push(u):this.reverse_adjacency_list[c]=[u],i&&(this.adjacency_list[c]?this.adjacency_list[c].push(u):this.adjacency_list[c]=[u],this.reverse_adjacency_list[s]?this.reverse_adjacency_list[s].push(l):this.reverse_adjacency_list[s]=[l])},ae=function(e,t,n){this._currentEdgeIndex++,this._edgeProperties[this._currentEdgeIndex]=n,this._edgeProperties[this._currentEdgeIndex]._start_index=e,this._edgeProperties[this._currentEdgeIndex]._end_index=t;let r={end:t,cost:n._cost,attrs:this._currentEdgeIndex};this.adjacency_list[e]?this.adjacency_list[e].push(r):this.adjacency_list[e]=[r];let i={end:e,cost:n._cost,attrs:this._currentEdgeIndex};this.reverse_adjacency_list[t]?this.reverse_adjacency_list[t].push(i):this.reverse_adjacency_list[t]=[i]};var N={};N.read=function(e,t){return e.readFields(N._readField,{_locked:!1,_geoJsonFlag:!1,adjacency_list:[],reverse_adjacency_list:[],_nodeToIndexLookup:{},_edgeProperties:[],_edgeGeometry:[]},t)},N._readField=function(e,t,n){if(e===1)t._locked=n.readBoolean();else if(e===2)t._geoJsonFlag=n.readBoolean();else if(e===3)t.adjacency_list.push(N.AdjList.read(n,n.readVarint()+n.pos));else if(e===4)t.reverse_adjacency_list.push(N.AdjList.read(n,n.readVarint()+n.pos));else if(e===5){var r=N._FieldEntry5.read(n,n.readVarint()+n.pos);t._nodeToIndexLookup[r.key]=r.value}else e===6?t._edgeProperties.push(n.readString()):e===7&&t._edgeGeometry.push(N.GeometryArray.read(n,n.readVarint()+n.pos))},N.write=function(e,t){if(e._locked&&t.writeBooleanField(1,e._locked),e._geoJsonFlag&&t.writeBooleanField(2,e._geoJsonFlag),e.adjacency_list)for(var n=0;n<e.adjacency_list.length;n++)t.writeMessage(3,N.AdjList.write,e.adjacency_list[n]);if(e.reverse_adjacency_list)for(n=0;n<e.reverse_adjacency_list.length;n++)t.writeMessage(4,N.AdjList.write,e.reverse_adjacency_list[n]);if(e._nodeToIndexLookup)for(n in e._nodeToIndexLookup)Object.prototype.hasOwnProperty.call(e._nodeToIndexLookup,n)&&t.writeMessage(5,N._FieldEntry5.write,{key:n,value:e._nodeToIndexLookup[n]});if(e._edgeProperties)for(n=0;n<e._edgeProperties.length;n++)t.writeStringField(6,e._edgeProperties[n]);if(e._edgeGeometry)for(n=0;n<e._edgeGeometry.length;n++)t.writeMessage(7,N.GeometryArray.write,e._edgeGeometry[n])},N.EdgeAttrs={},N.EdgeAttrs.read=function(e,t){return e.readFields(N.EdgeAttrs._readField,{end:0,cost:0,attrs:0},t)},N.EdgeAttrs._readField=function(e,t,n){e===1?t.end=n.readVarint():e===2?t.cost=n.readDouble():e===3&&(t.attrs=n.readVarint())},N.EdgeAttrs.write=function(e,t){e.end&&t.writeVarintField(1,e.end),e.cost&&t.writeDoubleField(2,e.cost),e.attrs&&t.writeVarintField(3,e.attrs)},N.AdjList={},N.AdjList.read=function(e,t){return e.readFields(N.AdjList._readField,{edges:[]},t)},N.AdjList._readField=function(e,t,n){e===1&&t.edges.push(N.EdgeAttrs.read(n,n.readVarint()+n.pos))},N.AdjList.write=function(e,t){if(e.edges)for(var n=0;n<e.edges.length;n++)t.writeMessage(1,N.EdgeAttrs.write,e.edges[n])},N.LineStringAray={},N.LineStringAray.read=function(e,t){return e.readFields(N.LineStringAray._readField,{coords:[]},t)},N.LineStringAray._readField=function(e,t,n){e===1&&n.readPackedDouble(t.coords)},N.LineStringAray.write=function(e,t){e.coords&&t.writePackedDouble(1,e.coords)},N.GeometryArray={},N.GeometryArray.read=function(e,t){return e.readFields(N.GeometryArray._readField,{linestrings:[]},t)},N.GeometryArray._readField=function(e,t,n){e===1&&t.linestrings.push(N.LineStringAray.read(n,n.readVarint()+n.pos))},N.GeometryArray.write=function(e,t){if(e.linestrings)for(var n=0;n<e.linestrings.length;n++)t.writeMessage(1,N.LineStringAray.write,e.linestrings[n])},N._FieldEntry5={},N._FieldEntry5.read=function(e,t){return e.readFields(N._FieldEntry5._readField,{key:``,value:0},t)},N._FieldEntry5._readField=function(e,t,n){e===1?t.key=n.readString():e===2&&(t.value=n.readVarint())},N._FieldEntry5.write=function(e,t){e.key&&t.writeStringField(1,e.key),e.value&&t.writeVarintField(2,e.value)};var oe=o((e=>{\n/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */\ne.read=function(e,t,n,r,i){var a,o,s=i*8-r-1,c=(1<<s)-1,l=c>>1,u=-7,d=n?i-1:0,f=n?-1:1,p=e[t+d];for(d+=f,a=p&(1<<-u)-1,p>>=-u,u+=s;u>0;a=a*256+e[t+d],d+=f,u-=8);for(o=a&(1<<-u)-1,a>>=-u,u+=r;u>0;o=o*256+e[t+d],d+=f,u-=8);if(a===0)a=1-l;else if(a===c)return o?NaN:(p?-1:1)*(1/0);else o+=2**r,a-=l;return(p?-1:1)*o*2**(a-r)},e.write=function(e,t,n,r,i,a){var o,s,c,l=a*8-i-1,u=(1<<l)-1,d=u>>1,f=i===23?2**-24-2**-77:0,p=r?0:a-1,m=r?1:-1,h=+(t<0||t===0&&1/t<0);for(t=Math.abs(t),isNaN(t)||t===1/0?(s=+!!isNaN(t),o=u):(o=Math.floor(Math.log(t)/Math.LN2),t*(c=2**-o)<1&&(o--,c*=2),o+d>=1?t+=f/c:t+=f*2**(1-d),t*c>=2&&(o++,c/=2),o+d>=u?(s=0,o=u):o+d>=1?(s=(t*c-1)*2**i,o+=d):(s=t*2**(d-1)*2**i,o=0));i>=8;e[n+p]=s&255,p+=m,s/=256,i-=8);for(o=o<<i|s,l+=i;l>0;e[n+p]=o&255,p+=m,o/=256,l-=8);e[n+p-m]|=h*128}})),se=o(((e,t)=>{t.exports=r;var n=oe();function r(e){this.buf=ArrayBuffer.isView&&ArrayBuffer.isView(e)?e:new Uint8Array(e||0),this.pos=0,this.type=0,this.length=this.buf.length}r.Varint=0,r.Fixed64=1,r.Bytes=2,r.Fixed32=5;var i=65536*65536,a=1/i,o=12,s=typeof TextDecoder>`u`?null:new TextDecoder(`utf-8`);r.prototype={destroy:function(){this.buf=null},readFields:function(e,t,n){for(n=n||this.length;this.pos<n;){var r=this.readVarint(),i=r>>3,a=this.pos;this.type=r&7,e(i,t,this),this.pos===a&&this.skip(r)}return t},readMessage:function(e,t){return this.readFields(e,t,this.readVarint()+this.pos)},readFixed32:function(){var e=w(this.buf,this.pos);return this.pos+=4,e},readSFixed32:function(){var e=E(this.buf,this.pos);return this.pos+=4,e},readFixed64:function(){var e=w(this.buf,this.pos)+w(this.buf,this.pos+4)*i;return this.pos+=8,e},readSFixed64:function(){var e=w(this.buf,this.pos)+E(this.buf,this.pos+4)*i;return this.pos+=8,e},readFloat:function(){var e=n.read(this.buf,this.pos,!0,23,4);return this.pos+=4,e},readDouble:function(){var e=n.read(this.buf,this.pos,!0,52,8);return this.pos+=8,e},readVarint:function(e){var t=this.buf,n,r=t[this.pos++];return n=r&127,r<128||(r=t[this.pos++],n|=(r&127)<<7,r<128)||(r=t[this.pos++],n|=(r&127)<<14,r<128)||(r=t[this.pos++],n|=(r&127)<<21,r<128)?n:(r=t[this.pos],n|=(r&15)<<28,c(n,e,this))},readVarint64:function(){return this.readVarint(!0)},readSVarint:function(){var e=this.readVarint();return e%2==1?(e+1)/-2:e/2},readBoolean:function(){return!!this.readVarint()},readString:function(){var e=this.readVarint()+this.pos,t=this.pos;return this.pos=e,e-t>=o&&s?O(this.buf,t,e):D(this.buf,t,e)},readBytes:function(){var e=this.readVarint()+this.pos,t=this.buf.subarray(this.pos,e);return this.pos=e,t},readPackedVarint:function(e,t){if(this.type!==r.Bytes)return e.push(this.readVarint(t));var n=l(this);for(e=e||[];this.pos<n;)e.push(this.readVarint(t));return e},readPackedSVarint:function(e){if(this.type!==r.Bytes)return e.push(this.readSVarint());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readSVarint());return e},readPackedBoolean:function(e){if(this.type!==r.Bytes)return e.push(this.readBoolean());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readBoolean());return e},readPackedFloat:function(e){if(this.type!==r.Bytes)return e.push(this.readFloat());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readFloat());return e},readPackedDouble:function(e){if(this.type!==r.Bytes)return e.push(this.readDouble());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readDouble());return e},readPackedFixed32:function(e){if(this.type!==r.Bytes)return e.push(this.readFixed32());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readFixed32());return e},readPackedSFixed32:function(e){if(this.type!==r.Bytes)return e.push(this.readSFixed32());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readSFixed32());return e},readPackedFixed64:function(e){if(this.type!==r.Bytes)return e.push(this.readFixed64());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readFixed64());return e},readPackedSFixed64:function(e){if(this.type!==r.Bytes)return e.push(this.readSFixed64());var t=l(this);for(e=e||[];this.pos<t;)e.push(this.readSFixed64());return e},skip:function(e){var t=e&7;if(t===r.Varint)for(;this.buf[this.pos++]>127;);else if(t===r.Bytes)this.pos=this.readVarint()+this.pos;else if(t===r.Fixed32)this.pos+=4;else if(t===r.Fixed64)this.pos+=8;else throw Error(`Unimplemented type: `+t)},writeTag:function(e,t){this.writeVarint(e<<3|t)},realloc:function(e){for(var t=this.length||16;t<this.pos+e;)t*=2;if(t!==this.length){var n=new Uint8Array(t);n.set(this.buf),this.buf=n,this.length=t}},finish:function(){return this.length=this.pos,this.pos=0,this.buf.subarray(0,this.length)},writeFixed32:function(e){this.realloc(4),T(this.buf,e,this.pos),this.pos+=4},writeSFixed32:function(e){this.realloc(4),T(this.buf,e,this.pos),this.pos+=4},writeFixed64:function(e){this.realloc(8),T(this.buf,e&-1,this.pos),T(this.buf,Math.floor(e*a),this.pos+4),this.pos+=8},writeSFixed64:function(e){this.realloc(8),T(this.buf,e&-1,this.pos),T(this.buf,Math.floor(e*a),this.pos+4),this.pos+=8},writeVarint:function(e){if(e=+e||0,e>268435455||e<0){d(e,this);return}this.realloc(4),this.buf[this.pos++]=e&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=(e>>>=7)&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=(e>>>=7)&127|(e>127?128:0),!(e<=127)&&(this.buf[this.pos++]=e>>>7&127)))},writeSVarint:function(e){this.writeVarint(e<0?-e*2-1:e*2)},writeBoolean:function(e){this.writeVarint(!!e)},writeString:function(e){e=String(e),this.realloc(e.length*4),this.pos++;var t=this.pos;this.pos=k(this.buf,e,this.pos);var n=this.pos-t;n>=128&&m(t,n,this),this.pos=t-1,this.writeVarint(n),this.pos+=n},writeFloat:function(e){this.realloc(4),n.write(this.buf,e,this.pos,!0,23,4),this.pos+=4},writeDouble:function(e){this.realloc(8),n.write(this.buf,e,this.pos,!0,52,8),this.pos+=8},writeBytes:function(e){var t=e.length;this.writeVarint(t),this.realloc(t);for(var n=0;n<t;n++)this.buf[this.pos++]=e[n]},writeRawMessage:function(e,t){this.pos++;var n=this.pos;e(t,this);var r=this.pos-n;r>=128&&m(n,r,this),this.pos=n-1,this.writeVarint(r),this.pos+=r},writeMessage:function(e,t,n){this.writeTag(e,r.Bytes),this.writeRawMessage(t,n)},writePackedVarint:function(e,t){t.length&&this.writeMessage(e,h,t)},writePackedSVarint:function(e,t){t.length&&this.writeMessage(e,g,t)},writePackedBoolean:function(e,t){t.length&&this.writeMessage(e,y,t)},writePackedFloat:function(e,t){t.length&&this.writeMessage(e,_,t)},writePackedDouble:function(e,t){t.length&&this.writeMessage(e,v,t)},writePackedFixed32:function(e,t){t.length&&this.writeMessage(e,b,t)},writePackedSFixed32:function(e,t){t.length&&this.writeMessage(e,x,t)},writePackedFixed64:function(e,t){t.length&&this.writeMessage(e,S,t)},writePackedSFixed64:function(e,t){t.length&&this.writeMessage(e,C,t)},writeBytesField:function(e,t){this.writeTag(e,r.Bytes),this.writeBytes(t)},writeFixed32Field:function(e,t){this.writeTag(e,r.Fixed32),this.writeFixed32(t)},writeSFixed32Field:function(e,t){this.writeTag(e,r.Fixed32),this.writeSFixed32(t)},writeFixed64Field:function(e,t){this.writeTag(e,r.Fixed64),this.writeFixed64(t)},writeSFixed64Field:function(e,t){this.writeTag(e,r.Fixed64),this.writeSFixed64(t)},writeVarintField:function(e,t){this.writeTag(e,r.Varint),this.writeVarint(t)},writeSVarintField:function(e,t){this.writeTag(e,r.Varint),this.writeSVarint(t)},writeStringField:function(e,t){this.writeTag(e,r.Bytes),this.writeString(t)},writeFloatField:function(e,t){this.writeTag(e,r.Fixed32),this.writeFloat(t)},writeDoubleField:function(e,t){this.writeTag(e,r.Fixed64),this.writeDouble(t)},writeBooleanField:function(e,t){this.writeVarintField(e,!!t)}};function c(e,t,n){var r=n.buf,i,a=r[n.pos++];if(i=(a&112)>>4,a<128||(a=r[n.pos++],i|=(a&127)<<3,a<128)||(a=r[n.pos++],i|=(a&127)<<10,a<128)||(a=r[n.pos++],i|=(a&127)<<17,a<128)||(a=r[n.pos++],i|=(a&127)<<24,a<128)||(a=r[n.pos++],i|=(a&1)<<31,a<128))return u(e,i,t);throw Error(`Expected varint not more than 10 bytes`)}function l(e){return e.type===r.Bytes?e.readVarint()+e.pos:e.pos+1}function u(e,t,n){return n?t*4294967296+(e>>>0):(t>>>0)*4294967296+(e>>>0)}function d(e,t){var n,r;if(e>=0?(n=e%4294967296|0,r=e/4294967296|0):(n=~(-e%4294967296),r=~(-e/4294967296),n^4294967295?n=n+1|0:(n=0,r=r+1|0)),e>=0x10000000000000000||e<-0x10000000000000000)throw Error(`Given varint doesn't fit into 10 bytes`);t.realloc(10),f(n,r,t),p(r,t)}function f(e,t,n){n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos++]=e&127|128,e>>>=7,n.buf[n.pos]=e&127}function p(e,t){var n=(e&7)<<4;t.buf[t.pos++]|=n|((e>>>=3)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127|((e>>>=7)?128:0),e&&(t.buf[t.pos++]=e&127)))))}function m(e,t,n){var r=t<=16383?1:t<=2097151?2:t<=268435455?3:Math.floor(Math.log(t)/(Math.LN2*7));n.realloc(r);for(var i=n.pos-1;i>=e;i--)n.buf[i+r]=n.buf[i]}function h(e,t){for(var n=0;n<e.length;n++)t.writeVarint(e[n])}function g(e,t){for(var n=0;n<e.length;n++)t.writeSVarint(e[n])}function _(e,t){for(var n=0;n<e.length;n++)t.writeFloat(e[n])}function v(e,t){for(var n=0;n<e.length;n++)t.writeDouble(e[n])}function y(e,t){for(var n=0;n<e.length;n++)t.writeBoolean(e[n])}function b(e,t){for(var n=0;n<e.length;n++)t.writeFixed32(e[n])}function x(e,t){for(var n=0;n<e.length;n++)t.writeSFixed32(e[n])}function S(e,t){for(var n=0;n<e.length;n++)t.writeFixed64(e[n])}function C(e,t){for(var n=0;n<e.length;n++)t.writeSFixed64(e[n])}function w(e,t){return(e[t]|e[t+1]<<8|e[t+2]<<16)+e[t+3]*16777216}function T(e,t,n){e[n]=t,e[n+1]=t>>>8,e[n+2]=t>>>16,e[n+3]=t>>>24}function E(e,t){return(e[t]|e[t+1]<<8|e[t+2]<<16)+(e[t+3]<<24)}function D(e,t,n){for(var r=``,i=t;i<n;){var a=e[i],o=null,s=a>239?4:a>223?3:a>191?2:1;if(i+s>n)break;var c,l,u;s===1?a<128&&(o=a):s===2?(c=e[i+1],(c&192)==128&&(o=(a&31)<<6|c&63,o<=127&&(o=null))):s===3?(c=e[i+1],l=e[i+2],(c&192)==128&&(l&192)==128&&(o=(a&15)<<12|(c&63)<<6|l&63,(o<=2047||o>=55296&&o<=57343)&&(o=null))):s===4&&(c=e[i+1],l=e[i+2],u=e[i+3],(c&192)==128&&(l&192)==128&&(u&192)==128&&(o=(a&15)<<18|(c&63)<<12|(l&63)<<6|u&63,(o<=65535||o>=1114112)&&(o=null))),o===null?(o=65533,s=1):o>65535&&(o-=65536,r+=String.fromCharCode(o>>>10&1023|55296),o=56320|o&1023),r+=String.fromCharCode(o),i+=s}return r}function O(e,t,n){return s.decode(e.subarray(t,n))}function k(e,t,n){for(var r=0,i,a;r<t.length;r++){if(i=t.charCodeAt(r),i>55295&&i<57344)if(a)if(i<56320){e[n++]=239,e[n++]=191,e[n++]=189,a=i;continue}else i=a-55296<<10|i-56320|65536,a=null;else{i>56319||r+1===t.length?(e[n++]=239,e[n++]=191,e[n++]=189):a=i;continue}else a&&(e[n++]=239,e[n++]=191,e[n++]=189,a=null);i<128?e[n++]=i:(i<2048?e[n++]=i>>6|192:(i<65536?e[n++]=i>>12|224:(e[n++]=i>>18|240,e[n++]=i>>12&63|128),e[n++]=i>>6&63|128),e[n++]=i&63|128)}return n}})),ce=o(((e,t)=>{t.exports={}})),le=c(se(),1);let ue=function(e){let t=typeof e==`object`?e:JSON.parse(e);this._locked=t._locked,this._geoJsonFlag=t._geoJsonFlag,this.adjacency_list=t.adjacency_list,this.reverse_adjacency_list=t.reverse_adjacency_list,this._nodeToIndexLookup=t._nodeToIndexLookup,this._edgeProperties=t._edgeProperties,this._edgeGeometry=t._edgeGeometry},de=function(){if(!this._locked)throw Error(`No sense in saving network before it is contracted.`);return JSON.stringify({_locked:this._locked,_geoJsonFlag:this._geoJsonFlag,adjacency_list:this.adjacency_list,reverse_adjacency_list:this.reverse_adjacency_list,_nodeToIndexLookup:this._nodeToIndexLookup,_edgeProperties:this._edgeProperties,_edgeGeometry:this._edgeGeometry})},fe=function(e){var t=new le.default(e),n=N.read(t);n.adjacency_list=n.adjacency_list.map(e=>e.edges),n.reverse_adjacency_list=n.reverse_adjacency_list.map(e=>e.edges),n._edgeGeometry=n._edgeGeometry.map(e=>e.linestrings.map(e=>e.coords)),n._edgeProperties=n._edgeProperties.map(e=>JSON.parse(e)),this._locked=n._locked,this._geoJsonFlag=n._geoJsonFlag,this.adjacency_list=n.adjacency_list,this.reverse_adjacency_list=n.reverse_adjacency_list,this._nodeToIndexLookup=n._nodeToIndexLookup,this._edgeProperties=n._edgeProperties,this._edgeGeometry=n._edgeGeometry,this._indexToNodeLookup={};for(let[e,t]of Object.entries(this._nodeToIndexLookup))this._indexToNodeLookup[t]=e;console.log(`done loading pbf`)},pe=async function(e){if(!this._locked)throw Error(`No sense in saving network before it is contracted.`);let t;try{t=await Promise.resolve().then(()=>c(ce(),1))}catch{console.log(`saving as PBF only works in NodeJS`);return}let n={_locked:this._locked,_geoJsonFlag:this._geoJsonFlag,adjacency_list:this.adjacency_list,reverse_adjacency_list:this.reverse_adjacency_list,_nodeToIndexLookup:this._nodeToIndexLookup,_edgeProperties:this._edgeProperties,_edgeGeometry:this._edgeGeometry};n.adjacency_list=n.adjacency_list.map(e=>({edges:e.map(e=>e)})),n.reverse_adjacency_list=n.reverse_adjacency_list.map(e=>({edges:e.map(e=>e)})),n._edgeGeometry=n._edgeGeometry.map(e=>({linestrings:e.map(e=>({coords:e}))})),n._edgeProperties=n._edgeProperties.map(e=>JSON.stringify(e));var r=new le.default;N.write(n,r);var i=r.finish();t.writeFileSync(e,i),console.log(`done saving ${e}`)};function me(e){this.id=e.id,this.dist=e.dist===void 0?1/0:e.dist,this.prev=void 0,this.visited=void 0,this.opened=!1,this.heapIndex=-1}function he(){var e=0,t=[];return{createNewState:r,reset:n};function n(){e=0}function r(n){var r=t[e];return r?(r.id=n.id,r.dist=n.dist===void 0?1/0:n.dist,r.prev=void 0,r.visited=void 0,r.opened=!1,r.heapIndex=-1):(r=new me(n),t[e]=r),e++,r}}let ge=function(){if(this._locked)throw Error(`Network has already been contracted`);this._locked=!0,this._maxUncontractedEdgeIndex=this._currentEdgeIndex;let e=this._createChShortcutter(),t=t=>this._contract(t,!0,e)-(this.adjacency_list[t]||[]).length+n(t),n=e=>(this.adjacency_list[e]||[]).reduce((e,t)=>e+(this.contracted_nodes[t.end]==null?0:1),0),r=new O({compare(e,t){return e.score-t.score}});this.contracted_nodes=[],Object.keys(this._nodeToIndexLookup).forEach(e=>{let n=this._nodeToIndexLookup[e],i=new be(t(n),n);r.push(i)});let i=1,a=r.length;for(;r.length>0;){let n=r.length;n%50==0&&(this.debugMode&&console.log(n/a),this._cleanAdjList(this.adjacency_list),this._cleanAdjList(this.reverse_adjacency_list));let o=!1,s=r.peek(),c=s.score;do{let e=s.id,n=t(e);n>c&&(s.score=n,r.updateItem(s.heapIndex)),s=r.peek(),s.id===e&&(o=!0)}while(o===!1);let l=r.pop();this._contract(l.id,!1,e),this.contracted_nodes[l.id]=i,i++}this._cleanAdjList(this.adjacency_list),this._cleanAdjList(this.reverse_adjacency_list),this._arrangeContractedPaths(this.adjacency_list),this._arrangeContractedPaths(this.reverse_adjacency_list),this.debugMode&&console.log(`Contraction complete`)},_e=function(e){e.forEach((e,t)=>{e.forEach(e=>{let n=t,r=[],i=[];for(i=[e.attrs];i.length;){let e=i.pop();e<=this._maxUncontractedEdgeIndex?r.push(e):i.push(...this._edgeProperties[e]._id)}let a={};r.forEach(e=>{let t=this._edgeProperties[e],n=t._start_index,r=t._end_index;a[n]?a[n].push(e):a[n]=[e],a[r]?a[r].push(e):a[r]=[e]});let o=[],s=String(n),c=a[s][0];for(;c!=null;){o.push(c);let e=this._edgeProperties[c],t=String(e._start_index),n=String(e._end_index),r=t===s?n:t;s=r;let i=a[r];if(i.length===1)break;i.length>2&&(console.error(`too many edges in array. unexpected. unrecoverable.`),process.exit()),c=i[0]===c?i[1]:i[0]}this._edgeProperties[e.attrs]._ordered=o})})},ve=function(e){e.forEach((t,n)=>{let r=this.contracted_nodes[n];r!=null&&(e[n]=e[n].filter(e=>{let t=this.contracted_nodes[e.end];return t==null?!0:r<t}))})},ye=function(e,t,n){let r=(this.reverse_adjacency_list[e]||[]).filter(e=>!this.contracted_nodes[e.end]),i=(this.adjacency_list[e]||[]).filter(e=>!this.contracted_nodes[e.end]),a=0;return r.forEach(r=>{let o=0,s=r.cost;if(i.forEach(e=>{if(r.end===e.end)return;let t=s+e.cost;t>o&&(o=t)}),!i.length)return;let c=n.runDijkstra(r.end,null,e,o);i.forEach(e=>{if(r.end===e.end)return;let n=s+e.cost;if(n<(c.distances[e.end]||1/0)&&(a++,!t)){let t={_cost:n,_id:[r.attrs,e.attrs],_start_index:r.end,_end_index:e.end};this._addContractedEdge(r.end,e.end,t)}})}),a};function be(e,t){this.score=e,this.id=t}let xe=function(){let e=this._createNodePool(),t=this.adjacency_list;return{runDijkstra:n};function n(n,r,i,a){e.reset();let o=[],s={};var c=new O({compare(e,t){return e.dist-t.dist}});let l=e.createNewState({id:n,dist:0});for(o[n]=l,l.opened=1,s[l.id]=0,n===r&&(l=``);l;){(t[l.id]||[]).filter(e=>e.end!==i).forEach(t=>{let n=o[t.end];if(n===void 0&&(n=e.createNewState({id:t.end}),o[t.end]=n),n.visited===!0)return;n.opened||(c.push(n),n.opened=!0);let r=l.dist+t.cost;r>=n.dist||(n.dist=r,s[n.id]=r,n.prev=l.id,c.updateItem(n.heapIndex))}),l.visited=!0;let n=l.dist;l=c.pop(),l&&l.id===r&&(l=``),n>a&&(l=``)}return{distances:s,nodeState:o}}};function P(e,t){let n=t||{};this.debugMode=n.debugMode||!1,this.adjacency_list=[],this.reverse_adjacency_list=[],this._createNodePool=he,this._currentNodeIndex=-1,this._nodeToIndexLookup={},this._indexToNodeLookup={},this._currentEdgeIndex=-1,this._edgeProperties=[],this._edgeGeometry=[],this._maxUncontractedEdgeIndex=0,this._locked=!1,this._geoJsonFlag=!1,this._manualAdd=!1,e&&(this._loadFromGeoJson(e),this.debugMode&&(console.log(`Nodes: `,this._currentNodeIndex),console.log(`Edges: `,this._currentEdgeIndex)))}P.prototype.createPathfinder=k,P.prototype._loadFromGeoJson=te,P.prototype._cleanseGeoJsonNetwork=ne,P.prototype._addContractedEdge=ae,P.prototype.addEdge=re,P.prototype._addEdge=ie,P.prototype.loadCH=ue,P.prototype.saveCH=de,P.prototype.loadPbfCH=fe,P.prototype.savePbfCH=pe,P.prototype.contractGraph=ge,P.prototype._arrangeContractedPaths=_e,P.prototype._cleanAdjList=ve,P.prototype._contract=ye,P.prototype._createChShortcutter=xe;let Se=6371e3;Se*Se;let Ce=Math.PI/180;function F([e,t],[n,r]){return we(e,t,n,r)}function we(e,t,n,r){let i=(r-t)*Ce,a=(n-e)*Ce,o=t*Ce,s=r*Ce,c=Math.sin(i/2),l=Math.sin(a/2),u=Math.hypot(c,Math.cos(o)*Math.cos(s)*l);return 2*Se*Math.asin(u)}function Te(e,t,n=5){if(e===t)return[e];let r=e>t,i=r?t:e,a=r?e:t,o=(a-i)/n,s=10**Math.floor(Math.log10(o)),c=o/s,l;l=c<1.5?1:c<3?2:c<7?5:10;let u=l*s,d=Math.floor(i/u)*u,f=Math.ceil(a/u)*u,p=[],m=d,h=Math.max(0,-Math.floor(Math.log10(u))),g=u/1e9;for(;m<=f+g;)p.push(Number(m.toFixed(h))),m+=u;return r?p.reverse():p}function Ee(e){let t=e.prototype._arrangeContractedPaths;return e.prototype._arrangeContractedPaths=function(e){let t=this;e.forEach((e,n)=>{e.forEach(e=>{let r=n,i=[],a=[e.attrs];for(;a.length;){let e=a.pop();if(e<=t._maxUncontractedEdgeIndex)i.push(e);else{let n=t._edgeProperties[e];n&&Array.isArray(n._id)&&a.push(...n._id)}}let o={};if(i.forEach(e=>{let n=t._edgeProperties[e],r=String(n._start_index),i=String(n._end_index);o[r]||(o[r]=[]),o[r].push(e),o[i]||(o[i]=[]),o[i].push(e)}),i.length<=1){t._edgeProperties[e.attrs]._ordered=i;return}let s=i.length,c=new Set,l=null,u=(e,n)=>{if(n.length===s)return l=n.slice(),!0;let r=o[e]||[];for(let i of r){if(c.has(i))continue;c.add(i);let r=t._edgeProperties[i],a=String(r._start_index),o=String(r._end_index),s=e===a?o:a;if(n.push(i),u(s,n))return!0;n.pop(),c.delete(i)}return!1};if(u(String(r),[]),l){t._edgeProperties[e.attrs]._ordered=l;return}let d=[],f=String(r),p=o[f]||[],m=p.length?p[0]:null;for(;m!=null;){d.push(m);let e=t._edgeProperties[m],n=String(e._start_index),r=String(e._end_index),i=n===f?r:n;f=i;let a=o[i]||[];if(a.length===1)break;let s=null;for(let e of a)if(e!==m&&!d.includes(e)){s=e;break}if(s==null)break;m=s}for(let e of i)d.includes(e)||d.push(e);t._edgeProperties[e.attrs]._ordered=d})})},function(){t?e.prototype._arrangeContractedPaths=t:delete e.prototype._arrangeContractedPaths}}function De(e,t,n,r={}){if(!e||typeof e!=`object`)throw Error(`Invalid prepared graph for isoPHAST`);let{N:i}=e;if(!Number.isInteger(i))throw Error(\"Prepared graph missing node count `N`.\");let{direction:a=`from`,mode:o=`car`,outputUnscaled:s=!1}=r;if(a!==`from`&&a!==`to`)throw Error(`Invalid direction: expected \"from\" or \"to\".`);if(!Number.isInteger(t)||t<0||t>=i)throw Error(`Invalid startId ${t}: expected integer in range 0..${i-1}`);let c=new Float64Array(i).fill(1/0),l=o===`pedestrian`,u=e.distScale&&Number.isFinite(e.distScale)?e.distScale:10;if(!e._chGraph||e._chGraphMode!==o||e._chGraphIsUndirected!==l||e._chGraphCostField!==e.costField||e._chGraphPenaltyKey!==e.penaltyKey){let t=new P,n=0,r=e.edgeSrc||null,a=e.edgeTgt||null,s=e.edgeCostInt||null;if(r&&a&&s)for(let e=0;e<r.length;e++){let i=r[e],o=a[e],c=s[e]/u;t.addEdge(String(i),String(o),{_id:n++,_cost:c},null,l)}else{let{adjPtr:r,adjTo:a,adjCost:o}=e;for(let e=0;e<i;e++)for(let i=r[e];i<r[e+1];i++){let r=a[i],s=o[i]/u;t.addEdge(String(e),String(r),{_id:n++,_cost:s},null,l)}}let c=Ee(P);try{t.contractGraph()}finally{c()}e._chGraph=t,e._chGraphMode=o,e._chGraphIsUndirected=l,e._chGraphCostField=e.costField,e._chGraphPenaltyKey=e.penaltyKey,e._chFinder=e._chGraph.createPathfinder({})}let d=e._chFinder||e._chGraph.createPathfinder({});e._chFinder=d;let f=s&&e.coordsArr&&e.coordsArr[t]&&e.costField===`distance`&&e.coordsAreGeographic===!0,p=f?e.coordsArr[t]:null;if(a===`from`)for(let r=0;r<i;r++){if(r===t){c[r]=0;continue}if(f){let t=e.coordsArr[r];if(!t){c[r]=1/0;continue}if(F(p,t)>n){c[r]=1/0;continue}}try{let e=d.queryContractionHierarchy(String(t),String(r));e&&Number.isFinite(e.total_cost)?c[r]=e.total_cost===0&&r!==t?1/0:e.total_cost:c[r]=1/0}catch{c[r]=1/0}}else for(let r=0;r<i;r++){if(r===t){c[r]=0;continue}if(f){let t=e.coordsArr[r];if(!t){c[r]=1/0;continue}if(F(p,t)>n){c[r]=1/0;continue}}try{let e=d.queryContractionHierarchy(String(r),String(t));e&&Number.isFinite(e.total_cost)?c[r]=e.total_cost===0&&r!==t?1/0:e.total_cost:c[r]=1/0}catch{c[r]=1/0}}let m=[];for(let e=0;e<i;e++){let t=c[e];Number.isFinite(t)&&t<=n&&m.push(e)}if(!s){let e=new Float64Array(i);for(let t=0;t<i;t++){let n=c[t];e[t]=Number.isFinite(n)?Math.round(n*u):1/0}return{distances:e,reachable:m}}return{distances:c,reachable:m}}function Oe(e,t=`ERR_ITEM`){return!e||typeof e!=`object`?{error:!0,code:t,message:e?String(e):void 0,stack:void 0}:{error:!0,code:e.code||t,message:e.message,stack:e.stack}}function ke(e){return!e||!e.error?String(e):`${e.code||`ERR`}: ${e.message||``}`}let Ae=null;if(typeof process<`u`&&process?.hrtime&&typeof process.hrtime.bigint==`function`)try{let e=Number(process.hrtime.bigint()/1000000n);Ae=Date.now()-e}catch{Ae=null}let je=()=>{let e=Date.now();if(typeof performance<`u`&&typeof performance?.now==`function`&&typeof performance?.timeOrigin==`number`)try{let t=performance.timeOrigin+performance.now();return Math.abs(t-e)<1e3?t:e}catch{}if(Ae!=null)try{let t=Number(process.hrtime.bigint()/1000000n)+Ae;return Math.abs(t-e)<1e3?t:e}catch{return e}return e},I=Object.freeze({error:`error`,warn:`warn`,info:`info`,log:`log`,debug:`debug`,table:`table`}),L=typeof globalThis<`u`&&globalThis?.console?globalThis.console:typeof self<`u`&&self?.console?self.console:typeof window<`u`&&window?.console?window.console:typeof global<`u`&&global?.console?global.console:null;function Me(e){try{return JSON.stringify(e)}catch{try{let t=typeof WeakSet==`function`?new WeakSet:new Set;return JSON.stringify(e,function(e,n){if(n&&typeof n==`object`){if(t.has(n))return`[Circular]`;t.add(n)}return typeof n==`function`?`[Function: ${n.name||`anonymous`}]`:typeof n==`symbol`?String(n):typeof n==`bigint`?n.toString()+`n`:n})}catch{try{return String(e)}catch{return`[Unserializable]`}}}}var Ne=class{constructor(e=0,t={}){this._debugLevel=0,this._counters=Object.create(null),this._format=t?.format||`text`,this.name=t?.name||null,this._formatter=typeof t?.formatter==`function`?t.formatter:null,this._output=typeof t?.output==`function`?t.output:null,this.setDebugLevel(e)}setDebugLevel(e){let t=NaN;typeof e==`number`?t=e:typeof e==`string`||typeof e==`boolean`?t=Number(e):(e instanceof Number||e instanceof String||e instanceof Boolean)&&(t=Number(e.valueOf())),this._debugLevel=Number.isFinite(t)&&t>=0?Math.max(0,Math.min(3,Math.floor(t))):0}getDebugLevel(){return this._debugLevel}isDebugLevel(e=1){return Number(this._debugLevel)>=Number(e||1)}isDebug(){return this.isDebugLevel(1)}_resolveLogArgs(e){return e.map(e=>{if(typeof e==`function`)try{return e()}catch(e){return e}return e})}_emit(e,t,n,r,i={}){if(!this.isDebugLevel(e))return;let a=this._resolveLogArgs(r),o={level:n,msg:i.msgArray?a:a.length===1?a[0]:a,ts:je(),format:this._format};if(this.name&&(o.name=this.name),this._formatter)try{let e=this._formatter(o);if(e!=null){if(typeof e==`string`){if(this._output){try{this._output(e)}catch{}return}typeof L?.[t]==`function`&&L[t](e);return}o=e}}catch{}if(this._output){try{this._output(o)}catch{}return}if(typeof L?.[t]==`function`)if(this._format===`json`)try{let e=typeof o==`string`?o:Me(o);L[t](e)}catch{try{L[t](...Array.isArray(a)?a:[a])}catch{}}else L[t](...a)}error(...e){let t=e.map(e=>{try{if(e?.error)return ke(e);if(e instanceof Error||e&&typeof e==`object`)return ke(Oe(e))}catch{}return e});this._emit(1,`error`,I.error,t)}warn(...e){this._emit(2,`warn`,I.warn,e)}info(...e){this._emit(3,`info`,I.info,e)}log(...e){this._emit(3,`log`,I.log,e)}debug(...e){this._emit(3,`debug`,I.debug,e)}table(...e){if(!this.isDebugLevel(3)||!L)return;if(this._format===`json`){this._emit(3,`log`,I.table,e,{msgArray:!0});return}let t=this._resolveLogArgs(e);typeof L.table==`function`?L.table(...t):typeof L.log==`function`&&L.log(...t)}incrementCounter(e){if(!this.isDebug())return;let t=String(e||``);t&&(this._counters[t]=(this._counters[t]||0)+1)}getDebugCounters(){return Object.assign({},this._counters)}resetDebugCounters(){this._counters=Object.create(null)}};let Pe=Math.PI/180,Fe=111320;function Ie(e){return Math.max(Math.cos(e*Pe),1e-6)}function Le(e){return Array.isArray(e)&&e.length===2&&Number.isFinite(e[0])&&Number.isFinite(e[1])}function Re(e){let{nodes:t}=e,n=t.size,r=new u(n),i=Array(n),a=Array(n),o=0;for(let[e,n]of t)r.add(n.coords[0],n.coords[1]),a[o]=e,i[o]=n.coords,o+=1;return r.finish(),{index:r,coordsArr:i,nodeIds:a}}function ze(e,t,n){e._spatialIndex||(e._spatialIndex=Re(e));let{index:r,nodeIds:i}=e._spatialIndex,[a,o]=t,s=n/(Fe*Ie(o));return r.within(a,o,s).map(e=>i[e])}function Be(e,t,n=500){if(!t||typeof t!=`object`||!t.nodes||typeof t.nodes!=`object`||typeof t.nodes.get!=`function`||typeof t.nodes.has!=`function`||typeof t.nodes.size!=`number`)throw Error(`Invalid graph: expected object with nodes Map.`);if(!Le(e))return-1;t._spatialIndex||(t._spatialIndex=Re(t));let{index:r,coordsArr:i,nodeIds:a}=t._spatialIndex,[o,s]=e,c=n/(Fe*Ie(s)),l=r.within(o,s,c);if(l.length===0)return-1;let u=-1,d=n;for(let t of l){let n=a[t],r=F(e,i[t]);r<d&&(d=r,u=n)}return u}function Ve(e){if(e._incidentEdgeIndex)return e._incidentEdgeIndex;let t=e.nodes.size,n=Array.from({length:t},()=>[]);for(let r=0;r<e.edges.length;r++){let i=e.edges[r];i.source>=0&&i.source<t&&n[i.source].push(r),i.target>=0&&i.target<t&&n[i.target].push(r)}return e._incidentEdgeIndex=n,n}function He(e){if(e._edgeSpatialIndex)return e._edgeSpatialIndex;let t=new u(e.edges.length),n=[],r=[],i=[],a=0;for(let o=0;o<e.edges.length;o+=1){let s=e.edges[o],c=e.nodes.get(s.source),l=e.nodes.get(s.target);if(!c||!l)continue;let[u,d]=c.coords,[f,p]=l.coords,m=(u+f)/2,h=(d+p)/2,g=Ie(h),_=(f-u)*g/2,v=(p-d)/2,y=Math.hypot(_,v);n.push([m,h]),r.push(y),i.push(o),t.add(m,h),y>a&&(a=y)}return t.finish(),e._edgeSpatialIndex={index:t,edgeCenters:n,edgeRadiusDegs:r,edgeIndexByPointIndex:i,maxEdgeRadiusDeg:a},e._edgeSpatialIndex}function Ue(e,t,n){let{index:r,edgeCenters:i,edgeRadiusDegs:a,edgeIndexByPointIndex:o,maxEdgeRadiusDeg:s}=He(e),[c,l]=t,u=Ie(l),d=n/(Fe*u),f=d+s;return r.within(c,l,f).filter(e=>{let t=i[e];if(!t)return!1;let n=(t[0]-c)*u,r=t[1]-l;return Math.hypot(n,r)<=d+a[e]}).map(e=>o[e])}function We(e,t,n,r){let i=e[0]*r,a=e[1],o=t[0]*r,s=t[1],c=n[0]*r,l=n[1],u=c-o,d=l-s,f=u*u+d*d;if(f===0)return null;let p=((i-o)*u+(a-s)*d)/f;return{t:p,projected:[o+u*p,s+d*p]}}function Ge(e,t,n,r=60){let i=ze(t,e,n+250),a=Ve(t),o=new Set;for(let e of i){let t=a[e];if(t)for(let e of t)o.add(e)}for(let r of Ue(t,e,n+250))o.add(r);if(o.size===0)return null;let s=Ie(e[1]),c=null,l=i=>{let a=t.edges[i];if(!a)return;let o=t.nodes.get(a.source)?.coords,l=t.nodes.get(a.target)?.coords;if(!o||!l||a.cost===-1&&a.reverseCost===-1)return;let u=We(e,o,l,s);if(!u)return;let{t:d,projected:f}=u,p=Math.max(0,Math.min(1,d)),m=p===d?[f[0]/s,f[1]]:[(o[0]*s+(l[0]*s-o[0]*s)*p)/s,o[1]+(l[1]-o[1])*p],h=F(e,m);h>n||h>r||(!c||h<c.distanceM)&&(c={edge:a,edgeIndex:i,projectedCoords:m,distanceM:h,source:a.source,target:a.target,t:p})};for(let e of o)l(e);if(o.size<t.edges.length)for(let e=0;e<t.edges.length;e++)o.has(e)||l(e);return c}function Ke(e,t,n){let r={id:t,coords:n};return{size:e.size+1,get(n){return n===t?r:e.get(n)},has(n){return n===t||e.has(n)},keys(){return(function*(){for(let t of e.keys())yield t;yield t})()},values(){return(function*(){for(let t of e.values())yield t;yield r})()},entries(){return(function*(){for(let t of e.entries())yield t;yield[t,r]})()},[Symbol.iterator](){return this.entries()}}}function qe(e,t,n){let r=e.length+n.length-1,i=Array(r),a=0;for(let n=0;n<t;n+=1)i[a++]=e[n];for(let e=0;e<n.length;e+=1)i[a++]=n[e];for(let n=t+1;n<e.length;n+=1)i[a++]=e[n];return i}function Je(e){let t=-1;for(let n of e.nodes.keys())n>t&&(t=n);return t+1}function Ye(e,t){let n=Je(e),r=Ke(e.nodes,n,t.projectedCoords),i=e.nodes.get(t.edge.source).coords,a=e.nodes.get(t.edge.target).coords,o=F(i,t.projectedCoords),s=F(t.projectedCoords,a),c=o/(t.edge.speed/3.6),l=s/(t.edge.speed/3.6),u=t.edge.properties,d=t.edge.fibonacciScore,f=Number.isFinite(t.edge.id)?t.edge.id:e.edges.length,p=-(f*2+1),m=-(f*2+2),h=t.edge.cost===-1?-1:o,g=t.edge.cost===-1?-1:s,_=t.edge.reverseCost===-1?-1:o,v=t.edge.reverseCost===-1?-1:s,y=[{id:p,source:t.edge.source,target:n,cost:h,reverseCost:_,length:o,speed:t.edge.speed,travelTime:c,properties:u,fibonacciScore:d},{id:m,source:n,target:t.edge.target,cost:g,reverseCost:v,length:s,speed:t.edge.speed,travelTime:l,properties:u,fibonacciScore:d}],b=qe(e.edges,t.edgeIndex,y),x={...e,nodes:r,edges:b,nodeIndex:e.nodeIndex&&new Map(e.nodeIndex),_lastAddedNodeId:n};return delete x._spatialIndex,delete x._incidentEdgeIndex,delete x._prepared,x}function Xe(e,t,n,r=60){let i={type:`none`,nodeId:-1,nodeSnapDistanceM:1/0,segmentSnap:null,segmentSnapDistanceM:1/0,snapDistanceM:1/0};if(!Le(e))return i;let a=Be(e,t,n);i.nodeId=a,a!==-1&&(i.nodeSnapDistanceM=F(e,t.nodes.get(a)?.coords??[NaN,NaN]));let o=Ge(e,t,n,r);return o?(i.segmentSnap=o,i.segmentSnapDistanceM=o.distanceM,o.t===0||o.t===1?(i.nodeId=o.t===0?o.source:o.target,i.nodeSnapDistanceM=o.distanceM,i.type=`node`,i.snapDistanceM=o.distanceM):(i.type=`segment`,i.snapDistanceM=i.segmentSnapDistanceM)):i.nodeId!==-1&&(i.type=`node`,i.snapDistanceM=i.nodeSnapDistanceM),i}function Ze(e,t,n,r=60){let i=Array.isArray(n)&&n.length>0?n:[250,500,800],a={type:`none`,nodeId:-1,nodeSnapDistanceM:1/0,segmentSnap:null,segmentSnapDistanceM:1/0,snapDistanceM:1/0};for(let n of i)if(a=Xe(e,t,n,r),a.type!==`none`)return a;return a}let Qe=Object.freeze({generatedAt:`2026-05-08T06:56:47.004332+00:00`,featureOrder:`safeN.safeE.safeBeelineKm.avgOutDegree.logAvgOutDegree.edgesPerKm.nodesPerKm.sizeRatioEN.beelinePerNode.relativeDensity.logRelativeDensity.globalCoverage.logGlobalCoverage.emptyRatio.logEmptyRatio.sourceDegree.logSourceDegree.targetDegree.logTargetDegree.sourceCentrality.logSourceCentrality.targetCentrality.logTargetCentrality.sourceTargetDegreeRatio.logSourceTargetDegreeRatio.sourceTargetCentralityRatio.logSourceTargetCentralityRatio.graphDensity.logGraphDensity.avgBranchFactor.logAvgBranchFactor.logN.logE.logBeelineKm.logEdgesPerKm.logNodesPerKm.logEoverN.logBeelinePerNode.densityBySize.logDensityBySize.coverageDensity.logCoverageDensity.degreeProduct.logDegreeProduct.centralityProduct.logCentralityProduct.coverageEmptyContrast.logCoverageEmptyContrast.safeBeelineKmOverSizeRatioEN.globalCoverageTimesEmptyRatio.avgOutDegreeTimesLogRelativeDensity.beelinePerNodeTimesSourceTargetDegreeRatio.coverageEmptyContrastTimesLogAvgBranchFactor.densityBySizeTimesSourceCentrality`.split(`.`),engines:[`bidirectional-astar`,`adaptive-barrier`,`delta-stepping`,`ultra-dijkstra`],profiles:{sabOff:{modelType:`runtime-linear`,runtimeFeatureOrder:`logN.logE.logDensityBySize.sourceCentrality.avgOutDegreeTimesLogRelativeDensity.degreeProduct.logTargetDegree.nodesPerKm.logSourceTargetDegreeRatio.globalCoverageTimesEmptyRatio.targetDegree.sourceTargetDegreeRatio.logSourceTargetCentralityRatio.beelinePerNodeTimesSourceTargetDegreeRatio.safeBeelineKm.logSourceCentrality.logSourceDegree.sourceDegree.logDegreeProduct.targetCentrality.coverageDensity.logEdgesPerKm.logCentralityProduct.logTargetCentrality.logCoverageEmptyContrast.logNodesPerKm.safeN.logEmptyRatio.relativeDensity`.split(`.`),runtimeScalerMean:[9.953534111145693,10.306107657870928,10.179418255010212,35.23255813953488,1.2000989786158425,2.0697674418604652,.8735181818435295,16146.147553997811,.6971508099449448,.06862466902882636,1.4651162790697674,1.0620155038759689,.5353518764732391,.12554421254928,4.48686046511628,1.782412313084339,.8440179184606578,1.372093023255814,1.0462601861070673,75.23255813953489,.2105043345120366,9.650933379716797,3.5454774889245333,3.319556356155643,.07036258708020175,9.298380539267672,32026.95348837209,.48884699873646015,1.374378107174757],runtimeScalerScale:[.7802797824053423,.8112631380226669,.9852697125276325,59.91421666493021,.3841215840043817,1.3188322677914255,.23347911503556903,15609.187220087797,.22657707937345387,.07486406893026765,.6231516747429889,.4941822465274178,1.0065020502025708,.10630825516298101,5.612798264023307,1.9242883930750867,.19598683756458085,.48336301606573323,.37122137966779756,63.66768272592054,.2538511405761554,.841276044629191,3.983688334644014,1.9720370078600902,.10256917352535876,.8564976115643828,43468.110955018936,.14544184764502804,.6394766982126728],scaler_mean:[32026.95348837209,47081.53488372093,4.48686046511628,1.4279653004235897,.8857757363486024,22674.918175575764,16146.147553997811,1.4279653004235897,.12236987517754519,1.374378107174757,.8348080412448576,.14748502713305092,.12727839311720254,.6468584102887971,.48884699873646015,1.372093023255814,.8440179184606578,1.4651162790697674,.8735181818435295,35.23255813953488,1.782412313084339,75.23255813953489,3.319556356155643,1.0620155038759689,.6971508099449448,4.77633694543673,.5353518764732391,1.374378107174757,.8348080412448576,1.4279653004235897,.8857757363486024,9.953534111145693,10.306107657870928,1.2760096553010236,9.650933379716797,9.298380539267672,.8857757363486024,.11248523631210577,45822.57256000054,10.179418255010212,.2105043345120366,.17084045709428813,2.0697674418604652,1.0462601861070673,3520.813953488372,3.5454774889245333,.07886035810422456,.07036258708020175,3.058559271420463,.06862466902882636,1.2000989786158425,.12554421254928,.07184969160134493,2238574.406852828],scaler_scale:[43468.110955018936,66693.40038210568,5.612798264023307,.12380696658276415,.05033888080840221,21755.739063333,15609.187220087797,.12380696658276415,.08721515164406074,.6394766982126728,.23604016843857162,.16964678135547157,.14131683033350545,.22153321676862622,.14544184764502804,.48336301606573323,.19598683756458085,.6231516747429889,.23347911503556903,59.91421666493021,1.9242883930750867,63.66768272592054,1.9720370078600902,.4941822465274178,.22657707937345387,21.945509344145304,1.0065020502025708,.6394766982126728,.23604016843857162,.12380696658276415,.05033888080840221,.7802797824053423,.8112631380226669,.8962387837738194,.841276044629191,.8564976115643828,.05033888080840221,.076530705146375,66209.67125938559,.9852697125276325,.2538511405761554,.19664190478049298,1.3188322677914255,.37122137966779756,7832.697923198901,3.983688334644014,.11977771922575586,.10256917352535876,3.7388637825236395,.07486406893026765,.3841215840043817,.10630825516298101,.11012210526134425,8348187.2730846405],classes:[`bidirectional-astar`,`adaptive-barrier`,`delta-stepping`,`ultra-dijkstra`],fallbackEngine:`adaptive-barrier`,minConfidence:.36,minMargin:.04,regressors:{\"bidirectional-astar\":{coefficients:[.1684660616620416,0,.032391574227357625,0,0,0,-.017624818125046255,0,0,-.15588884218125998,0,0,0,0,.047725131248075835,-.15618713665529707,-.15618713665528644,.28026389601568363,-.11559553379038798,-.1917800231662427,.055895631608454274,.14186651173796608,-.05947834723567894,.12431764886212064,.2081966634451041,0,.0679344676570621,0,0,0,0,.22200947173142932,.17622713892288358,0,-.040219149290666514,-.004178064579950128,0,0,0,.19917206596864545,.1254119513613888,0,.16837593658297936,-.12435750329862638,0,.06553162902435615,0,-.04658829234886771,0,-.08480120283697098,.19680186729463675,-.01536061765477211,0,0],intercept:1.8891424845125149},\"adaptive-barrier\":{coefficients:[.032644917748469136,0,-.07298439917381098,0,0,0,-.052231463366428005,0,0,-.11424749802049329,0,0,0,0,.04704702705276934,-.016468490302968396,-.01646849030298061,-.036525829158913774,-.12318230709162031,-.02977942416600117,-.1225820943874817,.09660939312994982,.005208643393779445,-.0952138139667475,.0377708290650164,0,.05482193366998291,0,0,0,0,.25867747155526327,.300851338272686,0,.053598658225041174,.0033354481017503312,0,0,0,.125562930204136,.10571243964938123,0,.09758495149322041,-.0290188566466423,0,.029478917438227795,0,.12650570193466956,0,-.0942489682994541,.14742984466494521,-.02756477595533866,0,0],intercept:1.8041389179526628},\"delta-stepping\":{coefficients:[.07633876429748082,0,-.10466755323739724,0,0,0,-.08083943578169091,0,0,-.02712564208012691,0,0,0,0,.13913064806821882,.0044116231388824055,.00441162313888682,.027976238510035965,-.02980947570028348,-.4156713353619224,.027848274172829073,-.002096124648665258,.07545634155749252,.008765945763254087,.0611748355168238,0,.0738593154100619,0,0,0,0,.26482847465994336,.1911997391896807,0,-.009581231312212186,.05074076475684758,0,0,0,.3023676699870633,.15659210393671325,0,-.03263248001488759,-.00671766493388961,0,.041676453575614794,0,-.00757952308692386,0,-.07944332241855762,.040540462655707966,-.06968017018511266,0,0],intercept:2.239791239480427},\"ultra-dijkstra\":{coefficients:[.006019598201543182,0,-.1180600458840195,0,0,0,-.0745711754635445,0,0,.005546372081151986,0,0,0,0,-.03265895169725758,-.025615078832684327,-.025615078832688754,.002202925674888062,-.10494155074265968,-.041838000626448275,-.05037097506665974,.002768878081292754,.046958885893579695,-.0778817302451126,.04456230466097306,0,.03403425213603531,0,0,0,0,.2580133701950583,.21209209042942048,0,.03129232405473484,.06489516252266019,0,0,0,.21869088785752874,.0398505652087684,0,.0965581390388645,-.027842139633572988,0,-.016654790255373177,0,.13366867738685667,0,-.14893909279909187,-.049784706324219934,.1406670490390348,0,0],intercept:1.832018974842811}},runtimeRegressors:{\"bidirectional-astar\":{coefficients:[.22200947173142932,.17622713892288358,.19917206596864545,-.1917800231662427,.19680186729463675,.16837593658297936,-.11559553379038798,-.017624818125046255,.2081966634451041,-.08480120283697098,.28026389601568363,.12431764886212064,.0679344676570621,-.01536061765477211,.032391574227357625,.055895631608454274,-.15618713665528644,-.15618713665529707,-.12435750329862638,.14186651173796608,.1254119513613888,-.040219149290666514,.06553162902435615,-.05947834723567894,-.04658829234886771,-.004178064579950128,.1684660616620416,.047725131248075835,-.15588884218125998],intercept:1.8891424845125149},\"adaptive-barrier\":{coefficients:[.25867747155526327,.300851338272686,.125562930204136,-.02977942416600117,.14742984466494521,.09758495149322041,-.12318230709162031,-.052231463366428005,.0377708290650164,-.0942489682994541,-.036525829158913774,-.0952138139667475,.05482193366998291,-.02756477595533866,-.07298439917381098,-.1225820943874817,-.01646849030298061,-.016468490302968396,-.0290188566466423,.09660939312994982,.10571243964938123,.053598658225041174,.029478917438227795,.005208643393779445,.12650570193466956,.0033354481017503312,.032644917748469136,.04704702705276934,-.11424749802049329],intercept:1.8041389179526628},\"delta-stepping\":{coefficients:[.26482847465994336,.1911997391896807,.3023676699870633,-.4156713353619224,.040540462655707966,-.03263248001488759,-.02980947570028348,-.08083943578169091,.0611748355168238,-.07944332241855762,.027976238510035965,.008765945763254087,.0738593154100619,-.06968017018511266,-.10466755323739724,.027848274172829073,.00441162313888682,.0044116231388824055,-.00671766493388961,-.002096124648665258,.15659210393671325,-.009581231312212186,.041676453575614794,.07545634155749252,-.00757952308692386,.05074076475684758,.07633876429748082,.13913064806821882,-.02712564208012691],intercept:2.239791239480427},\"ultra-dijkstra\":{coefficients:[.2580133701950583,.21209209042942048,.21869088785752874,-.041838000626448275,-.049784706324219934,.0965581390388645,-.10494155074265968,-.0745711754635445,.04456230466097306,-.14893909279909187,.002202925674888062,-.0778817302451126,.03403425213603531,.1406670490390348,-.1180600458840195,-.05037097506665974,-.025615078832688754,-.025615078832684327,-.027842139633572988,.002768878081292754,.0398505652087684,.03129232405473484,-.016654790255373177,.046958885893579695,.13366867738685667,.06489516252266019,.006019598201543182,-.03265895169725758,.005546372081151986],intercept:1.832018974842811}}},sabOn:{modelType:`runtime-linear`,runtimeFeatureOrder:`logN.logE.sourceCentrality.logDensityBySize.logCentralityProduct.safeBeelineKm.densityBySizeTimesSourceCentrality.safeBeelineKmOverSizeRatioEN.safeN.logBeelineKm.logTargetCentrality.safeE.sourceTargetDegreeRatio.densityBySize.beelinePerNodeTimesSourceTargetDegreeRatio.beelinePerNode.logEdgesPerKm.logNodesPerKm.edgesPerKm.coverageDensity.targetDegree.targetCentrality.sourceTargetCentralityRatio.logCoverageDensity.centralityProduct.degreeProduct.logBeelinePerNode.logSourceTargetCentralityRatio.logEmptyRatio.globalCoverageTimesEmptyRatio.logTargetDegree.logSourceDegree.emptyRatio.nodesPerKm.logRelativeDensity.logGraphDensity`.split(`.`),runtimeScalerMean:[9.953534111145693,10.306107657870928,35.23255813953488,10.179418255010212,3.5454774889245333,4.48686046511628,2238574.406852828,3.058559271420463,32026.95348837209,1.2760096553010236,3.319556356155643,47081.53488372093,1.0620155038759689,45822.57256000054,.12554421254928,.12236987517754519,9.650933379716797,9.298380539267672,22674.918175575764,.2105043345120366,1.4651162790697674,75.23255813953489,4.77633694543673,.17084045709428813,3520.813953488372,2.0697674418604652,.11248523631210577,.5353518764732391,.48884699873646015,.06862466902882636,.8735181818435295,.8440179184606578,.6468584102887971,16146.147553997811,.8348080412448576,.8348080412448576],runtimeScalerScale:[.7802797824053423,.8112631380226669,59.91421666493021,.9852697125276325,3.983688334644014,5.612798264023307,8348187.2730846405,3.7388637825236395,43468.110955018936,.8962387837738194,1.9720370078600902,66693.40038210568,.4941822465274178,66209.67125938559,.10630825516298101,.08721515164406074,.841276044629191,.8564976115643828,21755.739063333,.2538511405761554,.6231516747429889,63.66768272592054,21.945509344145304,.19664190478049298,7832.697923198901,1.3188322677914255,.076530705146375,1.0065020502025708,.14544184764502804,.07486406893026765,.23347911503556903,.19598683756458085,.22153321676862622,15609.187220087797,.23604016843857162,.23604016843857162],scaler_mean:[32026.95348837209,47081.53488372093,4.48686046511628,1.4279653004235897,.8857757363486024,22674.918175575764,16146.147553997811,1.4279653004235897,.12236987517754519,1.374378107174757,.8348080412448576,.14748502713305092,.12727839311720254,.6468584102887971,.48884699873646015,1.372093023255814,.8440179184606578,1.4651162790697674,.8735181818435295,35.23255813953488,1.782412313084339,75.23255813953489,3.319556356155643,1.0620155038759689,.6971508099449448,4.77633694543673,.5353518764732391,1.374378107174757,.8348080412448576,1.4279653004235897,.8857757363486024,9.953534111145693,10.306107657870928,1.2760096553010236,9.650933379716797,9.298380539267672,.8857757363486024,.11248523631210577,45822.57256000054,10.179418255010212,.2105043345120366,.17084045709428813,2.0697674418604652,1.0462601861070673,3520.813953488372,3.5454774889245333,.07886035810422456,.07036258708020175,3.058559271420463,.06862466902882636,1.2000989786158425,.12554421254928,.07184969160134493,2238574.406852828],scaler_scale:[43468.110955018936,66693.40038210568,5.612798264023307,.12380696658276415,.05033888080840221,21755.739063333,15609.187220087797,.12380696658276415,.08721515164406074,.6394766982126728,.23604016843857162,.16964678135547157,.14131683033350545,.22153321676862622,.14544184764502804,.48336301606573323,.19598683756458085,.6231516747429889,.23347911503556903,59.91421666493021,1.9242883930750867,63.66768272592054,1.9720370078600902,.4941822465274178,.22657707937345387,21.945509344145304,1.0065020502025708,.6394766982126728,.23604016843857162,.12380696658276415,.05033888080840221,.7802797824053423,.8112631380226669,.8962387837738194,.841276044629191,.8564976115643828,.05033888080840221,.076530705146375,66209.67125938559,.9852697125276325,.2538511405761554,.19664190478049298,1.3188322677914255,.37122137966779756,7832.697923198901,3.983688334644014,.11977771922575586,.10256917352535876,3.7388637825236395,.07486406893026765,.3841215840043817,.10630825516298101,.11012210526134425,8348187.2730846405],classes:[`bidirectional-astar`,`adaptive-barrier`,`delta-stepping`,`ultra-dijkstra`],fallbackEngine:`adaptive-barrier`,minConfidence:.36,minMargin:.04,regressors:{\"bidirectional-astar\":{coefficients:[.04845016537541562,.10499035451522305,.011605208263651936,0,0,.16556801365070903,-.1051406091541065,0,-.07171212483422999,0,-.01049195875950214,0,0,-.02824227209442571,.004881114078220385,0,-.15922935364156365,.16328424139629383,-.08212175959548336,-.08045675772931728,0,.1183818545519568,-.1794496130984801,.1321265313741427,0,-.034500296928899124,.009062922207228787,0,-.010491958759502136,0,0,.1313458641774951,.3684295336865369,.07269795858931105,.05544841193889123,-.17485379285182817,0,-.029266085975624776,.025646750086230158,.0819187712751888,-.005722886359024794,-.03924156852345127,.02649249335775743,0,-.03427123860043879,.12879308852094434,0,0,-.037234292191745184,.04757502287716094,0,.03145177953885545,0,-.00023817661832604132],intercept:1.952335006512615},\"adaptive-barrier\":{coefficients:[.0883384003525242,.09979588376732011,-.04690857232671382,0,0,.12158372034537382,.00920556298360845,0,-.06006881922016567,0,-.048772021243140666,0,0,.02509484421500592,-.011203261621711053,0,-.11668927409573746,.09080740027926082,.0018800675786380188,.04604927636722012,0,.07465775770864938,-.09538218637979677,.12525307864262777,0,.020646142922246313,-.013224344691400243,0,-.048772021243140666,0,0,.17703160067354823,.26543300648548185,.1422847663322637,-.030129546611271076,-.11973502892484279,0,-.015464969372282592,.06303261733873228,.12213710074154793,.03848679291507266,.0449933067900683,-.011792611097076649,0,-.045636548530713826,.09193051685284985,0,0,-.05116832355773985,-.0069285570020666,0,-.028824316362121145,0,-.1359753341087808],intercept:1.8253442421464459},\"delta-stepping\":{coefficients:[.16871225416792962,.14937951592198545,-.3654748076217951,0,0,-.03097945269172864,-.012408912157337706,0,-.09378808183707839,0,-.02855814206468489,0,0,.02842395206249757,.11203801391658985,0,.034680712889110586,-.001197629305245047,.07146156211863265,-.407732238358142,0,.05973550590083194,-.04628352899924939,.10912655780971561,0,-.07495553920195822,.05181449800405871,0,-.028558142064684867,0,0,.34772842220249894,.2807321599052594,.06253187201370455,-.091736039633533,-.03923656289692361,0,-.08740316425215947,.17224101797921298,.35763809937727453,.1878890213674323,.15768744533966234,-.13369876643293732,0,-.1519713331741133,.13354465344742789,0,0,-.312716665486618,.10475514332499121,0,-.155807582881681,0,-.2845967003442695],intercept:2.6707308399691922},\"ultra-dijkstra\":{coefficients:[.03009470144724754,.025749883920062052,-.06040782484712936,0,0,.10985214922956242,.016303474544398646,0,-.08715867244092802,0,-.07369595530440924,0,0,-.040540266584543336,-.006838706036656292,0,-.04314069909553735,.03960193714478251,.013967592110843231,-.144457228465764,0,.035003118948704864,-.06411858283145122,-.012342851326987914,0,-.08229583686448201,.10609601568310244,0,-.0736959553044092,0,0,.22954228183518088,.2555971784719244,.09425232545196363,-.05460065306677854,-.08661498746075129,0,-.05920427375923116,.015723956927354336,.14122507679715482,.018679386182335715,.01382770872343134,-.03323360952019476,0,-.01930307281421111,.07445185608978928,0,0,-.03870015900652404,.03641577806817927,0,.08704223402097289,0,.03903381737376651],intercept:1.8421103468548197}},runtimeRegressors:{\"bidirectional-astar\":{coefficients:[.1313458641774951,.3684295336865369,-.08045675772931728,.0819187712751888,.12879308852094434,.011605208263651936,-.00023817661832604132,-.037234292191745184,.04845016537541562,.07269795858931105,-.1794496130984801,.10499035451522305,.1321265313741427,.025646750086230158,.03145177953885545,-.07171212483422999,.05544841193889123,-.17485379285182817,.16556801365070903,-.005722886359024794,.16328424139629383,.1183818545519568,-.034500296928899124,-.03924156852345127,-.03427123860043879,.02649249335775743,-.029266085975624776,.009062922207228787,.004881114078220385,.04757502287716094,-.08212175959548336,-.15922935364156365,-.02824227209442571,-.1051406091541065,-.01049195875950214,-.010491958759502136],intercept:1.952335006512615},\"adaptive-barrier\":{coefficients:[.17703160067354823,.26543300648548185,.04604927636722012,.12213710074154793,.09193051685284985,-.04690857232671382,-.1359753341087808,-.05116832355773985,.0883384003525242,.1422847663322637,-.09538218637979677,.09979588376732011,.12525307864262777,.06303261733873228,-.028824316362121145,-.06006881922016567,-.030129546611271076,-.11973502892484279,.12158372034537382,.03848679291507266,.09080740027926082,.07465775770864938,.020646142922246313,.0449933067900683,-.045636548530713826,-.011792611097076649,-.015464969372282592,-.013224344691400243,-.011203261621711053,-.0069285570020666,.0018800675786380188,-.11668927409573746,.02509484421500592,.00920556298360845,-.048772021243140666,-.048772021243140666],intercept:1.8253442421464459},\"delta-stepping\":{coefficients:[.34772842220249894,.2807321599052594,-.407732238358142,.35763809937727453,.13354465344742789,-.3654748076217951,-.2845967003442695,-.312716665486618,.16871225416792962,.06253187201370455,-.04628352899924939,.14937951592198545,.10912655780971561,.17224101797921298,-.155807582881681,-.09378808183707839,-.091736039633533,-.03923656289692361,-.03097945269172864,.1878890213674323,-.001197629305245047,.05973550590083194,-.07495553920195822,.15768744533966234,-.1519713331741133,-.13369876643293732,-.08740316425215947,.05181449800405871,.11203801391658985,.10475514332499121,.07146156211863265,.034680712889110586,.02842395206249757,-.012408912157337706,-.02855814206468489,-.028558142064684867],intercept:2.6707308399691922},\"ultra-dijkstra\":{coefficients:[.22954228183518088,.2555971784719244,-.144457228465764,.14122507679715482,.07445185608978928,-.06040782484712936,.03903381737376651,-.03870015900652404,.03009470144724754,.09425232545196363,-.06411858283145122,.025749883920062052,-.012342851326987914,.015723956927354336,.08704223402097289,-.08715867244092802,-.05460065306677854,-.08661498746075129,.10985214922956242,.018679386182335715,.03960193714478251,.035003118948704864,-.08229583686448201,.01382770872343134,-.01930307281421111,-.03323360952019476,-.05920427375923116,.10609601568310244,-.006838706036656292,.03641577806817927,.013967592110843231,-.04314069909553735,-.040540266584543336,.016303474544398646,-.07369595530440924,-.0736959553044092],intercept:1.8421103468548197}}}}}),$e=Object.freeze({\"adaptive-barrier\":Object.freeze({fallbackUseParallel:!1,policy:Object.freeze({minNodesForParallel:13e3,minFrontierForParallel:256})}),\"delta-stepping\":Object.freeze({fallbackUseParallel:!0,policy:Object.freeze({minFrontierForParallel:256})})});Object.freeze({parallelization:$e}),typeof window<`u`&&typeof navigator<`u`&&typeof SharedArrayBuffer<`u`&&typeof Worker<`u`&&typeof crossOriginIsolated==`boolean`&&crossOriginIsolated,(()=>{let e=Qe?.profiles??{},t=Array.isArray(Qe?.featureOrder)?Qe.featureOrder:[],n={};for(let r in e){let i=e[r];if(!i||typeof i!=`object`)continue;let a=Array.isArray(i.runtimeFeatureOrder)?i.runtimeFeatureOrder:t,o=Array.isArray(i.runtimeScalerMean)?i.runtimeScalerMean:Array.isArray(i.scaler_mean)?i.scaler_mean:null,s=Array.isArray(i.runtimeScalerScale)?i.runtimeScalerScale:Array.isArray(i.scaler_scale)?i.scaler_scale:null,c=Array.isArray(i.classes)?i.classes:null,l=i.runtimeRegressors||i.regressors,u=typeof i.fallbackEngine==`string`?i.fallbackEngine:null,d=i.modelType===`runtime-linear`,f=Array.isArray(o)&&Array.isArray(s)&&Array.isArray(c)&&c.length>0&&a.length===o.length&&a.length===s.length,p=d&&f&&l&&typeof l==`object`&&c.every(e=>{let t=l[e];return t&&Array.isArray(t.coefficients)&&t.coefficients.length===a.length});n[r]=Object.freeze({runtimeFeatureOrder:a,means:o,scales:s,classes:c,fallbackEngine:u,regressors:l,isRuntimeLinear:d,hasValidScaler:f,hasValidRegressors:p,minConfidence:Math.max(.36,Number.isFinite(i.minConfidence)?i.minConfidence:0),minMargin:Math.max(.04,Number.isFinite(i.minMargin)?i.minMargin:0)})}return Object.freeze(n)})();let et={car:{motorway:1,motorway_link:1,motorway_junction:1,trunk:1.05,trunk_link:1.05,primary:1.15,primary_link:1.15,secondary:1.5,secondary_link:1.5,tertiary:1.75,tertiary_link:1.75,residential:2.5,service:2.5,unclassified:3,living_street:3,road:5,minor:5},bicycle:{cycleway:1,path:1.1,pedestrian:1.1,footway:1.1,bridleway:1.3,track:2,living_street:2,service:2,residential:2.2,unclassified:2.3,tertiary_link:2.5,tertiary:2.5,secondary_link:3,secondary:3,primary_link:3.5,primary:3.5,road:4},pedestrian:{road:1,primary:1,primary_link:1,secondary:1,secondary_link:1,tertiary:1,tertiary_link:1,residential:1,living_street:1,service:1,track:1,pedestrian:1,path:1,cycleway:1,footway:1,bridleway:1,byway:1,steps:1,unclassified:1,minor:1}};function tt(e={}){let{intersectionPenaltySec:t=0,turnPenaltySec:n=0,turnAngleThresholdDeg:r=25}=e,i=[[`intersectionPenaltySec`,t],[`turnPenaltySec`,n],[`turnAngleThresholdDeg`,r]];for(let[e,t]of i)if(!Number.isFinite(t)||t<0)throw Error(`Invalid penalties.${e}: expected a non-negative finite number`);return{intersectionPenaltySec:t,turnPenaltySec:n,turnAngleThresholdDeg:r}}new Ne(0,{name:`omt-router`});let nt=Object.freeze({IDLE:`idle`,RUNNING:`running`,CANCELLING:`cancelling`,ERROR:`error`});Object.freeze({cpu:`bidirectional-astar`,bidirectionalAStar:`bidirectional-astar`,adaptiveBarrier:`adaptive-barrier`,deltaStepping:`delta-stepping`,ultraDijkstra:`ultra-dijkstra`}),Object.freeze({MISSING_RESULT:`missing_result`,ENDPOINT_MISMATCH:`endpoint_mismatch`,INVALID_PATH:`invalid_path`,COST_MISMATCH:`cost_mismatch`,NO_PATH:`no_path`,NO_NODE:`no_node`,POOR_SNAP:`poor_snap`,INCOMPLETE_PATH:`incomplete_path`,TILE_CORS:`tile_cors`,NO_ROUTE:`no_route`,INVALID_ROUTE:`invalid_route`}),Object.freeze({ENGINE_ERROR:`engine_error`,ENGINE_WORKER_FAILED:`engine_worker_failed`,ENGINE_WORKER_CRASHED:`engine_worker_crashed`,ENGINE_WORKER_UNAVAILABLE:`engine_worker_unavailable`,ENGINE_CANCELLED:`engine_cancelled`,ENGINE_SHUTDOWN:`engine_shutdown`,ENGINE_WORKER_BUSY:`engine_worker_busy`});function rt(e){return e===`travelTime`||e===`optimal`}function it(e,t){let n=e.properties?.class??``,r=et[t];return r?Number(r[n]??1):1}function at(e,t){let n=it(e,t);return e.travelTime*(1+.7*(n-1))}nt.IDLE;function ot(e,t={}){if(!rt(e))return`none`;let{intersectionPenaltySec:n}=tt(t);return`i${n}`}function st(e,t=`distance`,n={}){let{nodes:r,edges:i}=e,a=r.size,o=tt(n),s=rt(t)&&o.intersectionPenaltySec>0,c=null;if(s){let e=new Int32Array(a);for(let t of i)t.cost!==-1&&(e[t.source]++,e[t.target]++),t.reverseCost!==-1&&(e[t.target]++,e[t.source]++);c=new Uint8Array(a);for(let t=0;t<a;t++)c[t]=+(e[t]>=3)}let l=i.length*2,u=new Int32Array(l),d=new Int32Array(l),f=new Int32Array(l),p=new Int32Array(l*3),m=new Int32Array(l*3),h=0,g=0,_=0,v=new Map,y=(e,t,n)=>{let r=s&&c&&c[t]?o.intersectionPenaltySec:0,i=v.get(e);if(i||(i=new Set,v.set(e,i)),i.has(t))return;i.add(t);let a=Math.round((n+r)*10);u[h]=e,d[h]=t,f[h]=a,h++,p[g++]=e,p[g++]=t,p[g++]=a,m[_++]=t,m[_++]=e,m[_++]=a};for(let n of i){let r=rt(t),i=n.cost===-1?-1:r?t===`optimal`?at(n,e.mode):n.travelTime:n.length,a=n.reverseCost===-1?-1:r?t===`optimal`?at(n,e.mode):n.travelTime:n.length;i!==-1&&y(n.source,n.target,i),a!==-1&&y(n.target,n.source,a)}let b=h,x=u.subarray(0,b),S=d.subarray(0,b),C=f.subarray(0,b),w=new Int32Array(a+1),T=new Int32Array(b),E=new Int32Array(b);for(let e=0;e<g;e+=3)w[p[e]+1]++;for(let e=0;e<a;e++)w[e+1]+=w[e];let D=w.slice(0,a);for(let e=0;e<g;e+=3){let t=p[e],n=p[e+1],r=p[e+2],i=D[t]++;T[i]=n,E[i]=r}let O=new Int32Array(a+1),k=new Int32Array(b),A=new Int32Array(b);for(let e=0;e<_;e+=3)O[m[e]+1]++;for(let e=0;e<a;e++)O[e+1]+=O[e];let j=O.slice(0,a);for(let e=0;e<_;e+=3){let t=m[e],n=m[e+1],r=m[e+2],i=j[t]++;k[i]=n,A[i]=r}let ee=Array(a);for(let e=0;e<a;e++)ee[e]=r.get(e).coords;let M=Array(a);for(let e=0;e<a;e++){let t=w[e],n=w[e+1],r=n-t;if(r===0)continue;if(r===1){M[e]=[T[t],E[t]];continue}let i=new Map;for(let e=t;e<n;e++)i.set(T[e],E[e]);M[e]=i}let te=x,ne=S,re=C;if(e.mode===`pedestrian`){let e=new Map;for(let t=0;t<x.length;t++){let n=x[t],r=S[t],i=n<r?n:r,a=n<r?r:n,o=i+`:`+a,s=C[t],c=e.get(o);(c===void 0||s<c)&&e.set(o,s)}let t=Array.from(e.entries()),n=t.length,r=new Int32Array(n),i=new Int32Array(n),a=new Int32Array(n),o=0;for(let[e,n]of t){let[t,s]=e.split(`:`).map(Number);r[o]=t,i[o]=s,a[o]=n,o++}te=r,ne=i,re=a}return{edgeSrc:te,edgeTgt:ne,edgeCostInt:re,adjPtr:w,adjTo:T,adjCost:E,adjCostMap:M,revAdjPtr:O,revAdjFrom:k,revAdjCost:A,N:a,E:b,nodes:r,coordsArr:ee,costField:t,penalties:o,penaltyKey:ot(t,o),distScale:10,coordsAreGeographic:e.coordsAreGeographic===!0}}let R=11102230246251565e-32,z=134217729;(3+8*R)*R;function ct(e,t,n,r,i){let a,o,s,c,l=t[0],u=r[0],d=0,f=0;u>l==u>-l?(a=l,l=t[++d]):(a=u,u=r[++f]);let p=0;if(d<e&&f<n)for(u>l==u>-l?(o=l+a,s=a-(o-l),l=t[++d]):(o=u+a,s=a-(o-u),u=r[++f]),a=o,s!==0&&(i[p++]=s);d<e&&f<n;)u>l==u>-l?(o=a+l,c=o-a,s=a-(o-c)+(l-c),l=t[++d]):(o=a+u,c=o-a,s=a-(o-c)+(u-c),u=r[++f]),a=o,s!==0&&(i[p++]=s);for(;d<e;)o=a+l,c=o-a,s=a-(o-c)+(l-c),l=t[++d],a=o,s!==0&&(i[p++]=s);for(;f<n;)o=a+u,c=o-a,s=a-(o-c)+(u-c),u=r[++f],a=o,s!==0&&(i[p++]=s);return(a!==0||p===0)&&(i[p++]=a),p}function lt(e,t){let n=t[0];for(let r=1;r<e;r++)n+=t[r];return n}function B(e){return new Float64Array(e)}(3+16*R)*R,(2+12*R)*R,(9+64*R)*R*R;let V=B(4),ut=B(8),dt=B(12),ft=B(16),H=B(4);function pt(e,t,n,r,i,a,o){let s,c,l,u,d,f,p,m,h,g,_,v,y,b,x,S,C,w,T=e-i,E=n-i,D=t-a,O=r-a;b=T*O,f=z*T,p=f-(f-T),m=T-p,f=z*O,h=f-(f-O),g=O-h,x=m*g-(b-p*h-m*h-p*g),S=D*E,f=z*D,p=f-(f-D),m=D-p,f=z*E,h=f-(f-E),g=E-h,C=m*g-(S-p*h-m*h-p*g),_=x-C,d=x-_,V[0]=x-(_+d)+(d-C),v=b+_,d=v-b,y=b-(v-d)+(_-d),_=y-S,d=y-_,V[1]=y-(_+d)+(d-S),w=v+_,d=w-v,V[2]=v-(w-d)+(_-d),V[3]=w;let k=lt(4,V),A=22204460492503146e-32*o;if(k>=A||-k>=A||(d=e-T,s=e-(T+d)+(d-i),d=n-E,l=n-(E+d)+(d-i),d=t-D,c=t-(D+d)+(d-a),d=r-O,u=r-(O+d)+(d-a),s===0&&c===0&&l===0&&u===0)||(A=11093356479670487e-47*o+33306690738754706e-32*Math.abs(k),k+=T*u+O*s-(D*l+E*c),k>=A||-k>=A))return k;b=s*O,f=z*s,p=f-(f-s),m=s-p,f=z*O,h=f-(f-O),g=O-h,x=m*g-(b-p*h-m*h-p*g),S=c*E,f=z*c,p=f-(f-c),m=c-p,f=z*E,h=f-(f-E),g=E-h,C=m*g-(S-p*h-m*h-p*g),_=x-C,d=x-_,H[0]=x-(_+d)+(d-C),v=b+_,d=v-b,y=b-(v-d)+(_-d),_=y-S,d=y-_,H[1]=y-(_+d)+(d-S),w=v+_,d=w-v,H[2]=v-(w-d)+(_-d),H[3]=w;let j=ct(4,V,4,H,ut);b=T*u,f=z*T,p=f-(f-T),m=T-p,f=z*u,h=f-(f-u),g=u-h,x=m*g-(b-p*h-m*h-p*g),S=D*l,f=z*D,p=f-(f-D),m=D-p,f=z*l,h=f-(f-l),g=l-h,C=m*g-(S-p*h-m*h-p*g),_=x-C,d=x-_,H[0]=x-(_+d)+(d-C),v=b+_,d=v-b,y=b-(v-d)+(_-d),_=y-S,d=y-_,H[1]=y-(_+d)+(d-S),w=v+_,d=w-v,H[2]=v-(w-d)+(_-d),H[3]=w;let ee=ct(j,ut,4,H,dt);return b=s*u,f=z*s,p=f-(f-s),m=s-p,f=z*u,h=f-(f-u),g=u-h,x=m*g-(b-p*h-m*h-p*g),S=c*l,f=z*c,p=f-(f-c),m=c-p,f=z*l,h=f-(f-l),g=l-h,C=m*g-(S-p*h-m*h-p*g),_=x-C,d=x-_,H[0]=x-(_+d)+(d-C),v=b+_,d=v-b,y=b-(v-d)+(_-d),_=y-S,d=y-_,H[1]=y-(_+d)+(d-S),w=v+_,d=w-v,H[2]=v-(w-d)+(_-d),H[3]=w,ft[ct(ee,dt,4,H,ft)-1]}function mt(e,t,n,r,i,a){let o=(t-a)*(n-i),s=(e-i)*(r-a),c=o-s,l=Math.abs(o+s);return Math.abs(c)>=33306690738754716e-32*l?c:-pt(e,t,n,r,i,a,l)}(7+56*R)*R,(3+28*R)*R,(26+288*R)*R*R,B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(8),B(8),B(8),B(4),B(8),B(8),B(16),B(12),B(192),B(192),(10+96*R)*R,(4+48*R)*R,(44+576*R)*R*R,B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(8),B(8),B(8),B(8),B(8),B(8),B(8),B(8),B(8),B(4),B(4),B(4),B(8),B(16),B(16),B(16),B(32),B(32),B(48),B(64),B(1152),B(1152),(16+224*R)*R,(5+72*R)*R,(71+1408*R)*R*R,B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(4),B(24),B(24),B(24),B(24),B(24),B(24),B(24),B(24),B(24),B(24),B(1152),B(1152),B(1152),B(1152),B(1152),B(2304),B(2304),B(3456),B(5760),B(8),B(8),B(8),B(16),B(24),B(48),B(48),B(96),B(192),B(384),B(384),B(384),B(768),B(96),B(96),B(96),B(1152);let ht=2**-52,gt=new Uint32Array(512);var _t=class e{static from(t,n=wt,r=Tt){let i=t.length,a=new Float64Array(i*2);for(let e=0;e<i;e++){let i=t[e];a[2*e]=n(i),a[2*e+1]=r(i)}return new e(a)}constructor(e){let t=e.length>>1;if(t>0&&typeof e[0]!=`number`)throw Error(`Expected coords to contain numbers.`);this.coords=e;let n=Math.max(2*t-5,0);this._triangles=new Uint32Array(n*3),this._halfedges=new Int32Array(n*3),this._hashSize=Math.ceil(Math.sqrt(t)),this._hullPrev=new Uint32Array(t),this._hullNext=new Uint32Array(t),this._hullTri=new Uint32Array(t),this._hullHash=new Int32Array(this._hashSize),this._ids=new Uint32Array(t),this._dists=new Float64Array(t),this.trianglesLen=0,this._cx=0,this._cy=0,this._hullStart=0,this.hull=this._triangles,this.triangles=this._triangles,this.halfedges=this._halfedges,this.update()}update(){let{coords:e,_hullPrev:t,_hullNext:n,_hullTri:r,_hullHash:i}=this,a=e.length>>1,o=1/0,s=1/0,c=-1/0,l=-1/0;for(let t=0;t<a;t++){let n=e[2*t],r=e[2*t+1];n<o&&(o=n),r<s&&(s=r),n>c&&(c=n),r>l&&(l=r),this._ids[t]=t}let u=(o+c)/2,d=(s+l)/2,f=0,p=0,m=0;for(let t=0,n=1/0;t<a;t++){let r=yt(u,d,e[2*t],e[2*t+1]);r<n&&(f=t,n=r)}let h=e[2*f],g=e[2*f+1];for(let t=0,n=1/0;t<a;t++){if(t===f)continue;let r=yt(h,g,e[2*t],e[2*t+1]);r<n&&r>0&&(p=t,n=r)}let _=e[2*p],v=e[2*p+1],y=1/0;for(let t=0;t<a;t++){if(t===f||t===p)continue;let n=xt(h,g,_,v,e[2*t],e[2*t+1]);n<y&&(m=t,y=n)}let b=e[2*m],x=e[2*m+1];if(y===1/0){for(let t=0;t<a;t++)this._dists[t]=e[2*t]-e[0]||e[2*t+1]-e[1];U(this._ids,this._dists,0,a-1);let t=new Uint32Array(a),n=0;for(let e=0,r=-1/0;e<a;e++){let i=this._ids[e],a=this._dists[i];a>r&&(t[n++]=i,r=a)}this.hull=t.subarray(0,n),this.triangles=new Uint32Array,this.halfedges=new Int32Array;return}if(mt(h,g,_,v,b,x)<0){let e=p,t=_,n=v;p=m,_=b,v=x,m=e,b=t,x=n}let S=St(h,g,_,v,b,x);this._cx=S.x,this._cy=S.y;for(let t=0;t<a;t++)this._dists[t]=yt(e[2*t],e[2*t+1],S.x,S.y);U(this._ids,this._dists,0,a-1),this._hullStart=f;let C=3;n[f]=t[m]=p,n[p]=t[f]=m,n[m]=t[p]=f,r[f]=0,r[p]=1,r[m]=2,i.fill(-1),i[this._hashKey(h,g)]=f,i[this._hashKey(_,v)]=p,i[this._hashKey(b,x)]=m,this.trianglesLen=0,this._addTriangle(f,p,m,-1,-1,-1);for(let a=0,o=0,s=0;a<this._ids.length;a++){let c=this._ids[a],l=e[2*c],u=e[2*c+1];if(a>0&&Math.abs(l-o)<=ht&&Math.abs(u-s)<=ht||(o=l,s=u,c===f||c===p||c===m))continue;let d=0;for(let e=0,t=this._hashKey(l,u);e<this._hashSize&&(d=i[(t+e)%this._hashSize],!(d!==-1&&d!==n[d]));e++);d=t[d];let h=d,g;for(;g=n[h],mt(l,u,e[2*h],e[2*h+1],e[2*g],e[2*g+1])>=0;)if(h=g,h===d){h=-1;break}if(h===-1)continue;let _=this._addTriangle(h,c,n[h],-1,-1,r[h]);r[c]=this._legalize(_+2),r[h]=_,C++;let v=n[h];for(;g=n[v],mt(l,u,e[2*v],e[2*v+1],e[2*g],e[2*g+1])<0;)_=this._addTriangle(v,c,g,r[c],-1,r[v]),r[c]=this._legalize(_+2),n[v]=v,C--,v=g;if(h===d)for(;g=t[h],mt(l,u,e[2*g],e[2*g+1],e[2*h],e[2*h+1])<0;)_=this._addTriangle(g,c,h,-1,r[h],r[g]),this._legalize(_+2),r[g]=_,n[h]=h,C--,h=g;this._hullStart=t[c]=h,n[h]=t[v]=c,n[c]=v,i[this._hashKey(l,u)]=c,i[this._hashKey(e[2*h],e[2*h+1])]=h}this.hull=new Uint32Array(C);for(let e=0,t=this._hullStart;e<C;e++)this.hull[e]=t,t=n[t];this.triangles=this._triangles.subarray(0,this.trianglesLen),this.halfedges=this._halfedges.subarray(0,this.trianglesLen)}_hashKey(e,t){return Math.floor(vt(e-this._cx,t-this._cy)*this._hashSize)%this._hashSize}_legalize(e){let{_triangles:t,_halfedges:n,coords:r}=this,i=0,a=0;for(;;){let o=n[e],s=e-e%3;if(a=s+(e+2)%3,o===-1){if(i===0)break;e=gt[--i];continue}let c=o-o%3,l=s+(e+1)%3,u=c+(o+2)%3,d=t[a],f=t[e],p=t[l],m=t[u];if(bt(r[2*d],r[2*d+1],r[2*f],r[2*f+1],r[2*p],r[2*p+1],r[2*m],r[2*m+1])){t[e]=m,t[o]=d;let r=n[u];if(r===-1){let t=this._hullStart;do{if(this._hullTri[t]===u){this._hullTri[t]=e;break}t=this._hullPrev[t]}while(t!==this._hullStart)}this._link(e,r),this._link(o,n[a]),this._link(a,u);let s=c+(o+1)%3;i<gt.length&&(gt[i++]=s)}else{if(i===0)break;e=gt[--i]}}return a}_link(e,t){this._halfedges[e]=t,t!==-1&&(this._halfedges[t]=e)}_addTriangle(e,t,n,r,i,a){let o=this.trianglesLen;return this._triangles[o]=e,this._triangles[o+1]=t,this._triangles[o+2]=n,this._link(o,r),this._link(o+1,i),this._link(o+2,a),this.trianglesLen+=3,o}};function vt(e,t){let n=e/(Math.abs(e)+Math.abs(t));return(t>0?3-n:1+n)/4}function yt(e,t,n,r){let i=e-n,a=t-r;return i*i+a*a}function bt(e,t,n,r,i,a,o,s){let c=e-o,l=t-s,u=n-o,d=r-s,f=i-o,p=a-s,m=c*c+l*l,h=u*u+d*d,g=f*f+p*p;return c*(d*g-h*p)-l*(u*g-h*f)+m*(u*p-d*f)<0}function xt(e,t,n,r,i,a){let o=n-e,s=r-t,c=i-e,l=a-t,u=o*o+s*s,d=c*c+l*l,f=.5/(o*l-s*c),p=(l*u-s*d)*f,m=(o*d-c*u)*f;return p*p+m*m}function St(e,t,n,r,i,a){let o=n-e,s=r-t,c=i-e,l=a-t,u=o*o+s*s,d=c*c+l*l,f=.5/(o*l-s*c);return{x:e+(l*u-s*d)*f,y:t+(o*d-c*u)*f}}function U(e,t,n,r){if(r-n<=20)for(let i=n+1;i<=r;i++){let r=e[i],a=t[r],o=i-1;for(;o>=n&&t[e[o]]>a;)e[o+1]=e[o--];e[o+1]=r}else{let i=n+r>>1,a=n+1,o=r;Ct(e,i,a),t[e[n]]>t[e[r]]&&Ct(e,n,r),t[e[a]]>t[e[r]]&&Ct(e,a,r),t[e[n]]>t[e[a]]&&Ct(e,n,a);let s=e[a],c=t[s];for(;;){do a++;while(t[e[a]]<c);do o--;while(t[e[o]]>c);if(o<a)break;Ct(e,a,o)}e[n+1]=e[o],e[o]=s,r-a+1>=o-n?(U(e,t,a,r),U(e,t,n,o-1)):(U(e,t,n,o-1),U(e,t,a,r))}}function Ct(e,t,n){let r=e[t];e[t]=e[n],e[n]=r}function wt(e){return e[0]}function Tt(e){return e[1]}let Et=1e-6;var W=class{constructor(){this._x0=this._y0=this._x1=this._y1=null,this._=``}moveTo(e,t){this._+=`M${this._x0=this._x1=+e},${this._y0=this._y1=+t}`}closePath(){this._x1!==null&&(this._x1=this._x0,this._y1=this._y0,this._+=`Z`)}lineTo(e,t){this._+=`L${this._x1=+e},${this._y1=+t}`}arc(e,t,n){e=+e,t=+t,n=+n;let r=e+n,i=t;if(n<0)throw Error(`negative radius`);this._x1===null?this._+=`M${r},${i}`:(Math.abs(this._x1-r)>Et||Math.abs(this._y1-i)>Et)&&(this._+=`L`+r+`,`+i),n&&(this._+=`A${n},${n},0,1,1,${e-n},${t}A${n},${n},0,1,1,${this._x1=r},${this._y1=i}`)}rect(e,t,n,r){this._+=`M${this._x0=this._x1=+e},${this._y0=this._y1=+t}h${+n}v${+r}h${-n}Z`}value(){return this._||null}},Dt=class{constructor(){this._=[]}moveTo(e,t){this._.push([e,t])}closePath(){this._.push(this._[0].slice())}lineTo(e,t){this._.push([e,t])}value(){return this._.length?this._:null}},Ot=class{constructor(e,[t,n,r,i]=[0,0,960,500]){if(!((r=+r)>=(t=+t))||!((i=+i)>=(n=+n)))throw Error(`invalid bounds`);this.delaunay=e,this._circumcenters=new Float64Array(e.points.length*2),this.vectors=new Float64Array(e.points.length*2),this.xmax=r,this.xmin=t,this.ymax=i,this.ymin=n,this._init()}update(){return this.delaunay.update(),this._init(),this}_init(){let{delaunay:{points:e,hull:t,triangles:n},vectors:r}=this,i,a,o=this.circumcenters=this._circumcenters.subarray(0,n.length/3*2);for(let r=0,s=0,c=n.length,l,u;r<c;r+=3,s+=2){let c=n[r]*2,d=n[r+1]*2,f=n[r+2]*2,p=e[c],m=e[c+1],h=e[d],g=e[d+1],_=e[f],v=e[f+1],y=h-p,b=g-m,x=_-p,S=v-m,C=(y*S-b*x)*2;if(Math.abs(C)<1e-9){if(i===void 0){i=a=0;for(let n of t)i+=e[n*2],a+=e[n*2+1];i/=t.length,a/=t.length}let n=1e9*Math.sign((i-p)*S-(a-m)*x);l=(p+_)/2-n*S,u=(m+v)/2+n*x}else{let e=1/C,t=y*y+b*b,n=x*x+S*S;l=p+(S*t-b*n)*e,u=m+(y*n-x*t)*e}o[s]=l,o[s+1]=u}let s=t[t.length-1],c,l=s*4,u,d=e[2*s],f,p=e[2*s+1];r.fill(0);for(let n=0;n<t.length;++n)s=t[n],c=l,u=d,f=p,l=s*4,d=e[2*s],p=e[2*s+1],r[c+2]=r[l]=f-p,r[c+3]=r[l+1]=d-u}render(e){let t=e==null?e=new W:void 0,{delaunay:{halfedges:n,inedges:r,hull:i},circumcenters:a,vectors:o}=this;if(i.length<=1)return null;for(let t=0,r=n.length;t<r;++t){let r=n[t];if(r<t)continue;let i=Math.floor(t/3)*2,o=Math.floor(r/3)*2,s=a[i],c=a[i+1],l=a[o],u=a[o+1];this._renderSegment(s,c,l,u,e)}let s,c=i[i.length-1];for(let t=0;t<i.length;++t){s=c,c=i[t];let n=Math.floor(r[c]/3)*2,l=a[n],u=a[n+1],d=s*4,f=this._project(l,u,o[d+2],o[d+3]);f&&this._renderSegment(l,u,f[0],f[1],e)}return t&&t.value()}renderBounds(e){let t=e==null?e=new W:void 0;return e.rect(this.xmin,this.ymin,this.xmax-this.xmin,this.ymax-this.ymin),t&&t.value()}renderCell(e,t){let n=t==null?t=new W:void 0,r=this._clip(e);if(r===null||!r.length)return;t.moveTo(r[0],r[1]);let i=r.length;for(;r[0]===r[i-2]&&r[1]===r[i-1]&&i>1;)i-=2;for(let e=2;e<i;e+=2)(r[e]!==r[e-2]||r[e+1]!==r[e-1])&&t.lineTo(r[e],r[e+1]);return t.closePath(),n&&n.value()}*cellPolygons(){let{delaunay:{points:e}}=this;for(let t=0,n=e.length/2;t<n;++t){let e=this.cellPolygon(t);e&&(e.index=t,yield e)}}cellPolygon(e){let t=new Dt;return this.renderCell(e,t),t.value()}_renderSegment(e,t,n,r,i){let a,o=this._regioncode(e,t),s=this._regioncode(n,r);o===0&&s===0?(i.moveTo(e,t),i.lineTo(n,r)):(a=this._clipSegment(e,t,n,r,o,s))&&(i.moveTo(a[0],a[1]),i.lineTo(a[2],a[3]))}contains(e,t,n){return(t=+t,t!==t)||(n=+n,n!==n)?!1:this.delaunay._step(e,t,n)===e}*neighbors(e){let t=this._clip(e);if(t)for(let n of this.delaunay.neighbors(e)){let e=this._clip(n);if(e){loop:for(let r=0,i=t.length;r<i;r+=2)for(let a=0,o=e.length;a<o;a+=2)if(t[r]===e[a]&&t[r+1]===e[a+1]&&t[(r+2)%i]===e[(a+o-2)%o]&&t[(r+3)%i]===e[(a+o-1)%o]){yield n;break loop}}}}_cell(e){let{circumcenters:t,delaunay:{inedges:n,halfedges:r,triangles:i}}=this,a=n[e];if(a===-1)return null;let o=[],s=a;do{let n=Math.floor(s/3);if(o.push(t[n*2],t[n*2+1]),s=s%3==2?s-2:s+1,i[s]!==e)break;s=r[s]}while(s!==a&&s!==-1);return o}_clip(e){if(e===0&&this.delaunay.hull.length===1)return[this.xmax,this.ymin,this.xmax,this.ymax,this.xmin,this.ymax,this.xmin,this.ymin];let t=this._cell(e);if(t===null)return null;let{vectors:n}=this,r=e*4;return this._simplify(n[r]||n[r+1]?this._clipInfinite(e,t,n[r],n[r+1],n[r+2],n[r+3]):this._clipFinite(e,t))}_clipFinite(e,t){let n=t.length,r=null,i,a,o=t[n-2],s=t[n-1],c,l=this._regioncode(o,s),u,d=0;for(let f=0;f<n;f+=2)if(i=o,a=s,o=t[f],s=t[f+1],c=l,l=this._regioncode(o,s),c===0&&l===0)u=d,d=0,r?r.push(o,s):r=[o,s];else{let t,n,f,p,m;if(c===0){if((t=this._clipSegment(i,a,o,s,c,l))===null)continue;[n,f,p,m]=t}else{if((t=this._clipSegment(o,s,i,a,l,c))===null)continue;[p,m,n,f]=t,u=d,d=this._edgecode(n,f),u&&d&&this._edge(e,u,d,r,r.length),r?r.push(n,f):r=[n,f]}u=d,d=this._edgecode(p,m),u&&d&&this._edge(e,u,d,r,r.length),r?r.push(p,m):r=[p,m]}if(r)u=d,d=this._edgecode(r[0],r[1]),u&&d&&this._edge(e,u,d,r,r.length);else if(this.contains(e,(this.xmin+this.xmax)/2,(this.ymin+this.ymax)/2))return[this.xmax,this.ymin,this.xmax,this.ymax,this.xmin,this.ymax,this.xmin,this.ymin];return r}_clipSegment(e,t,n,r,i,a){let o=i<a;for(o&&([e,t,n,r,i,a]=[n,r,e,t,a,i]);;){if(i===0&&a===0)return o?[n,r,e,t]:[e,t,n,r];if(i&a)return null;let s,c,l=i||a;l&8?(s=e+(n-e)*(this.ymax-t)/(r-t),c=this.ymax):l&4?(s=e+(n-e)*(this.ymin-t)/(r-t),c=this.ymin):l&2?(c=t+(r-t)*(this.xmax-e)/(n-e),s=this.xmax):(c=t+(r-t)*(this.xmin-e)/(n-e),s=this.xmin),i?(e=s,t=c,i=this._regioncode(e,t)):(n=s,r=c,a=this._regioncode(n,r))}}_clipInfinite(e,t,n,r,i,a){let o=Array.from(t),s;if((s=this._project(o[0],o[1],n,r))&&o.unshift(s[0],s[1]),(s=this._project(o[o.length-2],o[o.length-1],i,a))&&o.push(s[0],s[1]),o=this._clipFinite(e,o))for(let t=0,n=o.length,r,i=this._edgecode(o[n-2],o[n-1]);t<n;t+=2)r=i,i=this._edgecode(o[t],o[t+1]),r&&i&&(t=this._edge(e,r,i,o,t),n=o.length);else this.contains(e,(this.xmin+this.xmax)/2,(this.ymin+this.ymax)/2)&&(o=[this.xmin,this.ymin,this.xmax,this.ymin,this.xmax,this.ymax,this.xmin,this.ymax]);return o}_edge(e,t,n,r,i){for(;t!==n;){let n,a;switch(t){case 5:t=4;continue;case 4:t=6,n=this.xmax,a=this.ymin;break;case 6:t=2;continue;case 2:t=10,n=this.xmax,a=this.ymax;break;case 10:t=8;continue;case 8:t=9,n=this.xmin,a=this.ymax;break;case 9:t=1;continue;case 1:t=5,n=this.xmin,a=this.ymin;break}(r[i]!==n||r[i+1]!==a)&&this.contains(e,n,a)&&(r.splice(i,0,n,a),i+=2)}return i}_project(e,t,n,r){let i=1/0,a,o,s;if(r<0){if(t<=this.ymin)return null;(a=(this.ymin-t)/r)<i&&(s=this.ymin,o=e+(i=a)*n)}else if(r>0){if(t>=this.ymax)return null;(a=(this.ymax-t)/r)<i&&(s=this.ymax,o=e+(i=a)*n)}if(n>0){if(e>=this.xmax)return null;(a=(this.xmax-e)/n)<i&&(o=this.xmax,s=t+(i=a)*r)}else if(n<0){if(e<=this.xmin)return null;(a=(this.xmin-e)/n)<i&&(o=this.xmin,s=t+(i=a)*r)}return[o,s]}_edgecode(e,t){return(e===this.xmin?1:e===this.xmax?2:0)|(t===this.ymin?4:t===this.ymax?8:0)}_regioncode(e,t){return(e<this.xmin?1:e>this.xmax?2:0)|(t<this.ymin?4:t>this.ymax?8:0)}_simplify(e){if(e&&e.length>4){for(let t=0;t<e.length;t+=2){let n=(t+2)%e.length,r=(t+4)%e.length;(e[t]===e[n]&&e[n]===e[r]||e[t+1]===e[n+1]&&e[n+1]===e[r+1])&&(e.splice(n,2),t-=2)}e.length||(e=null)}return e}};let kt=2*Math.PI,G=Math.pow;function At(e){return e[0]}function jt(e){return e[1]}function Mt(e){let{triangles:t,coords:n}=e;for(let e=0;e<t.length;e+=3){let r=2*t[e],i=2*t[e+1],a=2*t[e+2];if((n[a]-n[r])*(n[i+1]-n[r+1])-(n[i]-n[r])*(n[a+1]-n[r+1])>1e-10)return!1}return!0}function Nt(e,t,n){return[e+Math.sin(e+t)*n,t+Math.cos(e-t)*n]}var Pt=class e{static from(t,n=At,r=jt,i){return new e(`length`in t?Ft(t,n,r,i):Float64Array.from(It(t,n,r,i)))}constructor(e){this._delaunator=new _t(e),this.inedges=new Int32Array(e.length/2),this._hullIndex=new Int32Array(e.length/2),this.points=this._delaunator.coords,this._init()}update(){return this._delaunator.update(),this._init(),this}_init(){let e=this._delaunator,t=this.points;if(e.hull&&e.hull.length>2&&Mt(e)){this.collinear=Int32Array.from({length:t.length/2},(e,t)=>t).sort((e,n)=>t[2*e]-t[2*n]||t[2*e+1]-t[2*n+1]);let e=this.collinear[0],n=this.collinear[this.collinear.length-1],r=[t[2*e],t[2*e+1],t[2*n],t[2*n+1]],i=1e-8*Math.hypot(r[3]-r[1],r[2]-r[0]);for(let e=0,n=t.length/2;e<n;++e){let n=Nt(t[2*e],t[2*e+1],i);t[2*e]=n[0],t[2*e+1]=n[1]}this._delaunator=new _t(t)}else delete this.collinear;let n=this.halfedges=this._delaunator.halfedges,r=this.hull=this._delaunator.hull,i=this.triangles=this._delaunator.triangles,a=this.inedges.fill(-1),o=this._hullIndex.fill(-1);for(let e=0,t=n.length;e<t;++e){let t=i[e%3==2?e-2:e+1];(n[e]===-1||a[t]===-1)&&(a[t]=e)}for(let e=0,t=r.length;e<t;++e)o[r[e]]=e;r.length<=2&&r.length>0&&(this.triangles=new Int32Array(3).fill(-1),this.halfedges=new Int32Array(3).fill(-1),this.triangles[0]=r[0],a[r[0]]=1,r.length===2&&(a[r[1]]=0,this.triangles[1]=r[1],this.triangles[2]=r[1]))}voronoi(e){return new Ot(this,e)}*neighbors(e){let{inedges:t,hull:n,_hullIndex:r,halfedges:i,triangles:a,collinear:o}=this;if(o){let t=o.indexOf(e);t>0&&(yield o[t-1]),t<o.length-1&&(yield o[t+1]);return}let s=t[e];if(s===-1)return;let c=s,l=-1;do{if(yield l=a[c],c=c%3==2?c-2:c+1,a[c]!==e)return;if(c=i[c],c===-1){let t=n[(r[e]+1)%n.length];t!==l&&(yield t);return}}while(c!==s)}find(e,t,n=0){if((e=+e,e!==e)||(t=+t,t!==t))return-1;let r=n,i;for(;(i=this._step(n,e,t))>=0&&i!==n&&i!==r;)n=i;return i}_step(e,t,n){let{inedges:r,hull:i,_hullIndex:a,halfedges:o,triangles:s,points:c}=this;if(r[e]===-1||!c.length)return(e+1)%(c.length>>1);let l=e,u=G(t-c[e*2],2)+G(n-c[e*2+1],2),d=r[e],f=d;do{let r=s[f],d=G(t-c[r*2],2)+G(n-c[r*2+1],2);if(d<u&&(u=d,l=r),f=f%3==2?f-2:f+1,s[f]!==e)break;if(f=o[f],f===-1){if(f=i[(a[e]+1)%i.length],f!==r&&G(t-c[f*2],2)+G(n-c[f*2+1],2)<u)return f;break}}while(f!==d);return l}render(e){let t=e==null?e=new W:void 0,{points:n,halfedges:r,triangles:i}=this;for(let t=0,a=r.length;t<a;++t){let a=r[t];if(a<t)continue;let o=i[t]*2,s=i[a]*2;e.moveTo(n[o],n[o+1]),e.lineTo(n[s],n[s+1])}return this.renderHull(e),t&&t.value()}renderPoints(e,t){t===void 0&&(!e||typeof e.moveTo!=`function`)&&(t=e,e=null),t=t==null?2:+t;let n=e==null?e=new W:void 0,{points:r}=this;for(let n=0,i=r.length;n<i;n+=2){let i=r[n],a=r[n+1];e.moveTo(i+t,a),e.arc(i,a,t,0,kt)}return n&&n.value()}renderHull(e){let t=e==null?e=new W:void 0,{hull:n,points:r}=this,i=n[0]*2,a=n.length;e.moveTo(r[i],r[i+1]);for(let t=1;t<a;++t){let i=2*n[t];e.lineTo(r[i],r[i+1])}return e.closePath(),t&&t.value()}hullPolygon(){let e=new Dt;return this.renderHull(e),e.value()}renderTriangle(e,t){let n=t==null?t=new W:void 0,{points:r,triangles:i}=this,a=i[e*=3]*2,o=i[e+1]*2,s=i[e+2]*2;return t.moveTo(r[a],r[a+1]),t.lineTo(r[o],r[o+1]),t.lineTo(r[s],r[s+1]),t.closePath(),n&&n.value()}*trianglePolygons(){let{triangles:e}=this;for(let t=0,n=e.length/3;t<n;++t)yield this.trianglePolygon(t)}trianglePolygon(e){let t=new Dt;return this.renderTriangle(e,t),t.value()}};function Ft(e,t,n,r){let i=e.length,a=new Float64Array(i*2);for(let o=0;o<i;++o){let i=e[o];a[o*2]=t.call(r,i,o,e),a[o*2+1]=n.call(r,i,o,e)}return a}function*It(e,t,n,r){let i=0;for(let a of e)yield t.call(r,a,i,e),yield n.call(r,a,i,e),++i}function Lt(e,t){return e==null||t==null?NaN:e<t?-1:e>t?1:e>=t?0:NaN}function Rt(e,t){return e==null||t==null?NaN:t<e?-1:t>e?1:t>=e?0:NaN}function zt(e){let t,n,r;e.length===2?(t=e===Lt||e===Rt?e:Bt,n=e,r=e):(t=Lt,n=(t,n)=>Lt(e(t),n),r=(t,n)=>e(t)-n);function i(e,r,i=0,a=e.length){if(i<a){if(t(r,r)!==0)return a;do{let t=i+a>>>1;n(e[t],r)<0?i=t+1:a=t}while(i<a)}return i}function a(e,r,i=0,a=e.length){if(i<a){if(t(r,r)!==0)return a;do{let t=i+a>>>1;n(e[t],r)<=0?i=t+1:a=t}while(i<a)}return i}function o(e,t,n=0,a=e.length){let o=i(e,t,n,a-1);return o>n&&r(e[o-1],t)>-r(e[o],t)?o-1:o}return{left:i,center:o,right:a}}function Bt(){return 0}function Vt(e){return e===null?NaN:+e}let Ht=zt(Lt),Ut=Ht.right;Ht.left,zt(Vt).center;let Wt=Math.sqrt(50),Gt=Math.sqrt(10),Kt=Math.sqrt(2);function qt(e,t,n){let r=(t-e)/Math.max(0,n),i=Math.floor(Math.log10(r)),a=r/10**i,o=a>=Wt?10:a>=Gt?5:a>=Kt?2:1,s,c,l;return i<0?(l=10**-i/o,s=Math.round(e*l),c=Math.round(t*l),s/l<e&&++s,c/l>t&&--c,l=-l):(l=10**i*o,s=Math.round(e/l),c=Math.round(t/l),s*l<e&&++s,c*l>t&&--c),c<s&&.5<=n&&n<2?qt(e,t,n*2):[s,c,l]}function Jt(e,t,n){if(t=+t,e=+e,n=+n,!(n>0))return[];if(e===t)return[e];let r=t<e,[i,a,o]=r?qt(t,e,n):qt(e,t,n);if(!(a>=i))return[];let s=a-i+1,c=Array(s);if(r)if(o<0)for(let e=0;e<s;++e)c[e]=(a-e)/-o;else for(let e=0;e<s;++e)c[e]=(a-e)*o;else if(o<0)for(let e=0;e<s;++e)c[e]=(i+e)/-o;else for(let e=0;e<s;++e)c[e]=(i+e)*o;return c}function Yt(e,t,n){return t=+t,e=+e,n=+n,qt(e,t,n)[2]}function Xt(e,t,n){t=+t,e=+e,n=+n;let r=t<e,i=r?Yt(t,e,n):Yt(e,t,n);return(r?-1:1)*(i<0?1/-i:i)}function Zt(e,t){switch(arguments.length){case 0:break;case 1:this.range(e);break;default:this.range(t).domain(e);break}return this}function Qt(e,t,n){e.prototype=t.prototype=n,n.constructor=e}function $t(e,t){var n=Object.create(e.prototype);for(var r in t)n[r]=t[r];return n}function en(){}var tn=.7,nn=1/tn,K=`\\\\s*([+-]?\\\\d+)\\\\s*`,rn=`\\\\s*([+-]?(?:\\\\d*\\\\.)?\\\\d+(?:[eE][+-]?\\\\d+)?)\\\\s*`,q=`\\\\s*([+-]?(?:\\\\d*\\\\.)?\\\\d+(?:[eE][+-]?\\\\d+)?)%\\\\s*`,an=/^#([0-9a-f]{3,8})$/,on=RegExp(`^rgb\\\\(${K},${K},${K}\\\\)$`),sn=RegExp(`^rgb\\\\(${q},${q},${q}\\\\)$`),cn=RegExp(`^rgba\\\\(${K},${K},${K},${rn}\\\\)$`),ln=RegExp(`^rgba\\\\(${q},${q},${q},${rn}\\\\)$`),un=RegExp(`^hsl\\\\(${rn},${q},${q}\\\\)$`),dn=RegExp(`^hsla\\\\(${rn},${q},${q},${rn}\\\\)$`),fn={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074};Qt(en,_n,{copy(e){return Object.assign(new this.constructor,this,e)},displayable(){return this.rgb().displayable()},hex:pn,formatHex:pn,formatHex8:mn,formatHsl:hn,formatRgb:gn,toString:gn});function pn(){return this.rgb().formatHex()}function mn(){return this.rgb().formatHex8()}function hn(){return Dn(this).formatHsl()}function gn(){return this.rgb().formatRgb()}function _n(e){var t,n;return e=(e+``).trim().toLowerCase(),(t=an.exec(e))?(n=t[1].length,t=parseInt(t[1],16),n===6?vn(t):n===3?new J(t>>8&15|t>>4&240,t>>4&15|t&240,(t&15)<<4|t&15,1):n===8?yn(t>>24&255,t>>16&255,t>>8&255,(t&255)/255):n===4?yn(t>>12&15|t>>8&240,t>>8&15|t>>4&240,t>>4&15|t&240,((t&15)<<4|t&15)/255):null):(t=on.exec(e))?new J(t[1],t[2],t[3],1):(t=sn.exec(e))?new J(t[1]*255/100,t[2]*255/100,t[3]*255/100,1):(t=cn.exec(e))?yn(t[1],t[2],t[3],t[4]):(t=ln.exec(e))?yn(t[1]*255/100,t[2]*255/100,t[3]*255/100,t[4]):(t=un.exec(e))?En(t[1],t[2]/100,t[3]/100,1):(t=dn.exec(e))?En(t[1],t[2]/100,t[3]/100,t[4]):fn.hasOwnProperty(e)?vn(fn[e]):e===`transparent`?new J(NaN,NaN,NaN,0):null}function vn(e){return new J(e>>16&255,e>>8&255,e&255,1)}function yn(e,t,n,r){return r<=0&&(e=t=n=NaN),new J(e,t,n,r)}function bn(e){return e instanceof en||(e=_n(e)),e?(e=e.rgb(),new J(e.r,e.g,e.b,e.opacity)):new J}function xn(e,t,n,r){return arguments.length===1?bn(e):new J(e,t,n,r??1)}function J(e,t,n,r){this.r=+e,this.g=+t,this.b=+n,this.opacity=+r}Qt(J,xn,$t(en,{brighter(e){return e=e==null?nn:nn**+e,new J(this.r*e,this.g*e,this.b*e,this.opacity)},darker(e){return e=e==null?tn:tn**+e,new J(this.r*e,this.g*e,this.b*e,this.opacity)},rgb(){return this},clamp(){return new J(Y(this.r),Y(this.g),Y(this.b),Tn(this.opacity))},displayable(){return-.5<=this.r&&this.r<255.5&&-.5<=this.g&&this.g<255.5&&-.5<=this.b&&this.b<255.5&&0<=this.opacity&&this.opacity<=1},hex:Sn,formatHex:Sn,formatHex8:Cn,formatRgb:wn,toString:wn}));function Sn(){return`#${X(this.r)}${X(this.g)}${X(this.b)}`}function Cn(){return`#${X(this.r)}${X(this.g)}${X(this.b)}${X((isNaN(this.opacity)?1:this.opacity)*255)}`}function wn(){let e=Tn(this.opacity);return`${e===1?`rgb(`:`rgba(`}${Y(this.r)}, ${Y(this.g)}, ${Y(this.b)}${e===1?`)`:`, ${e})`}`}function Tn(e){return isNaN(e)?1:Math.max(0,Math.min(1,e))}function Y(e){return Math.max(0,Math.min(255,Math.round(e)||0))}function X(e){return e=Y(e),(e<16?`0`:``)+e.toString(16)}function En(e,t,n,r){return r<=0?e=t=n=NaN:n<=0||n>=1?e=t=NaN:t<=0&&(e=NaN),new Z(e,t,n,r)}function Dn(e){if(e instanceof Z)return new Z(e.h,e.s,e.l,e.opacity);if(e instanceof en||(e=_n(e)),!e)return new Z;if(e instanceof Z)return e;e=e.rgb();var t=e.r/255,n=e.g/255,r=e.b/255,i=Math.min(t,n,r),a=Math.max(t,n,r),o=NaN,s=a-i,c=(a+i)/2;return s?(o=t===a?(n-r)/s+(n<r)*6:n===a?(r-t)/s+2:(t-n)/s+4,s/=c<.5?a+i:2-a-i,o*=60):s=c>0&&c<1?0:o,new Z(o,s,c,e.opacity)}function On(e,t,n,r){return arguments.length===1?Dn(e):new Z(e,t,n,r??1)}function Z(e,t,n,r){this.h=+e,this.s=+t,this.l=+n,this.opacity=+r}Qt(Z,On,$t(en,{brighter(e){return e=e==null?nn:nn**+e,new Z(this.h,this.s,this.l*e,this.opacity)},darker(e){return e=e==null?tn:tn**+e,new Z(this.h,this.s,this.l*e,this.opacity)},rgb(){var e=this.h%360+(this.h<0)*360,t=isNaN(e)||isNaN(this.s)?0:this.s,n=this.l,r=n+(n<.5?n:1-n)*t,i=2*n-r;return new J(jn(e>=240?e-240:e+120,i,r),jn(e,i,r),jn(e<120?e+240:e-120,i,r),this.opacity)},clamp(){return new Z(kn(this.h),An(this.s),An(this.l),Tn(this.opacity))},displayable(){return(0<=this.s&&this.s<=1||isNaN(this.s))&&0<=this.l&&this.l<=1&&0<=this.opacity&&this.opacity<=1},formatHsl(){let e=Tn(this.opacity);return`${e===1?`hsl(`:`hsla(`}${kn(this.h)}, ${An(this.s)*100}%, ${An(this.l)*100}%${e===1?`)`:`, ${e})`}`}}));function kn(e){return e=(e||0)%360,e<0?e+360:e}function An(e){return Math.max(0,Math.min(1,e||0))}function jn(e,t,n){return(e<60?t+(n-t)*e/60:e<180?n:e<240?t+(n-t)*(240-e)/60:t)*255}var Mn=e=>()=>e;function Nn(e,t){return function(n){return e+n*t}}function Pn(e,t,n){return e**=+n,t=t**+n-e,n=1/n,function(r){return(e+r*t)**+n}}function Fn(e){return(e=+e)==1?In:function(t,n){return n-t?Pn(t,n,e):Mn(isNaN(t)?n:t)}}function In(e,t){var n=t-e;return n?Nn(e,n):Mn(isNaN(e)?t:e)}var Ln=(function e(t){var n=Fn(t);function r(e,t){var r=n((e=xn(e)).r,(t=xn(t)).r),i=n(e.g,t.g),a=n(e.b,t.b),o=In(e.opacity,t.opacity);return function(t){return e.r=r(t),e.g=i(t),e.b=a(t),e.opacity=o(t),e+``}}return r.gamma=e,r})(1);function Rn(e,t){t||(t=[]);var n=e?Math.min(t.length,e.length):0,r=t.slice(),i;return function(a){for(i=0;i<n;++i)r[i]=e[i]*(1-a)+t[i]*a;return r}}function zn(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Bn(e,t){var n=t?t.length:0,r=e?Math.min(n,e.length):0,i=Array(r),a=Array(n),o;for(o=0;o<r;++o)i[o]=Yn(e[o],t[o]);for(;o<n;++o)a[o]=t[o];return function(e){for(o=0;o<r;++o)a[o]=i[o](e);return a}}function Vn(e,t){var n=new Date;return e=+e,t=+t,function(r){return n.setTime(e*(1-r)+t*r),n}}function Hn(e,t){return e=+e,t=+t,function(n){return e*(1-n)+t*n}}function Un(e,t){var n={},r={},i;for(i in(typeof e!=`object`||!e)&&(e={}),(typeof t!=`object`||!t)&&(t={}),t)i in e?n[i]=Yn(e[i],t[i]):r[i]=t[i];return function(e){for(i in n)r[i]=n[i](e);return r}}var Wn=/[-+]?(?:\\d+\\.?\\d*|\\.?\\d+)(?:[eE][-+]?\\d+)?/g,Gn=new RegExp(Wn.source,`g`);function Kn(e){return function(){return e}}function qn(e){return function(t){return e(t)+``}}function Jn(e,t){var n=Wn.lastIndex=Gn.lastIndex=0,r,i,a,o=-1,s=[],c=[];for(e+=``,t+=``;(r=Wn.exec(e))&&(i=Gn.exec(t));)(a=i.index)>n&&(a=t.slice(n,a),s[o]?s[o]+=a:s[++o]=a),(r=r[0])===(i=i[0])?s[o]?s[o]+=i:s[++o]=i:(s[++o]=null,c.push({i:o,x:Hn(r,i)})),n=Gn.lastIndex;return n<t.length&&(a=t.slice(n),s[o]?s[o]+=a:s[++o]=a),s.length<2?c[0]?qn(c[0].x):Kn(t):(t=c.length,function(e){for(var n=0,r;n<t;++n)s[(r=c[n]).i]=r.x(e);return s.join(``)})}function Yn(e,t){var n=typeof t,r;return t==null||n===`boolean`?Mn(t):(n===`number`?Hn:n===`string`?(r=_n(t))?(t=r,Ln):Jn:t instanceof _n?Ln:t instanceof Date?Vn:zn(t)?Rn:Array.isArray(t)?Bn:typeof t.valueOf!=`function`&&typeof t.toString!=`function`||isNaN(t)?Un:Hn)(e,t)}function Xn(e,t){return e=+e,t=+t,function(n){return Math.round(e*(1-n)+t*n)}}function Zn(e){return function(){return e}}function Qn(e){return+e}var $n=[0,1];function Q(e){return e}function er(e,t){return(t-=e=+e)?function(n){return(n-e)/t}:Zn(isNaN(t)?NaN:.5)}function tr(e,t){var n;return e>t&&(n=e,e=t,t=n),function(n){return Math.max(e,Math.min(t,n))}}function nr(e,t,n){var r=e[0],i=e[1],a=t[0],o=t[1];return i<r?(r=er(i,r),a=n(o,a)):(r=er(r,i),a=n(a,o)),function(e){return a(r(e))}}function rr(e,t,n){var r=Math.min(e.length,t.length)-1,i=Array(r),a=Array(r),o=-1;for(e[r]<e[0]&&(e=e.slice().reverse(),t=t.slice().reverse());++o<r;)i[o]=er(e[o],e[o+1]),a[o]=n(t[o],t[o+1]);return function(t){var n=Ut(e,t,1,r)-1;return a[n](i[n](t))}}function ir(e,t){return t.domain(e.domain()).range(e.range()).interpolate(e.interpolate()).clamp(e.clamp()).unknown(e.unknown())}function ar(){var e=$n,t=$n,n=Yn,r,i,a,o=Q,s,c,l;function u(){var n=Math.min(e.length,t.length);return o!==Q&&(o=tr(e[0],e[n-1])),s=n>2?rr:nr,c=l=null,d}function d(i){return i==null||isNaN(i=+i)?a:(c||(c=s(e.map(r),t,n)))(r(o(i)))}return d.invert=function(n){return o(i((l||(l=s(t,e.map(r),Hn)))(n)))},d.domain=function(t){return arguments.length?(e=Array.from(t,Qn),u()):e.slice()},d.range=function(e){return arguments.length?(t=Array.from(e),u()):t.slice()},d.rangeRound=function(e){return t=Array.from(e),n=Xn,u()},d.clamp=function(e){return arguments.length?(o=e?!0:Q,u()):o!==Q},d.interpolate=function(e){return arguments.length?(n=e,u()):n},d.unknown=function(e){return arguments.length?(a=e,d):a},function(e,t){return r=e,i=t,u()}}function or(){return ar()(Q,Q)}function sr(e){return Math.abs(e=Math.round(e))>=1e21?e.toLocaleString(`en`).replace(/,/g,``):e.toString(10)}function cr(e,t){if(!isFinite(e)||e===0)return null;var n=(e=t?e.toExponential(t-1):e.toExponential()).indexOf(`e`),r=e.slice(0,n);return[r.length>1?r[0]+r.slice(2):r,+e.slice(n+1)]}function $(e){return e=cr(Math.abs(e)),e?e[1]:NaN}function lr(e,t){return function(n,r){for(var i=n.length,a=[],o=0,s=e[0],c=0;i>0&&s>0&&(c+s+1>r&&(s=Math.max(1,r-c)),a.push(n.substring(i-=s,i+s)),!((c+=s+1)>r));)s=e[o=(o+1)%e.length];return a.reverse().join(t)}}function ur(e){return function(t){return t.replace(/[0-9]/g,function(t){return e[+t]})}}var dr=/^(?:(.)?([<>=^]))?([+\\-( ])?([$#])?(0)?(\\d+)?(,)?(\\.\\d+)?(~)?([a-z%])?$/i;function fr(e){if(!(t=dr.exec(e)))throw Error(`invalid format: `+e);var t;return new pr({fill:t[1],align:t[2],sign:t[3],symbol:t[4],zero:t[5],width:t[6],comma:t[7],precision:t[8]&&t[8].slice(1),trim:t[9],type:t[10]})}fr.prototype=pr.prototype;function pr(e){this.fill=e.fill===void 0?` `:e.fill+``,this.align=e.align===void 0?`>`:e.align+``,this.sign=e.sign===void 0?`-`:e.sign+``,this.symbol=e.symbol===void 0?``:e.symbol+``,this.zero=!!e.zero,this.width=e.width===void 0?void 0:+e.width,this.comma=!!e.comma,this.precision=e.precision===void 0?void 0:+e.precision,this.trim=!!e.trim,this.type=e.type===void 0?``:e.type+``}pr.prototype.toString=function(){return this.fill+this.align+this.sign+this.symbol+(this.zero?`0`:``)+(this.width===void 0?``:Math.max(1,this.width|0))+(this.comma?`,`:``)+(this.precision===void 0?``:`.`+Math.max(0,this.precision|0))+(this.trim?`~`:``)+this.type};function mr(e){out:for(var t=e.length,n=1,r=-1,i;n<t;++n)switch(e[n]){case`.`:r=i=n;break;case`0`:r===0&&(r=n),i=n;break;default:if(!+e[n])break out;r>0&&(r=0);break}return r>0?e.slice(0,r)+e.slice(i+1):e}var hr;function gr(e,t){var n=cr(e,t);if(!n)return hr=void 0,e.toPrecision(t);var r=n[0],i=n[1],a=i-(hr=Math.max(-8,Math.min(8,Math.floor(i/3)))*3)+1,o=r.length;return a===o?r:a>o?r+Array(a-o+1).join(`0`):a>0?r.slice(0,a)+`.`+r.slice(a):`0.`+Array(1-a).join(`0`)+cr(e,Math.max(0,t+a-1))[0]}function _r(e,t){var n=cr(e,t);if(!n)return e+``;var r=n[0],i=n[1];return i<0?`0.`+Array(-i).join(`0`)+r:r.length>i+1?r.slice(0,i+1)+`.`+r.slice(i+1):r+Array(i-r.length+2).join(`0`)}var vr={\"%\":(e,t)=>(e*100).toFixed(t),b:e=>Math.round(e).toString(2),c:e=>e+``,d:sr,e:(e,t)=>e.toExponential(t),f:(e,t)=>e.toFixed(t),g:(e,t)=>e.toPrecision(t),o:e=>Math.round(e).toString(8),p:(e,t)=>_r(e*100,t),r:_r,s:gr,X:e=>Math.round(e).toString(16).toUpperCase(),x:e=>Math.round(e).toString(16)};function yr(e){return e}var br=Array.prototype.map,xr=[`y`,`z`,`a`,`f`,`p`,`n`,`µ`,`m`,``,`k`,`M`,`G`,`T`,`P`,`E`,`Z`,`Y`];function Sr(e){var t=e.grouping===void 0||e.thousands===void 0?yr:lr(br.call(e.grouping,Number),e.thousands+``),n=e.currency===void 0?``:e.currency[0]+``,r=e.currency===void 0?``:e.currency[1]+``,i=e.decimal===void 0?`.`:e.decimal+``,a=e.numerals===void 0?yr:ur(br.call(e.numerals,String)),o=e.percent===void 0?`%`:e.percent+``,s=e.minus===void 0?`−`:e.minus+``,c=e.nan===void 0?`NaN`:e.nan+``;function l(e,l){e=fr(e);var u=e.fill,d=e.align,f=e.sign,p=e.symbol,m=e.zero,h=e.width,g=e.comma,_=e.precision,v=e.trim,y=e.type;y===`n`?(g=!0,y=`g`):vr[y]||(_===void 0&&(_=12),v=!0,y=`g`),(m||u===`0`&&d===`=`)&&(m=!0,u=`0`,d=`=`);var b=(l&&l.prefix!==void 0?l.prefix:``)+(p===`$`?n:p===`#`&&/[boxX]/.test(y)?`0`+y.toLowerCase():``),x=(p===`$`?r:/[%p]/.test(y)?o:``)+(l&&l.suffix!==void 0?l.suffix:``),S=vr[y],C=/[defgprs%]/.test(y);_=_===void 0?6:/[gprs]/.test(y)?Math.max(1,Math.min(21,_)):Math.max(0,Math.min(20,_));function w(e){var n=b,r=x,o,l,p;if(y===`c`)r=S(e)+r,e=``;else{e=+e;var w=e<0||1/e<0;if(e=isNaN(e)?c:S(Math.abs(e),_),v&&(e=mr(e)),w&&+e==0&&f!==`+`&&(w=!1),n=(w?f===`(`?f:s:f===`-`||f===`(`?``:f)+n,r=(y===`s`&&!isNaN(e)&&hr!==void 0?xr[8+hr/3]:``)+r+(w&&f===`(`?`)`:``),C){for(o=-1,l=e.length;++o<l;)if(p=e.charCodeAt(o),48>p||p>57){r=(p===46?i+e.slice(o+1):e.slice(o))+r,e=e.slice(0,o);break}}}g&&!m&&(e=t(e,1/0));var T=n.length+e.length+r.length,E=T<h?Array(h-T+1).join(u):``;switch(g&&m&&(e=t(E+e,E.length?h-r.length:1/0),E=``),d){case`<`:e=n+e+r+E;break;case`=`:e=n+E+e+r;break;case`^`:e=E.slice(0,T=E.length>>1)+n+e+r+E.slice(T);break;default:e=E+n+e+r;break}return a(e)}return w.toString=function(){return e+``},w}function u(e,t){var n=Math.max(-8,Math.min(8,Math.floor($(t)/3)))*3,r=10**-n,i=l((e=fr(e),e.type=`f`,e),{suffix:xr[8+n/3]});return function(e){return i(r*e)}}return{format:l,formatPrefix:u}}var Cr,wr,Tr;Er({thousands:`,`,grouping:[3],currency:[`$`,``]});function Er(e){return Cr=Sr(e),wr=Cr.format,Tr=Cr.formatPrefix,Cr}function Dr(e){return Math.max(0,-$(Math.abs(e)))}function Or(e,t){return Math.max(0,Math.max(-8,Math.min(8,Math.floor($(t)/3)))*3-$(Math.abs(e)))}function kr(e,t){return e=Math.abs(e),t=Math.abs(t)-e,Math.max(0,$(t)-$(e))+1}function Ar(e,t,n,r){var i=Xt(e,t,n),a;switch(r=fr(r??`,f`),r.type){case`s`:var o=Math.max(Math.abs(e),Math.abs(t));return r.precision==null&&!isNaN(a=Or(i,o))&&(r.precision=a),Tr(r,o);case``:case`e`:case`g`:case`p`:case`r`:r.precision==null&&!isNaN(a=kr(i,Math.max(Math.abs(e),Math.abs(t))))&&(r.precision=a-(r.type===`e`));break;case`f`:case`%`:r.precision==null&&!isNaN(a=Dr(i))&&(r.precision=a-(r.type===`%`)*2);break}return wr(r)}function jr(e){var t=e.domain;return e.ticks=function(e){var n=t();return Jt(n[0],n[n.length-1],e??10)},e.tickFormat=function(e,n){var r=t();return Ar(r[0],r[r.length-1],e??10,n)},e.nice=function(n){n??(n=10);var r=t(),i=0,a=r.length-1,o=r[i],s=r[a],c,l,u=10;for(s<o&&(l=o,o=s,s=l,l=i,i=a,a=l);u-- >0;){if(l=Yt(o,s,n),l===c)return r[i]=o,r[a]=s,t(r);if(l>0)o=Math.floor(o/l)*l,s=Math.ceil(s/l)*l;else if(l<0)o=Math.ceil(o*l)/l,s=Math.floor(s*l)/l;else break;c=l}return e},e}function Mr(){var e=or();return e.copy=function(){return ir(e,Mr())},Zt.apply(e,arguments),jr(e)}function Nr(e){let t,n;for(let r of e)r!=null&&(t===void 0?r>=r&&(t=n=r):(t>r&&(t=r),n<r&&(n=r)));return[t,n]}function*Pr(e){for(let t of e)yield*t}function Fr(e){return Array.from(Pr(e))}function Ir(e,t){let n=t.length,r=-1;for(;++r<n;){let n=Lr(e,t[r]);if(n)return n}return 0}function Lr(e,t){let n=t[0],r=t[1],i=-1;for(let a=0,o=e.length,s=o-1;a<o;s=a++){let o=e[a],c=o[0],l=o[1],u=e[s],d=u[0],f=u[1];if(Rr(o,u,t))return 0;l>r!=f>r&&n<(d-c)*(r-l)/(f-l)+c&&(i=-i)}return i}function Rr(e,t,n){let r;return zr(e,t,n)&&Br(e[r=+(e[0]===t[0])],n[r],t[r])}function zr(e,t,n){return(t[0]-e[0])*(n[1]-e[1])===(n[0]-e[0])*(t[1]-e[1])}function Br(e,t,n){return e<=t&&t<=n||n<=t&&t<=e}function Vr(e){let t=0,n=e.length,r=e[n-1][1]*e[0][0]-e[n-1][0]*e[0][1];for(;++t<n;)r+=e[t-1][1]*e[t][0]-e[t-1][0]*e[t][1];return r}function Hr(e){let t=[],n=[];for(let r of e)Vr(r)>0?t.push([r]):n.push(r);return n.forEach(function(e){for(let n=0,r=t.length,i;n<r;++n)if(Ir((i=t[n])[0],e)!==-1){i.push(e);return}}),t}function Ur(){let e=e=>e[0],t=e=>e[1],n=e=>isFinite(+e[2])?+e[2]:0,r=Pt.from,i=(e,t,n)=>{let{points:r}=c,i=[r[2*e],r[2*e+1]],a=[r[2*t],r[2*t+1]];return[n*a[0]+(1-n)*i[0],n*a[1]+(1-n)*i[1]]},a=Hr,o,s,c;function l(i){c=r(i,e,t),s=Array.from(i,n),typeof o!=`object`&&(o=Mr().domain(Nr(s)).nice().ticks(o))}function*u(e){l(e);for(let e of o)yield{type:`MultiPolygon`,coordinates:g(c,s,e),value:e}}function d(e,t){return l(e),{type:`MultiPolygon`,coordinates:g(c,s,t),value:t}}function*f(e){l(e);let t,n,r;for(let e of o)n&&(t=n),n=Fr(g(c,s,e)),t&&(yield{type:`MultiPolygon`,coordinates:a(t.concat(n.map(e=>e.slice().reverse()))),value:r,valueMax:e}),r=e}let p=function(e){return[...u(e)]};return p.x=t=>t?(e=t,p):e,p.y=e=>e?(t=e,p):t,p.value=e=>e?(n=e,p):n,p.thresholds=e=>e?(o=e,p):o,p.triangulate=e=>e?(r=e,p):r,p.pointInterpolate=e=>e?(i=e,p):i,p.ringsort=e=>e?(a=e,p):a,p.contours=u,p.contour=d,p.isobands=f,p._values=()=>s,p._triangulation=()=>c,p;function m(e){return e%3==2?e-2:e+1}function h(e){return e%3==0?e+2:e-1}function g(e,t,n=0){for(let e of t)if(!isFinite(e))throw[`Invalid value`,e];let{halfedges:r,inedges:o,triangles:s}=e,c=t.length,l=new Map;r.forEach((e,t)=>{e===-1&&l.set(s[t],s[t+(t%3==2?-2:1)])});function u(e){return d(s[e],s[m(e)])}function d(e,r){let i=t[e],a=t[r];if(i<=n&&a>=n&&i<a)return(n-i)/(a-i)}let f=[],p=new Uint8Array(r.length).fill(0),g,_,v,y,b;for(y=0;y<r.length;y++)if(!p[y]){for(_=y,g=[];(b=u(_))>0;){let[e,i]=[s[_],s[v=m(_)]];if(g.length&&e===g[0].ti&&i===g[0].tj||g.length>2*c)break;if(p[_]=1,g.push({ti:e,tj:i,a:b}),(v=r[_])>-1){if(u(v=m(v))>0){_=v;continue}if(u(v=m(v))>0){_=v;continue}}else{let e=s[_];for(;t[e]<n;)e=l.get(e);for(;t[e]>=n;)g.push({ti:e,tj:e,a:0}),e=l.get(e);if(v=o[e],g.push({ti:e,tj:s[v],a:d(e,s[v])}),u(_=m(v))>0||u(_=h(v))>0)continue}}g.length&&(g.push(g[0]),f.push(g.map(({ti:e,tj:t,a:n})=>i(e,t,n))))}do{let e=[],r=l.keys().next().value;do{let t=l.get(r);e.push(r),l.delete(r),r=t}while(l.has(r));e.every(e=>t[e]>=n)&&(e.push(e[0]),f.push(e.map(e=>i(e,e,0))))}while(l.size);return a(f)}}function Wr(e){if(!Array.isArray(e)||e.length===0)return``;let t=e,n=t.length;if(n>1){let e=t[0],r=t[n-1];Math.abs(e[0]-r[0])<1e-12&&Math.abs(e[1]-r[1])<1e-12&&(t=t.slice(0,n-1))}let r=Array(t.length);for(let e=0;e<t.length;e++){let n=t[e];r[e]=`${n[0].toFixed(9)}:${n[1].toFixed(9)}`}let i=r.length;if(i===0)return``;if(i===1)return r[0];function a(e){let t=e.length,n=0,r=1,i=0;for(;n<t&&r<t&&i<t;){let a=e[(n+i)%t],o=e[(r+i)%t];if(a===o){i++;continue}a>o?(n=n+i+1,n<=r&&(n=r+1)):(r=r+i+1,r<=n&&(r=n+1)),i=0}return Math.min(n,r)}let o=a(r),s=r.slice().reverse(),c=a(s);for(let e=0;e<i;e++){let t=r[(o+e)%i],n=s[(c+e)%i];if(t!==n)return t<n?o===0?r.join(`|`):r.slice(o).concat(r.slice(0,o)).join(`|`):c===0?s.join(`|`):s.slice(c).concat(s.slice(0,c)).join(`|`)}return o===0?r.join(`|`):r.slice(o).concat(r.slice(0,o)).join(`|`)}function Gr(e,t=[]){let n=Ur(),r=0;t.length>0&&(n.thresholds(t),r=t.at(-1));let i=Array.from(n.isobands(e)),a=1e-9,o=e.reduce((e,t)=>{let n=t[0],r=t[1];return n<e.minX&&(e.minX=n),r<e.minY&&(e.minY=r),n>e.maxX&&(e.maxX=n),r>e.maxY&&(e.maxY=r),e},{minX:1/0,minY:1/0,maxX:-1/0,maxY:-1/0}),s={ixMin:-1,ixMax:-1,iyMin:-1,iyMax:-1};for(let t=0;t<e.length;t++){let n=e[t],r=n[0],i=n[1];(s.ixMin===-1||r<e[s.ixMin][0])&&(s.ixMin=t),(s.ixMax===-1||r>e[s.ixMax][0])&&(s.ixMax=t),(s.iyMin===-1||i<e[s.iyMin][1])&&(s.iyMin=t),(s.iyMax===-1||i>e[s.iyMax][1])&&(s.iyMax=t)}let c=[];s.ixMin>=0&&c.push([e[s.ixMin][0],e[s.ixMin][1]]),s.ixMax>=0&&c.push([e[s.ixMax][0],e[s.ixMax][1]]),s.iyMin>=0&&c.push([e[s.iyMin][0],e[s.iyMin][1]]),s.iyMax>=0&&c.push([e[s.iyMax][0],e[s.iyMax][1]]);let l=[],u=new Set;for(let e of c){let t=`${e[0].toFixed(9)}|${e[1].toFixed(9)}`;u.has(t)||(u.add(t),l.push(e))}function d(e,t,n,r,i,o){let s=(e-n)*(o-r)-(t-r)*(i-n);if(Math.abs(s)>a)return!1;let c=(e-n)*(i-n)+(t-r)*(o-r);return!(c<-a||c-((i-n)*(i-n)+(o-r)*(o-r))>a)}function f(e,t){let n=e[0],r=e[1],i=!1;for(let e=0,a=t.length-1;e<t.length;a=e++){let o=t[e][0],s=t[e][1],c=t[a][0],l=t[a][1];if(d(n,r,o,s,c,l))return!0;s>r!=l>r&&n<(c-o)*(r-s)/(l-s)+o&&(i=!i)}return i}function p(e,t){return Math.abs(e[0]-t[0])<=a&&Math.abs(e[1]-t[1])<=a}function m(e){let t=e||[],n=1/0,r=1/0,i=-1/0,a=-1/0;for(let e of t){let t=e[0],o=e[1];!Number.isFinite(t)||!Number.isFinite(o)||(t<n&&(n=t),t>i&&(i=t),o<r&&(r=o),o>a&&(a=o))}return{minX:n,minY:r,maxX:i,maxY:a}}function h(e,t){return!(!e||!t||e.maxX<=t.minX+a||e.minX>=t.maxX-a||e.maxY<=t.minY+a||e.minY>=t.maxY-a)}function g(e,t,n){return(t[0]-e[0])*(n[1]-e[1])-(t[1]-e[1])*(n[0]-e[0])}function _(e,t,n){return d(n[0],n[1],e[0],e[1],t[0],t[1])}function v(e,t,n,r){let i=g(e,t,n),o=g(e,t,r),s=g(n,r,e),c=g(n,r,t),l=Math.abs(i)<=a?0:i>0?1:-1,u=Math.abs(o)<=a?0:o>0?1:-1,d=Math.abs(s)<=a?0:s>0?1:-1,f=Math.abs(c)<=a?0:c>0?1:-1;return!!(l!==0&&u!==0&&d!==0&&f!==0&&l!==u&&d!==f||l===0&&_(e,t,n)&&!p(n,e)&&!p(n,t)||u===0&&_(e,t,r)&&!p(r,e)&&!p(r,t)||d===0&&_(n,r,e)&&!p(e,n)&&!p(e,r)||f===0&&_(n,r,t)&&!p(t,n)&&!p(t,r))}function y(e,t,n){let r=m(e);if(!Number.isFinite(r.minX))return!1;for(let i=0;i<t.length;i++){if(i===n)continue;let a=t[i];if(Array.isArray(a.coordinates))for(let t=0;t<a.coordinates.length;t++){let n=a.coordinates[t];if(!Array.isArray(n)||n.length===0)continue;let i=n[0];if(h(r,m(i))){for(let t of e)if(f(t,i))return!0;for(let t of i)if(f(t,e))return!0;for(let t=0;t<e.length;t++){let n=e[t],r=e[(t+1)%e.length];for(let e=0;e<i.length;e++){let t=i[e],a=i[(e+1)%i.length];if(v(n,r,t,a))return!0}}}}}return!1}for(let e=0;e<i.length;e++){let t=i[e];if(!Array.isArray(t.coordinates))continue;let n=t.coordinates,r=[];for(let e=0;e<n.length;e++){let t=n[e];if(!Array.isArray(t)||t.length===0)continue;let i=t[0];if(!Array.isArray(i)||i.length===0)continue;let s=1/0,c=1/0,u=-1/0,d=-1/0;for(let e=0;e<i.length;e++){let t=i[e],n=t[0],r=t[1];n<s&&(s=n),r<c&&(c=r),n>u&&(u=n),r>d&&(d=r)}if(!(s<=o.minX+a&&c<=o.minY+a&&u>=o.maxX-a&&d>=o.maxY-a)){r.push(t);continue}let p=!0;for(let e=0;e<l.length;e++){let t=l[e];if(!f(t,i)){p=!1;break}}p||r.push(t)}t.coordinates=r}for(let e=1;e<i.length;e++){let t=i[e-1],n=new Map,r=!1;if(Array.isArray(t.coordinates)){let a=t.coordinates;for(let t=0;t<a.length&&!r;t++){let n=a[t];if(!Array.isArray(n)||n.length===0)continue;let o=n[0],s=m(o);for(let t=0;t<i.length&&!r;t++){if(t===e-1)continue;let n=i[t];if(Array.isArray(n.coordinates))for(let e=0;e<n.coordinates.length;e++){let t=n.coordinates[e];if(!Array.isArray(t)||t.length===0)continue;let i=t[0];if(h(s,m(i)))for(let e=0;e<o.length&&!r;e++){let t=o[e],n=o[(e+1)%o.length];for(let e=0;e<i.length;e++){let a=i[e],o=i[(e+1)%i.length];if(v(t,n,a,o)){r=!0;break}}}}}}if(!r)for(let e=0;e<a.length;e++){let t=a[e];if(Array.isArray(t))for(let e=1,r=t.length;e<r;e++){let r=t[e],i=Wr(r);i&&!n.has(i)&&n.set(i,r)}}}if(n.size===0)continue;let a=i[e];if(!Array.isArray(a.coordinates))continue;let o=a.coordinates;for(let t=0;t<o.length;t++){let r=o[t];if(!Array.isArray(r)||r.length===0)continue;let a=r[0],s=Wr(a);if(!n.has(s))continue;let c=n.get(s).slice(),l=Array.isArray(r[0])?r[0].map(e=>[e[0],e[1]]):r[0];y(l,i,e);let u=Array.isArray(c)?c.map(e=>[e[0],e[1]]):c;r[0]=u,y(u,i,e)&&(r[0]=l)}}let b=Array(i.length);for(let e=0;e<i.length;e++){let t=i[e];if(t.valueMax>r)continue;let n={valueMin:t.value,valueMax:t.valueMax,bandIndex:e},a;a=!Array.isArray(t.coordinates)||t.coordinates.length===0?{type:t.type,coordinates:t.coordinates}:t.coordinates.length===1?{type:`Polygon`,coordinates:t.coordinates[0]}:{type:`MultiPolygon`,coordinates:t.coordinates},b[e]={type:`Feature`,geometry:a,properties:n}}return{type:`FeatureCollection`,features:b}}async function Kr({point:e,direction:t=`from`,mode:n=`car`,costField:r=`distance`,graph:i,maxCost:a=1e3,snapMaxDistM:o=800,penalties:s={}}={}){if(!i||!(i.nodes instanceof Map)||!Array.isArray(i.edges))throw Error(`Invalid graph: expected object with nodes Map and edges array.`);if(!Array.isArray(e)||e.length!==2)throw Error(`Invalid point: expected [lng, lat]`);let c,l,u=Ze(e,i,[o],o);if(!u||!u.segmentSnap)throw Error(`Point did not project to any graph segment within snapMaxDistM`);c=Ye(i,u.segmentSnap),c.mode=n,l=c._lastAddedNodeId??c.nodes.size-1;let d=st(c,r,s),{distances:f,reachable:p}=De(d,l,a,{outputUnscaled:!0,direction:t,mode:n});if(!p||p.length===0)throw Error(`isoPHAST returned no reachable nodes within maxCost`);let m=d.coordsArr||[],h=[],g=Te(0,a,7).filter(e=>e<a);g.shift(),g.push(a),g.sort((e,t)=>e-t);for(let e=0;e<f.length;e++){let t=f[e];if(!Number.isFinite(t)||t>a*1.1)continue;let n=m[e];!n||n.length<2||h.push([n[0],n[1],t])}return h.length===0?{type:`FeatureCollection`,features:[]}:Gr(h,g)}self.addEventListener(`message`,async e=>{let t=e.data;if(!t||typeof t!=`object`)return;let{type:n,id:r,payload:i}=t;if(n===`compute`){try{let e=await Kr(i);self.postMessage({type:`result`,id:r,result:e})}catch(e){let t={message:e?.message?String(e.message):String(e||`Error`),stack:e?.stack??null,code:e?.code??null};self.postMessage({type:`error`,id:r,error:t})}return}if(n===`dispose`)try{self.close()}catch{}})})();", Ds = typeof self < "u" && self.Blob && new Blob(["(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", Es], { type: "text/javascript;charset=utf-8" });
function Os(e) {
	let t;
	try {
		if (t = Ds && (self.URL || self.webkitURL).createObjectURL(Ds), !t) throw "";
		let n = new Worker(t, { name: e?.name });
		return n.addEventListener("error", () => {
			(self.URL || self.webkitURL).revokeObjectURL(t);
		}), n;
	} catch {
		return new Worker("data:text/javascript;charset=utf-8," + encodeURIComponent(Es), { name: e?.name });
	}
}
//#endregion
//#region src/ui/MapLibreRoutingControl.core.js
var ks = /* @__PURE__ */ s({
	buildGraphGeoJSON: () => Gs,
	fmtDistance: () => Vs,
	fmtTime: () => Hs,
	formatDuration: () => Bs,
	formatEngineBadgeName: () => Us,
	getEngineBadgeIcon: () => Ws,
	getRouteDistance: () => Ls,
	handleRouteFailure: () => Js,
	haversineMeters: () => Is,
	lngLatToStr: () => zs,
	parseCoords: () => Rs,
	tryIsoline: () => Ks,
	tryRoute: () => qs
});
function As(e) {
	if (e._isolineWorker) return e._isolineWorker;
	if (typeof Worker > "u") return null;
	try {
		let t;
		if (typeof Os == "function") t = new Os();
		else if (Os && typeof Os.addEventListener == "function") t = Os;
		else throw Error("Isoline worker import is not a constructor or instance");
		return t.addEventListener("message", (t) => {
			let n = t.data;
			if (!n || typeof n != "object") return;
			let { type: r, id: i, result: a, error: o } = n;
			try {
				let t = e._isolinePendingRequests && e._isolinePendingRequests.get(i);
				if (!t) return;
				r === "result" ? t.resolve(a) : t.reject(Object.assign(Error(o?.message || "Isoline worker error"), { code: o?.code }));
			} finally {
				e._isolinePendingRequests && e._isolinePendingRequests.delete(i);
			}
		}), t.addEventListener("error", (t) => {
			let n = Error(t?.message ?? "Isoline worker error");
			if (e._isolinePendingRequests) for (let [t, r] of e._isolinePendingRequests) {
				try {
					r.reject(n);
				} catch {}
				e._isolinePendingRequests.delete(t);
			}
		}), e._isolineWorker = t, e._isolinePendingRequests = e._isolinePendingRequests || /* @__PURE__ */ new Map(), t;
	} catch (e) {
		return console.warn("[omt-router] isoline worker unavailable, falling back to main-thread", e), null;
	}
}
async function js(e, t) {
	if (e._isolinePendingRequests || (e._isolinePendingRequests = /* @__PURE__ */ new Map()), e._isolinePendingRequests.size) for (let [t, n] of e._isolinePendingRequests) {
		try {
			n.reject(/* @__PURE__ */ Error("isoline cancelled"));
		} catch {}
		e._isolinePendingRequests.delete(t);
	}
	let n = As(e);
	if (!n) return Ts(t);
	let r = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`, i = new Promise((t, n) => {
		e._isolinePendingRequests.set(r, {
			resolve: t,
			reject: n
		});
	});
	try {
		let e = [], i = t, a = t && t.graph;
		if (a && typeof a == "object") {
			let n = {};
			for (let t of Object.keys(a)) {
				let r = a[t];
				if (ArrayBuffer.isView(r) && r.buffer) try {
					let i = r.slice();
					n[t] = i, e.push(i.buffer);
				} catch {
					n[t] = r;
				}
				else n[t] = r;
			}
			i = {
				...t,
				graph: n
			};
		}
		e.length ? n.postMessage({
			type: "compute",
			id: r,
			payload: i
		}, e) : n.postMessage({
			type: "compute",
			id: r,
			payload: i
		});
	} catch (t) {
		throw e._isolinePendingRequests.delete(r), t;
	}
	return i;
}
var Ms = Object.freeze({
	"ultra-dijkstra": "UltraDijkstra",
	"bidirectional-astar": "Bidirectional A★",
	"adaptive-barrier": "Adaptive Barrier",
	"delta-stepping": "Delta Stepping",
	cpu: "CPU"
}), Ns = Object.freeze({
	parallel: "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3\"/><path d=\"M12 19v3\"/><path d=\"M2 12h3\"/><path d=\"M19 12h3\"/><path d=\"m4.9 4.9 2.2 2.2\"/><path d=\"m16.9 16.9 2.2 2.2\"/><path d=\"m16.9 7.1 2.2-2.2\"/><path d=\"m4.9 19.1 2.2-2.2\"/></svg>",
	cpu: "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"1\"/><path d=\"M10 7V4\"/><path d=\"M14 7V4\"/><path d=\"M10 20v-3\"/><path d=\"M14 20v-3\"/><path d=\"M7 10H4\"/><path d=\"M7 14H4\"/><path d=\"M20 10h-3\"/><path d=\"M20 14h-3\"/></svg>"
}), Ps = Math.PI / 180, Fs = 6371e3;
function Is(e, t) {
	let [n, r] = e, [i, a] = t, o = (a - r) * Ps, s = (i - n) * Ps, c = r * Ps, l = a * Ps, u = Math.sin(o / 2), d = Math.sin(s / 2), f = u * u + Math.cos(c) * Math.cos(l) * d * d;
	return 2 * Fs * Math.asin(Math.sqrt(f));
}
function Ls(e) {
	let t = 0;
	for (let n = 1; n < e.length; n++) t += Is(e[n - 1], e[n]);
	return t;
}
function Rs(e) {
	let [t, n] = String(e || "").split(",").map((e) => parseFloat(e.trim()));
	return !Number.isFinite(t) || !Number.isFinite(n) || t < -90 || t > 90 || n < -180 || n > 180 ? null : [n, t];
}
function zs({ lng: e, lat: t }) {
	return `${t.toFixed(6)}, ${e.toFixed(6)}`;
}
function Bs(e) {
	if (e < 1) return "< 1 min";
	if (e < 60) return `${e} min`;
	let t = Math.floor(e / 60), n = e % 60;
	return n > 0 ? `${t} h ${n} min` : `${t} h`;
}
function Vs(e) {
	return e < 1e3 ? `${Math.round(e)} m` : `${(e / 1e3).toFixed(1)} km`;
}
function Hs(e, t) {
	return Bs(Math.round(e / 1e3 / ({
		car: 50,
		pedestrian: 5,
		bicycle: 15
	}[t] ?? 50) * 60));
}
function Us(e) {
	return Ms[e] || e;
}
function Ws(e) {
	return e ? Ns.parallel : Ns.cpu;
}
function Gs(e) {
	let t = e?.nodes;
	if (!e?.nodes || !e?.edges?.length) return {
		type: "FeatureCollection",
		features: []
	};
	let n = [];
	for (let r of e.edges) {
		let e = t.get(r.source), i = t.get(r.target);
		!e || !i || n.push({
			type: "Feature",
			geometry: {
				type: "LineString",
				coordinates: [e.coords, i.coords]
			},
			properties: {}
		});
	}
	return {
		type: "FeatureCollection",
		features: n
	};
}
async function Ks(e) {
	if (!e._mounted || !e._isoline || !e._isoline.point) return;
	if (e._setupRouteSource(), !e._map?.getSource(e._options.isolineSourceId)) {
		e._setStatus(e._text.status.waitingStyle || "Waiting for map style", "loading");
		return;
	}
	if (!e._urlTemplate && e._tileJsonUrl) try {
		await e._loadTileTemplate();
	} catch {
		e._setStatus(e._text.status?.tileMetadata || "Tile metadata error", "error");
		return;
	}
	let t = ++e._calcId;
	try {
		try {
			e._cancelRunningEngine?.("isoline_cancelled");
		} catch {}
		e._setStatus(`<span class="rp-spinner"></span>${e._text.status?.calculatingIsoline || "Calculating isoline"}`, "loading");
		let n = [e._isoline.point[0], e._isoline.point[1]], r = null;
		try {
			let t = {
				car: 65,
				bicycle: 15,
				pedestrian: 5
			}[e._mode] ?? 65, i = e._costField === "travelTime" || e._costField === "optimal" ? Number(e._isoline.maxCost) * (t / 3.6) : Number(e._isoline.maxCost), a = Number(e._options.isolineTileSearchMultiplier ?? 1.6), o = Number(e._options.isolineTileSearchExtraMeters ?? 200), s = Math.max(i * a, i + o);
			r = await Nc(T(n[0], n[1], 14, s, "zxy").map((t) => ({
				...t,
				url: Dc(e._urlTemplate, t, {
					tileUrlTransform: e._tileUrlTransform,
					tileProxyTemplate: e._tileProxyTemplate
				})
			})), e._mode, {
				zoom: 14,
				schema: "zxy",
				urlTemplate: e._urlTemplate ?? "",
				tileProxyTemplate: e._tileProxyTemplate ?? "",
				tileUrlTransform: e._tileUrlTransform
			});
		} catch {
			r = (await e._routeFunction(n, n, e._mode, e._urlTemplate, {
				costField: e._costField,
				includeGraph: !0,
				maxAcceptableSnapDistanceM: e._routeOptions.maxAcceptableSnapDistanceM,
				penalties: e._routeOptions.penalties,
				tileUrlTransform: e._tileUrlTransform,
				tileProxyTemplate: e._tileProxyTemplate
			})).graph ?? null;
		}
		if (t !== e._calcId) return;
		if (!r) {
			e._setStatus(e._text.status?.noGraph || "Graph unavailable", "error");
			return;
		}
		if (r?.hasMissingTiles) {
			e._setStatus(e._text.status?.tileCors || e._text.status?.noGraph || "Missing tiles", "error");
			return;
		}
		let i = null;
		try {
			i = await js(e, {
				point: n,
				direction: e._isoline.direction,
				mode: e._mode,
				costField: e._costField,
				graph: r,
				maxCost: e._isoline.maxCost,
				snapMaxDistM: e._routeOptions.maxAcceptableSnapDistanceM,
				penalties: e._routeOptions.penalties
			});
		} catch (r) {
			if (t !== e._calcId) return;
			try {
				let a = await e._routeFunction(n, n, e._mode, e._urlTemplate, {
					costField: e._costField,
					includeGraph: !0,
					maxAcceptableSnapDistanceM: e._routeOptions.maxAcceptableSnapDistanceM,
					penalties: e._routeOptions.penalties,
					tileUrlTransform: e._tileUrlTransform,
					tileProxyTemplate: e._tileProxyTemplate
				});
				if (t !== e._calcId) return;
				let o = a.graph ?? null;
				if (o) {
					if (i = await js(e, {
						point: n,
						direction: e._isoline.direction,
						mode: e._mode,
						costField: e._costField,
						graph: o,
						maxCost: e._isoline.maxCost,
						snapMaxDistM: e._routeOptions.maxAcceptableSnapDistanceM,
						penalties: e._routeOptions.penalties
					}), t !== e._calcId) return;
				} else throw r;
			} catch {
				throw r;
			}
		}
		if (t !== e._calcId) return;
		let a = i;
		a || (a = {
			type: "FeatureCollection",
			features: []
		}), a.type === "Feature" && (a = {
			type: "FeatureCollection",
			features: [a]
		});
		let o = e._map.getSource(e._options.isolineSourceId);
		if (o && typeof o.setData == "function") {
			o.setData(a);
			try {
				let t = Array.isArray(a.features) ? a.features.map((e) => Number(e?.properties?.valueMax ?? e?.properties?.break)).filter(Number.isFinite) : [], n = 0, r = 1;
				t.length && (n = Math.min(...t), r = Math.max(...t), n === r && (n -= 1e-6, r += 1e-6));
				let i = e._isoline.direction === "from" ? e._options.startColor : e._options.endColor, o = e._isoline.direction === "from" ? e._options.endColor : e._options.startColor, s = [
					"interpolate-hcl",
					["linear"],
					["get", "valueMax"],
					n,
					i,
					r,
					o
				];
				e._map && typeof e._map.getLayer == "function" && (e._map.getLayer(e._options.isolineFillLayerId) && (e._map.setPaintProperty(e._options.isolineFillLayerId, "fill-color", s), e._map.setPaintProperty(e._options.isolineFillLayerId, "fill-outline-color", s), e._map.setLayoutProperty(e._options.isolineFillLayerId, "fill-sort-key", ["-", ["get", "valueMax"]])), e._map.getLayer(e._options.isolineOutlineLayerId) && e._map.setPaintProperty(e._options.isolineOutlineLayerId, "text-color", s));
			} catch {}
			try {
				e._centerMapOnSource(e._options.isolineSourceId, {
					padding: 100,
					maxZoom: 16,
					duration: 600
				});
			} catch {}
		}
		e._setStatus("", "");
	} catch (n) {
		if (t !== e._calcId) return;
		console.error("[omt-router] isoline error", n);
		try {
			let t = e._map?.getSource(e._options.isolineSourceId);
			t && typeof t.setData == "function" && t.setData({
				type: "FeatureCollection",
				features: []
			});
		} catch {}
		e._mounted && e._setStatus(e._text.status?.noRoute || "Isoline failed", "error");
	}
}
async function qs(e) {
	if (!e._mounted || !e._origin || !e._dest) return;
	if (e._setupRouteSource(), !e._map?.getSource(e._options.routeSourceId)) {
		e._setStatus(e._text.status.waitingStyle, "loading");
		return;
	}
	if (!e._urlTemplate) {
		if (e._tileJsonUrl && (await e._loadTileTemplate(), !e._mounted)) return;
		if (!e._urlTemplate) {
			e._setStatus(e._text.status.tileUrl, "error"), e._clearRoute();
			return;
		}
	}
	let t = ++e._calcId;
	e._hideStats(), e._clearRoute(), e._clearGraph(), e._setStatus(`<span class="rp-spinner"></span>${e._text.status.calculating}`, "loading");
	let n = !1, r = setTimeout(() => {
		n = !0, e._cancelRunningEngine?.(`timeout_${e._routeTimeoutMs}ms`);
	}, e._routeTimeoutMs);
	try {
		let n = await e._routeFunction(e._origin, e._dest, e._mode, e._urlTemplate, {
			costField: e._costField,
			tileUrlTransform: e._tileUrlTransform,
			tileProxyTemplate: e._tileProxyTemplate,
			includeGraph: e._options.showGraph,
			...e._routeOptions
		});
		if (!e._mounted || t !== e._calcId) return;
		if (!n.found || !n.coordinates?.length) {
			e._handleRouteFailure(n);
			return;
		}
		e._map.getSource(e._options.routeSourceId).setData({
			type: "Feature",
			geometry: {
				type: "LineString",
				coordinates: n.coordinates
			},
			properties: {}
		}), e._options.showGraph && (n.graph ? e._map.getSource(e._options.graphSourceId).setData(Gs(n.graph)) : e._clearGraph());
		let r = n.coordinates;
		if (r.length > 0) {
			let t = r[0], n = r[r.length - 1];
			e._origin = t, e._dest = n, e._placeMarker("origin", t), e._placeMarker("dest", n), e._originInput.value = zs({
				lng: t[0],
				lat: t[1]
			}), e._destInput.value = zs({
				lng: n[0],
				lat: n[1]
			});
		}
		r.length > 1 && (console.log("[dbg] requesting _centerMapOnSource (route)", e._options.routeSourceId, !!e._map?.getSource?.(e._options.routeSourceId), "coords.length=", r.length), e._centerMapOnSource(e._options.routeSourceId, {
			padding: 100,
			maxZoom: 16,
			duration: 600
		})), e._showStats(n), e._setStatus("");
	} catch (r) {
		if (!e._mounted || t !== e._calcId) return;
		if (console.error("[omt-router] routing error:", r), r?.code === "engine_cancelled") e._setStatus(n ? e._text.status.timedOut : e._text.status.cancelled, "error");
		else {
			let t = r?.message || (typeof r == "string" ? r : e._text.status.unknownError ?? "Unknown routing error");
			e._setStatus(`${e._text.status.routeErrorPrefix} ${t}`, "error");
		}
		e._clearRoute(), e._clearGraph();
	} finally {
		clearTimeout(r);
	}
}
function Js(e, t) {
	switch (console.warn("[omt-router] route failed:", t), t?.reason) {
		case H.TILE_CORS:
			e._setStatus(e._text.status.tileCors, "error");
			break;
		case H.POOR_SNAP:
			e._setStatus(e._text.status.poorSnap, "error");
			break;
		case H.NO_NODE:
			e._setStatus(e._text.status.noNode, "error");
			break;
		case H.NO_PATH:
			e._setStatus(e._text.status.noPath, "error");
			break;
		case H.INCOMPLETE_PATH:
			e._setStatus(e._text.status.incompletePath, "error");
			break;
		default:
			e._setStatus(e._text.status.noRoute, "error");
			break;
	}
	e._clearRoute(), e._clearGraph();
}
//#endregion
//#region src/ui/MapLibreRoutingControl.ui.js
function Ys(e) {
	let t = `

      <div class="rp-modes" style="--rp-columns:3">
        <button type="button" class="rp-mode-btn" data-mode="pedestrian" aria-pressed="false" title="${e._text.modeTitles.pedestrian}">
          <span class="rp-mode-icon">🚶</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes.pedestrian}</span><span class="rp-label-visible">${e._text.modes.pedestrian}</span></span>
        </button>
        <button type="button" class="rp-mode-btn active" data-mode="car" aria-pressed="true" title="${e._text.modeTitles.car}">
          <span class="rp-mode-icon">🚗</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes.car}</span><span class="rp-label-visible">${e._text.modes.car}</span></span>
        </button>
        <button type="button" class="rp-mode-btn" data-mode="bicycle" aria-pressed="false" title="${e._text.modeTitles.bicycle}">
          <span class="rp-mode-icon">🚲</span>
          <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes.bicycle}</span><span class="rp-label-visible">${e._text.modes.bicycle}</span></span>
        </button>
      </div>

      <div class="rp-section">
        <div class="rp-modes rp-costs" style="--rp-columns:3">
          <button type="button" class="rp-cost-btn active" data-cost-field="distance" aria-pressed="true" title="${e._text.costTitles.distance}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels.distance}</span><span class="rp-label-visible">${e._text.costLabels.distance}</span></span>
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="travelTime" aria-pressed="false" title="${e._text.costTitles.travelTime}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels.travelTime}</span><span class="rp-label-visible">${e._text.costLabels.travelTime}</span></span>
          </button>
          <button type="button" class="rp-cost-btn" data-cost-field="optimal" aria-pressed="false" title="${e._text.costTitles.optimal}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels.optimal}</span><span class="rp-label-visible">${e._text.costLabels.optimal}</span></span>
          </button>
        </div>
        <div class="rp-inputs">
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--origin" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-origin" type="text" placeholder="${e._text.originPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="rp-swap-wrap">
            <button type="button" class="rp-swap-btn" id="rp-swap-btn" title="${e._text.reverseRoute}" aria-label="${e._text.reverseRoute}"><span class="rp-btn-label"><span class="rp-label-measure">⇅</span><span class="rp-label-visible">⇅</span></span></button>
          </div>
          <div class="rp-input-row">
            <svg class="rp-point-icon rp-point-icon--dest" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-dest" type="text" placeholder="${e._text.destinationPlaceholder}" autocomplete="off" spellcheck="false" />
          </div>
        </div>
      </div>

      <div class="rp-hint">
        <span class="rp-hint-item"><span class="rp-hint-key">${e._text.leftClick}</span> ${e._text.setOrigin}</span>
        <span class="rp-hint-sep">·</span>
        <span class="rp-hint-item"><span class="rp-hint-key">${e._text.rightClick}</span> ${e._text.setDestination}</span>
      </div>

      <div class="rp-stats" id="rp-stats" hidden>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-dist">—</span>
          <span class="rp-stat-label" id="rp-stat-dist-label">${e._text.stats.distance}</span>
        </div>
        <div class="rp-stat-divider"></div>
        <div class="rp-stat">
          <span class="rp-stat-value" id="rp-stat-time">—</span>
          <span class="rp-stat-label" id="rp-stat-time-label">${e._text.stats.estTime}</span>
        </div>
      </div>

      <div class="rp-engine" id="rp-engine" hidden></div>
      <div class="rp-status" id="rp-status" role="status" aria-live="polite" hidden></div>
    `, n = e._costField === "travelTime" || e._costField === "optimal" ? Math.round((Number(e._isoline.maxCost) || 0) / 60) : Number(e._isoline.maxCost) || 0, r = e._costField === "travelTime" || e._costField === "optimal" ? "min" : "m", i = `
      <div class="rp-section" id="rp-isoline-controls">

        <div class="rp-modes">
          <button type="button" class="rp-mode-btn ${e._mode, ""}" data-mode="pedestrian" aria-pressed="false" title="${e._text.modeTitles?.pedestrian || ""}">
            <span class="rp-mode-icon">🚶</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes?.pedestrian || "Pedestrian"}</span><span class="rp-label-visible">${e._text.modes?.pedestrian || "Pedestrian"}</span></span>
          </button>
          <button type="button" class="rp-mode-btn ${e._mode === "car" ? "active" : ""}" data-mode="car" aria-pressed="${e._mode === "car" ? "true" : "false"}" title="${e._text.modeTitles?.car || ""}">
            <span class="rp-mode-icon">🚗</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes?.car || "Car"}</span><span class="rp-label-visible">${e._text.modes?.car || "Car"}</span></span>
          </button>
          <button type="button" class="rp-mode-btn ${e._mode, ""}" data-mode="bicycle" aria-pressed="false" title="${e._text.modeTitles?.bicycle || ""}">
            <span class="rp-mode-icon">🚲</span>
            <span class="rp-mode-label rp-btn-label"><span class="rp-label-measure">${e._text.modes?.bicycle || "Bicycle"}</span><span class="rp-label-visible">${e._text.modes?.bicycle || "Bicycle"}</span></span>
          </button>
        </div>

        
        <div class="rp-modes rp-costs" style="--rp-columns:3">
          <button type="button" class="rp-cost-btn ${e._costField === "distance" ? "active" : ""}" data-cost-field="distance" aria-pressed="${e._costField === "distance" ? "true" : "false"}" title="${e._text.costTitles?.distance || ""}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels?.distance || "Distance"}</span><span class="rp-label-visible">${e._text.costLabels?.distance || "Distance"}</span></span>
          </button>
          <button type="button" class="rp-cost-btn ${e._costField === "travelTime" ? "active" : ""}" data-cost-field="travelTime" aria-pressed="${e._costField === "travelTime" ? "true" : "false"}" title="${e._text.costTitles?.travelTime || ""}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels?.travelTime || "Time"}</span><span class="rp-label-visible">${e._text.costLabels?.travelTime || "Time"}</span></span>
          </button>
          <button type="button" class="rp-cost-btn ${e._costField === "optimal" ? "active" : ""}" data-cost-field="optimal" aria-pressed="${e._costField === "optimal" ? "true" : "false"}" title="${e._text.costTitles?.optimal || ""}">
            <span class="rp-btn-label"><span class="rp-label-measure">${e._text.costLabels?.optimal || "Optimal"}</span><span class="rp-label-visible">${e._text.costLabels?.optimal || "Optimal"}</span></span>
          </button>
        </div>

        <div class="rp-modes rp-costs" style="--rp-columns:2">
          <button type="button" class="rp-isoline-direction-btn ${e._isoline && e._isoline.direction === "from" ? "active" : ""}" data-direction="from" aria-pressed="${e._isoline && e._isoline.direction === "from" ? "true" : "false"}"><span class="rp-btn-label"><span class="rp-label-measure">${e._text.isoline?.from || "From"}</span><span class="rp-label-visible">${e._text.isoline?.from || "From"}</span></span></button>
          <button type="button" class="rp-isoline-direction-btn ${e._isoline && e._isoline.direction === "to" ? "active" : ""}" data-direction="to" aria-pressed="${e._isoline && e._isoline.direction === "to" ? "true" : "false"}"><span class="rp-btn-label"><span class="rp-label-measure">${e._text.isoline?.to || "To"}</span><span class="rp-label-visible">${e._text.isoline?.to || "To"}</span></span></button>
        </div>

        <div class="rp-inputs">
          <div class="rp-input-row">
            <svg class="rp-point-icon ${e._isoline.direction === "to" ? "rp-point-icon--dest" : "rp-point-icon--origin"}" viewBox="0 0 10 10">
              <circle cx="5" cy="5" r="4.5"/>
            </svg>
            <input id="rp-isoline-point" type="text" placeholder="${e._text.isoline?.pointPlaceholder || "lat, lng"}" autocomplete="off" spellcheck="false" />
          </div>
          <div class="rp-input-row">
            <input id="rp-isoline-threshold" type="number" min="0" value="${n}" />
            <span id="rp-isoline-threshold-unit" class="rp-threshold-unit">${r}</span>
          </div>
        </div>
      </div>
      <div class="rp-hint">${e._text.isoline?.hint || ""}</div>
      <div class="rp-status" id="rp-status-isoline" role="status" aria-live="polite" hidden></div>
    `;
	if (e._features === "both") {
		let n = e._activeTab === "routing", r = e._activeTab === "isoline";
		return `
        <div class="rp-modes" style="--rp-columns:2">
          <button type="button" id="rp-tab-routing" class="rp-tab-btn ${n ? "active" : ""}"><span class="rp-btn-label"><span class="rp-label-measure">${e._text.tabs?.routing || "Routing"}</span><span class="rp-label-visible">${e._text.tabs?.routing || "Routing"}</span></span></button>
          <button type="button" id="rp-tab-isoline" class="rp-tab-btn ${r ? "active" : ""}"><span class="rp-btn-label"><span class="rp-label-measure">${e._text.tabs?.isolines || "Isolines"}</span><span class="rp-label-visible">${e._text.tabs?.isolines || "Isolines"}</span></span></button>
        </div>
        <div id="rp-routing-panel" ${n ? "" : "hidden"}>
          ${t}
        </div>
        <div id="rp-isoline-panel" ${r ? "" : "hidden"}>
          ${i}
        </div>
      `;
	}
	return e._features === "isolines" ? `${e._text.title ? `<span class="rp-title">${e._text.title}</span>` : ""}${i}` : t;
}
function Xs(e) {
	try {
		let t = e._panel && e._panel.querySelector ? e._panel.querySelector("#rp-isoline-panel") : null;
		if (!t) return;
		let n = t.querySelector("#rp-isoline-threshold"), r = t.querySelector("#rp-isoline-threshold-unit");
		if (!n || !r) return;
		e._costField === "travelTime" || e._costField === "optimal" ? (r.textContent = "min", n.value = Number.isFinite(e._isoline.maxCost) ? Math.round(e._isoline.maxCost / 60) : "") : (r.textContent = "m", n.value = Number.isFinite(e._isoline.maxCost) ? e._isoline.maxCost : "");
	} catch {}
}
function Zs(e, t) {
	if (!e._statsEl || !e._statDistEl || !e._statTimeEl || !e._statDistLabelEl || !e._statTimeLabelEl || !e._engineBadgeEl) {
		console.warn("[omt-router] skipping stats update because the control panel is not mounted");
		return;
	}
	let n = t.costField === "distance" ? t.cost : Qs(t.coordinates), r = t.costField === "distance" ? Hs(n, e._mode) : $s(t.cost), i = t.engine ?? "cpu", a = !!t.parallelUsed;
	e._statDistEl.textContent = Vs(n), e._statTimeEl.textContent = r, e._statDistLabelEl.textContent = e._text.stats.distance, e._statTimeLabelEl.textContent = e._costField === "distance" ? e._text.stats.estTime : e._text.stats.travelTime, e._statsEl.hidden = !1, e._engineBadgeEl.className = `rp-engine ${a ? "rp-engine--parallel" : "rp-engine--cpu"}`;
	let o = e._text.costLabels[e._costField] ?? e._text.costLabels.distance, s = Us(i);
	e._engineBadgeEl.innerHTML = `${Ws(a)}${s} · ${o}`, e._engineBadgeEl.hidden = !1;
}
function Qs(e) {
	if (!Array.isArray(e) || e.length < 2) return 0;
	let t = 0;
	for (let n = 1; n < e.length; n++) {
		let r = e[n - 1], i = e[n], a = (i[1] - r[1]) * (Math.PI / 180), o = (i[0] - r[0]) * (Math.PI / 180), s = r[1] * (Math.PI / 180), c = i[1] * (Math.PI / 180), l = Math.sin(a / 2), u = Math.sin(o / 2), d = l * l + Math.cos(s) * Math.cos(c) * u * u;
		t += 2 * 6371e3 * Math.asin(Math.sqrt(d));
	}
	return t;
}
function $s(e) {
	return Bs(Math.round(e / 60));
}
function ec(e) {
	try {
		if (!e || !e._panel) return;
		let t = e._panel.querySelector("#rp-routing-panel"), n = e._panel.querySelector("#rp-isoline-panel"), r = [];
		t && r.push(t), n && r.push(n), r.forEach((t) => {
			t.querySelectorAll(".rp-mode-btn").forEach((t) => {
				let n = t.dataset.mode === e._mode;
				t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
			}), t.querySelectorAll(".rp-cost-btn").forEach((t) => {
				let n = t.dataset.costField === e._costField;
				t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
			}), t.querySelectorAll(".rp-isoline-direction-btn").forEach((t) => {
				let n = e._isoline && t.dataset.direction === e._isoline.direction;
				t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
			});
		}), Xs(e);
	} catch {}
}
function tc(e, t) {
	try {
		if (!e || !e._panel) return;
		if (t === "routing") {
			let t = e._options.isolineMaxCost, n = Number.isFinite(Number(t)) ? Number(t) : e._costField === "travelTime" || e._costField === "optimal" ? 900 : 100;
			e._isoline = e._isoline || {
				point: null,
				direction: "from",
				maxCost: n
			}, e._isoline.point = null, e._isoline.direction = "from", e._isoline.maxCost = n;
			let r = e._panel.querySelector("#rp-isoline-panel");
			if (r) {
				let t = r.querySelector("#rp-isoline-point");
				t && (t.value = "");
				let n = r.querySelector("#rp-isoline-threshold"), i = r.querySelector("#rp-isoline-threshold-unit");
				n && i && (e._costField === "travelTime" || e._costField === "optimal" ? (i.textContent = "min", n.value = Number.isFinite(e._isoline.maxCost) ? Math.round(e._isoline.maxCost / 60) : "") : (i.textContent = "m", n.value = Number.isFinite(e._isoline.maxCost) ? e._isoline.maxCost : "")), r.querySelectorAll(".rp-isoline-direction-btn").forEach((e) => {
					let t = e.dataset.direction === "from";
					e.classList.toggle("active", t), e.setAttribute("aria-pressed", t ? "true" : "false");
				});
				let a = r.querySelector(".rp-point-icon");
				a && a.classList && (a.classList.toggle("rp-point-icon--origin", !0), a.classList.toggle("rp-point-icon--dest", !1));
				let o = r.querySelector("#rp-status-isoline") || e._statusElIsoline;
				o && (o.textContent = "", o.hidden = !0, o.className = "rp-status");
			}
		} else if (t === "isoline") {
			e._origin = null, e._dest = null, e._originInput && (e._originInput.value = ""), e._destInput && (e._destInput.value = ""), e._statsEl && (e._statsEl.hidden = !0), e._engineBadgeEl && (e._engineBadgeEl.hidden = !0);
			let t = e._statusEl || null;
			t && (t.textContent = "", t.hidden = !0, t.className = "rp-status");
		}
	} catch {}
}
//#endregion
//#region src/ui/MapLibreRoutingControl.map.js
function nc(e) {
	e._map && (e._map.getSource(e._options.routeSourceId) || (e._routeSourceStyleLoadHandler = () => {
		!e._mounted || !e._map || e._map.getSource(e._options.routeSourceId) || (e._map.addSource(e._options.routeSourceId, {
			type: "geojson",
			lineMetrics: !0,
			data: {
				type: "FeatureCollection",
				features: []
			}
		}), e._map.addLayer({
			id: e._options.routeCasingLayerId,
			type: "line",
			source: e._options.routeSourceId,
			paint: {
				"line-color": "#ffffff",
				"line-width": 10,
				"line-opacity": .5
			},
			layout: {
				"line-cap": "round",
				"line-join": "round"
			}
		}), e._options.showGraph && (e._map.addSource(e._options.graphSourceId, {
			type: "geojson",
			data: {
				type: "FeatureCollection",
				features: []
			}
		}), e._map.addLayer({
			id: e._options.graphLayerId,
			type: "line",
			source: e._options.graphSourceId,
			paint: {
				"line-color": "#00ff00",
				"line-width": 2,
				"line-opacity": .9
			},
			layout: {
				"line-cap": "round",
				"line-join": "round"
			}
		})), e._map.addLayer({
			id: e._options.routeLayerId,
			type: "line",
			source: e._options.routeSourceId,
			paint: {
				"line-color": e._options.startColor,
				"line-gradient": [
					"interpolate-hcl",
					["linear"],
					["line-progress"],
					0,
					e._options.startColor,
					1,
					e._options.endColor
				],
				"line-width": 4,
				"line-opacity": .9
			},
			layout: {
				"line-cap": "round",
				"line-join": "round"
			}
		}), e._map.getSource(e._options.isolineSourceId) || (e._map.addSource(e._options.isolineSourceId, {
			type: "geojson",
			data: {
				type: "FeatureCollection",
				features: []
			}
		}), e._map.addLayer({
			id: e._options.isolineFillLayerId,
			type: "fill",
			source: e._options.isolineSourceId,
			paint: {
				"fill-color": e._options.startColor,
				"fill-outline-color": e._options.startColor,
				"fill-opacity": .2
			},
			layout: { "fill-sort-key": ["-", ["get", "valueMax"]] }
		}), e._map.addLayer({
			id: e._options.isolineOutlineLayerId,
			type: "symbol",
			source: e._options.isolineSourceId,
			layout: {
				"symbol-placement": "point",
				"text-field": ["to-string", ["get", "valueMax"]],
				"text-font": ["Open Sans Regular"],
				"text-size": 12
			},
			paint: {
				"text-color": e._options.startColor,
				"text-halo-color": "#ffffff",
				"text-halo-width": 1
			}
		})), e._origin && e._dest && e._tryRoute?.());
	}, e._map.isStyleLoaded() ? e._routeSourceStyleLoadHandler() : e._map.once("load", e._routeSourceStyleLoadHandler)));
}
function rc(e) {
	for (let t of [
		e._options.routeLayerId,
		e._options.routeCasingLayerId,
		e._options.graphLayerId,
		e._options.isolineOutlineLayerId,
		e._options.isolineFillLayerId
	]) e._map.getLayer(t) && e._map.removeLayer(t);
	for (let t of [
		e._options.routeSourceId,
		e._options.graphSourceId,
		e._options.isolineSourceId
	]) e._map.getSource(t) && e._map.removeSource(t);
}
function ic(e, t, n) {
	if (e._markers[t]) {
		e._markers[t].setLngLat(n);
		return;
	}
	let r = document.createElement("div");
	r.className = `rp-map-dot rp-map-dot--${t}`, r.style.backgroundColor = t === "origin" ? e._options.startColor : e._options.endColor;
	let i = new e._maplibre.Marker({
		element: r,
		draggable: !0
	}).setLngLat(n).addTo(e._map);
	e._markers[t] = i, i.on("dragstart", () => {
		e._suppressNextMapPointerSet = !0, r.classList.add("is-dragging");
	}), i.on("dragend", () => {
		r.classList && typeof r.classList.remove == "function" && r.classList.remove("is-dragging");
		let n = i.getLngLat(), a = [n.lng, n.lat];
		t === "origin" ? (e._origin = a, e._originInput && (e._originInput.value = `${n.lat.toFixed(6)}, ${n.lng.toFixed(6)}`)) : (e._dest = a, e._destInput && (e._destInput.value = `${n.lat.toFixed(6)}, ${n.lng.toFixed(6)}`)), e._tryRoute?.();
	});
}
function ac(e, t) {
	let n = [t[0], t[1]], r = e._isoline.direction === "from" ? e._options.startColor : e._options.endColor;
	if (e._markers.isoline) {
		e._markers.isoline.setLngLat(n);
		try {
			let t = e._markers.isoline.getElement();
			t && t.style && (t.style.background = r);
			try {
				let t = e._panel.querySelector("#rp-isoline-panel .rp-point-icon");
				t && t.classList && (t.classList.toggle("rp-point-icon--origin", e._isoline.direction === "from"), t.classList.toggle("rp-point-icon--dest", e._isoline.direction === "to"));
			} catch {}
		} catch {}
		return;
	}
	let i = document.createElement("div");
	i.className = "rp-map-dot", i.style.background = r;
	let a = new e._maplibre.Marker({
		element: i,
		draggable: !0
	}).setLngLat(n).addTo(e._map);
	e._markers.isoline = a;
	try {
		let t = e._panel.querySelector("#rp-isoline-panel .rp-point-icon");
		t && t.classList && (t.classList.toggle("rp-point-icon--origin", e._isoline.direction === "from"), t.classList.toggle("rp-point-icon--dest", e._isoline.direction === "to"));
	} catch {}
	a.on("dragstart", () => {
		e._suppressNextMapPointerSet = !0, i.classList.add("is-dragging");
	}), a.on("dragend", () => {
		i.classList && typeof i.classList.remove == "function" && i.classList.remove("is-dragging");
		let t = a.getLngLat();
		e._isoline.point = [t.lng, t.lat], e._isolinePointInput && (e._isolinePointInput.value = `${t.lat.toFixed(6)}, ${t.lng.toFixed(6)}`);
		try {
			e._routeFunction([t.lng, t.lat], [t.lng, t.lat], e._mode, e._urlTemplate, {
				costField: e._costField,
				includeGraph: !0,
				maxAcceptableSnapDistanceM: e._routeOptions.maxAcceptableSnapDistanceM,
				penalties: e._routeOptions.penalties,
				tileUrlTransform: e._tileUrlTransform,
				tileProxyTemplate: e._tileProxyTemplate
			});
		} catch {}
		e._tryIsoline?.();
	});
}
function oc(e) {
	if (!e._map) return;
	let t = e._map.getSource(e._options.isolineSourceId);
	t && typeof t.setData == "function" && t.setData({
		type: "FeatureCollection",
		features: []
	}), e._markers.isoline && (e._markers.isoline.remove(), e._markers.isoline = null);
}
function sc(e) {
	!e._map || !e._map.getSource(e._options.routeSourceId) || e._map.getSource(e._options.routeSourceId).setData({
		type: "FeatureCollection",
		features: []
	});
}
function cc(e) {
	!e._map || !e._map.getSource(e._options.graphSourceId) || e._map.getSource(e._options.graphSourceId).setData({
		type: "FeatureCollection",
		features: []
	});
}
async function lc(e, t, n = {
	padding: 50,
	maxZoom: 16
}) {
	if (!(!e._map || !t)) try {
		let r = await e._map.getSource(t).getBounds();
		e._map.fitBounds(r, n);
	} catch (e) {
		console.warn(`Failed to center map on source ${t}`, e);
	}
}
//#endregion
//#region src/ui/MapLibreRoutingControl.js
var uc = {
	defaultMode: "car",
	defaultCostField: "distance",
	theme: "light",
	panelClassName: "",
	routeTimeoutMs: 2e4,
	routeSourceId: "omtr-route-source",
	routeCasingLayerId: "omtr-route-casing",
	routeLayerId: "omtr-route-line",
	graphSourceId: "omtr-graph-source",
	graphLayerId: "omtr-graph-line",
	showGraph: !1,
	mapPosition: "top-left",
	startColor: "#2563eb",
	endColor: "#dc2626",
	features: "both",
	isolineSourceId: "omtr-isoline-source",
	isolineFillLayerId: "omtr-isoline-fill",
	isolineOutlineLayerId: "omtr-isoline-outline",
	isolineTileSearchMultiplier: 1.6,
	isolineTileSearchExtraMeters: 200,
	locale: "auto",
	routeOptions: {
		maxAutoRadius: 8,
		maxAcceptableSnapDistanceM: 60
	}
};
Object.freeze({
	"ultra-dijkstra": "UltraDijkstra",
	"bidirectional-astar": "Bidirectional A★",
	"adaptive-barrier": "Adaptive Barrier",
	"delta-stepping": "Delta Stepping",
	cpu: "CPU"
}), Object.freeze({
	parallel: "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v3\"/><path d=\"M12 19v3\"/><path d=\"M2 12h3\"/><path d=\"M19 12h3\"/><path d=\"m4.9 4.9 2.2 2.2\"/><path d=\"m16.9 16.9 2.2 2.2\"/><path d=\"m16.9 7.1 2.2-2.2\"/><path d=\"m4.9 19.1 2.2-2.2\"/></svg>",
	cpu: "<svg width=\"11\" height=\"11\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" aria-hidden=\"true\"><rect x=\"7\" y=\"7\" width=\"10\" height=\"10\" rx=\"1\"/><path d=\"M10 7V4\"/><path d=\"M14 7V4\"/><path d=\"M10 20v-3\"/><path d=\"M14 20v-3\"/><path d=\"M7 10H4\"/><path d=\"M7 14H4\"/><path d=\"M20 10h-3\"/><path d=\"M20 14h-3\"/></svg>"
});
var { haversineMeters: dc, getRouteDistance: fc, parseCoords: pc, lngLatToStr: mc, formatDuration: hc, fmtDistance: gc, fmtTime: _c, formatEngineBadgeName: vc, getEngineBadgeIcon: yc } = ks;
function bc(e, t) {
	let n = { ...e };
	for (let r in t) if (Object.prototype.hasOwnProperty.call(t, r)) {
		let i = t[r];
		i && typeof i == "object" && !Array.isArray(i) ? n[r] = bc(e[r] || {}, i) : n[r] = i;
	}
	return n;
}
function xc(e, t) {
	if (!t || typeof t != "object" || Array.isArray(t)) return e;
	let n = { ...e };
	for (let r in e) {
		if (!Object.prototype.hasOwnProperty.call(e, r) || !Object.prototype.hasOwnProperty.call(t, r)) continue;
		let i = e[r], a = t[r];
		i && typeof i == "object" && !Array.isArray(i) ? a && typeof a == "object" && !Array.isArray(a) ? n[r] = xc(i, a) : n[r] = i : typeof a == typeof i ? n[r] = a : n[r] = i;
	}
	return n;
}
var Sc = class {
	constructor(e = {}) {
		this._options = bc(uc, e), this._routeFunction = this._options.routeFunction ?? Mc, this._getEngineWorkerStatus = this._options.getEngineWorkerStatus ?? Cr, this._onEngineWorkerStatusChange = this._options.onEngineWorkerStatusChange ?? wr, this._cancelRunningEngine = this._options.cancelRunningEngine ?? Tr, this._tileJsonUrl = this._options.tileJsonUrl, this._urlTemplate = this._options.urlTemplate || null, this._tileUrlTransform = this._options.tileUrlTransform, this._tileProxyTemplate = this._options.tileProxyTemplate, this._routeOptions = { ...this._options.routeOptions }, this._routeTimeoutMs = Number(this._options.routeTimeoutMs), this._theme = String(this._options.theme ?? "auto").toLowerCase(), this._panelClassName = typeof this._options.panelClassName == "string" ? this._options.panelClassName.trim() : "";
		let t = this._options.locale ?? this._options.language, n = this._options.locale_override ?? this._options.localeOverride ?? (t && typeof t == "object" && !Array.isArray(t) ? t : void 0), r = zr(typeof t == "string" ? t : this._options.language ?? "auto");
		if (this._locale = r, this._text = n ? xc(Ir[r] ?? Ir.en, n) : Ir[r] ?? Ir.en, this._text.isoline = this._text.isoline || {}, this._text.tabs = this._text.tabs || {
			routing: this._text.title || "Routing",
			isolines: this._text.isoline.heading || "Isolines"
		}, this._maplibre = this._options.maplibre ?? (typeof window < "u" ? window.maplibregl : null), !this._maplibre || typeof this._maplibre.Marker != "function") throw Error("MapLibreRoutingControl requires a compatible maplibre instance via options.maplibre or window.maplibregl.");
		this._mode = this._options.defaultMode, this._costField = this._options.defaultCostField, this._origin = null, this._dest = null, this._map = null, this._panel = null, this._originInput = null, this._destInput = null, this._statusEl = null, this._statusElIsoline = null, this._statsEl = null, this._statDistEl = null, this._statTimeEl = null, this._engineBadgeEl = null, this._markers = {
			origin: null,
			dest: null,
			isoline: null
		}, this._calcId = 0, this._suppressNextMapPointerSet = !1, this._engineBusy = !1, this._unsubscribeEngineStatus = null, this._mapClickHandler = null, this._mapContextMenuHandler = null, this._routeSourceStyleLoadHandler = null, this._tileTemplatePromise = null, this._mounted = !1;
		let i = String(this._options.features ?? "both").toLowerCase().trim();
		i === "isoline" && (i = "isolines"), i === "route" && (i = "routing"), [
			"both",
			"isolines",
			"routing"
		].includes(i) || (i = "both"), this._features = i, this._activeTab = this._features === "isolines" ? "isoline" : "routing";
		let a = this._options.isolineMaxCost, o = Number.isFinite(Number(a)) ? Number(a) : this._costField === "travelTime" || this._costField === "optimal" ? 900 : 1e3;
		this._isoline = {
			point: null,
			direction: "from",
			maxCost: o
		}, this._isolineWorker = null, this._isolinePendingRequests = null;
	}
	_resolveThemeClass() {
		let e = String(this._theme ?? "auto").toLowerCase();
		return e === "dark" ? "routing-panel--theme-dark" : e === "light" ? "routing-panel--theme-light" : "routing-panel--theme-auto";
	}
	onAdd(e) {
		return this._mounted = !0, this._map = e, this._panel = document.createElement("div"), this._panel.className = "routing-panel", this._panel.classList.add(this._resolveThemeClass()), this._panelClassName && this._panel.classList.add(...this._panelClassName.split(/\s+/).filter(Boolean)), this._panel.dataset.theme = this._theme, this._panel.innerHTML = this._buildPanelMarkup(), this._originInput = this._panel.querySelector("#rp-origin"), this._destInput = this._panel.querySelector("#rp-dest"), this._statusEl = this._panel.querySelector("#rp-status"), this._statusElIsoline = this._panel.querySelector("#rp-status-isoline"), this._statsEl = this._panel.querySelector("#rp-stats"), this._statDistEl = this._panel.querySelector("#rp-stat-dist"), this._statTimeEl = this._panel.querySelector("#rp-stat-time"), this._statDistLabelEl = this._panel.querySelector("#rp-stat-dist-label"), this._statTimeLabelEl = this._panel.querySelector("#rp-stat-time-label"), this._engineBadgeEl = this._panel.querySelector("#rp-engine"), this._isolinePointInput = this._panel.querySelector("#rp-isoline-point"), this._isolineThresholdInput = this._panel.querySelector("#rp-isoline-threshold"), this._bindPanelEvents(), ec(this), this._setupRouteSource(), this._mapClickHandler = (e) => this._activeTab === "isoline" ? this.setIsolineFromMap(e.lngLat) : this.setOriginFromMap(e.lngLat), this._mapContextMenuHandler = (e) => {
			e.originalEvent?.preventDefault(), this._activeTab !== "isoline" && (this._consumeMapPointerSuppression() || this.setDestFromMap(e.lngLat));
		}, this._map.on("click", this._mapClickHandler), this._map.on("contextmenu", this._mapContextMenuHandler), this._onEngineWorkerStatusChange && (this._unsubscribeEngineStatus = this._onEngineWorkerStatusChange((e) => {
			this._engineBusy = !!e.running;
		}), this._engineBusy = !!this._getEngineWorkerStatus?.().running), this._tileJsonUrl && !this._urlTemplate && this._loadTileTemplate().catch((e) => {
			console.error("[omt-router] tile metadata load failed:", e), this._setStatus(this._text.status.tileMetadata, "error");
		}), this._panel;
	}
	onRemove() {
		this._mounted = !1, this._unsubscribeEngineStatus?.(), this._unsubscribeEngineStatus = null, this._engineBusy && this._cancelRunningEngine?.("routing_control_removed"), this._map && (this._mapClickHandler && (this._map.off("click", this._mapClickHandler), this._mapClickHandler = null), this._mapContextMenuHandler && (this._map.off("contextmenu", this._mapContextMenuHandler), this._mapContextMenuHandler = null), this._routeSourceStyleLoadHandler && (this._map.off("load", this._routeSourceStyleLoadHandler), this._routeSourceStyleLoadHandler = null)), Object.values(this._markers).forEach((e) => e?.remove()), this._markers = {
			origin: null,
			dest: null,
			isoline: null
		}, this._map && this._removeRouteLayers(), this._panel?.remove(), this._map = null;
		try {
			if (this._isolinePendingRequests) {
				for (let [e, t] of this._isolinePendingRequests) try {
					t.reject(/* @__PURE__ */ Error("control removed"));
				} catch {}
				this._isolinePendingRequests = null;
			}
		} catch {}
		try {
			if (this._isolineWorker) {
				try {
					this._isolineWorker.postMessage({ type: "dispose" });
				} catch {}
				try {
					this._isolineWorker.terminate();
				} catch {}
				this._isolineWorker = null;
			}
		} catch {}
		kc();
	}
	setOrigin(e) {
		this._origin = [e.lng, e.lat], this._originInput.value = mc(e), this._placeMarker("origin", this._origin), this._tryRoute();
	}
	setDest(e) {
		this._dest = [e.lng, e.lat], this._destInput.value = mc(e), this._placeMarker("dest", this._dest), this._tryRoute();
	}
	setOriginFromMap(e) {
		this._consumeMapPointerSuppression() || this.setOrigin(e);
	}
	setDestFromMap(e) {
		this._consumeMapPointerSuppression() || this.setDest(e);
	}
	setIsoline(e) {
		this._isoline.point = [e.lng, e.lat], this._isolinePointInput && (this._isolinePointInput.value = mc(e)), this._placeIsolineMarker(this._isoline.point), this._tryIsoline();
	}
	setIsolineFromMap(e) {
		this._consumeMapPointerSuppression() || this.setIsoline(e);
	}
	setUrlTemplate(e) {
		this._urlTemplate = e, this._tryRoute();
	}
	setTileJsonUrl(e) {
		this._tileJsonUrl = e, this._urlTemplate = null, this._tileTemplatePromise = null, this._loadTileTemplate().catch((e) => {
			console.error("[omt-router] tile metadata load failed:", e), this._setStatus(this._text.status.tileMetadata, "error");
		});
	}
	async _loadTileTemplate() {
		return this._tileJsonUrl ? (this._tileTemplatePromise || (this._tileTemplatePromise = fetch(this._tileJsonUrl).then((e) => {
			if (!e.ok) throw Error(`Tile metadata request failed: ${e.status} ${e.statusText}`);
			return e.json();
		}).then((e) => {
			if (!e || !Array.isArray(e.tiles) || e.tiles.length === 0) throw Error("Tile metadata response does not contain a valid tiles array.");
			return this._urlTemplate = e.tiles[0], this._origin && this._dest && this._tryRoute(), this._urlTemplate;
		})), this._tileTemplatePromise) : null;
	}
	_buildPanelMarkup() {
		return Ys(this);
	}
	_bindPanelEvents() {
		let e = this._panel.querySelector("#rp-routing-panel") || this._panel, t = e.querySelectorAll(".rp-mode-btn");
		t.forEach((e) => {
			e.addEventListener("click", () => {
				let n = e.dataset.mode;
				if (this._mode === n) {
					t.forEach((t) => {
						let n = t === e;
						t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
					}), ec(this);
					return;
				}
				this._mode = n, t.forEach((t) => {
					let n = t === e;
					t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
				}), ec(this), this._tryRoute();
			});
		});
		let n = e.querySelectorAll(".rp-cost-btn");
		n.forEach((e) => {
			e.addEventListener("click", () => {
				let t = e.dataset.costField;
				if (this._costField === t) {
					n.forEach((t) => {
						let n = t === e;
						t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
					}), ec(this);
					return;
				}
				this._costField = t, n.forEach((t) => {
					let n = t === e;
					t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
				}), ec(this), this._tryRoute();
			});
		}), this._originInput && this._originInput.addEventListener("change", () => {
			let e = pc(this._originInput.value);
			e && (this._origin = e, this._placeMarker("origin", e), this._tryRoute());
		}), this._destInput && this._destInput.addEventListener("change", () => {
			let e = pc(this._destInput.value);
			e && (this._dest = e, this._placeMarker("dest", e), this._tryRoute());
		});
		let r = this._panel.querySelector("#rp-swap-btn");
		r && r.addEventListener("click", () => {
			this._reverseRoute();
		}), this._panel.addEventListener("mousedown", (e) => e.stopPropagation()), this._panel.addEventListener("wheel", (e) => e.stopPropagation()), this._panel.addEventListener("contextmenu", (e) => e.stopPropagation());
		let i = this._panel.querySelector("#rp-tab-routing"), a = this._panel.querySelector("#rp-tab-isoline");
		i && a && (i.addEventListener("click", () => {
			i.classList.add("active"), a.classList.remove("active");
			let e = this._panel.querySelector("#rp-routing-panel"), t = this._panel.querySelector("#rp-isoline-panel");
			e && (e.hidden = !1), t && (t.hidden = !0), this._activeTab = "routing", this._clearIsoline(), ec(this), tc(this, "routing");
		}), a.addEventListener("click", () => {
			a.classList.add("active"), i.classList.remove("active");
			let e = this._panel.querySelector("#rp-routing-panel"), t = this._panel.querySelector("#rp-isoline-panel");
			e && (e.hidden = !0), t && (t.hidden = !1), this._activeTab = "isoline", this._clearRoute();
			try {
				this._markers.origin && (this._markers.origin.remove(), this._markers.origin = null);
			} catch {}
			try {
				this._markers.dest && (this._markers.dest.remove(), this._markers.dest = null);
			} catch {}
			ec(this), tc(this, "isoline");
		}));
		let o = this._panel.querySelectorAll(".rp-isoline-direction-btn");
		o.forEach((e) => {
			e.addEventListener("click", () => {
				let t = e.dataset.direction, n = this._isoline.direction === t;
				this._isoline.direction = t, o.forEach((t) => t.classList.toggle("active", t === e));
				let r = this._isoline.direction === "from" ? this._options.startColor : this._options.endColor;
				try {
					let e = this._markers.isoline;
					if (e && typeof e.getElement == "function") {
						let t = e.getElement();
						t && t.style && (t.style.background = r);
					}
				} catch {}
				try {
					let e = this._panel.querySelector("#rp-isoline-panel .rp-point-icon");
					e && e.classList && (e.classList.toggle("rp-point-icon--origin", this._isoline.direction === "from"), e.classList.toggle("rp-point-icon--dest", this._isoline.direction === "to"));
				} catch {}
				!n && this._isoline.point && this._tryIsoline();
			});
		});
		let s = this._panel.querySelector("#rp-isoline-point");
		s && s.addEventListener("change", () => {
			let e = pc(s.value || "");
			e && (this._isoline.point = e, this._placeIsolineMarker(e), this._tryIsoline());
		});
		let c = this._panel.querySelector("#rp-isoline-panel");
		if (c) {
			let e = c.querySelectorAll(".rp-mode-btn");
			e.forEach((t) => {
				t.addEventListener("click", () => {
					let n = t.dataset.mode;
					if (this._mode === n) {
						e.forEach((e) => {
							let n = e === t;
							e.classList.toggle("active", n), e.setAttribute("aria-pressed", n ? "true" : "false");
						}), ec(this);
						return;
					}
					this._mode = n, e.forEach((e) => {
						let n = e === t;
						e.classList.toggle("active", n), e.setAttribute("aria-pressed", n ? "true" : "false");
					}), ec(this), this._tryIsoline();
				});
			});
			let t = c.querySelectorAll(".rp-cost-btn");
			t.forEach((e) => {
				e.addEventListener("click", () => {
					let n = e.dataset.costField;
					if (this._costField === n) {
						t.forEach((t) => {
							let n = t === e;
							t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
						}), ec(this);
						return;
					}
					this._costField = n, t.forEach((t) => {
						let n = t === e;
						t.classList.toggle("active", n), t.setAttribute("aria-pressed", n ? "true" : "false");
					}), ec(this), this._tryIsoline();
				});
			});
			let n = c.querySelector("#rp-isoline-threshold");
			if (n) {
				let e = () => {
					let e = Number(n.value || 0);
					!Number.isFinite(e) || e < 0 || (this._costField === "travelTime" || this._costField === "optimal" ? this._isoline.maxCost = e * 60 : this._isoline.maxCost = e, this._tryIsoline());
				};
				n.addEventListener("input", e), n.addEventListener("change", e);
			}
		}
	}
	_updateIsolineThresholdUI() {
		return Xs(this);
	}
	_setupRouteSource() {
		return nc(this);
	}
	_removeRouteLayers() {
		return rc(this);
	}
	_placeMarker(e, t) {
		return ic(this, e, t);
	}
	_placeIsolineMarker(e) {
		return ac(this, e);
	}
	_clearIsoline() {
		return oc(this);
	}
	async _tryIsoline() {
		return Ks(this);
	}
	_consumeMapPointerSuppression() {
		return this._suppressNextMapPointerSet ? (this._suppressNextMapPointerSet = !1, !0) : !1;
	}
	_reverseRoute() {
		if (!this._origin && !this._dest) return;
		let e = this._origin;
		this._origin = this._dest, this._dest = e, this._origin && (this._originInput.value = `${this._origin[1].toFixed(6)}, ${this._origin[0].toFixed(6)}`, this._placeMarker("origin", this._origin)), this._dest && (this._destInput.value = `${this._dest[1].toFixed(6)}, ${this._dest[0].toFixed(6)}`, this._placeMarker("dest", this._dest)), this._tryRoute();
	}
	_setStatus(e, t = "") {
		let n = this._activeTab === "isoline" ? this._statusElIsoline || this._statusEl : this._statusEl || this._statusElIsoline;
		if (!n) return;
		let r = n === this._statusEl ? this._statusElIsoline : this._statusEl;
		n.className = `rp-status${t ? " " + t : ""}`, t === "loading" ? n.innerHTML = /rp-spinner/.test(String(e)) ? String(e) : `<span class="rp-spinner"></span>${String(e)}` : n.textContent = e, n.hidden = !e, r && r !== n && (r.textContent = "", r.hidden = !0, r.className = "rp-status");
	}
	_showStats(e) {
		return Zs(this, e);
	}
	_formatDurationSeconds(e) {
		return $s(e);
	}
	_hideStats() {
		this._statsEl.hidden = !0, this._engineBadgeEl.hidden = !0;
	}
	_clearRoute() {
		return sc(this);
	}
	_clearGraph() {
		return cc(this);
	}
	async _tryRoute() {
		return qs(this);
	}
	_handleRouteFailure(e) {
		return Js(this, e);
	}
	_buildGraphGeoJSON(e) {
		return Gs(e);
	}
	_centerMapOnSource(e, t = {
		padding: 100,
		maxZoom: 16,
		duration: 600
	}) {
		try {
			console.log("[dbg] _centerMapOnSource delegator called", {
				sourceId: e,
				mapPresent: !!this._map
			});
		} catch {}
		return lc(this, e, t);
	}
}, Cc = new b({
	maxEntries: 5e3,
	defaultTTL: 3e5
}), wc = new b({
	maxEntries: 50,
	defaultTTL: 3e5
}), Tc = new Set([
	"distance",
	"travelTime",
	"optimal"
]), Ec = Math.PI / 180;
function Dc(e, t, { tileUrlTransform: n, tileProxyTemplate: r } = {}) {
	let i = de(e, {
		z: t.z,
		x: t.x,
		y: t.y
	});
	if (typeof n == "function") {
		let e = n(i, t);
		if (typeof e != "string") throw Error("Invalid tileUrlTransform: expected a string return value.");
		return e;
	}
	return typeof r == "string" && r ? r.includes("{url}") ? de(r, {
		z: t.z,
		x: t.x,
		y: t.y,
		url: encodeURIComponent(i)
	}) : `${r}${encodeURIComponent(i)}` : i;
}
function Oc(e, t) {
	return e?.missingTileErrors?.find((e) => e?.code === t) ?? null;
}
function kc() {
	try {
		Er();
	} catch {}
	Cc.clear(), wc.clear(), Je();
}
var Ac = kc;
function jc(e, t, n) {
	let r = (e[1] + t[1]) / 2, i = 2 * Math.PI * 6371e3 * Math.cos(r * Ec) / 2 ** n, a = F(e, t), o = Math.max(600, a * .15);
	return Math.min(3, Math.max(1, Math.ceil(o / i)));
}
var Mc = async (e, t, n, r, { zoom: i = 14, schema: a = "zxy", radius: o, maxAutoRadius: s = 8, engineId: c = "auto", costField: l = "distance", penalties: u = {}, maxAcceptableSnapDistanceM: d, tileUrlTransform: f, tileProxyTemplate: p, includeGraph: m = !1 } = {}) => {
	if (Qe(e, "start"), Qe(t, "end"), n = $e(n), et(i), a = tt(a), nt(r), rt(d), o !== void 0 && (o = it(o)), !Tc.has(l)) throw Error(`Unknown costField: ${l}. Expected "distance", "travelTime", or "optimal".`);
	let h = at(u), g = o ?? jc(e, t, i), _ = Number(s), v = Math.max(g, Math.min(10, Number.isFinite(_) ? Math.floor(_) : 8)), y = qe(), b, x = null;
	function S(e) {
		let t = 2166136261;
		for (let n = 0; n < e.length; n++) {
			let r = e[n];
			for (let e = 0; e < r.length; e++) t ^= r.charCodeAt(e), t = t * 16777619 >>> 0;
		}
		return t.toString(16);
	}
	let C = /* @__PURE__ */ new Map();
	for (let o = g; o <= v; o++) {
		let s = w(e, t, i, o, a).map((e) => ({
			...e,
			url: Dc(r, e, {
				tileUrlTransform: f,
				tileProxyTemplate: p
			})
		})), u = C.get(o);
		u || (u = s.map((e) => `${e.z}/${e.x}/${e.y}`), u.sort(), C.set(o, u));
		let g = S(u), _ = typeof f == "function" ? null : `v3:${n}:${i}:${a}:${r}:${p ?? ""}:${g}`, T = _ ? wc.get(_) : null;
		T || (T = await Ae(s, n, {
			pool: y,
			cache: Cc
		}), _ && !T?.hasMissingTiles && wc.set(_, T)), x = T, b = await Fr(e, t, T, {
			costField: l,
			penalties: h,
			engineId: c,
			maxAcceptableSnapDistanceM: d
		});
		let E = {
			hasMissingTiles: T?.hasMissingTiles ?? !1,
			missingTileErrors: T?.missingTileErrors ?? []
		}, D = Oc(T, "MissingAllowOriginHeader");
		if (!b.found && D) return {
			...b,
			...E,
			reason: "tile_cors",
			code: "MissingAllowOriginHeader",
			message: D.message
		};
		if (b.found || b.reason !== "no_path" && b.reason !== "no_node" && b.reason !== "poor_snap" && b.reason !== "incomplete_path") return {
			...m ? {
				...b,
				graph: T
			} : b,
			...E
		};
		o < v && console.debug(`[omt-router] ${b.reason} at radius=${o}, retrying with radius=${o + 1}`);
	}
	let T = {
		hasMissingTiles: x?.hasMissingTiles ?? !1,
		missingTileErrors: x?.missingTileErrors ?? []
	};
	return {
		...m ? {
			...b,
			graph: x
		} : b,
		...T
	};
};
async function Nc(e, t, { zoom: n = 14, schema: r = "zxy", urlTemplate: i = "", tileProxyTemplate: a = "", tileUrlTransform: o, pool: s = qe() } = {}) {
	if (!Array.isArray(e)) throw Error("tiles must be an array");
	let c = e.map((e) => `${e.z}/${e.x}/${e.y}`);
	c.sort();
	let l = 2166136261;
	for (let e = 0; e < c.length; e++) {
		let t = c[e];
		for (let e = 0; e < t.length; e++) l ^= t.charCodeAt(e), l = l * 16777619 >>> 0;
	}
	let u = l.toString(16), d = typeof o == "function" ? null : `v3:${t}:${n}:${r}:${i}:${a ?? ""}:${u}`, f = d ? wc.get(d) : null;
	return f || (f = await Ae(e, t, {
		pool: s,
		cache: Cc
	}), d && !f?.hasMissingTiles && wc.set(d, f)), f;
}
//#endregion
export { Sc as MapLibreRoutingControl, Nr as buildCH, Nc as buildGraphForTiles, Dc as buildTileURL, Tr as cancelRunningEngine, Fr as computeRoute, kc as dispose, Cr as getEngineWorkerStatus, Ct as nearestNode, wr as onEngineWorkerStatusChange, Pr as queryRoute, Mc as route, Ac as shutdown };
