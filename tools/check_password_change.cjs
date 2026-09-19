const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('kasisougu/static/app.js', 'utf8');
const start = source.indexOf("$('password-change-form').addEventListener('submit'");
const end = source.indexOf("$('delete-local')", start);
async function check(failure) {
  let listener;
  const fields = Object.fromEntries(['current-password','new-password','new-password-confirmation'].map(id => [id, {value:id === 'current-password' ? 'fixture-current' : 'fixture-new-password', focus(){}}]));
  let resets = 0, status = '';
  const form = {addEventListener(type, fn){listener = fn;}, reset(){resets++;}};
  const button = {disabled:false};
  const context = {token:'fixture-session', userId:'fixture-user', $:id => id === 'password-change-form' ? form : fields[id], message:(id,text)=>{status=text;}, authRequest:async()=>{await Promise.resolve(); if(failure) throw new Error('fixture rejection'); return {id:'fixture-user'};}};
  vm.runInNewContext(source.slice(start,end), context);
  const event = {preventDefault(){},submitter:button,currentTarget:form};
  const pending = listener(event);
  // DOM dispatch clears currentTarget when the synchronous listener returns.
  event.currentTarget = null;
  await pending;
  assert.equal(button.disabled,false);
  assert.equal(resets,1);
  assert.ok(status.includes(failure ? 'fixture rejection' : 'パスワードを変更しました。'),status);
}
(async()=>{await check(false); await check(true); console.log('PASS: async success and rejection both reset the form and report the result');})().catch(error=>{console.error(error);process.exitCode=1;});
