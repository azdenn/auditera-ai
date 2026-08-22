/* =========================================================================
   Property licence guard  —  shared verbatim across all three tools.

   WHY THIS EXISTS
   An account is licensed for specific properties ($50/property/month). Without
   this check, anyone handed a working username and password could audit any
   property at all, which makes the per-property pricing meaningless. This is
   the piece that actually binds an account to its properties.

   WHAT IT CAN AND CANNOT DO
   It reads identifiers out of the customer's own uploaded documents and
   refuses to proceed when they belong to a property the account isn't
   licensed for. That stops the realistic case completely: someone given a
   password uploads THEIR OWN property's exports, which name a different
   property, and are refused.

   It cannot stop someone who deliberately edits their documents to impersonate
   a licensed property. Nothing running in the browser can — the documents are
   supplied by the very person being checked. That residual case is a detection
   problem (usage analytics), not a lock problem. Do not add more locks here
   expecting to close it.

   WHAT IT MATCHES ON — grounded in real ResMan/TAA documents, not guesswork:
     - Rent roll (.xlsx): cell A2 holds the property name, written by ResMan,
       not typed by a user. Verified on real exports from two properties.
       There is NO address anywhere in a rent roll — checked every cell.
     - Leases (.pdf): carry the property name AND street address AND ZIP.
       Verified present in 8/8 real leases across both properties and
       multiple lease years.
   ========================================================================= */

/* Strip everything that varies between how a name is typed and how ResMan
   prints it: case, punctuation, "apartments"/"apts", doubled spaces. */
function pgNormalizeName(s){
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(apartments?|apts?|the|at|of|llc|lp|ltd|inc)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Address normalisation folds the abbreviations that differ between a lease
   ("525 Jones Avenue") and a database row ("525 Jones Ave"). Both appear in
   real documents — the same Blanco lease contains each spelling. */
const PG_STREET_WORDS = {
  avenue:'ave', av:'ave', street:'st', road:'rd', drive:'dr', circle:'cir',
  lane:'ln', boulevard:'blvd', court:'ct', place:'pl', parkway:'pkwy',
  highway:'hwy', terrace:'ter', trail:'trl', north:'n', south:'s',
  east:'e', west:'w'
};
function pgNormalizeAddress(s){
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => PG_STREET_WORDS[w] || w)
    .join(' ');
}

/* The distinctive part of an address: house number + first street word.
   "525 jones" / "110 bluebonnet". Deliberately short — enough to be specific,
   short enough to survive PDF line wrapping and OCR noise. */
function pgAddressKey(address){
  const n = pgNormalizeAddress(address);
  const m = /(\d{1,6})\s+([a-z]+)/.exec(n);
  return m ? (m[1] + ' ' + m[2]) : null;
}
function pgZip(address){
  const m = /\b(\d{5})\b/.exec(String(address || ''));
  return m ? m[1] : null;
}

/* Does a blob of document text identify this licensed property?
   Returns the strength of the evidence, because callers treat them
   differently: a name or street match is decisive, a bare ZIP is not
   (many properties share a ZIP). */
function pgMatchStrength(docText, prop){
  const hay = ' ' + pgNormalizeAddress(docText) + ' ';
  const hayName = ' ' + pgNormalizeName(docText) + ' ';

  const name = pgNormalizeName(prop.name);
  if (name && name.length >= 3 && hayName.indexOf(' ' + name + ' ') !== -1) return 'name';

  const key = pgAddressKey(prop.address);
  if (key && hay.indexOf(' ' + key + ' ') !== -1) return 'address';

  const zip = pgZip(prop.address);
  if (zip && hay.indexOf(' ' + zip + ' ') !== -1) return 'zip';

  return null;
}

/* Decide whether a document may be audited.

   Returns one of:
     {verdict:'ok',       property}   matched a licensed property
     {verdict:'blocked',  detected}   identified a property, none licensed
     {verdict:'unknown'}              nothing identifiable in the document
     {verdict:'unlicensed'}           account holds no licences at all

   'unknown' is NOT treated as a pass by callers that have a reliable
   identifier available (the rent roll always does). It exists for documents
   like scanned leases where no text can be extracted, so a bad scan doesn't
   masquerade as a licence failure. */
function pgCheckDocument(docText, licensed, detectedName){
  if (!Array.isArray(licensed) || licensed.length === 0) return {verdict:'unlicensed'};

  let best = null;
  for (const p of licensed){
    const s = pgMatchStrength(docText, p);
    if (s === 'name' || s === 'address') return {verdict:'ok', property:p, via:s};
    if (s === 'zip' && !best) best = p;
  }
  // A ZIP alone is too weak to authorise on its own, but if the document
  // named a property and that name matched nothing, that IS decisive.
  if (detectedName){
    const dn = pgNormalizeName(detectedName);
    if (dn) return {verdict:'blocked', detected: detectedName};
  }
  if (best) return {verdict:'unknown'};
  return {verdict:'unknown'};
}

/* Plain-language refusal text. The decision was: block, and say exactly why.
   So this never says "something went wrong" — it names what was found, what
   is licensed, and what to do next. */
function pgBlockMessage(detected, licensed){
  const names = (licensed || []).map(p => p.name).filter(Boolean);
  const list = names.length
    ? names.map(n => '“' + n + '”').join(' and ')
    : 'no properties';
  return 'These documents are for ' + (detected ? '“' + detected + '”' : 'a property') +
    ', which this account is not licensed for. This account is licensed for ' + list + '. ' +
    'If you have taken on a new property, it needs to be added to your subscription before you can audit it.';
}

function pgUnlicensedMessage(){
  return 'This account does not have an active property licence yet, so documents cannot be audited. ' +
    'Each property is licensed separately — contact us to add the property you are trying to audit.';
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { pgNormalizeName, pgNormalizeAddress, pgAddressKey, pgZip,
                     pgMatchStrength, pgCheckDocument, pgBlockMessage, pgUnlicensedMessage };
}
