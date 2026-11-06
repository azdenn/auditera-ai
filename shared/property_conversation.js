/* Local conversation adapter. Inputs and replies are plain data so a future
   provider can use the same boundary. A proposal still needs paValidateBatch
   and explicit approval. This module has no network or storage access. */
var PropertyConversation = (function () {
  const normalize = value => String(value || '').toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
  function clarify(step, message, values, state = {}) {
    return {kind:'clarify', message, pending:{step, ...state},
      choices:values.map(value => typeof value === 'string' ? {value, label:value} : value)};
  }
  function scope(anchor, member) {
    return clarify('scope', 'How is '+member+' billed when '+anchor+' appears on the rent roll?', [
      {value:'conditional', label:'Included only when not separately billed'},
      {value:'included', label:'Always included in '+anchor},
      {value:'separate', label:'Separate — keep checking this charge'},
      {value:'unknown', label:'I’m not sure'}
    ], {anchor, member});
  }
  function chooseMember(anchor, members) {
    return clarify('member', 'Which charge should we clarify for '+anchor+'?', members, {anchor});
  }
  function packageChoices(context, members = []) {
    return clarify('anchor', 'Which billed package are you describing?', context.packages.map(p=>p.label), {members});
  }
  function keep() {
    return {kind:'keep', message:'You can view the results using the current findings.'};
  }
  function answer(request) {
    const {pending, choices, text, choice, context} = request;
    let selected = choices.find(option => option.value === choice);
    if (!selected) selected = choices.find(option => normalize(option.label) === normalize(text));
    if (!selected && pending.step === 'scope') {
      const value = normalize(text);
      if (/^(?:included )?(?:only (?:when|if) not separately billed|unless (?:it is )?separately billed)$/.test(value))
        selected = choices.find(option=>option.value==='conditional');
      if (/^(?:always included|included on all units)$/.test(value))
        selected = choices.find(option=>option.value==='included');
      if (/^(?:always )?separate$/.test(value))
        selected = choices.find(option=>option.value==='separate');
      if (/^(?:i m not sure|not sure|i don t know|unsure)$/.test(value))
        selected = choices.find(option=>option.value==='unknown');
    }
    if (!selected) return {kind:'clarify', message:'Please choose one of the answers below, or start a new explanation.', pending, choices};
    if (pending.step === 'anchor') {
      const group=context.packages.find(p=>p.label===selected.value);
      if (!group) return packageChoices(context);
      const members=pending.members.filter(member=>group.members.includes(member));
      return members.length===1 ? scope(group.label,members[0]) : chooseMember(group.label,members.length ? members : group.members);
    }
    if (pending.step === 'member') {
      const group=context.packages.find(p=>p.label===pending.anchor);
      if (!group || !group.members.includes(selected.value)) return packageChoices(context);
      return scope(group.label,selected.value);
    }
    if (selected.value === 'unknown') return {kind:'unresolved', message:'This charge still needs review. You can explain another charge or keep the original findings.'};
    const group=context.packages.find(p=>p.label===pending.anchor);
    if (!group || !group.members.includes(pending.member)) return packageChoices(context);
    const rule={type:selected.value==='separate'?'separate':'includes',rentRollLabel:pending.anchor,leaseLabels:[pending.member]};
    if (selected.value==='conditional') rule.scope='unitemised';
    return {kind:'proposal', rules:[rule], message:'Review this interpretation and its affected units before approving it.'};
  }
  function reply(request, helpers) {
    const text=String(request.text||'').trim();
    if (normalize(text)==='actually no') return {kind:'unresolved',message:'The proposal has been discarded. Explain the correction or use the guided choices.'};
    if (/^(?:no|no thanks|keep (?:the )?original (?:findings|results)|don t change anything|do not change anything)$/.test(normalize(text))) return keep();
    if (request.pending) return answer(request);
    if (!text) return {kind:'unresolved',message:'Describe one charge and how your property bills it.'};
    const {context}=request;
    const uncertain=/\b(?:maybe|perhaps|unsure|uncertain|sometimes|not sure|don t know)\b/.test(normalize(text));
    const parsed=helpers.parseRule(text);
    if (!uncertain && parsed && parsed.type==='alias') {
      return {kind:'proposal',rules:[parsed],message:'Review the charge-name interpretation below.'};
    }
    // Recognition only identifies a topic. Scope is explicitly confirmed in the
    // next turn, including when the initial sentence claims something is included.
    const labels=helpers.findLabels(text);
    const anchors=context.packages.filter(group=>labels.includes(group.label));
    const members=[...new Set(context.packages.flatMap(group=>group.members))].filter(member=>labels.includes(member));
    if (!context.packages.length) return {kind:'unresolved',message:'For this finding, use the guided choices or keep it for review. This local conversation currently supports charge names and package membership.'};
    if (anchors.length!==1) return packageChoices(context,members);
    const group=anchors[0], available=members.filter(member=>group.members.includes(member));
    if (available.length!==1) return chooseMember(group.label,available.length ? available : group.members);
    return scope(group.label,available[0]);
  }
  return {reply};
})();
if (typeof module !== 'undefined' && module.exports) module.exports=PropertyConversation;
