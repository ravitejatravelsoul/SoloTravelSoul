import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import WebView from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import { Colors } from '@/constants/theme';
import { LEAFLET_JS, LEAFLET_CSS } from '@/assets/leaflet/leaflet-bundle';

export interface MapPin {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  color: string;
  label?: string;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface Props {
  pins: MapPin[];
  userLocation?: UserLocation | null;
  onPinTap?: (pin: MapPin) => void;
  onError?: () => void;
}

type BridgeMessage =
  | { type: 'pinTap'; id: string }
  | { type: 'error'; message: string }
  | { type: 'ready' }
  | { type: 'log'; message: string };

// Pre-compute lengths once at module load (logged in HTML for diagnostics).
const JS_LEN = LEAFLET_JS.length;
const CSS_LEN = LEAFLET_CSS.length;

function buildMapHtml(pins: MapPin[]): string {
  const pinsJson = JSON.stringify(pins).replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<style>${LEAFLET_CSS}</style>
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

<!-- BLOCK 1: Null out AMD define so Leaflet's UMD uses the global path.
     In Expo Go / react-native-webview dev mode an AMD define may be injected;
     if Leaflet detects it, the module is deferred and window.L is never set
     synchronously, causing "Can't find variable: L" in the next script. -->
<script>
var __rnwSavedDefine=window.define;
window.define=undefined;
</script>

<!-- BLOCK 2: Leaflet 1.9.4 — inline bundle (${JS_LEN} chars). -->
<script>${LEAFLET_JS}</script>

<!-- BLOCK 3: Restore define; ensure window.L is accessible.
     Leaflet's UMD sets both window.leaflet and window.L, but alias just in case. -->
<script>
window.define=__rnwSavedDefine;
if(typeof window.L==='undefined'&&typeof window.leaflet!=='undefined'){
  window.L=window.leaflet;
}
</script>

<!-- BLOCK 4: Map initialisation. -->
<script>
(function(){
  function post(obj){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }

  // Guard: Leaflet must be available before we try to use it.
  if(typeof L==='undefined'){
    post({type:'error',message:'Leaflet L undefined after bundle load. bundleLen=${JS_LEN} cssLen=${CSS_LEN} leafletProp='+typeof window.leaflet});
    return;
  }

  post({type:'log',message:'Leaflet loaded ok. typeof L='+typeof L+' pins=${pins.length}'});

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
      attribution:'\\u00a9 <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom:19
    }).addTo(map);

    // User location marker — updated by centerOnUser() from React Native
    var userMarker=null;

    window.centerOnUser=function(lat,lng){
      var dotHtml='<div style="width:14px;height:14px;border-radius:50%;background:#1270C2;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);"></div>';
      var icon=L.divIcon({html:dotHtml,className:'',iconSize:[14,14],iconAnchor:[7,7]});
      if(userMarker){
        userMarker.setLatLng([lat,lng]);
      }else{
        userMarker=L.marker([lat,lng],{icon:icon,zIndexOffset:1000}).addTo(map);
      }
      map.setView([lat,lng],12,{animate:true,duration:0.8});
    };

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
    }else if(PINS.length===1){
      map.setView([PINS[0].latitude,PINS[0].longitude],13);
    }else{
      var latlngs=PINS.map(function(p){return[p.latitude,p.longitude];});
      map.fitBounds(L.latLngBounds(latlngs),{padding:[40,40],maxZoom:12});
    }

    post({type:'ready'});
    post({type:'log',message:'map ready with '+PINS.length+' pins'});

  }catch(e){
    post({type:'error',message:String(e)});
  }
})();
</script>
</body>
</html>`;
}

export function WebLeafletMap({ pins, userLocation, onPinTap, onError }: Props) {
  const [errored, setErrored] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const mapReadyRef = useRef(false);
  const pendingCenterRef = useRef<UserLocation | null>(null);

  useEffect(() => {
    mapReadyRef.current = false;
    pendingCenterRef.current = userLocation ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins]);

  useEffect(() => {
    if (!userLocation) return;
    if (mapReadyRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(
        `window.centerOnUser(${userLocation.latitude},${userLocation.longitude}); true;`
      );
    } else {
      pendingCenterRef.current = userLocation;
    }
  }, [userLocation]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data) as BridgeMessage;
        if (msg.type === 'ready') {
          mapReadyRef.current = true;
          if (__DEV__) console.log('[WebLeafletMap] map ready');
          const pending = pendingCenterRef.current;
          if (pending && webViewRef.current) {
            webViewRef.current.injectJavaScript(
              `window.centerOnUser(${pending.latitude},${pending.longitude}); true;`
            );
            pendingCenterRef.current = null;
          }
        } else if (msg.type === 'log') {
          if (__DEV__) console.log('[WebLeafletMap]', msg.message);
        } else if (msg.type === 'pinTap' && onPinTap) {
          const pin = pins.find((p) => p.id === msg.id);
          if (pin) onPinTap(pin);
        } else if (msg.type === 'error') {
          if (__DEV__) console.warn('[WebLeafletMap] JS error:', msg.message);
          setErrored(true);
          onError?.();
        }
      } catch {
        // malformed bridge message — ignore
      }
    },
    [pins, onPinTap, onError]
  );

  const handleNativeError = useCallback((event: WebViewErrorEvent) => {
    if (__DEV__) {
      console.warn(
        '[WebLeafletMap] native WebView error:',
        event.nativeEvent.description,
        'code:', event.nativeEvent.code,
      );
    }
    setErrored(true);
    onError?.();
  }, [onError]);

  const mapSource = useMemo(() => ({ html: buildMapHtml(pins) }), [pins]);

  if (errored) return null;

  return (
    <WebView
      ref={webViewRef}
      source={mapSource}
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
