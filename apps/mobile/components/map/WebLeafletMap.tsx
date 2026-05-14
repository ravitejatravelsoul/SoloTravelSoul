import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { Colors } from '@/constants/theme';

export interface MapPin {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  color: string;
  label?: string; // short text rendered inside the circle (e.g. day number)
}

interface Props {
  pins: MapPin[];
  onPinTap?: (pin: MapPin) => void;
  onError?: () => void;
}

// Messages posted from Leaflet → React Native.
// Only the pin id travels over the bridge; the full pin is looked up
// in the pins array to avoid re-serialising large objects.
type BridgeMessage =
  | { type: 'pinTap'; id: string }
  | { type: 'error'; message: string };

function buildMapHtml(pins: MapPin[]): string {
  // Escape </script> so it can't break out of the script block.
  const pinsJson = JSON.stringify(pins).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%;height:100%;overflow:hidden;background:#f8f9fb}
  #map{width:100%;height:100%}
  .leaflet-control-attribution{font-size:9px}
  .leaflet-control-zoom{border:none!important}
  .leaflet-control-zoom a{
    border-radius:8px!important;
    border:1px solid #e5e7eb!important;
    color:#1270C2!important;
    font-size:16px!important;
    line-height:28px!important;
    width:28px!important;
    height:28px!important;
    margin-bottom:2px!important;
    box-shadow:0 1px 4px rgba(0,0,0,0.12)!important;
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  function post(obj){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  try{
    var PINS=${pinsJson};

    var map=L.map('map',{
      zoomControl:true,
      attributionControl:true,
      dragging:true,
      touchZoom:true,
      scrollWheelZoom:false,
      tap:true
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom:19,
      crossOrigin:true
    }).addTo(map);

    function makeIcon(pin){
      var s=pin.label?26:14;
      var inner=pin.label
        ?'<span style="font-size:11px;font-weight:700;color:#fff;line-height:1;font-family:system-ui,sans-serif;">'+pin.label+'</span>'
        :'';
      var html='<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+pin.color+';border:2.5px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.32);display:flex;align-items:center;justify-content:center;">'+inner+'</div>';
      return L.divIcon({html:html,className:'',iconSize:[s,s],iconAnchor:[s/2,s/2]});
    }

    var markers=[];
    PINS.forEach(function(pin){
      var m=L.marker([pin.latitude,pin.longitude],{icon:makeIcon(pin)}).addTo(map);
      m.on('click',function(){post({type:'pinTap',id:pin.id});});
      markers.push(m);
    });

    if(PINS.length===0){
      map.setView([39.8283,-98.5795],4);
    } else if(PINS.length===1){
      map.setView([PINS[0].latitude,PINS[0].longitude],13);
    } else {
      var latlngs=PINS.map(function(p){return[p.latitude,p.longitude];});
      map.fitBounds(L.latLngBounds(latlngs),{padding:[40,40],maxZoom:12});
    }
  } catch(e){
    post({type:'error',message:String(e)});
  }
})();
</script>
</body>
</html>`;
}

export function WebLeafletMap({ pins, onPinTap, onError }: Props) {
  const [errored, setErrored] = useState(false);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as BridgeMessage;
        if (msg.type === 'pinTap' && onPinTap) {
          const pin = pins.find((p) => p.id === msg.id);
          if (pin) onPinTap(pin);
        } else if (msg.type === 'error') {
          setErrored(true);
          onError?.();
        }
      } catch {
        // malformed message — ignore
      }
    },
    [pins, onPinTap, onError]
  );

  const handleNativeError = useCallback(() => {
    setErrored(true);
    onError?.();
  }, [onError]);

  if (errored) return null;

  return (
    <WebView
      source={{ html: buildMapHtml(pins) }}
      style={styles.webview}
      onMessage={handleMessage}
      onError={handleNativeError}
      scrollEnabled={false}
      bounces={false}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: Colors.background },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
});
