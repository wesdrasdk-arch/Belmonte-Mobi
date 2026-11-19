// Mapa web: iframe com o mesmo HTML Leaflet (react-native-webview não existe na web).
import { createElement } from "react";
import { View } from "react-native";
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
      {createElement("iframe", {
        srcDoc: buildMapHtml(markers, route),
        style: { width: "100%", height: "100%", border: "none" },
        title: "mapa",
      })}
    </View>
  );
}
