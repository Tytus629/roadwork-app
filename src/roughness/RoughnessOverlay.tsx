import React from "react";
import { Marker, Polyline } from "react-native-maps";
import { ROUGHNESS_COLORS, type RoughnessClass } from "./signal";
import type { DriveEventRow, DriveSegmentRow } from "../repositories/roughnessRepo";

export const EVENT_PIN_COLORS: Record<DriveEventRow["severity"], string> = {
  bump: "yellow",
  pothole: "orange",
  severe: "red",
};

type Props = {
  segments: DriveSegmentRow[];
  events: DriveEventRow[];
  hideMarkers?: boolean;
  onEventPress?: (e: DriveEventRow) => void;
};

/** Colored roughness polylines + bump/pothole markers. Render inside a <MapView>. */
export function RoughnessOverlay({ segments, events, hideMarkers, onEventPress }: Props) {
  return (
    <>
      {segments
        .filter((s) => s.path.length >= 2)
        .map((s) => (
          <Polyline
            key={`rough-${s.id}`}
            coordinates={s.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={7}
            strokeColor={ROUGHNESS_COLORS[s.roughnessClass as RoughnessClass] ?? "#64748b"}
          />
        ))}
      {!hideMarkers &&
        events.map((e) => (
          <Marker
            key={`bump-${e.id}`}
            coordinate={{ latitude: e.lat, longitude: e.lng }}
            pinColor={EVENT_PIN_COLORS[e.severity] ?? "yellow"}
            title={`${e.severity === "bump" ? "Bump" : e.severity === "pothole" ? "Possible pothole" : "Severe hit"} (${(e.peakMps2 / 9.81).toFixed(2)} g)`}
            description={new Date(e.occurredAt).toLocaleString() + (e.workOrderId ? " • work order created" : "")}
            onCalloutPress={() => onEventPress?.(e)}
          />
        ))}
    </>
  );
}
