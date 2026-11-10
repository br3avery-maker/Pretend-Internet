import {campaignPrefix} from './vendor/archive-engine.js';

// The confirmed campaign is one description shape, not five magic strings: a
// role-phrase opener, a generic promise of resources, and an unrelated
// external link. Requiring all three keeps undecided near misses visible,
// which is what the curated baseline records: descriptions that only share an
// opener were deliberately retained rather than excluded.
//
// Two guards keep the signature from collapsing into "opener plus anything".
// The promise is looked for after the opener, because two of the five role
// phrases ("Community writer sharing", "Digital resources editor") already
// contain a promise word and would otherwise satisfy it for every publication.
// A bare candidate whose last label is a file or asset extension
// ("index.html", "Node.js", "data.json") is a file reference, not an external
// link; a full URL or a `www.` form is always a link.
const PROMISE=/\b(?:sharing|offering|providing|curated|curating|resources|insights|articles|guides|recommendations?)\b/iu;
const URL_LIKE=/(?:https?:\/\/|www\.)\S+/iu;
const BARE_DOMAIN=/\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,24}\b/giu;
const FILE_EXTENSION=/\.(?:html?|xhtml|css|mjs|cjs|jsx?|tsx?|jsonl?|txt|md|markdown|png|jpe?g|webp|gif|svg|ico|pdf|epub|mobi|zip|gz|tgz|tar|rar|7z|wav|mp3|m4a|ogg|flac|mp4|mov|webm|avi|xml|rss|atom|csv|tsv|wasm|apk|aab|exe|msi|dmg|iso|ya?ml|toml|lock|py|rb|rs|cpp|hpp|java|kt|swift|dart|ps1|sh|ipynb|sql|sqlite|log)$/iu;

function externalLink(text){
  if(URL_LIKE.test(text))return true;
  for(const candidate of text.matchAll(BARE_DOMAIN))
    if(!FILE_EXTENSION.test(candidate[0]))return true;
  return false;
}

export function campaignMatch(text){
  const prefix=campaignPrefix(text);
  if(!prefix)return null;
  const normalized=String(text).replace(/\s+/gu,' ').trim();
  if(!PROMISE.test(normalized.slice(prefix.length))||!externalLink(normalized))return null;
  return {prefix,reasons:['role-phrase','resource-promise','external-link']};
}
