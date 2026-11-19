// Mapa nativo (iOS/Android): WebView + Leaflet/OpenStreetMap — sem chave de API.
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { buildMapHtml, type MapMarker } from "./map-html";

export function MapView({
  markers = [],
  route,
  height = 220,
  style,
}: {
  markers?: MapMarker[];
  route?: [number, number][];
  height?: number;
  style?: View["props"]["style"];
}) {
  return (
    <View style={[style, { height, borderRadius: 20, overflow: "hidden", backgroundColor: "#E2E8F0" }]}>
      <WebView
        source={{ html: buildMapHtml(markers, route) }}
        style={StyleSheet.absoluteFill}
        scrollEnabled={false}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}
