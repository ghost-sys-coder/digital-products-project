// The TikTok pixel loader for store pages, shared by the server (which renders it) and the browser
// (which reads the opt-out cookie). See lib/tiktok.ts for the server events.

export const OPT_OUT_COOKIE = "st_ads_optout";

/**
 * The pixel's loader, plus: skip everything when opted out, remember a TikTok click id (ttclid) from
 * the landing URL so checkout can send it with the purchase, and replay events queued before load.
 * The pixel id is validated on the server (letters and digits only) before it reaches this string.
 */
export function pixelLoader(pixelId: string) {
  return `(function(w,d,t){
if(navigator.globalPrivacyControl===true||/(?:^|; )${OPT_OUT_COOKIE}=1/.test(d.cookie))return;
try{var c=new URLSearchParams(location.search).get("ttclid");if(c&&/^[\\w.~:-]{1,500}$/.test(c))d.cookie="st_ttclid="+encodeURIComponent(c)+"; path=/; max-age=2592000; samesite=lax"+(location.protocol==="https:"?"; secure":"");}catch(e){}
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=r;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript";n.async=!0;n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load("${pixelId}");ttq.page();
(w.__stTtqPending||[]).forEach(function(a){ttq.track(a[0],a[1],a[2])});w.__stTtqPending=[];
})(window,document,"ttq");`;
}
