import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { WorkItem } from "../types/workItem";
import { SimpleSelect } from "./ui/SimpleSelect";
import { SimpleToggle } from "./ui/SimpleToggle";
import { STANDARD_ROAD_SIGNS } from "../constants/signTypes";

type Props = {
  item: WorkItem;
  patchWorkOrder: (patch: Partial<WorkItem>) => Promise<void>;
};

export function TypeSpecificDetails({ item, patchWorkOrder }: Props) {
  return (
    <>
      {/* POTHOLE DETAILS */}
      {item.type === "pothole" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Pothole Details</Text>

          <SimpleSelect
            label="Severity"
            value={item.potholeDetails?.severity ?? "medium"}
            options={[
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), severity: v as any },
              })
            }
          />

          <SimpleToggle
            label="Hazard (cones/flagging needed)"
            value={!!item.potholeDetails?.hazard}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), hazard: v },
              })
            }
          />

          <SimpleToggle
            label="Water present"
            value={!!item.potholeDetails?.waterPresent}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), waterPresent: v },
              })
            }
          />

          <SimpleToggle
            label="Edge break"
            value={!!item.potholeDetails?.edgeBreak}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), edgeBreak: v },
              })
            }
          />

          <SimpleToggle
            label="Needs patch"
            value={item.potholeDetails?.needsPatch ?? true}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), needsPatch: v },
              })
            }
          />

          <SimpleSelect
            label="Repair method"
            value={item.potholeDetails?.repairMethod ?? "cold_patch"}
            options={[
              { label: "Cold Patch", value: "cold_patch" },
              { label: "Hot Mix", value: "hot_mix" },
              { label: "Grind & Inlay", value: "grind_inlay" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                potholeDetails: { ...(item.potholeDetails ?? {}), repairMethod: v as any },
              })
            }
          />
        </View>
      )}

      {/* SPRAYING DETAILS */}
      {item.type === "spraying" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Spraying Details</Text>

          <SimpleSelect
            label="Target"
            value={item.sprayingDetails?.target ?? "weeds"}
            options={[
              { label: "Weeds", value: "weeds" },
              { label: "Brush", value: "brush" },
              { label: "Invasive", value: "invasive" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                sprayingDetails: { ...(item.sprayingDetails ?? {}), target: v as any },
              })
            }
          />

          <SimpleSelect
            label="Area type"
            value={item.sprayingDetails?.areaType ?? "shoulder"}
            options={[
              { label: "Shoulder", value: "shoulder" },
              { label: "Ditch", value: "ditch" },
              { label: "Median", value: "median" },
              { label: "Around Signs", value: "around_signs" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                sprayingDetails: { ...(item.sprayingDetails ?? {}), areaType: v as any },
              })
            }
          />

          <SimpleToggle
            label="Near water"
            value={!!item.sprayingDetails?.nearWater}
            onChange={(v) =>
              patchWorkOrder({
                sprayingDetails: { ...(item.sprayingDetails ?? {}), nearWater: v },
              })
            }
          />

          <SimpleToggle
            label="Posted (signs/notice)"
            value={!!item.sprayingDetails?.posted}
            onChange={(v) =>
              patchWorkOrder({
                sprayingDetails: { ...(item.sprayingDetails ?? {}), posted: v },
              })
            }
          />
        </View>
      )}

      {/* BRUSHING DETAILS */}
      {item.type === "brushing" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Brushing Details</Text>

          <SimpleSelect
            label="Scope"
            value={item.brushingDetails?.scope ?? "spot"}
            options={[
              { label: "Spot", value: "spot" },
              { label: "Segment", value: "segment" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                brushingDetails: { ...(item.brushingDetails ?? {}), scope: v as any },
              })
            }
          />

          <SimpleSelect
            label="Area type"
            value={item.brushingDetails?.areaType ?? "shoulder"}
            options={[
              { label: "Shoulder", value: "shoulder" },
              { label: "Ditch", value: "ditch" },
              { label: "Around Signs", value: "around_signs" },
              { label: "Guardrail Line", value: "guardrail_line" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                brushingDetails: { ...(item.brushingDetails ?? {}), areaType: v as any },
              })
            }
          />

          <SimpleToggle
            label="Sight distance issue"
            value={!!item.brushingDetails?.sightDistanceIssue}
            onChange={(v) =>
              patchWorkOrder({
                brushingDetails: { ...(item.brushingDetails ?? {}), sightDistanceIssue: v },
              })
            }
          />

          <SimpleToggle
            label="Debris left"
            value={!!item.brushingDetails?.debrisLeft}
            onChange={(v) =>
              patchWorkOrder({
                brushingDetails: { ...(item.brushingDetails ?? {}), debrisLeft: v },
              })
            }
          />
        </View>
      )}

      {/* CULVERT DETAILS */}
      {item.type === "culvert" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Culvert Details</Text>

          <SimpleSelect
            label="Issue"
            value={item.culvertDetails?.issue ?? "plugged"}
            options={[
              { label: "Plugged", value: "plugged" },
              { label: "Damaged", value: "damaged" },
              { label: "Washed Out", value: "washed_out" },
              { label: "Collapse", value: "collapse" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                culvertDetails: { ...(item.culvertDetails ?? {}), issue: v as any },
              })
            }
          />

          <SimpleToggle
            label="Standing water"
            value={!!item.culvertDetails?.standingWater}
            onChange={(v) =>
              patchWorkOrder({
                culvertDetails: { ...(item.culvertDetails ?? {}), standingWater: v },
              })
            }
          />

          <SimpleToggle
            label="Inlet blocked"
            value={!!item.culvertDetails?.inletBlocked}
            onChange={(v) =>
              patchWorkOrder({
                culvertDetails: { ...(item.culvertDetails ?? {}), inletBlocked: v },
              })
            }
          />

          <SimpleToggle
            label="Outlet blocked"
            value={!!item.culvertDetails?.outletBlocked}
            onChange={(v) =>
              patchWorkOrder({
                culvertDetails: { ...(item.culvertDetails ?? {}), outletBlocked: v },
              })
            }
          />

          <SimpleToggle
            label="Needs jetting"
            value={!!item.culvertDetails?.needsJetting}
            onChange={(v) =>
              patchWorkOrder({
                culvertDetails: { ...(item.culvertDetails ?? {}), needsJetting: v },
              })
            }
          />
        </View>
      )}

      {/* GUARDRAIL DETAILS */}
      {item.type === "guardrail" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Guardrail Details</Text>

          <SimpleSelect
            label="Component"
            value={item.guardrailDetails?.component ?? "end_treatment"}
            options={[
              { label: "W-Beam", value: "w_beam" },
              { label: "Thrie Beam", value: "thrie_beam" },
              { label: "Posts", value: "posts" },
              { label: "Blocks", value: "blocks" },
              { label: "End Treatment", value: "end_treatment" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                guardrailDetails: { ...(item.guardrailDetails ?? {}), component: v as any },
              })
            }
          />

          <SimpleSelect
            label="Damage level"
            value={item.guardrailDetails?.damageLevel ?? "moderate"}
            options={[
              { label: "Minor", value: "minor" },
              { label: "Moderate", value: "moderate" },
              { label: "Severe", value: "severe" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                guardrailDetails: { ...(item.guardrailDetails ?? {}), damageLevel: v as any },
              })
            }
          />

          <SimpleToggle
            label="Broken posts"
            value={!!item.guardrailDetails?.brokenPosts}
            onChange={(v) =>
              patchWorkOrder({
                guardrailDetails: { ...(item.guardrailDetails ?? {}), brokenPosts: v },
              })
            }
          />

          <SimpleToggle
            label="Rail bent"
            value={!!item.guardrailDetails?.railBent}
            onChange={(v) =>
              patchWorkOrder({
                guardrailDetails: { ...(item.guardrailDetails ?? {}), railBent: v },
              })
            }
          />

          <SimpleToggle
            label="Replacement needed"
            value={!!item.guardrailDetails?.needsReplacement}
            onChange={(v) =>
              patchWorkOrder({
                guardrailDetails: { ...(item.guardrailDetails ?? {}), needsReplacement: v },
              })
            }
          />
        </View>
      )}

      {/* DANGER TREE DETAILS */}
      {item.type === "danger_tree" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Danger Tree Details</Text>

          <SimpleSelect
            label="Issue"
            value={item.dangerTreeDetails?.issue ?? "in_road"}
            options={[
              { label: "In Road", value: "in_road" },
              { label: "Leaning", value: "leaning" },
              { label: "Downed", value: "downed" },
              { label: "Hanging Limb", value: "hanging_limb" },
              { label: "Blocking View", value: "blocking_view" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                dangerTreeDetails: { ...(item.dangerTreeDetails ?? {}), issue: v as any },
              })
            }
          />

          <SimpleToggle
            label="Blocking lane"
            value={!!item.dangerTreeDetails?.blockingLane}
            onChange={(v) =>
              patchWorkOrder({
                dangerTreeDetails: { ...(item.dangerTreeDetails ?? {}), blockingLane: v },
              })
            }
          />

          <SimpleToggle
            label="Needs traffic control"
            value={!!item.dangerTreeDetails?.needsTrafficControl}
            onChange={(v) =>
              patchWorkOrder({
                dangerTreeDetails: { ...(item.dangerTreeDetails ?? {}), needsTrafficControl: v },
              })
            }
          />

          <SimpleToggle
            label="Removed"
            value={!!item.dangerTreeDetails?.removed}
            onChange={(v) =>
              patchWorkOrder({
                dangerTreeDetails: { ...(item.dangerTreeDetails ?? {}), removed: v },
              })
            }
          />
        </View>
      )}

      {/* DITCHING DETAILS */}
      {item.type === "ditching" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Ditching Details</Text>

          <SimpleSelect
            label="Issue"
            value={item.ditchingDetails?.issue ?? "silted"}
            options={[
              { label: "Silted", value: "silted" },
              { label: "Erosion", value: "erosion" },
              { label: "Standing Water", value: "standing_water" },
              { label: "Washout", value: "washout" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                ditchingDetails: { ...(item.ditchingDetails ?? {}), issue: v as any },
              })
            }
          />

          <SimpleSelect
            label="Equipment needed"
            value={item.ditchingDetails?.equipmentNeeded ?? "grader"}
            options={[
              { label: "Hand", value: "hand" },
              { label: "Mini Excavator", value: "mini_ex" },
              { label: "Excavator", value: "excavator" },
              { label: "Grader", value: "grader" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                ditchingDetails: { ...(item.ditchingDetails ?? {}), equipmentNeeded: v as any },
              })
            }
          />
        </View>
      )}

      {/* ASPHALT DETAILS */}
      {item.type === "asphalt" && (
        <View style={styles.detailsContainer}>
          <Text style={styles.detailsTitle}>Asphalt Details</Text>

          <SimpleSelect
            label="Work type"
            value={item.asphaltDetails?.workType ?? "patch"}
            options={[
              { label: "Patch", value: "patch" },
              { label: "Overlay", value: "overlay" },
              { label: "Pave", value: "pave" },
              { label: "Pothole Repair", value: "pothole_repair" },
              { label: "Other", value: "other" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                asphaltDetails: { ...(item.asphaltDetails ?? {}), workType: v as any },
              })
            }
          />

          <SimpleSelect
            label="Mix type"
            value={item.asphaltDetails?.mix ?? "unknown"}
            options={[
              { label: "G-Mix", value: "g_mix" },
              { label: "S-Mix", value: "s_mix" },
              { label: "B-Mix", value: "b_mix" },
              { label: "Warm Mix", value: "warm_mix" },
              { label: "Cold Patch", value: "cold_patch" },
              { label: "Unknown", value: "unknown" },
            ]}
            onChange={(v) =>
              patchWorkOrder({
                asphaltDetails: { ...(item.asphaltDetails ?? {}), mix: v as any },
              })
            }
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  detailsContainer: {
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 14,
    backgroundColor: "#f9fafb",
  },
  detailsTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 8,
    color: "#111827",
  },
});
