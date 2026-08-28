/* =========================================================================
   Property rules — the small, closed vocabulary a property's own conventions
   are allowed to be expressed in.

   WHY THIS FILE IS THE ANSWER TO "CAN SOMEONE JUST TYPE IT IN?"
   Free-form English into an audit tool sounds unbounded and dangerous. It is
   neither, because the OUTPUT space is tiny and fixed. There are exactly four
   things a rule can do, and every argument must be a charge label that
   actually appeared in the documents just uploaded. A sentence either compiles
   into one of those four shapes, using words from a list of roughly fifteen,
   or it does not compile at all and the person is told so.

   That is the whole trick. Whatever produces the rule -- the pattern detector,
   a language model reading a typed correction, or somebody clicking a
   checkbox -- has to come through this door, and this door validates against
   the documents rather than against its own confidence.

   NOTHING HERE TALKS TO A SERVER OR A MODEL. This is the schema, the
   validator, and the evidence check. It is deliberately dependency-free so it
   can be inlined into the tools and unit-tested on its own.
   ========================================================================= */

/* The four verbs. This list is the safety boundary: a rule that is not one of
   these cannot be represented, so it cannot be saved, so it cannot run.

   ALIAS    these spellings all mean this one charge
   BUNDLE   these lease lines add up to this one rent roll line
   ROLLUP   this repeated finding becomes ONE property-level note
   HIDE     this charge category is not flagged at this property

   Note what is missing and stays missing: there is no verb for "change a
   number", no verb for "mark this as matched", and no verb that can reach a
   rent, a signature or a charge billed without being disclosed. Those are
   guarded again in PROTECTED_SUBJECTS below, because a boundary worth having
   is worth enforcing twice. */
var RULE_TYPES = ['alias', 'bundle', 'rollup', 'hide'];

/* Subjects no rule may ever touch, whoever asks and however they phrase it.
   These are the findings the product exists to produce; a tool that can be
   talked out of them is worth less than one that shows everything. */
var PROTECTED_SUBJECTS = {
  rent:       /^(rent|base rent|market rent|monthly rent|contract rent)$/i,
  signature:  /signature/i,
  undisclosed:/undisclosed|not on the lease|billed but/i,
};

