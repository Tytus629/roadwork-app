import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getAssetLayerKind, getAssetSignVisual } from "../utils/assetLayer";
import { getAssetTypeColor, getAssetTypeShortLabel } from "../utils/assetTypes";

type AssetBadgeAsset = {
  assetType?: string | null;
  subtype?: string | null;
  details?: Record<string, unknown> | null;
};

type Props = {
  asset: AssetBadgeAsset;
  size?: "sm" | "md";
};

export default function AssetBadge({ asset, size = "md" }: Props) {
  const layer = getAssetLayerKind(asset);
  const compact = size === "sm";

  if (layer === "sign" || layer === "delineator") {
    const visual = getAssetSignVisual(asset);
    const isDiamond = visual.shape === "diamond";

    return (
      <View style={styles.wrap}>
        <View
          style={[
            styles.signBadge,
            compact ? styles.signBadgeSm : styles.signBadgeMd,
            isDiamond && styles.signBadgeDiamond,
            {
              backgroundColor: visual.fillColor,
              borderColor: visual.borderColor,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.signText,
              compact ? styles.signTextSm : styles.signTextMd,
              isDiamond && styles.signTextDiamond,
              { color: visual.textColor },
            ]}
          >
            {visual.shortLabel}
          </Text>
        </View>
      </View>
    );
  }

  const color = getAssetTypeColor(layer);
  const shortLabel = getAssetTypeShortLabel(layer);

  return (
    <View
      style={[
        styles.assetBadge,
        compact ? styles.assetBadgeSm : styles.assetBadgeMd,
        { backgroundColor: `${color}18`, borderColor: color },
      ]}
    >
      <Text style={[styles.assetText, compact ? styles.assetTextSm : styles.assetTextMd, { color }]}>
        {shortLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  signBadge: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    overflow: "hidden",
  },
  signBadgeSm: {
    minWidth: 40,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  signBadgeMd: {
    minWidth: 54,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  signBadgeDiamond: {
    transform: [{ rotate: "45deg" }],
  },
  signText: {
    fontWeight: "900",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  signTextSm: {
    fontSize: 10,
  },
  signTextMd: {
    fontSize: 11,
  },
  signTextDiamond: {
    transform: [{ rotate: "-45deg" }],
  },
  assetBadge: {
    borderWidth: 1.5,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  assetBadgeSm: {
    minWidth: 42,
    height: 24,
    paddingHorizontal: 7,
  },
  assetBadgeMd: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: 9,
  },
  assetText: {
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  assetTextSm: {
    fontSize: 10,
  },
  assetTextMd: {
    fontSize: 11,
  },
});