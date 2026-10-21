# Development Standards & TODO

## 📝 Documentation Requirements

**CRITICAL: ALL new code must include comprehensive documentation!**

### For Every New File:
Add a header comment block explaining:
```tsx
/**
 * FileName.tsx
 * 
 * PURPOSE:
 * - What this file does
 * - Why it exists
 * 
 * KEY RESPONSIBILITIES:
 * - List main functions/features
 * 
 * DATA FLOW:
 * - How data moves through this component
 * 
 * USAGE EXAMPLE:
 * - Quick code snippet showing how to use
 */
```

### For Every New Feature:
1. **Add inline comments** explaining WHY decisions were made
2. **Update DEVELOPMENT_GUIDE.md** with new patterns
3. **Document in README.md** if user-facing
4. **Add TypeScript types** for all new data structures

### For Every New Function:
```tsx
/**
 * Short description of what function does
 * 
 * @param paramName - What this parameter is for
 * @returns What this function returns
 * 
 * USAGE:
 * const result = myFunction(value);
 */
function myFunction(paramName: string): ReturnType {
  // Implementation
}
```

---

## ✅ Code Review Checklist Template

Copy this checklist for every PR or feature branch:

```markdown
## Feature: [Name of Feature]

### Documentation ✅
- [ ] Added file header comment explaining purpose
- [ ] Added inline comments for complex logic
- [ ] Explained WHY, not just WHAT
- [ ] Updated DEVELOPMENT_GUIDE.md if new pattern
- [ ] Added TypeScript JSDoc comments for exports

### Architecture ✅
- [ ] DB writes go through service layer
- [ ] Service functions call emitDbChanged()
- [ ] Custom hooks subscribe to subscribeDbChanged()
- [ ] Components use hooks (not direct DB access)
- [ ] Type-safe (no 'any' without reason)

### Testing ✅
- [ ] Tested create flow
- [ ] Tested edit flow
- [ ] Tested delete flow
- [ ] Tested filters (if applicable)
- [ ] Tested on iOS
- [ ] Tested on Android
- [ ] Verified UI updates automatically

### Edge Cases ✅
- [ ] Handles null/undefined safely
- [ ] Handles empty arrays/objects
- [ ] Error messages shown to user
- [ ] Loading states implemented
- [ ] No memory leaks (useEffect cleanup)
```

---

## 🚨 REMINDER: Document AS You Code

**DO NOT:**
- ❌ Write code now, document later
- ❌ Assume code is self-documenting
- ❌ Skip comments because "it's obvious"

**DO:**
- ✅ Write comment FIRST explaining what you're about to build
- ✅ Add comments while writing complex logic
- ✅ Update docs when refactoring

**Think:** "If I left the company tomorrow, could someone else maintain this?"

---

## 📚 Documentation Examples

### Good Example:
```tsx
/**
 * useMapWorkOrders.ts
 * 
 * PURPOSE:
 * Fetch work orders visible in current map region with applied filters.
 * Auto-updates when user pans map or changes filters.
 * 
 * WHY BBOX PARAMETER:
 * Performance optimization - only fetches work orders in visible area.
 * Without this, would fetch ALL work orders (slow on large datasets).
 * 
 * REACTIVITY:
 * Subscribes to DbEvents → re-fetches when database changes anywhere.
 * Also re-fetches when bbox or filter props change.
 */
export function useMapWorkOrders(
  bbox: BBox | null,
  filter: WorkOrderFilter
): WorkOrderRow[] {
  // Implementation with inline comments
}
```

### Bad Example:
```tsx
// ❌ No documentation, unclear purpose
export function useMapWorkOrders(bbox, filter) {
  const [items, setItems] = useState([]);
  // ... code without comments ...
  return items;
}
```

---

## 🎯 Priority Documentation Areas

### High Priority (Document First):
1. **Service functions** - Business logic layer
2. **Custom hooks** - Data fetching pattern
3. **Database schema** - Structure and relationships
4. **Complex algorithms** - Spatial queries, filtering
5. **Reactivity system** - DbEvents pattern

