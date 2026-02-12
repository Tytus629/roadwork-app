import React from "react";
import { Modal, View, Text, StyleSheet, Pressable, Image } from "react-native";

type Props = {
  uri: string | null;
  onClose: () => void;
};

export default function PhotoViewerModal({ uri, onClose }: Props) {
  return (
    <Modal visible={!!uri} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },
  topBar: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 10, flexDirection: "row", justifyContent: "flex-end" },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: "#111827" },
  closeText: { color: "white", fontWeight: "900" },
  image: { flex: 1 },
});
