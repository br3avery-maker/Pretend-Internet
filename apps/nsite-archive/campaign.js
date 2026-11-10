import {campaignPrefix} from './vendor/archive-engine.js';

// The confirmed campaign is one description shape, not five magic strings: a
// role-phrase opener, a generic promise of resources, and an unrelated
// external link. Requiring all three keeps undecided near misses visible,
// which is what the curated baseline records: descriptions that only share an
// opener were deliberately retained rather than excluded.
const PROMISE=/\b(?:sharing|offering|providing|curated|curating|resources|insights|articles|guides|recommendations?)\b/iu;
const LINK=/(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,24}\b/iu;

export function campaignMatch(text){
  const prefix=campaignPrefix(text);
  if(!prefix)return null;
  const normalized=String(text).replace(/\s+/gu,' ').trim();
  if(!PROMISE.test(normalized)||!LINK.test(normalized))return null;
  return {prefix,reasons:['role-phrase','resource-promise','external-link']};
}
