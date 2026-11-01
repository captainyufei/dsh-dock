import {createVideoRoute} from './video-route.js';

/** Media bytes use the Host's authenticated transport and composed filesystem. */
export const inject=['connection','fs'];
export function apply(ctx){
 ctx.effect(()=>ctx.connection.fetch.register(createVideoRoute(ctx.fs)),'chatgpt-rail: video media');
}
