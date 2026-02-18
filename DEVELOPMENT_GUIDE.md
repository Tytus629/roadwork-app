# RoadWorkTracker - Development Guide

**Last Updated:** February 11, 2026  
**Purpose:** Comprehensive guide for new developers joining the project

---

## � Quick Start for New Developers

**Start by reading these extensively documented files (in order):**

1. **Database & Data Flow:**
   - `src/db/workOrdersRepo.ts` - Database schema, queries, spatial operations
   - `src/state/DbEvents.ts` - Event system for database reactivity
   - `src/services/workOrdersService.ts` - Service layer for all write operations

2. **React Hooks (Data Fetching):**
   - `src/hooks/useWorkOrder.ts` - Fetch single work order (with auto-refresh)
   - `src/hooks/useMapWorkOrders.ts` - Fetch bbox-filtered work orders for map
   - `src/hooks/useWorkOrdersFiltered.ts` - Fetch filtered work orders for list view

3. **Core Screens:**
   - `src/screens/MapScreen.tsx` - Interactive map with work order creation
   - `src/screens/WorkOrdersScreen.tsx` - List view with filterable work orders
   - `src/components/WorkItemSheet.tsx` - Work order detail/edit modal

4. **Supporting Components:**
   - `src/components/CreateWizardModal.tsx` - Multi-step work order creation wizard
   - `src/state/FilterContext.tsx` - Global filter state management

**Each file has a 40-60 line header comment explaining:**
- Purpose and responsibilities
- Data flow and integration points
- Architectural decisions (WHY, not just WHAT)
- Performance considerations
- Common pitfalls and best practices

---

## �📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [File Organization](#file-organization)
4. [Key Patterns & Conventions](#key-patterns--conventions)
5. [Adding New Features](#adding-new-features)
6. [Common Tasks](#common-tasks)
7. [Debugging Tips](#debugging-tips)

---

## 🏗️ Architecture Overview

### Technology Stack
- **Frontend:** React Native (TypeScript)
- **Database:** SQLite (via op-sqlite)
- **Navigation:** React Navigation (Stack + Bottom Tabs)
- **State:** Minimal Redux (logs only) + SQLite as source of truth
- **Maps:** react-native-maps (Google Maps)

### Core Principles
1. **SQLite is Source of Truth:** Never duplicate data in memory (Redux/Context)
2. **Reactivity via Events:** DbEvents system notifies UI of database changes
3. **Hooks for Data Access:** All SQLite reads go through custom hooks
4. **Service Layer for Writes:** All SQLite writes go through service functions
5. **Type Safety:** Full TypeScript coverage, no `any` without reason

---

## 🔄 Data Flow

### Read Path (Fetching Data)
```
Component → Custom Hook → Repository Function → SQLite → Return Data
           ↑
           └── Subscribes to DbEvents (auto-refetch on changes)
```

**Example: Displaying a work order**
```tsx
// Component (WorkItemSheet.tsx)
const wo = useWorkOrder(workItemId);

// Hook (useWorkOrder.ts)
useEffect(() => {
  return subscribeDbChanged(() => setDbTick(prev => prev + 1));
}, []);

// Repository (workOrdersRepo.ts)
const row = getWorkOrderById(id);

// Result: Component always shows fresh data
```

### Write Path (Updating Data)
```
Component → Service Function → Repository Function → SQLite
                ↓
         emitDbChanged()
                ↓
      All Subscribed Hooks → Re-fetch → UI Updates
```

**Example: Updating work order status**
```tsx
// Component
updateWorkOrder({ id: wo.id, status: 'In Progress' });

// Service (workOrdersService.ts)
export function updateWorkOrder(args) {
  updateWorkOrderFields(args);  // Write to SQLite
  emitDbChanged();              // Notify all hooks
}

// Repository (workOrdersRepo.ts)
db.executeSync('UPDATE work_orders SET status = ? WHERE id = ?', [status, id]);

// DbEvents (DbEvents.ts)
emitDbChanged() → All useWorkOrder hooks re-fetch → UI updates
```

---

## 📁 File Organization

```
src/
├── components/          # Reusable UI components
│   ├── WorkItemSheet.tsx         # Work order detail modal
│   ├── SignTypePickerModal.tsx   # Sign type search modal
│   ├── CreateWizardModal.tsx     # Work order creation wizard
│   └── ui/                       # Generic UI components (Button, Input, etc.)
│
├── constants/           # Static data and configuration
│   ├── signTypes.ts              # MUTCD sign type catalog
│   ├── workOrderTypes.ts         # Work order type definitions
│   └── filterOptions.ts          # Filter dropdown options
│
├── db/                  # Database layer
│   ├── db.ts                     # SQLite connection & initialization
│   ├── migrations.ts             # Schema migrations
│   ├── workOrdersRepo.ts         # Work order queries
│   ├── types.ts                  # Database TypeScript types
│   └── geom.ts                   # Spatial/bounding box utilities
│
├── hooks/               # Custom React hooks
│   ├── useWorkOrder.ts           # Fetch single work order by ID
│   ├── useMapWorkOrders.ts       # Fetch work orders in map bbox
│   ├── useActiveWorkOrders.ts    # Fetch non-Done work orders
│   └── useSignsNear.ts           # Fetch signs near GPS location
│
├── navigation/          # React Navigation configuration
│   ├── RootNavigator.tsx         # Stack navigator (modals)
│   └── AppTabs.tsx               # Bottom tab navigator
│
├── screens/             # Full-screen components
│   ├── MapScreen.tsx             # Interactive map
│   ├── WorkOrdersScreen.tsx      # Work order list with filters
│   ├── SignsMapScreen.tsx        # Signs "Near Me" list
│   └── SignsDueScreen.tsx        # Signs needing inspection
│
├── services/            # Business logic layer
│   ├── workOrdersService.ts      # Work order CRUD operations
│   └── notify.ts                 # Push notification service
│
├── state/               # Global state management
│   ├── DbEvents.ts               # Database change event system
│   ├── FilterContext.tsx         # Global filter state (Context API)
│   └── SignsContext.tsx          # Sign catalog loader
│
├── storage/             # Legacy (being phased out)
│   └── (old Redux-based files - DO NOT USE)
│
└── types/               # TypeScript type definitions
    ├── workItem.ts               # Work order types
    └── Sign.ts                   # Sign-related types
```

---

## 🎯 Key Patterns & Conventions

### 1. Database Schema

**work_orders table:**
```sql
CREATE TABLE work_orders (
  id TEXT PRIMARY KEY,              -- UUID
  type TEXT NOT NULL,               -- "Sign", "Pothole", "Striping", etc.
  createdAt INTEGER NOT NULL,       -- Epoch milliseconds
  updatedAt INTEGER NOT NULL,       -- Epoch milliseconds
  status TEXT NOT NULL,             -- "Needs", "In Progress", "Done", "Deferred"
  priority TEXT NOT NULL,           -- "Low", "Medium", "High", "Urgent"
  note TEXT,                        -- User-entered notes
  geomType TEXT NOT NULL,           -- "point" or "line"
  lat REAL,                         -- Latitude (for point geometry)
  lng REAL,                         -- Longitude (for point geometry)
  lineJson TEXT,                    -- JSON array of {lat, lng} (for line geometry)
  minLat REAL,                      -- Bounding box (for spatial queries)
  minLng REAL,
  maxLat REAL,
  maxLng REAL
);
```

**sign_details table:**
```sql
CREATE TABLE sign_details (
  workOrderId TEXT PRIMARY KEY,    -- FK to work_orders.id
  signTypeId TEXT,                  -- References SIGN_TYPES constant
  category TEXT,                    -- "Regulatory", "Warning", etc.
  condition TEXT,                   -- "Good", "Faded", "Damaged", "Missing"
  action TEXT,                      -- "Replace", "Repair", "Clean", "Install"
  reflectivityIssue INTEGER,        -- 0 or 1 (boolean)
  FOREIGN KEY(workOrderId) REFERENCES work_orders(id) ON DELETE CASCADE
);
```

### 2. Reactivity Pattern

**ALWAYS follow this pattern for reactive data:**

```tsx
// Hook implementation
export function useMyData(id: string) {
  const [data, setData] = useState(null);
  const [dbTick, setDbTick] = useState(0);

  // Subscribe to DB changes
  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  // Re-fetch when id or dbTick changes
  const key = useMemo(() => JSON.stringify({ id, dbTick }), [id, dbTick]);
  useEffect(() => {
    const result = fetchFromSQLite(id);
    setData(result);
  }, [key]);

  return data;
}
```

### 3. Service Layer Pattern

**NEVER write to SQLite directly from UI components:**

```tsx
// ❌ WRONG: Component writes to DB directly
function MyComponent() {
  const handleSave = () => {
    db.executeSync('UPDATE work_orders SET status = ? WHERE id = ?', [status, id]);
    // Forgot emitDbChanged() → other components won't update!
  };
}

// ✅ CORRECT: Use service function
function MyComponent() {
  const handleSave = () => {
    updateWorkOrder({ id, status });  // Service handles DB + events
  };
}
```

### 4. Type Safety

**All database operations use TypeScript types:**

```tsx
// types.ts
export type WorkStatus = "Needs" | "In Progress" | "Done" | "Deferred";
export type Priority = "Low" | "Medium" | "High" | "Urgent";

export interface WorkOrderRow {
  id: string;
  type: string;
  status: WorkStatus;    // Type-safe string literal
  priority: Priority;
  // ...
}
```

### 5. Filtering & Normalization

**Handle user input variations gracefully:**

```tsx
// User can type "Needs", "needs", "  NEEDS  ", etc.
function normKey(input: string): string {
  return input.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Case-insensitive filtering
const matches = types.filter(t => normKey(t) === normKey(userInput));
```

---

## ➕ Adding New Features

### Adding a New Work Order Type

**1. Add to constants/workOrderTypes.ts:**
```tsx
export const WORK_ORDER_TYPES = [
  'Sign',
  'Pothole',
  'YOUR_NEW_TYPE',  // Add here
] as const;
```

**2. Database automatically handles new types** (type is a TEXT column)

**3. Add icon/color (optional) in formatWorkType():**
```tsx
export function formatWorkType(type: WorkType): string {
  switch (type) {
    case 'YOUR_NEW_TYPE':
      return '🆕 Your New Type';
    default:
      return type;
  }
}
```

**4. Test creation flow:**
- Open CreateWizardModal
- Select your new type
- Place on map
- Verify it saves and displays correctly

### Adding a New Filter

**1. Update FilterContext.tsx:**
```tsx
export interface WorkOrderFilter {
  type?: string[];
  status?: string[];
  priority?: string[];
  yourNewFilter?: string[];  // Add here
}
```

**2. Update WorkOrdersScreen.tsx UI:**
```tsx
<Text style={styles.sectionTitle}>Your New Filter</Text>
<View style={styles.chipRow}>
  {YOUR_OPTIONS.map(opt => (
    <Chip
      key={opt}
      label={opt}
      active={filter.yourNewFilter?.includes(opt)}
      onPress={() => toggleFilter('yourNewFilter', opt)}
    />
  ))}
</View>
```

**3. Update workOrdersRepo.ts query:**
```tsx
function buildWhere(filter: WorkOrderFilter): string {
  const conditions: string[] = [];
  // ... existing conditions ...
  if (filter.yourNewFilter?.length) {
    conditions.push(/* SQL condition */);
  }
  return conditions.join(' AND ');
}
```

### Adding a New Screen

**1. Create screen file:**
```tsx
// src/screens/MyNewScreen.tsx
export default function MyNewScreen() {
  return <View><Text>My New Screen</Text></View>;
}
```

**2. Add to navigation:**
```tsx
// navigation/AppTabs.tsx (for bottom tab)
<Tab.Screen name="MyNew" component={MyNewScreen} />

// OR navigation/RootNavigator.tsx (for modal/stack screen)
<Stack.Screen name="MyNew" component={MyNewScreen} />
```

**3. Add navigation types:**
```tsx
// navigation/RootNavigator.tsx
export type RootStackParamList = {
  MainTabs: undefined;
  MyNew: { optionalParam?: string };  // Add here
};
```

**4. Navigate to it:**
```tsx
navigation.navigate('MyNew', { optionalParam: 'value' });
```

---

## 🔧 Common Tasks

### Task: Update Work Order Status

```tsx
// In component
import { updateWorkOrder } from '../services/workOrdersService';

const handleStatusChange = (newStatus: WorkStatus) => {
  updateWorkOrder({ id: workOrder.id, status: newStatus });
  // That's it! Hook will auto-refresh UI
};
```

### Task: Create a Point Work Order

```tsx
import { createPointWorkOrder } from '../services/workOrdersService';
import { uid } from '../utils/uid';

const createNew = async (lat: number, lng: number) => {
  const id = uid();  // Generate UUID
  createPointWorkOrder({
    id,
    type: 'Sign',
    status: 'Needs',
    priority: 'High',
    note: null,
    point: { lat, lng },
    createdAt: Date.now(),
  });
  // Work order now visible on map
};
```

### Task: Filter Work Orders

```tsx
// In WorkOrdersScreen or MapScreen
const { filter, setFilter } = useWorkOrderFilter();

// Toggle status filter
const toggleStatus = (status: WorkStatus) => {
  setFilter(prev => ({
    ...prev,
    status: prev.status?.includes(status)
      ? prev.status.filter(s => s !== status)
      : [...(prev.status || []), status],
  }));
};

// Clear all filters
setFilter({});
```

### Task: Query Signs Near GPS Location

```tsx
import { useSignsNear } from '../hooks/useSignsNear';

function SignsNearMe() {
  const location = { lat: 46.9965, lng: -120.5478 };
  const radiusMiles = 0.5;
  const signs = useSignsNear(location, radiusMiles);

  return (
    <FlatList
      data={signs}
      renderItem={({ item }) => <Text>{item.wo.type}</Text>}
    />
  );
}
```

---

## 🐛 Debugging Tips

### Issue: UI Not Updating After Database Change

**Checklist:**
1. Did service function call `emitDbChanged()`?
2. Does hook subscribe to `subscribeDbChanged()`?
3. Does hook depend on `dbTick` in useMemo/useEffect?
4. Check console for SQLite errors

**Fix:**
```tsx
// Make sure service emits event
export function myServiceFunction() {
  // ... database write ...
  emitDbChanged();  // ← Don't forget!
}
```

### Issue: Stale Data in Component

**Problem:** Component holding full object instead of just ID

**Solution:**
```tsx
// ❌ WRONG: Stores full object (can become stale)
const [workOrder, setWorkOrder] = useState<WorkOrderRow>(item);

// ✅ CORRECT: Store ID, let hook fetch live data
const [workOrderId, setWorkOrderId] = useState<string>(item.id);
const workOrder = useWorkOrder(workOrderId);
```

### Issue: Filters Not Working

**Check normalization:**
```tsx
// Ensure case-insensitive comparison
const normKey = (s: string) => s.trim().toLowerCase();
const matches = items.filter(item => 
  normKey(item.type) === normKey(filterValue)
);
```

### Issue: Map Pins Not Showing

**Checklist:**
1. Is bbox calculation correct? (regionToBBox in MapScreen)
2. Are work orders in visible region? (check minLat/maxLat in DB)
3. Is filter excluding them? (try clearing filters)
4. Check console: `[MapScreen] DB loaded X items in viewport`

---

## 📝 Code Review Checklist

Before submitting changes, verify:

- [ ] **Documentation:** Added comments explaining WHY, not just WHAT
- [ ] **Service Layer:** All DB writes go through service functions
- [ ] **DbEvents:** All service functions call `emitDbChanged()`
- [ ] **Type Safety:** No `any` types without comment explaining why
- [ ] **Hooks:** Custom hooks subscribe to `subscribeDbChanged()`
- [ ] **Error Handling:** SQLite errors caught and logged
- [ ] **Testing:** Manually tested creation, editing, deletion flows
- [ ] **Filters:** New filters work with existing normalization
- [ ] **Types:** Updated TypeScript types for new fields/tables

---

## 🎓 Further Reading

- **SQLite Documentation:** https://www.sqlite.org/docs.html
- **React Navigation:** https://reactnavigation.org/docs/getting-started
- **React Native Maps:** https://github.com/react-native-maps/react-native-maps
- **TypeScript:** https://www.typescriptlang.org/docs/

---

## ⚠️ Important Notes

### DO:
- ✅ Use hooks for all data fetching
- ✅ Use service functions for all data writes
- ✅ Subscribe to DbEvents in custom hooks
- ✅ Store IDs, not full objects, in component state
- ✅ Add comprehensive comments to new features

### DON'T:
- ❌ Write to SQLite directly from components
- ❌ Forget to call `emitDbChanged()` after writes
- ❌ Duplicate data between SQLite and Redux/Context
- ❌ Use `any` type without explanation
- ❌ Store full objects in component state (use IDs + hooks)

---

**Questions?** Check existing code for examples or ask team lead.

**Last Updated:** February 11, 2026
