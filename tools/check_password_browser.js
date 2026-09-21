async (page) => {
  await page.goto('http://127.0.0.1:8765/');
  return await page.evaluate(async () => {
    const source = await (await fetch('./app.js')).text();
    const start = source.indexOf("$('password-change-form').addEventListener('submit'");
    const end = source.indexOf('async function navigateTo', start);
    const results = [];
    for (const fail of [false, true]) {
      const old = document.getElementById('password-change-form');
      const form = old.cloneNode(true); old.replaceWith(form);
      const $ = id => document.getElementById(id);
      const message = (id,text) => {$(id).textContent=text;};
      const authRequest = async () => {await new Promise(resolve=>setTimeout(resolve,20)); if(fail) throw new Error('fixture rejection'); return {id:'fixture-user'};};
      new Function('$','message','authRequest',"let token='fixture', userId='fixture-user';\n"+source.slice(start,end))($,message,authRequest);
      $('current-password').value='fixture-current';
      $('new-password').value=$('new-password-confirmation').value='fixture-new-password';
      form.dispatchEvent(new SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:$('password-change-submit')}));
      await new Promise(resolve=>setTimeout(resolve,100));
      const text = $('password-change-status').textContent;
      if(!text.includes(fail?'fixture rejection':'パスワードを変更しました。')) throw new Error('Unexpected status: '+text);
      if($('password-change-submit').disabled || $('current-password').value) throw new Error('Form did not recover');
      results.push(fail?'PASS rejection':'PASS success');
    }
    return results;
  });
}
