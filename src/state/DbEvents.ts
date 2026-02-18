/**
 * DbEvents.ts
 * 
 * PURPOSE:
 * Simple global event system for database change notifications.
 * Enables reactive UI updates when SQLite data changes anywhere in the app.
 * 
 * PROBLEM IT SOLVES:
 * - SQLite doesn't have built-in reactivity like Redux or MobX
 * - When component A updates a work order, component B (showing same data) needs to know
 * - Without this: Need to pass callbacks up/down component tree (prop drilling nightmare)
 * - With this: Any component can subscribe to DB changes and re-fetch
 * 
 * HOW IT WORKS:
 * 1. Service layer (workOrdersService.ts) calls emitDbChanged() after every write
 * 2. All subscribed listeners fire (usually React hooks)
 * 3. Hooks increment internal state → trigger useEffect → re-fetch from SQLite
 * 4. UI updates with latest data
 * 
 * USAGE IN HOOKS:
 * ```tsx
 * const [dbTick, setDbTick] = useState(0);
 * useEffect(() => {
 *   return subscribeDbChanged(() => setDbTick(getDbTick()));
 * }, []);
 * ```
 * 
 * USAGE IN SERVICES:
 * ```tsx
 * export function updateWorkOrder(args) {
 *   updateWorkOrderFields(args); // Write to SQLite
 *   emitDbChanged();             // Notify all hooks
 * }
 * ```
 * 
 * WHY NOT REDUX/MOBX:
 * - SQLite is source of truth, not in-memory state
 * - Don't want to duplicate data (SQLite + Redux = sync issues)
 * - This is simpler: ~20 lines vs 1000+ lines of Redux boilerplate
 * - Performance: Only re-fetch components that care about changed data
 * 
 * ALTERNATIVES CONSIDERED:
 * - React Context: Would cause entire tree to re-render on every change
 * - Event emitters (EventEmitter3): Overkill for single event type
 * - Polling: Wasteful, slow to update
 * - This solution: Lightweight, instant, React-friendly
 * 
 * MEMORY MANAGEMENT:
 * - subscribeDbChanged returns unsubscribe function
 * - useEffect cleanup calls unsubscribe → no memory leaks
 * - Hooks auto-cleanup when component unmounts
 */

type Listener = () => void;

let listeners: Listener[] = [];
let tick = 0;

/**
 * Emit a database change event.
 * Call this after every SQLite write operation.
 * All subscribed hooks will re-fetch their data.
 */
export function emitDbChanged() {
  tick++;
  for (const fn of listeners) fn();
}

/**
 * Subscribe to database change events.
 * Returns unsubscribe function - call in useEffect cleanup.
 */
export function subscribeDbChanged(fn: Listener) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

/**
 * Get current database change counter.
 * Increments on every emitDbChanged() call.
 * Used in useMemo keys to trigger re-computation.
 */
export function getDbTick() {
  return tick;
}
