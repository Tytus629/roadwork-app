type Listener = () => void;

let listeners: Listener[] = [];
let tick = 0;

export function emitDbChanged() {
  tick++;
  for (const fn of listeners) fn();
}

export function subscribeDbChanged(fn: Listener) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((x) => x !== fn);
  };
}

export function getDbTick() {
  return tick;
}