### Medium Priority:
1. Screen components (what they display)
2. Utility functions (input → output)
3. Type definitions (what fields mean)
4. Navigation structure
5. Constants (where values come from)

### Lower Priority (Brief Comments OK):
1. Simple UI components
2. Style objects
3. Straightforward CRUD operations
4. Standard React patterns

---

## 🔄 Ongoing Maintenance

### Weekly:
- [ ] Review new code for missing documentation
- [ ] Update DEVELOPMENT_GUIDE.md if new patterns emerge
- [ ] Cleanup outdated comments

### Monthly:
- [ ] Review entire codebase for documentation gaps
- [ ] Update architecture diagrams if changed
- [ ] Verify examples in docs still work

### When Onboarding New Developer:
- [ ] Have them read DEVELOPMENT_GUIDE.md
- [ ] Pair program to demonstrate patterns
- [ ] Review their first PRs for documentation quality

---

## 📖 Documentation Templates

### New Service Function:
```tsx
/**
 * Create a [type] work order at [location type].
 * 
 * DEFAULT VALUES:
 * - Status: "Needs" (user can change immediately)
 * - Priority: "High" (adjustable based on urgency)
 * 
 * SIDE EFFECTS:
 * - Inserts row into work_orders table
 * - Emits DbEvents (triggers UI updates)
 * - Logs action to work_log table
 * 
 * @param args.id - UUID for work order (generate with uid())
 * @param args.type - Work order type ("Sign", "Pothole", etc.)
 * @param args.point - GPS coordinates {lat, lng}
 */
export function createPointWorkOrder(args: CreatePointArgs): void {
  // Implementation
}
```

### New Hook:
```tsx
/**
 * [Hook name]
 * 
 * PURPOSE:
 * [What data this hook fetches and why]
 * 
 * REACTIVITY:
 * - Subscribes to DbEvents
 * - Re-fetches when [specific triggers]
 * 
 * RETURNS:
 * [What structure is returned, null when, etc.]
 * 
 * USAGE:
 * ```tsx
 * const data = useMyHook(param);
 * if (!data) return <Loading />;
 * return <Display data={data} />;
 * ```
 */
export function useMyHook(param: string): DataType | null {
  // Implementation
}
```

### New Screen:
```tsx
/**
 * [ScreenName]Screen.tsx
 * 
 * PURPOSE:
 * [User-facing description of what this screen does]
 * 
 * NAVIGATION:
 * - Accessed from: [which tab/button]
 * - Can navigate to: [other screens]
 * 
 * STATE:
 * - [Key state variables and their purpose]
 * 
 * USER ACTIONS:
 * - [What user can do on this screen]
 */
export default function MyScreen() {
  // Implementation
}
```

---

## 💡 Tips for Good Documentation

### Write for Newcomers:
- Assume reader knows React/TypeScript, but NOT your codebase
- Explain domain-specific terms (bbox, work order, sign details)
- Link to external docs when referencing libraries

### Explain Decisions:
```tsx
// ❌ Bad: States WHAT without WHY
// Store ID instead of object
const [selectedId, setSelectedId] = useState<string | null>(null);

// ✅ Good: Explains WHY this pattern
// Store ID, not full object - prevents stale data when work order updates
// Hook will fetch live data from SQLite
const [selectedId, setSelectedId] = useState<string | null>(null);
```

### Use Examples:
```tsx
/**
 * Format work type for display
 * 
 * EXAMPLES:
 * - "Sign" → "🪧 Sign"
 * - "pothole" → "🕳️ Pothole" (capitalizes)
 * - "unknown" → "Unknown" (fallback)
 */
export function formatWorkType(type: string): string {
  // Implementation
}
```

---

## ⚡ Quick Reference

**Before committing:**
1. Read your own code as if you've never seen it
2. Add comments explaining WHY at decision points
3. Update relevant docs (DEVELOPMENT_GUIDE.md, README.md)
4. Run through code review checklist

**Remember:** 
- Future you will thank present you for good docs
- 10 minutes of documentation saves hours of debugging
- Code without context is just syntax

---

**Bookmark this file and reference it for EVERY new feature!**
