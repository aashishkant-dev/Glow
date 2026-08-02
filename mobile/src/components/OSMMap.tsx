import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle, StyleProp } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '../utils/colors';
import { MapIcon } from './TabIcons';

export type OSMMarker = {
  lat: number;
  lng: number;
  color?: string;
  label?: string;
  kind?: 'care' | 'provider' | 'you';
  photoUrl?: string;
};

type Props = {
  center: { lat: number; lng: number } | null;
  markers?: OSMMarker[];
  zoom?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  onMarkerPress?: (label: string) => void;
};

// True when we have a real, non-null, non-(0,0) center to show.
function hasRealCenter(center: Props['center']): center is { lat: number; lng: number } {
  return !!center && (center.lat !== 0 || center.lng !== 0);
}

// Builds the marker divIcon HTML for a given marker. Care = red house pin,
// Provider = green person marker, you/default = brand-green dot. Mirrors the styling
// already used by the per-screen web Leaflet maps so native looks identical.
function markerJs(m: OSMMarker, idx: number): string {
  const color = m.color || (m.kind === 'care' ? '#FF3B30' : m.kind === 'provider' ? '#00C853' : Colors.brand);
  const label = (m.label || '').replace(/'/g, "\\'");
  let html: string;
  if (m.kind === 'care') {
    html =
      `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
        `<div style="width:34px;height:34px;background:${color};border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 4px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">` +
          `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" style="transform:rotate(45deg);"><path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" stroke="#fff" stroke-width="2" stroke-linejoin="round" fill="none"/></svg>` +
        `</div>` +
      `</div>`;
  } else if (m.kind === 'provider') {
    const initial = (m.label?.[0] || 'P').toUpperCase().replace(/'/g, "\\'");
    const safeUrl = (m.photoUrl || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const avatarInner = m.photoUrl
      ? `<img src="${safeUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display=\\'none\\';this.nextSibling.style.display=\\'flex\\';" />` +
        `<div style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:900;">${initial}</div>`
      : `<div style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:900;">${initial}</div>`;
    html =
      `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
        `<div style="width:38px;height:38px;background:linear-gradient(135deg,#00C853,#00A651);border:3px solid #fff;border-radius:50%;overflow:hidden;box-shadow:0 4px 14px rgba(0,200,83,0.5);">${avatarInner}</div>` +
        `<div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:9px solid #00A651;margin-top:-2px;"></div>` +
      `</div>`;
  } else {
    html =
      `<div style="width:22px;height:22px;background:${color};border:3px solid #fff;border-radius:50%;box-shadow:0 3px 10px rgba(0,0,0,0.35);"></div>`;
  }
  const anchor = m.kind === 'care' ? '[17,38]' : m.kind === 'provider' ? '[19,47]' : '[11,11]';
  const size = m.kind === 'care' ? '[34,40]' : m.kind === 'provider' ? '[38,49]' : '[22,22]';
  return (
    `var ic${idx}=L.divIcon({html:'${html.replace(/'/g, "\\'")}',className:'',iconSize:${size},iconAnchor:${anchor}});` +
    `var mk${idx}=L.marker([${m.lat},${m.lng}],{icon:ic${idx}}).addTo(map);` +
    (label ? `mk${idx}.bindPopup('${label}');mk${idx}.on('click',function(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({type:'markerPress',label:'${label.replace(/'/g, "\\'")}'}));}});` : '')
  );
}

function buildHtml(center: { lat: number; lng: number }, markers: OSMMarker[], zoom: number): string {
  const markerJsAll = markers
    .filter(m => m.lat !== 0 || m.lng !== 0)
    .map((m, i) => markerJs(m, i))
    .join('\n');
  const realMarkers = markers.filter(m => m.lat !== 0 || m.lng !== 0);
  const fit =
    realMarkers.length > 1
      ? `var grp=L.latLngBounds([${realMarkers.map(m => `[${m.lat},${m.lng}]`).join(',')}]);map.fitBounds(grp,{padding:[50,50]});`
      : '';
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#E8E8EA;}</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${center.lat},${center.lng}],${zoom});
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
  ${markerJsAll}
  ${fit}
</script>
</body></html>`;
}

/**
 * Key-free map. Native uses a WebView-hosted Leaflet map (CARTO/OSM tiles, no
 * Google API key). Web mounts the same Leaflet HTML via an iframe srcdoc so the
 * single component works everywhere. Renders a branded placeholder when there
 * is no real center to show.
 */
export function OSMMap({ center, markers = [], zoom = 13, height, style, onMarkerPress }: Props) {
  const real = hasRealCenter(center) ? center : null;
  const html = useMemo(
    () => (real ? buildHtml(real, markers, zoom) : ''),
    [real?.lat, real?.lng, zoom, JSON.stringify(markers)]
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.container,
    height != null ? { height } : null,
    style,
  ];

  if (!real) {
    return (
      <View style={[containerStyle, styles.placeholder]}>
        <MapIcon size={28} color={Colors.brand} />
        <Text style={styles.placeholderText}>Map will appear once a location is set</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    // Reuse the same Leaflet HTML via an iframe so behavior matches native.
    return (
      <View style={containerStyle}>
        {/* @ts-ignore — iframe is valid on react-native-web */}
        <iframe
          srcDoc={html}
          style={{ border: 'none', width: '100%', height: '100%' } as any}
          title="map"
        />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        setBuiltInZoomControls={false}
        androidLayerType="hardware"
        onMessage={(e: WebViewMessageEvent) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'markerPress' && onMarkerPress) onMarkerPress(msg.label);
          } catch {}
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#E8E8EA' },
  webview: { flex: 1, backgroundColor: '#E8E8EA' },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.systemGray6 },
  placeholderText: { fontSize: 13, fontWeight: '600', color: Colors.secondaryLabel, textAlign: 'center', paddingHorizontal: 24 },
});

export default OSMMap;
