const { generate } = require('./gen_synthetic_lease.cjs');
const path = require('path');

const OUT = p => path.join(__dirname, 'synthetic_leases', p);

(async () => {
  // A108 -- happy path: 12-month term (matches Rent Roll exactly), $0 deposit
  // + Lease Lock (matches Rent Roll's "Deposit Waiver Fee (LeaseLock)" $33
  // charge), single resident, fully signed both signature patterns.
  await generate({
    unit: 'A108', residentsRaw: 'Kevin Barfield', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '03/10/2026', leaseEndRaw: '03/09/2027',
    rent: 1495, deposit: 0,
    residentSignerNames: ['Kevin Barfield'], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('A108.pdf'));

  // A113 -- happy path: 13-month term (matches Rent Roll exactly), two
  // residents, $0 deposit + Lease Lock, fully signed.
  await generate({
    unit: 'A113', residentsRaw: 'Ashley Hominick, John Hominick', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '05/08/2026', leaseEndRaw: '06/07/2027',
    rent: 1852, deposit: 0,
    residentSignerNames: ['Ashley Hominick', 'John Hominick'], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('A113.pdf'));

  // A214 -- adversarial: resident name has a middle initial the Rent Roll
  // doesn't ("Briana J. Harper" vs "Briana Harper") -- should still MATCH.
  // Lease end date deliberately off by one day from the Rent Roll (08/04
  // instead of 08/03) -- should FAIL. Owner signature deliberately left
  // blank -- should FAIL. Deposit ($0 + Lease Lock) should PASS.
  await generate({
    unit: 'A214', residentsRaw: 'Briana J. Harper', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '05/23/2025', leaseEndRaw: '08/04/2026',
    rent: 1757, deposit: 0,
    residentSignerNames: ['Briana Harper'], ownerSignerName: null,
    signatureStyle: 'both',
  }, OUT('A214.pdf'));

  // A309 -- adversarial: unit number mismatch (lease says A309A, Rent Roll
  // says A309) -- should FAIL. Lease end date off by one day from the Rent
  // Roll (04/30 instead of 04/29) -- should FAIL. Traditional $800 deposit
  // matches. Fully signed.
  await generate({
    unit: 'A309A', residentsRaw: 'Roni Amster', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '05/01/2026', leaseEndRaw: '04/30/2027',
    rent: 1393, deposit: 800,
    residentSignerNames: ['Roni Amster'], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('A309.pdf'));

  // B304 -- format-tolerance happy path: resident written "Last, First" on
  // the lease ("Cline, Nick") vs "Nick Cline" on the Rent Roll -- should
  // still MATCH. Everything else matches exactly. Fully signed.
  await generate({
    unit: 'B304', residentsRaw: 'Cline, Nick', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '12/09/2025', leaseEndRaw: '12/07/2026',
    rent: 1354, deposit: 800,
    residentSignerNames: ['Nick Cline'], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('B304.pdf'));

  // B305 -- adversarial: resident name is a near-miss nickname ("Rob Colby"
  // vs Rent Roll's "Robert Colby") -- must NOT be treated as a match (per
  // the explicit "John Smith vs Jonathan Smith" requirement). Deposit
  // mismatch ($800 on the lease vs $2,800 on the Rent Roll). Dates match.
  // Fully signed.
  await generate({
    unit: 'B305', residentsRaw: 'Rob Colby', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '01/13/2026', leaseEndRaw: '01/18/2027',
    rent: 1384, deposit: 800,
    residentSignerNames: ['Rob Colby'], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('B305.pdf'));

  // C302 -- "Unable to Verify" + missing signature: the Security Deposit
  // field and Initial Lease Term dates are deliberately unparseable
  // (simulating a scan/format the extractor can't confidently read), so
  // those checks -- and the derived Lease Term Length check -- must show
  // "Unable to Verify" rather than guessing. Resident signature left blank.
  await generate({
    unit: 'C302', residentsRaw: 'James Jepson', owner: 'Garden Creek Apartments LLC',
    leaseStartRaw: '06/02/2025', leaseEndRaw: '10/01/2026',
    rent: 1254, deposit: 600,
    depositLineOverride: '$ ___________________________ 1254.00',
    leaseTermLineOverride: 'B. Initial Lease Term. Begins:_____________________________________ Ends at 11:59 p.m. on:_________________________________ See attached addendum',
    residentSignerNames: [null], ownerSignerName: 'Rajeev Kumar',
    signatureStyle: 'both',
  }, OUT('C302.pdf'));

  console.log('All synthetic test-unit leases generated.');
})();
