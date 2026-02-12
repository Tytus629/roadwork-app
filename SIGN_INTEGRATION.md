# Sign Asset Integration Guide

## Overview
This guide explains how to integrate the Sign Asset creation flow into your existing MapScreen or CreateScreen.

## Integration Steps

### 1. Import Required Components and Utilities

```typescript
import { useSignsContext } from "../state/SignsContext";
import { createSignAsset } from "../utils/createSignAsset";
import { SignDetailScreen } from "../screens/SignDetailScreen";
import type { SignType } from "../types/Sign";
```

### 2. Add State for Sign Creation Flow

```typescript
const { createSign } = useSignsContext();
const [selectedSign, setSelectedSign] = useState<SignAsset | null>(null);
const [showSignDetail, setShowSignDetail] = useState(false);
```

### 3. Handle Map Tap for Sign Creation

When user taps map and selects "Sign" as the work type:

```typescript
const handleCreateSign = (lat: number, lng: number, signType: SignType) => {
  // Create sign asset with defaults
  const signData = createSignAsset(signType, lat, lng);
  
  // Add to state and persist to DB
  const newSign = createSign(signData);
  
  // Open sign detail screen immediately
  setSelectedSign(newSign);
  setShowSignDetail(true);
};
```

### 4. Add Sign Type Selection UI

Add a sign type picker after user taps map (similar to work type selection):

```typescript
const signTypes: SignType[] = [
  "stop",
  "yield",
  "speed_limit",
  "warning",
  "street_name",
  "no_parking",
  "do_not_enter",
  "other",
];

// In your UI:
{showSignTypePicker && (
  <View>
    {signTypes.map((type) => (
      <Pressable
        key={type}
        onPress={() => handleCreateSign(tappedLat, tappedLng, type)}
      >
        <Text>{type.replace(/_/g, " ").toUpperCase()}</Text>
      </Pressable>
    ))}
  </View>
)}
```

### 5. Render Sign Detail Modal

```typescript
{showSignDetail && selectedSign && (
  <SignDetailScreen
    sign={selectedSign}
    onClose={() => {
      setShowSignDetail(false);
      setSelectedSign(null);
    }}
  />
)}
```

### 6. Show Signs on Map (Optional)

If you want to display existing signs as markers:

```typescript
import { useSignsContext } from "../state/SignsContext";

const { signs } = useSignsContext();

// In your map render:
{Object.values(signs).map((sign) => (
  <Marker
    key={sign.id}
    coordinate={{ latitude: sign.lat, longitude: sign.lng }}
    title={sign.signType.toUpperCase()}
    description={sign.mutcdCode || ""}
    onPress={() => {
      setSelectedSign(sign);
      setShowSignDetail(true);
    }}
  />
))}
```

## Example: Complete CreateScreen Integration

```typescript
import React, { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { useSignsContext } from "../state/SignsContext";
import { createSignAsset } from "../utils/createSignAsset";
import { SignDetailScreen } from "../screens/SignDetailScreen";
import type { SignType } from "../types/Sign";

export default function CreateScreen() {
  const { createSign } = useSignsContext();
  const [selectedSign, setSelectedSign] = useState(null);
  const [showSignDetail, setShowSignDetail] = useState(false);

  const handleCreateSignFromMap = (lat: number, lng: number, signType: SignType) => {
    const signData = createSignAsset(signType, lat, lng);
    const newSign = createSign(signData);
    setSelectedSign(newSign);
    setShowSignDetail(true);
  };

  return (
    <View>
      {/* Your existing UI */}
      
      {/* Sign Detail Modal */}
      {showSignDetail && selectedSign && (
        <SignDetailScreen
          sign={selectedSign}
          onClose={() => {
            setShowSignDetail(false);
            setSelectedSign(null);
          }}
        />
      )}
    </View>
  );
}
```

## Smoke Tests

1. **Create sign from map** ✓
   - Tap map → Select "Sign" type → Choose sign type
   - Sign detail screen opens with empty inspection history
   - Sign appears in Signs Due screen (180 days out)

2. **Add inspection** ✓
   - Open sign detail → "New Inspection" button
   - Fill form → Save
   - Inspection appears in history
   - Summary fields update (lastInspectionAt, lastResult, nextDueAt)

3. **Persistence** ✓
   - Create sign + add inspection
   - Restart app
   - If DB works: sign and inspections persist
   - If DB fails: app still runs, signs exist in memory for session

4. **Signs Due screen** ✓
   - Shows overdue signs (red)
   - Shows due soon signs (orange)
   - Tap sign → opens detail screen

## Notes

- All sign operations work offline-first
- DB failures are gracefully handled with console.warn
- Default inspection interval is 180 days (configurable in SignsContext.tsx)
- nextDueAt is automatically calculated when inspection is added
- needsSync flag is set to true for all new/updated signs
