const L = require('./lib');
(async () => {
  const b = await L.chromium.launch(); await L.T.reset(); await L.T.flags({ requireConfirm: false });
  const { p } = await L.open(b);
  console.log('gate?', await L.gate(p), '|', (await L.txt(p, '#gate')).slice(0, 200).replace(/\n/g, ' / '));
  console.log('errs', p.errs);
  await L.signupAndLogin(p, 'a@teste.invalid');
  console.log('mode', await p.evaluate(() => Store.mode), 'gate?', await L.gate(p), 'errs', p.errs);
  console.log((await L.txt(p, '#top')).replace(/\n/g, ' / '), '|', (await L.txt(p, '#main')).slice(0, 160).replace(/\n/g, ' / '));
  await p.screenshot({ path: '/tmp/smoke1.png' });
  await b.close();
})();
