// DeepSeek Dock 0.2.0 — six verified feature beats, one seekable timeline.
const loop = __LOOP__;
const tl=gsap.timeline({paused:true});
const move=(x,y,t,d=.45)=>tl.to('#cursor',{x,y,duration:d,ease:'power2.inOut'},t);
const click=t=>{tl.to('#cursor',{scale:.82,duration:.08},t);tl.to('#cursor',{scale:1,duration:.12},t+.08);};
const show=(s,t)=>tl.to(s,{autoAlpha:1,duration:.2,ease:'power2.out'},t);
const hide=(s,t)=>tl.to(s,{autoAlpha:0,duration:.18},t);
function initial(t){
 tl.set('#workspace,#main-panel,#top-title,.chatbody,.chatcomposer',{x:0},t);
 tl.set('#workspace,#chat-view,#source-row,#personal-row,#button-plus,.reply,#original-bubble,.document,.head,.viewport',{autoAlpha:1},t);
 if(t>0)tl.set('#home-view,#plugin-page,#custom,#demo-shade,#search-palette,#notification-feed,#bell-dot,#home-dot,#row-dot,#dock-drop,#dock-chat,#pin-menu,#personal-pin-menu,#unpin-menu,#pin-area,#pinned-personal,#new-session,#draft-note,#video,#button-close,#pause-symbol,#saved',{autoAlpha:0},t);
 tl.set('#drawer',{x:620,autoAlpha:0},t);
 tl.set('#dock-clock,#dock-plugin,#dock-works,#dock-chat,#dock-apps',{y:0},t);
 tl.set('#dock-home',{backgroundColor:'#e4e7e8',color:'#202428'},t);
 tl.set('#dock-plugin',{backgroundColor:'transparent',color:'#7b8287'},t);
 tl.set('#cursor',{x:1660,y:820,scale:1,autoAlpha:1},t);
 tl.set('#top-title',{innerText:'产品演示'},t);
 tl.set('#chat-pin',{innerText:'固定'},t);
 tl.set('#search-placeholder',{autoAlpha:1},t);
 if(t>0){tl.set('#search-query',{autoAlpha:0},t);tl.set('#search-query span',{opacity:0},t);}
 tl.set('#nav-back,#nav-forward',{opacity:.35},t);
 if(t>0)tl.set('#sent-bubble,#waiting-reply',{display:'none'},t);
 tl.set('#original-bubble,.reply',{display:'block'},t);
 tl.set('#play-symbol',{autoAlpha:1},t);
 tl.set('#notes-tab',{backgroundColor:'#fff'},t);tl.set('#video-tab',{backgroundColor:'#f2f3f3'},t);
 tl.set('#path-notes',{innerText:'示例项目 / 项目说明.md'},t);
 tl.set('#time-code',{innerText:'0:00 / 0:30'},t);
 tl.set('#progress',{scaleX:0},t);tl.set('#knob',{x:0},t);
 tl.set('#bar1,#bar2,#bar3,#bar4',{scaleY:.3},t);
 if(t>0)tl.set('.caption',{autoAlpha:0},t);tl.set('#cap0',{autoAlpha:1},t);
}
initial(0);
const stages=[[0,4.6],[4.8,11.6],[11.8,19.7],[20,27.7],[28,32.8],[33,41.8]];
stages.forEach(([a,b],i)=>{if(i)show('#cap'+i,a);hide('#cap'+i,b);});
// Sidebar collapse never removes the application rail.
move(323,181,.45);click(.95);
tl.to('#workspace,#main-panel',{x:-310,duration:.65,ease:'power3.inOut'},.95);
// The leading controls stay fixed. Reserve 35 px after their right edge,
// instead of carrying the title through the sidebar's full 310 px travel.
tl.to('#top-title',{x:-155,duration:.65,ease:'power3.inOut'},.95);
tl.to('.chatbody,.chatcomposer',{x:155,duration:.65,ease:'power3.inOut'},.95);
tl.set('#workspace',{autoAlpha:0},1.61);
move(145,356,1.85);move(323,181,2.65);click(3.1);
tl.set('#workspace',{autoAlpha:1},3.1);
tl.to('#workspace,#main-panel,.chatbody,.chatcomposer',{x:0,duration:.65,ease:'power3.inOut'},3.1);
tl.to('#top-title',{x:0,duration:.65,ease:'power3.inOut'},3.1);
// All Apps uses the real 0.2.0 labels, filters, monochrome icons and pin action.
move(145,468,4.85);click(5.3);show('#demo-shade,#custom',5.3);
move(724,696,6.25);click(6.7);
tl.set('#chat-pin',{innerText:'已固定'},6.7);show('#dock-chat',6.7);
tl.to('#dock-apps',{y:56,duration:.35,ease:'power3.inOut'},6.7);
move(1314,296,7.7);click(8.15);hide('#custom,#demo-shade',8.15);
// A real drag gesture is illustrated on the Dock, ending in its icon gap.
move(145,468,8.55);click(8.95);show('#dock-drop',9.05);
tl.to('#dock-chat',{opacity:.55,duration:.15},9.05);move(145,328,9.1,.7);
tl.to('#dock-chat',{y:-112,duration:.65,ease:'power3.inOut'},9.1);
tl.to('#dock-plugin,#dock-works',{y:56,duration:.65,ease:'power3.inOut'},9.2);
tl.to('#dock-chat',{opacity:1,duration:.15},9.85);hide('#dock-drop',9.85);
// Search titles and workspaces without claiming an enabled body index.
move(454,242,11.85);click(12.3);show('#demo-shade,#search-palette',12.3);
move(864,342,14.1);click(14.6);hide('#search-placeholder',14.6);show('#search-query',14.6);
tl.to('#search-query span',{opacity:1,duration:.01,stagger:.06},14.8);
move(875,458,16.15);click(16.6);hide('#search-palette,#demo-shade',16.6);
// The example completion event lights both entry dots. Acknowledging one
// result clears that result while keeping the history list visible.
show('#home-dot,#bell-dot,#row-dot',20.4);
move(416,242,20.8);click(21.25);show('#notification-feed',21.25);
move(312,424,23.1);click(23.55);hide('#home-dot,#bell-dot,#row-dot',23.55);
move(416,242,26.3);click(26.75);hide('#notification-feed',26.75);
// Back / Forward revisit registered main pages and existing conversations.
move(145,412,28.05);click(28.5);hide('#chat-view',28.5);show('#plugin-page',28.5);
tl.set('#top-title',{innerText:'插件'},28.5);
tl.set('#nav-back',{opacity:1},28.5);
tl.set('#dock-plugin',{backgroundColor:'#e4e7e8',color:'#202428'},28.5);tl.set('#dock-home',{backgroundColor:'transparent',color:'#7b8287'},28.5);
move(239,181,29);click(29.4);hide('#plugin-page',29.4);show('#chat-view',29.4);
tl.set('#top-title',{innerText:'产品演示'},29.4);tl.set('#nav-forward',{opacity:1},29.4);
tl.set('#nav-back',{opacity:.35},29.4);
tl.set('#dock-home',{backgroundColor:'#e4e7e8',color:'#202428'},29.4);tl.set('#dock-plugin',{backgroundColor:'transparent',color:'#7b8287'},29.4);
move(280,181,30.05);click(30.45);hide('#chat-view',30.45);show('#plugin-page',30.45);
tl.set('#top-title',{innerText:'插件'},30.45);tl.set('#nav-forward',{opacity:.35},30.45);
tl.set('#nav-back',{opacity:1},30.45);
tl.set('#dock-plugin',{backgroundColor:'#e4e7e8',color:'#202428'},30.45);tl.set('#dock-home',{backgroundColor:'transparent',color:'#7b8287'},30.45);
move(239,181,31.1);click(31.5);hide('#plugin-page',31.5);show('#chat-view',31.5);
tl.set('#top-title',{innerText:'产品演示'},31.5);tl.set('#nav-forward',{opacity:1},31.5);
tl.set('#nav-back',{opacity:.35},31.5);
tl.set('#dock-home',{backgroundColor:'#e4e7e8',color:'#202428'},31.5);tl.set('#dock-plugin',{backgroundColor:'transparent',color:'#7b8287'},31.5);
// The existing file drawer restores its open tabs, then plays/seeks the
// original illustrative media sample. No new model response is timed here.
move(1770,178,33.1);click(33.5);
tl.set('#drawer',{autoAlpha:1},33.5);tl.to('#drawer',{x:0,duration:.6,ease:'power3.inOut'},33.5);
tl.to('.chatbody,.chatcomposer',{x:-295,duration:.6,ease:'power3.inOut'},33.5);hide('#button-plus',33.5);show('#button-close',33.5);
move(1620,235,34.25);click(34.65);show('#video',34.65);hide('.document',34.65);
tl.set('#path-notes',{innerText:'示例项目 / 产品演示.mp4'},34.65);
tl.to('#notes-tab',{backgroundColor:'#f2f3f3',duration:.2},34.65);tl.to('#video-tab',{backgroundColor:'#fff',duration:.2},34.65);
move(1227,878,35);click(35.4);hide('#play-symbol',35.4);show('#pause-symbol',35.4);
tl.to('#bar1,#bar2,#bar3,#bar4',{scaleY:1,duration:1.7,ease:'power2.inOut'},35.4);
move(1246,909,37.2);click(37.55);move(1570,909,37.65,.55);
tl.to('#bar1',{scaleY:1.6,duration:.55,ease:'power2.inOut'},37.65);tl.to('#bar2',{scaleY:1.25,duration:.55,ease:'power2.inOut'},37.65);tl.to('#bar3',{scaleY:.8,duration:.55,ease:'power2.inOut'},37.65);
const media={seconds:0};
const paintMedia=()=>{document.getElementById('time-code').textContent='0:'+String(Math.floor(media.seconds)).padStart(2,'0')+' / 0:30';gsap.set('#progress',{scaleX:media.seconds/30});gsap.set('#knob',{x:562*media.seconds/30});};
tl.fromTo(media,{seconds:0},{seconds:2.2,duration:2.2,ease:'none',onUpdate:paintMedia,immediateRender:false},35.4);
tl.fromTo(media,{seconds:2.2},{seconds:20,duration:.55,ease:'none',onUpdate:paintMedia,immediateRender:false},37.65);
tl.fromTo(media,{seconds:20},{seconds:21.5,duration:1.5,ease:'none',onUpdate:paintMedia,immediateRender:false},38.2);
move(1227,878,39.3);click(39.7);hide('#pause-symbol',39.7);show('#play-symbol',39.7);
move(1770,178,40.05);click(40.45);
tl.to('#drawer',{x:620,duration:.6,ease:'power3.inOut'},40.45);tl.set('#drawer',{autoAlpha:0},41.06);
tl.to('.chatbody,.chatcomposer',{x:0,duration:.6,ease:'power3.inOut'},40.45);hide('#button-close',40.45);show('#button-plus',40.45);
hide('#cursor',41.8);show('#endcard',42);tl.set('.viewport,.head',{autoAlpha:0},42.21);
if(loop){initial(42.8);tl.to('#endcard',{autoAlpha:0,duration:.45,ease:'power2.inOut'},43.5);}
window.__timelines['ui-demo']=tl;
