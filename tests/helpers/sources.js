const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');

const tooltipParts = () => fs.readdirSync(path.join(ROOT, 'tooltips')).filter((f) => f.endsWith('.js')).sort();

const tooltipsScript = () => `(function () {\n${tooltipParts().map((f) => read('tooltips', f)).join('\n')}\n})();`;

const updateButtonScript = () => `(${read('update-button.js').trim()})();`;

const pageFn = () => {
  const m = read('desktop', 'launch.js').match(/const PAGE_FN = `([\s\S]*?)`;\n/);
  return vm.runInNewContext('`' + m[1] + '`');
};

const userCss = () => {
  const s = read('userContent.css');
  const at = s.indexOf('@-moz-document');
  return s.slice(s.indexOf('{', at) + 1, s.lastIndexOf('}'));
};

const jsFiles = () => {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'tests'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) out.push(full);
    }
  };
  walk(ROOT);
  return out;
};

module.exports = { ROOT, read, tooltipParts, tooltipsScript, updateButtonScript, pageFn, userCss, jsFiles };
