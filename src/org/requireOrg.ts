// src/org/requireOrg.ts
//
// Guardrail assert: ensures orgId is always present before DB/API operations.
// Throws immediately if orgId is null/undefined/empty, preventing unscoped queries.

export function requireOrgId(orgId: string | null | undefined): string {
  const v = (orgId ?? "").trim();
  if (!v) throw new Error("orgId is required");
  return v;
}
