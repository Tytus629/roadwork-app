export type SignAssetEntry = {
  signTypeId: string | null;
  signLabel: string;
  position: number;
  signCode?: string | null;
};

function trimToNull(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length ? text : null;
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function normalizeEntry(raw: unknown, fallbackPosition: number): SignAssetEntry | null {
  const rec = asObject(raw);
  if (!rec) return null;

  const signTypeId = trimToNull(rec.signTypeId ?? rec.id ?? rec.type);
  const signLabel =
    trimToNull(rec.signLabel ?? rec.label ?? rec.signName ?? rec.name ?? rec.signType) ??
    signTypeId;

  if (!signLabel) return null;

  const positionRaw = Number(rec.position);
  const position = Number.isFinite(positionRaw) && positionRaw > 0 ? Math.trunc(positionRaw) : fallbackPosition;

  return {
    signTypeId,
    signLabel,
    position,
    signCode: trimToNull(rec.signCode ?? rec.mutcdCode ?? rec.MUTCDCode),
  };
}

function toLegacySingleEntry(details: Record<string, any> | null): SignAssetEntry | null {
  if (!details) return null;

  const sign = asObject(details.sign);
  const signTypeId = trimToNull(details.signTypeId ?? sign?.signTypeId);
  const signLabel =
    trimToNull(details.signName ?? details.signType ?? sign?.signName ?? sign?.signType) ?? signTypeId;

  if (!signLabel) return null;

  return {
    signTypeId,
    signLabel,
    position: 1,
    signCode: trimToNull(details.signCode ?? details.mutcdCode ?? details.MUTCDCode ?? sign?.signCode),
  };
}

function normalizePositions(entries: SignAssetEntry[]): SignAssetEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    position: index + 1,
  }));
}

export function normalizeSignEntries(details: Record<string, any> | null | undefined): SignAssetEntry[] {
  const root = asObject(details);
  if (!root) return [];

  const signsRaw = Array.isArray(root.signs) ? root.signs : null;
  if (signsRaw && signsRaw.length) {
    const normalized = signsRaw
      .map((item, index) => normalizeEntry(item, index + 1))
      .filter((item): item is SignAssetEntry => !!item)
      .sort((a, b) => a.position - b.position);

    return normalizePositions(normalized);
  }

  const legacy = toLegacySingleEntry(root);
  return legacy ? [legacy] : [];
}

function dedupeKey(entry: SignAssetEntry): string {
  return `${String(entry.signTypeId ?? "").toLowerCase()}|${entry.signLabel.toLowerCase()}|${String(entry.signCode ?? "").toLowerCase()}`;
}

export function appendSignEntry(
  details: Record<string, any> | null | undefined,
  incoming: Omit<SignAssetEntry, "position">,
): Record<string, any> {
  const base = asObject(details) ? { ...(details as Record<string, any>) } : {};
  const existing = normalizeSignEntries(base);

  const nextEntry: SignAssetEntry = {
    signTypeId: trimToNull(incoming.signTypeId),
    signLabel: trimToNull(incoming.signLabel) ?? trimToNull(incoming.signTypeId) ?? "Unknown",
    signCode: trimToNull(incoming.signCode),
    position: existing.length + 1,
  };

  const existingKeys = new Set(existing.map(dedupeKey));
  if (!existingKeys.has(dedupeKey(nextEntry))) {
    existing.push(nextEntry);
  }

  const normalized = normalizePositions(existing);
  const first = normalized[0] ?? null;

  base.signs = normalized;

  // Backward-compat mirror for older readers.
  base.signTypeId = first?.signTypeId ?? null;
  base.signName = first?.signLabel ?? null;
  base.signCode = first?.signCode ?? null;
  base.sign = {
    ...(asObject(base.sign) ?? {}),
    signTypeId: first?.signTypeId ?? null,
    signName: first?.signLabel ?? null,
    signCode: first?.signCode ?? null,
  };

  return base;
}
