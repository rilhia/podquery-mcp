/**
 * env.js — sanitizes the environment variables Claude Desktop injects from
 * manifest.json's `user_config` before any other module in this project
 * reads them.
 *
 * The bug this exists for: when an optional string `user_config` field is
 * left BLANK in Claude Desktop's extension settings UI, Claude Desktop does
 * not always substitute an empty string for that field's `${user_config.X}`
 * placeholder in manifest.json's `mcp_config.env` block — it can instead
 * pass the LITERAL, unresolved placeholder text (e.g.
 * `"${user_config.omni_oldest_date}"`) through as the environment variable's
 * value. Downstream code that only checked for blank/whitespace (as every
 * consumer in this project originally did) then treated that literal string
 * as a real, user-supplied value — e.g. `sync.js`'s `resolveOldestEpoch()`
 * tried to `Date.parse()` it and threw "OMNI_OLDEST_DATE is not a valid
 * date", and worse, `glookoConfigured()` in range.js / paths.js would have
 * treated a blank Glooko email or password the same way, wrongly deciding
 * credentials were configured and attempting a real login with garbage.
 *
 * Rather than repeat an "is this actually a real value?" check at every call
 * site, this module runs once, as early as possible (it must be the first
 * import in server.js, before any other project module is evaluated), and
 * normalizes every user_config-derived variable in place: unresolved
 * placeholders and blank/whitespace values are deleted from process.env
 * entirely (so `process.env.X` reads back `undefined`, exactly as if the
 * user had left it unset), and everything else is trimmed. Every existing
 * consumer's `Boolean(process.env.X && process.env.X.trim())`-style check
 * keeps working unchanged — it just now sees the truth.
 */

const MANAGED_KEYS = [
  'GLOOKO_EMAIL',
  'GLOOKO_PASSWORD',
  'GLOOKO_GLUCOSE_UNIT',
  'OMNI_UNITS',
  'OMNI_LOWER',
  'OMNI_UPPER',
  'OMNI_OLDEST_DATE',
  'OMNI_DATA_DIR',
  'OMNI_DB_PATH',
];

// Matches an entire value that is still exactly one unresolved `${...}`
// template placeholder — e.g. `${user_config.omni_oldest_date}` or
// `${HOME}` — with nothing else around it. Deliberately whole-string (not
// just "contains"), so a legitimate value that happens to include a literal
// "$" or "{" somewhere is never mistaken for a placeholder.
const UNRESOLVED_PLACEHOLDER = /^\$\{[^}]*\}$/;

function isUnresolvedOrBlank(value) {
  if (value === undefined || value === null) return true;
  const trimmed = String(value).trim();
  if (trimmed === '') return true;
  if (UNRESOLVED_PLACEHOLDER.test(trimmed)) return true;
  return false;
}

export function sanitizeUserConfigEnv(env = process.env) {
  for (const key of MANAGED_KEYS) {
    if (isUnresolvedOrBlank(env[key])) {
      delete env[key];
    } else {
      env[key] = String(env[key]).trim();
    }
  }
}

// Run immediately on import — see the module comment above for why this
// must be the very first import in server.js.
sanitizeUserConfigEnv();
