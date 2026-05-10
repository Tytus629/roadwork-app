function makeRows(items) {
  const safeItems = Array.isArray(items) ? items : [];
  return {
    length: safeItems.length,
    item(index) {
      return safeItems[index];
    },
    _array: safeItems,
  };
}

function executeSync(sql) {
  const query = String(sql || "").toLowerCase();

  if (query.includes("select 1 as ok")) {
    return { rows: makeRows([{ ok: 1 }]) };
  }

  return { rows: makeRows([]) };
}

function open() {
  return {
    executeSync,
    close: () => undefined,
  };
}

module.exports = {
  open,
};
