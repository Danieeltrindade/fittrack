const L = require('./lib');
(async () => {
  const b = await L.chromium.launch(); await L.T.reset(); await L.T.flags({ requireConfirm: false });
  for (const [n, w, h, t] of [['m', 390, 844, true], ['d', 1280, 800, false]]) {
    const { p } = await L.open(b, { w, h, touch: t });
    await p.screenshot({ path: `/tmp/s-${n}-landing.png` });
    await p.click('[data-act=glogin]'); await p.screenshot({ path: `/tmp/s-${n}-login.png` });
    await p.click('[data-act=gland]'); await p.click('[data-act=gdemo]'); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/s-${n}-demo.png` });
    await p.click('#top [data-act=gexit]'); await L.signupAndLogin(p, `s${n}@teste.invalid`); await p.screenshot({ path: `/tmp/s-${n}-app.png` });
  }
  await b.close();
})();
