// Exercise build refusal branches without modifying any real source/artifact.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const realBuild = require('./build_tool.cjs');
const root = realBuild.ROOT;
let n = 0;
const check = (name, fn) => {fn();n++;console.log('PASS '+name);};
function runCheck(overrides={}) {
  vm.runInNewContext(fs.readFileSync(path.join(root,'build.cjs'),'utf8'), {
    require: name => name==='node:fs' ? {...fs,...overrides} : name==='./shared/build_tool.cjs' ? realBuild : require(name),
    process:{argv:['node','build.cjs','--check']},console:{log(){}},
  });
}
check('Current source and dist match', () => runCheck());
check('Modified artifact refuses release', () => assert.throws(() => runCheck({readFileSync:(p,...args) => {
  const bytes=fs.readFileSync(p,...args);
  return String(p).endsWith('leaseverify.html') ? Buffer.concat([Buffer.from(bytes),Buffer.from('changed')]) : bytes;
}}), /source\/dist mismatch/));
check('Missing artifact refuses release', () => assert.throws(() => runCheck({existsSync:p =>
  String(p).endsWith('depositverify.html') ? false : fs.existsSync(p)}), /source\/dist mismatch/));
check('Stale manifest refuses release', () => assert.throws(() => runCheck({readFileSync:(p,...args) =>
  String(p).endsWith('tools-build-manifest.json') ? '{}' : fs.readFileSync(p,...args)}), /manifest is stale/));
check('A missing inline marker refuses the build', () => {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'build_tool.cjs'),'utf8'), {
    module,__dirname,
    require:name=>name==='node:fs'?{...fs,readFileSync:(p,...args)=>{
      const bytes=fs.readFileSync(p,...args);
      return String(p).endsWith('template.html')?Buffer.from(bytes.toString().replace('<!--AUDIT_GATE-->','')):bytes;
    }}:require(name),
  });
  assert.throws(()=>module.exports.compose('lease'), /Expected exactly one/);
});
console.log(n+'/'+n+' passed');
