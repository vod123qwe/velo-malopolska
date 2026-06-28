// Mapa Leaflet renderowana w WebView. Sterowana z RN przez window.* (injectJavaScript),
// raportuje zdarzenia do RN przez window.ReactNativeWebView.postMessage.
export const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#0b0f14;}
  .leaflet-control-attribution{font-size:9px;background:rgba(0,0,0,.4)!important;color:#888!important;}
  .leaflet-control-zoom{display:none;}
  .pin{filter:drop-shadow(0 2px 4px rgba(0,0,0,.6));font-size:26px;line-height:1;}
  .poipill{width:30px;height:30px;border-radius:50%;background:#fff;display:flex;align-items:center;
      justify-content:center;box-shadow:0 2px 7px rgba(0,0,0,.35);}
  .me-wrap{position:relative;width:48px;height:48px;}
  .me-rot{position:absolute;left:0;top:0;width:48px;height:48px;display:none;transition:transform .15s linear;}
  .me-cone{position:absolute;left:50%;bottom:50%;width:42px;height:26px;margin-left:-21px;
      background:linear-gradient(to top, rgba(58,160,255,.6), rgba(58,160,255,0));
      clip-path:polygon(50% 100%, 0 0, 100% 0);}
  .me{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;
      background:#3aa0ff;border:3px solid #fff;box-shadow:0 0 0 6px rgba(58,160,255,.3),0 2px 8px rgba(0,0,0,.5);}
  .genc{width:14px;height:14px;border-radius:50%;background:#3ee08a;border:3px solid #fff;
      box-shadow:0 0 0 5px rgba(62,224,138,.3),0 2px 6px rgba(0,0,0,.4);}
  .wp{width:28px;height:28px;border-radius:50%;background:#3ee08a;color:#04240f;font-weight:800;
      font-size:14px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.5);}
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map',{zoomControl:false,attributionControl:true});
  var STYLES={
    dark:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light:'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    voyager:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    cyclosm:'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    topo:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    osm:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };
  var LIGHTISH={light:1,voyager:1,topo:1,osm:1,cyclosm:1};
  var curStyle='auto', curTheme='dark';
  var tiles=L.tileLayer(STYLES.dark,{maxZoom:19, subdomains:'abc', attribution:'© OpenStreetMap · CARTO · Esri · OpenTopoMap'}).addTo(map);
  map.setView([50.06,19.94], 12);
  function applyTiles(){
    var key = (curStyle==='auto') ? (curTheme==='light'?'light':'dark') : curStyle;
    tiles.setUrl(STYLES[key]||STYLES.dark);
    var light = (curStyle==='auto') ? (curTheme==='light') : !!LIGHTISH[key];
    var bg = (key==='satellite') ? '#0b0f14' : (light?'#e9eef3':'#0b0f14');
    document.body.style.background=bg;
    var el=document.getElementById('map'); if(el) el.style.background=bg;
  }
  window.setTheme=function(t){ curTheme=t; applyTiles(); };
  window.setMapStyle=function(k){ curStyle=k; applyTiles(); };

  var routeLine=null, poiMarkers=[], meMarker=null, doneLine=null, approachLine=null, headingDeg=null;
  function send(o){ var s=JSON.stringify(o); if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s); else if(window.parent && window.parent!==window) window.parent.postMessage(s,'*'); }
  // WEB (iframe): odbiór komend z aplikacji jako {__cmd, args} → wywołanie window[fn](...args)
  window.addEventListener('message', function(e){ try{ var d = typeof e.data==='string'? JSON.parse(e.data): e.data; if(d && d.__cmd && typeof window[d.__cmd]==='function') window[d.__cmd].apply(null, d.args||[]); }catch(err){} });
  var CAT={'Zamek':'#b4690e','Ruiny':'#b4690e','Zabytek':'#b4690e','Kościół':'#7c5cff','Punkt widokowy':'#0e9f6e','Szczyt':'#0e9f6e','Atrakcja':'#e0399b','Kawiarnia':'#9a6a3a','Miejsce piknikowe':'#0e9f6e','Restauracja':'#e0399b','Parking':'#3aa0ff','Jaskinia':'#5a6675','Miejsce':'#3aa0ff'};
  var SVGMAP={'Zamek':'landmark','Ruiny':'landmark','Zabytek':'landmark','Kościół':'church','Punkt widokowy':'eye','Szczyt':'mountain','Atrakcja':'star','Kawiarnia':'cup','Restauracja':'cup','Miejsce piknikowe':'tree','Parking':'parking','Jaskinia':'dot','Miejsce':'dot'};
  function poiIcon(kind){
    var col=CAT[kind]||'#3aa0ff';
    var P={
      landmark:'<path d="M2.5 6.5L8 3.2l5.5 3.3"/><path d="M3.5 7v6M6.2 7v6M9.8 7v6M12.5 7v6"/><path d="M2.5 13.2h11"/>',
      church:'<path d="M8 2v2.6"/><path d="M6.7 3.3h2.6"/><path d="M3.6 13.2V7.4L8 5l4.4 2.4v5.8"/><path d="M6.4 13.2v-3h3.2v3"/>',
      eye:'<path d="M1.6 8S4 4 8 4s6.4 4 6.4 4-2.4 4-6.4 4S1.6 8 1.6 8z"/><circle cx="8" cy="8" r="1.8"/>',
      mountain:'<path d="M1.8 12.8l4-6.6 2.5 3.6 1.7-2.5 4.2 5.5z"/>',
      star:'<path d="M8 2.4l1.6 3.4 3.7.4-2.8 2.5.8 3.6L8 10.6 4.7 12.3l.8-3.6L2.7 6.2l3.7-.4z" fill="'+col+'" stroke="none"/>',
      cup:'<path d="M3.4 6h7.6v2.8a2.8 2.8 0 0 1-2.8 2.8H6.2A2.8 2.8 0 0 1 3.4 8.8z"/><path d="M11 6.7h1.5a1.3 1.3 0 0 1 0 2.6H11"/><path d="M5 4.2v-.9M8 4.2v-.9M11 4.2v-.9"/>',
      tree:'<path d="M8 2.5l3 4.2H5z"/><path d="M8 5.6l3.2 4.4H4.8z"/><path d="M8 10v3.4"/>',
      parking:'<path d="M4.5 13V3.5h4a3 3 0 0 1 0 6h-4"/>',
      dot:'<circle cx="8" cy="8" r="3"/>'
    };
    var inner=P[SVGMAP[kind]||'dot'];
    var svg='<svg viewBox="0 0 16 16" width="17" height="17" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+inner+'</svg>';
    return L.divIcon({className:'',html:'<div class="poipill">'+svg+'</div>',iconSize:[30,30],iconAnchor:[15,15]});
  }

  window.setRoute=function(json){
    var r=JSON.parse(json);
    if(routeLine) map.removeLayer(routeLine);
    poiMarkers.forEach(function(m){map.removeLayer(m);}); poiMarkers=[];
    if(doneLine){map.removeLayer(doneLine);doneLine=null;}
    routeLine=L.polyline(r.path,{color:r.color||'#34d07f',weight:6,opacity:.85}).addTo(map);
    r.pois.forEach(function(p,i){
      var m=L.marker([p.lat,p.lon],{icon:poiIcon(p.kind)}).addTo(map);
      m.on('click',function(){send({type:'poi',idx:i});});
      poiMarkers.push(m);
    });
    map.fitBounds(routeLine.getBounds().pad(0.18));
  };

  window.startRideView=function(json){
    var r=JSON.parse(json);
    if(doneLine){map.removeLayer(doneLine);}
    doneLine=L.polyline([r.path[0]],{color:r.color||'#34d07f',weight:7,opacity:1}).addTo(map);
    if(routeLine) routeLine.setStyle({opacity:.4});
  };

  window.setApproach=function(json){
    var pts=JSON.parse(json);
    if(approachLine) map.removeLayer(approachLine);
    approachLine=L.polyline(pts,{color:'#9ec5ff',weight:5,opacity:.9,dashArray:'2,10',lineCap:'round'}).addTo(map);
    window.fitAll();
  };
  window.clearApproach=function(){ if(approachLine){map.removeLayer(approachLine);approachLine=null;} };
  // wykadruj trasę z zapasem na dole (pod szufladę) — bottomPx = ile px zasłania szuflada
  window.fitRoutePadded=function(bottomPx){
    if(!routeLine) return;
    try{ map.fitBounds(routeLine.getBounds(), {paddingTopLeft:[24,90], paddingBottomRight:[24, (bottomPx||0)+24]}); }catch(e){}
  };
  // wykadruj wszystko: trasa + dojazd + moja pozycja
  window.fitAll=function(){
    var bs=[];
    if(routeLine) bs.push(routeLine.getBounds());
    if(approachLine) bs.push(approachLine.getBounds());
    if(meMarker){ var ll=meMarker.getLatLng(); bs.push(L.latLngBounds(ll,ll)); }
    if(!bs.length) return;
    var b=bs[0]; for(var i=1;i<bs.length;i++) b=b.extend(bs[i]);
    try{ map.fitBounds(b.pad(0.18)); }catch(e){}
  };

  window.updateUser=function(lat,lon,follow){
    if(!meMarker){
      meMarker=L.marker([lat,lon],{icon:L.divIcon({className:'',html:'<div class=\\"me-wrap\\"><div class=\\"me-rot\\"><div class=\\"me-cone\\"></div></div><div class=\\"me\\"></div></div>',iconSize:[48,48],iconAnchor:[24,24]}),zIndexOffset:1000}).addTo(map);
    } else meMarker.setLatLng([lat,lon]);
    if(follow) map.panTo([lat,lon],{animate:true,duration:.3});
    applyHeading();
  };
  function applyHeading(){
    if(headingDeg==null||!meMarker) return;
    var el=meMarker.getElement(); if(!el) return;
    var r=el.querySelector('.me-rot'); if(r){ r.style.display='block'; r.style.transform='rotate('+headingDeg+'deg)'; }
  }
  window.updateHeading=function(deg){ if(typeof deg==='number'&&deg>=0) headingDeg=deg; applyHeading(); };
  window.setProgress=function(json){ if(doneLine) doneLine.setLatLngs(JSON.parse(json)); };
  window.recenter=function(lat,lon,z){ map.setView([lat,lon], z||15); };
  window.focusPoi=function(lat,lon){ try{ map.setView([lat,lon], 16, {animate:true}); }catch(e){} };
  // pełne czyszczenie mapy (naprawa: stara trasa zostawała po przełączeniu)
  window.clearAll=function(){
    [routeLine,doneLine,approachLine,meMarker].forEach(function(l){ if(l) map.removeLayer(l); });
    routeLine=doneLine=approachLine=meMarker=null;
    poiMarkers.forEach(function(m){map.removeLayer(m);}); poiMarkers=[];
    if(window.clearPlan) window.clearPlan();
  };

  /* ---- tryb planowania trasy ---- */
  var planMarkers=[], planLine=null, planActive=false, planPoiMarkers=[], nearbyMarkers=[], poiHighlight=null;
  function onMapClick(e){ send({type:'mapclick', lat:+e.latlng.lat.toFixed(6), lon:+e.latlng.lng.toFixed(6)}); }
  window.setPlanning=function(on){
    planActive=on;
    map.off('click', onMapClick);
    if(on){ map.on('click', onMapClick); } else { window.clearPlan(); }
  };
  // włącz/wyłącz dodawanie punktów ścieżki kliknięciem (bez czyszczenia trasy) — np. w trybie dodawania POI
  window.setPlanClicks=function(on){ map.off('click', onMapClick); if(on){ map.on('click', onMapClick); } };
  /* ---- generator: zaznaczanie obszaru ---- */
  var genCircle=null, genCenterM=null, genPickOn=false;
  function onGenClick(e){ send({type:'genpick', lat:+e.latlng.lat.toFixed(6), lon:+e.latlng.lng.toFixed(6)}); }
  window.setGenPick=function(on){ genPickOn=on; map.off('click', onGenClick); if(on){ map.on('click', onGenClick); } };
  window.setGenArea=function(lat,lon,radius,fit){
    if(genCircle) map.removeLayer(genCircle);
    if(genCenterM) map.removeLayer(genCenterM);
    genCircle=L.circle([lat,lon],{radius:radius,color:'#3ee08a',weight:2,fillColor:'#3ee08a',fillOpacity:0.12}).addTo(map);
    genCenterM=L.marker([lat,lon],{icon:L.divIcon({className:'',html:'<div class=\\"genc\\"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
    if(fit){ try{ map.fitBounds(genCircle.getBounds().pad(0.2)); }catch(e){} }
  };
  window.clearGen=function(){ if(genCircle){map.removeLayer(genCircle);genCircle=null;} if(genCenterM){map.removeLayer(genCenterM);genCenterM=null;} genPickOn=false; map.off('click', onGenClick); };
  window.setWaypoints=function(json){
    var pts=JSON.parse(json);
    planMarkers.forEach(function(m){map.removeLayer(m);}); planMarkers=[];
    pts.forEach(function(p,i){
      var m=L.marker([p[0],p[1]],{draggable:true,icon:L.divIcon({className:'',html:'<div class="wp">'+(i+1)+'</div>',iconSize:[28,28],iconAnchor:[14,14]})}).addTo(map);
      m.on('dragend', (function(idx){ return function(e){ var ll=e.target.getLatLng(); send({type:'wpmove',idx:idx,lat:+ll.lat.toFixed(6),lon:+ll.lng.toFixed(6)}); }; })(i));
      m.on('contextmenu', (function(idx){ return function(){ send({type:'wpdelete',idx:idx}); }; })(i)); // długie przytrzymanie = usuń
      planMarkers.push(m);
    });
  };
  window.setPlanRoute=function(json){
    var pts=JSON.parse(json);
    if(planLine){ map.removeLayer(planLine); planLine=null; }
    if(pts && pts.length){ planLine=L.polyline(pts,{color:'#3ee08a',weight:6,opacity:.95}).addTo(map); }
  };
  window.setPlanPois=function(json){
    var pts=JSON.parse(json);
    planPoiMarkers.forEach(function(m){map.removeLayer(m);}); planPoiMarkers=[];
    pts.forEach(function(p){ planPoiMarkers.push(L.marker([p.lat,p.lon],{icon:poiIcon(p.kind)}).addTo(map)); });
  };
  window.setNearbyMarkers=function(json){
    var pts=JSON.parse(json);
    nearbyMarkers.forEach(function(m){map.removeLayer(m);}); nearbyMarkers=[];
    pts.forEach(function(p,i){
      var m=L.marker([p.lat,p.lon],{icon:poiIcon(p.kind)}).addTo(map);
      m.on('click', (function(idx){ return function(){ send({type:'nearbytap',idx:idx}); }; })(i));
      nearbyMarkers.push(m);
    });
  };
  window.highlightPoi=function(lat,lon){
    if(poiHighlight) map.removeLayer(poiHighlight);
    poiHighlight=L.circleMarker([lat,lon],{radius:24,color:'#0e9f6e',weight:3,fillColor:'#0e9f6e',fillOpacity:0.15}).addTo(map);
    try{ map.setView([lat,lon], 15, {animate:true}); }catch(e){}
  };
  window.clearHighlight=function(){ if(poiHighlight){ map.removeLayer(poiHighlight); poiHighlight=null; } };
  window.clearNearbyMarkers=function(){ nearbyMarkers.forEach(function(m){map.removeLayer(m);}); nearbyMarkers=[]; if(poiHighlight){map.removeLayer(poiHighlight);poiHighlight=null;} };
  window.clearPlan=function(){
    planMarkers.forEach(function(m){map.removeLayer(m);}); planMarkers=[];
    planPoiMarkers.forEach(function(m){map.removeLayer(m);}); planPoiMarkers=[];
    nearbyMarkers.forEach(function(m){map.removeLayer(m);}); nearbyMarkers=[];
    if(planLine){ map.removeLayer(planLine); planLine=null; }
  };
  window.fitPlan=function(){
    var b=null;
    if(planLine){ b=planLine.getBounds(); }
    else if(planMarkers.length){ b=L.latLngBounds(planMarkers.map(function(m){return m.getLatLng();})); }
    if(b){ try{ map.fitBounds(b.pad(0.25)); }catch(e){} }
  };

  send({type:'ready'});
</script>
</body>
</html>`;
