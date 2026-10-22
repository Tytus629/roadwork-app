import React from "react";
import { Marker, Polyline } from "react-native-maps";
import { ROUGHNESS_COLORS, type RoughnessClass } from "./signal";
import type { DriveEventRow, DriveSegmentRow } from "../repositories/roughnessRepo";
import type { DetectionRow } from "../repositories/detectionsRepo";
import { DAMAGE_LABELS } from "../detection/types";

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
  onEventSelect?: (e: DriveEventRow) => void;
  detections?: DetectionRow[];
};

/** Colored roughness polylines + bump/pothole markers. Render inside a <MapView>. */
export function RoughnessOverlay({ segments, events, hideMarkers, onEventPress, onEventSelect, detections = [] }: Props) {
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
            onPress={() => onEventSelect?.(e)}
            onCalloutPress={() => onEventPress?.(e)}
          />
        ))}
      {!hideMarkers &&
        detections
          .filter((d) => d.lat != null && d.lng != null)
          .map((d) => (
            <Marker
              key={`det-${d.id}`}
              coordinate={{ latitude: d.lat as number, longitude: d.lng as number }}
              pinColor="violet"
              title={`${DAMAGE_LABELS[d.cls] ?? d.cls} (${Math.round(d.score * 100)}%) — screening`}
              description={`Photo AI ${d.modelName}@${d.modelVersion}; verify in field`}
            />
          ))}
    </>
  );
}