function prNormalizeLabel(s){
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function prRound(n){ return Math.round((Number(n) || 0) * 100) / 100; }

/* ---------------------------------------------------------------------------
   Validation.

   `vocab` is the set of charge labels ACTUALLY SEEN in the documents for this
   property -- both sides, exactly as written. Every label a rule refers to
   must be in it. This is what stops a confidently-worded instruction (from a
   person or a model) inventing a charge that does not exist and silently
   matching nothing forever.

   Returns { ok, errors, warnings }. Errors block saving. Warnings do not --
   they are things worth saying on the confirmation screen.
   ------------------------------------------------------------------------- */
function prValidateRule(rule, vocab){
  var errors = [], warnings = [];
  var known = new Map();
  (vocab || []).forEach(function(v){ known.set(prNormalizeLabel(v), v); });

  function requireKnown(label, what){
    var key = prNormalizeLabel(label);
    if (!key){ errors.push(what + ' is empty.'); return null; }
    if (!known.has(key)){
      errors.push('“' + label + '” does not appear anywhere in these documents, ' +
                  'so a rule about it would never match anything.');
      return null;
    }
    return known.get(key);
  }

  function refuseProtected(label){
    for (var k in PROTECTED_SUBJECTS){
      if (PROTECTED_SUBJECTS[k].test(String(label || ''))){
        errors.push('Rules cannot be made about ' + k + '. “' + label + '” is one of the ' +
                    'things this audit exists to check, so it is never suppressed.');
        return true;
      }
    }
    return false;
  }

  if (!rule || typeof rule !== 'object'){ return {ok:false, errors:['No rule given.'], warnings:[]}; }
  if (RULE_TYPES.indexOf(rule.type) === -1){
    return {ok:false, errors:['“' + rule.type + '” is not something a rule can do. ' +
      'A rule can only be: ' + RULE_TYPES.join(', ') + '.'], warnings:[]};
  }

  if (rule.type === 'alias'){
    // { type:'alias', target:'Washer/Dryer', spellings:['WD Rent', ...] }
    refuseProtected(rule.target);
    requireKnown(rule.target, 'The charge this is an alias for');
    var sp = Array.isArray(rule.spellings) ? rule.spellings : [];
    if (!sp.length) errors.push('An alias rule needs at least one other spelling.');
    sp.forEach(function(s){ refuseProtected(s); requireKnown(s, 'The spelling “' + s + '”'); });
    if (sp.some(function(s){ return prNormalizeLabel(s) === prNormalizeLabel(rule.target); })){
      warnings.push('One of the spellings is the same as the charge itself — it will be ignored.');
    }
  }

  if (rule.type === 'bundle'){
    // { type:'bundle', rentRollLabel:'Community Fee', leaseLabels:[...] }
    refuseProtected(rule.rentRollLabel);
    requireKnown(rule.rentRollLabel, 'The rent roll line');
    var ll = Array.isArray(rule.leaseLabels) ? rule.leaseLabels : [];
    ll.forEach(function(l){ refuseProtected(l); requireKnown(l, 'The lease line “' + l + '”'); });
    if (ll.length < 2){
      errors.push('A bundle needs at least two lease lines. One lease line matching one rent ' +
                  'roll line is an alias, not a bundle — say “these are the same charge” instead.');
    }
  }

  if (rule.type === 'rollup' || rule.type === 'hide'){
    // { type:'rollup'|'hide', subject:'Community Fee 2', reason:'...' }
    refuseProtected(rule.subject);
    requireKnown(rule.subject, 'The charge to roll up');
    if (rule.type === 'hide' && !String(rule.reason || '').trim()){
      warnings.push('No reason recorded. Anyone reviewing this audit later will see the ' +
                    'finding is suppressed but not why.');
    }
  }

  return { ok: errors.length === 0, errors: errors, warnings: warnings };
}

/* ---------------------------------------------------------------------------
   The evidence check — the reason a typed instruction is safe to accept.

   A rule that validates is still only a CLAIM. This runs it against the units
   already reconciled and reports whether the documents agree: how many units
   it holds on, how many it contradicts, and an example of each.

   This is what lets the tool answer a typed correction with "I read that as
   Trash + Pest = Amenity Fee, but on your documents those come to $22 against
   a $35 Amenity Fee on 46 units" instead of just saving it and being quietly
   wrong for a year. Nothing else in this design does as much work to keep a
   confident sentence from becoming a bad rule.
   ------------------------------------------------------------------------- */
function prCheckRuleAgainstData(rule, entries){
  var holds = [], contradicts = [], seen = 0;
  var undisclosed = [];   // billed on the rent roll with no lease line at all

  (entries || []).forEach(function(e){
    var rows = (e && Array.isArray(e.rows)) ? e.rows : null;
    if (!rows) return;

    function findByLabel(label, side){
      var key = prNormalizeLabel(label);
      for (var i = 0; i < rows.length; i++){
        var raw = side === 'lease' ? rows[i].leaseRaw : rows[i].resmanRaw;
        if (raw && raw.some(function(x){ return prNormalizeLabel(x) === key; })) return rows[i];
        if (prNormalizeLabel(rows[i].label) === key) return rows[i];
      }
      return null;
    }

    if (rule.type === 'bundle'){
      var target = findByLabel(rule.rentRollLabel, 'resman');
      if (!target || target.resmanVal == null) return;
      var parts = rule.leaseLabels.map(function(l){ return findByLabel(l, 'lease'); });
      if (parts.some(function(p){ return !p || p.leaseVal == null; })) return;
      seen++;
      var sum = prRound(parts.reduce(function(s, p){ return s + p.leaseVal; }, 0));
      var rec = { unit: e.unit, sum: sum, billed: prRound(target.resmanVal) };
      if (Math.abs(sum - rec.billed) < 0.005) holds.push(rec); else contradicts.push(rec);
      return;
    }

    if (rule.type === 'alias'){
      var a = findByLabel(rule.target, 'resman') || findByLabel(rule.target, 'lease');
      rule.spellings.forEach(function(s){
        var r = findByLabel(s, 'resman') || findByLabel(s, 'lease');
        if (!r) return;
        seen++;
        var av = a ? (a.resmanVal != null ? a.resmanVal : a.leaseVal) : null;
        var rv = r.resmanVal != null ? r.resmanVal : r.leaseVal;
        var rec = { unit: e.unit, spelling: s, amount: prRound(rv), usual: av == null ? null : prRound(av) };
        // An alias whose amount never matches the charge it claims to be is
        // worth querying -- it may be a different charge that merely reads
        // like one. Not fatal: amounts legitimately vary by unit.
        if (av == null || Math.abs(rv - av) < 0.005) holds.push(rec); else contradicts.push(rec);
      });
      return;
    }

    if (rule.type === 'rollup' || rule.type === 'hide'){
      var s2 = findByLabel(rule.subject, 'lease') || findByLabel(rule.subject, 'resman');
      if (!s2) return;
      seen++;
      /* THE ONE THING NO RULE MAY QUIETEN, CHECKED AGAINST THE DOCUMENTS
         RATHER THAN AGAINST THE WORDING.

         PROTECTED_SUBJECTS above matches on what a charge is CALLED, which
         catches "rent" and "signature" because those are named the same
         everywhere. It cannot catch this one, because "billed but never
         disclosed" is not a name — it is a situation, and it wears whatever
         name the property gave the charge.

         Found in real data: a property bills Resident Liability Insurance on
         nearly every unit, and on many of those leases there is no such line
         at all. A rule rolling that up would have hidden money coming out of
         residents' accounts with nothing on their lease to justify it, under
         a label no keyword list would ever have flagged.

         So the row's own status decides. A charge that exists only on the rent
         roll cannot be rolled up or hidden, whoever asks. */
      if (s2.status === 'resmanonly'){
        undisclosed.push({ unit: e.unit, amount: prRound(s2.resmanVal), label: s2.label });
        return;
      }
      holds.push({ unit: e.unit, amount: prRound(s2.leaseVal != null ? s2.leaseVal : s2.resmanVal) });
      return;
    }
  });

  return {
    unitsExamined: seen,
    holdsOn: holds.length,
    contradictedOn: contradicts.length,
    // Non-empty means this rule would suppress a charge that appears on the
    // rent roll and on no lease. It is refused outright -- see the note in the
    // rollup/hide branch above.
    wouldHideUndisclosed: undisclosed,
    // Enough to show a person, not enough to bury them.
    examples: holds.slice(0, 3),
    counterExamples: contradicts.slice(0, 3),
    // A rule the documents argue with is offered, never auto-applied.
    confident: holds.length > 0 && contradicts.length === 0 && undisclosed.length === 0,
    blocked: undisclosed.length > 0,
  };
}

/* Plain-language sentence for the confirmation screen. Whatever wrote the rule,
   the person approving it reads this — so it describes the EFFECT, in the
   document's own words, rather than restating what they typed. */
function prDescribeRule(rule){
  if (!rule) return '';
  if (rule.type === 'alias'){
    return 'Treat ' + rule.spellings.map(function(s){ return '“' + s + '”'; }).join(' and ') +
           ' as the same charge as “' + rule.target + '”.';
  }
  if (rule.type === 'bundle'){
    return 'Treat ' + rule.leaseLabels.map(function(l){ return '“' + l + '”'; }).join(' + ') +
           ' on the lease as the single “' + rule.rentRollLabel + '” line on the rent roll.';
  }
  if (rule.type === 'rollup'){
    return 'Report “' + rule.subject + '” once for the whole property instead of on every unit.';
  }
  if (rule.type === 'hide'){
    return 'Stop flagging “' + rule.subject + '” at this property' +
           (rule.reason ? ' — ' + rule.reason : '') + '.';
  }
  return '';
}

/* A stable identity for a rule, so the same convention proposed twice is
   recognised as already saved (or already declined) rather than offered again
   every month. Order-independent: the same bundle listed in a different order
   is the same rule. */
function prRuleKey(rule){
  if (!rule || !rule.type) return '';
  if (rule.type === 'alias'){
    return 'alias::' + prNormalizeLabel(rule.target) + '::' +
      (rule.spellings || []).map(prNormalizeLabel).sort().join('|');
  }
  if (rule.type === 'bundle'){
    return 'bundle::' + prNormalizeLabel(rule.rentRollLabel) + '::' +
      (rule.leaseLabels || []).map(prNormalizeLabel).sort().join('|');
  }
  return rule.type + '::' + prNormalizeLabel(rule.subject);
}

/* WHY A SAVED RULE IS RE-EXAMINED EVERY SINGLE RUN
   -----------------------------------------------
   Persisting these was removed once, deliberately, for a good reason: a saved
   rule outlives the documents that justified it. Next month's export changes,
   the rule still matches by name, and it quietly suppresses a real mismatch.

   Persistence is only safe if that cannot happen quietly. So every saved rule
   is re-checked against the documents in front of it, and this decides what
   happens to one:

     'active'     the documents still support it -- apply it
     'suspended'  the documents now contradict it -- DO NOT apply, say so
     'dormant'    the charges it refers to are not in this export at all --
                  harmless, nothing to apply it to, no need to alarm anyone

   Suspension is the whole point. A rule that stops being true stops working
   the same month, and the person is told which rule and on which units, rather
   than finding out a year later that an audit had a hole in it. */
function prRuleStatus(rule, evidence){
  if (!evidence || !evidence.unitsExamined) return 'dormant';
  if (evidence.contradictedOn > 0) return 'suspended';
  return 'active';
}

function prExplainStatus(rule, evidence, status){
  if (status === 'dormant'){
    return 'Nothing in this export matches this rule, so it did nothing. Kept in case ' +
           'the charge comes back.';
  }
  if (status === 'suspended'){
    var eg = evidence.counterExamples[0];
    var detail = '';
    if (eg && eg.sum != null){
      detail = ' On unit ' + eg.unit + ' the lease lines come to ' + eg.sum.toFixed(2) +
               ' against ' + eg.billed.toFixed(2) + ' billed.';
    } else if (eg && eg.amount != null && eg.usual != null){
      detail = ' On unit ' + eg.unit + ' it is ' + eg.amount.toFixed(2) +
               ' where the charge it claims to be is ' + eg.usual.toFixed(2) + '.';
    }
    return 'Switched off for this run — the documents no longer agree with it on ' +
           evidence.contradictedOn + ' unit' + (evidence.contradictedOn === 1 ? '' : 's') +
           '.' + detail + ' Nothing was suppressed. Check whether the charge changed, ' +
           'then keep or remove this rule.';
  }
  return 'Holding on ' + evidence.holdsOn + ' unit' + (evidence.holdsOn === 1 ? '' : 's') +
         ' in this export.';
}

if (typeof module !== 'undefined' && module.exports){
  module.exports = { RULE_TYPES, PROTECTED_SUBJECTS, prNormalizeLabel,
                     prValidateRule, prCheckRuleAgainstData, prDescribeRule,
                     prRuleKey, prRuleStatus, prExplainStatus };
}
