const test = require('node:test');
const assert = require('node:assert/strict');
const { runPage, available } = require('../helpers/chrome');
const { pageFn } = require('../helpers/sources');

const skip = !available && 'Chrome not found';
const CSS = '.probe{color:red}';
const inject = (css = CSS) => `${pageFn()};window.__figmaTweaks(${JSON.stringify(css)});`;
const figma = { host: 'figma.com', scripts: [inject()] };

test('the style is added once with the given css', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      const all = document.querySelectorAll('style#figma-tweaks');
      return { count: all.length, text: all[0].textContent, parent: all[0].parentElement.tagName };
    },
  });
  assert.deepEqual(result, { count: 1, text: CSS, parent: 'HEAD' });
});

test('pages outside figma.com get no style', { skip }, async () => {
  const result = await runPage({ scripts: [inject()], test: async () => document.querySelectorAll('style#figma-tweaks').length });
  assert.equal(result, 0);
});

test('the style comes back after the page removes it', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      document.getElementById('figma-tweaks').remove();
      await sleep(20);
      return { count: document.querySelectorAll('style#figma-tweaks').length, text: document.getElementById('figma-tweaks').textContent };
    },
  });
  assert.deepEqual(result, { count: 1, text: CSS });
});

test('the css text is restored after the page edits it', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      const style = document.getElementById('figma-tweaks');
      style.textContent = '';
      await sleep(20);
      const emptied = style.textContent;
      style.firstChild.data = 'broken';
      await sleep(20);
      return { emptied, edited: style.textContent };
    },
  });
  assert.deepEqual(result, { emptied: CSS, edited: CSS });
});

test('the style follows a replaced head and a replaced document element', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      const head = document.createElement('head');
      document.documentElement.replaceChild(head, document.head);
      await sleep(20);
      const inNewHead = head.querySelector('#figma-tweaks') !== null;
      const html = document.createElement('html');
      html.append(document.createElement('head'), document.createElement('body'));
      document.replaceChild(html, document.documentElement);
      await sleep(20);
      return { inNewHead, inNewRoot: html.querySelector('#figma-tweaks') !== null };
    },
  });
  assert.deepEqual(result, { inNewHead: true, inNewRoot: true });
});

test('a second injection replaces the css without a second style or observer', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      const first = window.__figmaTweaksObs;
      window.__figmaTweaks('.next{color:blue}');
      await sleep(20);
      return {
        count: document.querySelectorAll('style#figma-tweaks').length,
        text: document.getElementById('figma-tweaks').textContent,
        replaced: first !== window.__figmaTweaksObs,
      };
    },
  });
  assert.deepEqual(result, { count: 1, text: '.next{color:blue}', replaced: true });
});

test('the style keeps its css while the page keeps changing the head', { skip }, async () => {
  const result = await runPage({
    ...figma,
    test: async () => {
      for (let i = 0; i < 50; i++) document.head.appendChild(document.createElement('style')).textContent = `.x${i}{}`;
      await sleep(20);
      return { count: document.querySelectorAll('style#figma-tweaks').length, text: document.getElementById('figma-tweaks').textContent };
    },
  });
  assert.deepEqual(result, { count: 1, text: CSS });
});

const importPage = {
  ...figma,
  body: '<div id="outside">x</div><button id="more" data-testid="new-file-creation-more-button"><span id="inner">More</span></button>',
};

const importProbe = `
window.clicks = 0;
window.addItem = () => {
  const item = document.createElement('button');
  item.setAttribute('data-testid', 'file-import-button');
  item.addEventListener('click', () => { window.clicks++; item.remove(); });
  document.body.appendChild(item);
  return item;
};
const down = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
`;

test('More presses Import in the menu once it appears', { skip }, async () => {
  const result = await runPage({
    ...importPage,
    scripts: [inject(), importProbe],
    test: async () => {
      down(document.getElementById('inner'));
      await sleep(100);
      addItem();
      await sleep(20);
      document.getElementById('inner').click();
      await sleep(20);
      return clicks;
    },
  });
  assert.equal(result, 1);
});

test('the menu item that is already there is pressed at once', { skip }, async () => {
  const result = await runPage({
    ...importPage,
    scripts: [inject(), importProbe],
    test: async () => {
      addItem();
      down(document.getElementById('more'));
      await sleep(20);
      return clicks;
    },
  });
  assert.equal(result, 1);
});

test('other clicks do not press Import', { skip }, async () => {
  const result = await runPage({
    ...importPage,
    scripts: [inject(), importProbe],
    test: async () => {
      down(document.getElementById('outside'));
      await sleep(50);
      addItem();
      await sleep(50);
      return clicks;
    },
  });
  assert.equal(result, 0);
});

test('Import gives up after a second and works again on the next click', { skip }, async () => {
  const result = await runPage({
    ...importPage,
    scripts: [inject(), importProbe],
    test: async () => {
      down(document.getElementById('more'));
      await sleep(1200);
      addItem();
      await sleep(50);
      const late = clicks;
      down(document.getElementById('more'));
      await sleep(50);
      return { late, again: clicks };
    },
  });
  assert.deepEqual(result, { late: 0, again: 1 });
});
