import type { WorkItem, WorkType, Priority, WorkStatus } from "../types/workItem";
import { uid } from "./uid";

export function createWorkItemPoint(opts: {
  type: WorkType;
  title?: string;
  notes?: string;
  priority?: Priority;
  status?: WorkStatus;
  lat: number;
  lng: number;
}): WorkItem {
  const now = Date.now();
  const workItem: WorkItem = {
    id: uid(),
    type: opts.type,
    status: opts.status ?? "needs",
    priority: opts.priority ?? "high",
    title: opts.title ?? "New item",
    notes: opts.notes ?? "",
    geometry: { kind: "point", coordinates: { lat: opts.lat, lng: opts.lng } },
    createdAt: now,
    updatedAt: now,
    lastActionAt: now,
    assignedTo: null,
    photos: [],
    // STEP 1: Mark new items as needing sync
    needsSync: true,
  };

  // STEP C-2: Initialize sign maintenance defaults
  if (opts.type === "sign") {
    workItem.signMaintenance = {
      signType: null,
      condition: "faded",
      reflectivityIssue: false,
      obstructed: false,
      replacementNeeded: false,
    };
    workItem.signDetails = {
      signType: "stop",
      mutcdCode: null,
      condition: "good",
      reflectivityIssue: false,
      obstructed: false,
      replacementNeeded: false,
      postLeaning: false,
      heightOk: true,
    };
  }

  // Initialize type-specific details with sensible defaults
  if (opts.type === "pothole") {
    workItem.potholeDetails = {
      severity: "medium",
      hazard: false,
      waterPresent: false,
      edgeBreak: false,
      needsPatch: true,
      tempFillDone: false,
    };
  }

  if (opts.type === "spraying") {
    workItem.sprayingDetails = {
      target: "weeds",
      areaType: "shoulder",
      nearWater: false,
      posted: false,
    };
  }

  if (opts.type === "brushing") {
    workItem.brushingDetails = {
      scope: "spot",
      areaType: "shoulder",
      sightDistanceIssue: false,
      debrisLeft: false,
    };
  }

  if (opts.type === "culvert") {
    workItem.culvertDetails = {
      issue: "plugged",
      standingWater: false,
      inletBlocked: true,
      outletBlocked: false,
      needsJetting: false,
    };
  }

  if (opts.type === "guardrail") {
    workItem.guardrailDetails = {
      component: "end_treatment",
      endTreatmentType: "unknown",
      damageLevel: "moderate",
      brokenPosts: false,
      brokenBlocks: false,
      railBent: false,
      endTreatmentDamaged: true,
      needsReplacement: true,
    };
  }

  if (opts.type === "danger_tree") {
    workItem.dangerTreeDetails = {
      issue: "in_road",
      blockingLane: true,
      needsTrafficControl: true,
      removed: false,
    };
  }

  if (opts.type === "ditching") {
    workItem.ditchingDetails = {
      issue: "silted",
      equipmentNeeded: "grader",
    };
  }

  if (opts.type === "asphalt") {
    workItem.asphaltDetails = {
      workType: "patch",
      mix: "unknown",
      depthIn: null,
      areaFt2: null,
    };
  }

  return workItem;
}
