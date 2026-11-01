// Harness's dsh-session-reference wire format (MIT, DeepSeek AI, 2026).
export function sessionMention(sessionId,label){
 const bytes=new TextEncoder().encode(JSON.stringify(sessionId));
 const encoded=btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
 return '@['+String(label).replace(/[\\\]]/gu,value=>'\\'+value)+'](dsh-session:'+encoded+')';
}
