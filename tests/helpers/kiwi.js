const zlib = require('zlib');

const varuint = (n) => {
  const out = [];
  do { let b = n & 127; n = Math.floor(n / 128); if (n) b |= 128; out.push(b); } while (n);
  return out;
};
const varint = (n) => varuint(n < 0 ? (-n - 1) * 2 + 1 : n * 2);
const cstring = (s) => [...Buffer.from(s, 'utf8'), 0];
const float = (v) => {
  if (v === 0) return [0];
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, v);
  let bits = dv.getInt32(0);
  bits = (bits >>> 23) | (bits << 9);
  return [bits & 255, (bits >> 8) & 255, (bits >> 16) & 255, (bits >> 24) & 255];
};

const STRING = -6, FLOAT = -5;

const definition = (name, kind, fields) => [
  ...cstring(name), kind, ...varuint(fields.length),
  ...fields.flatMap(([n, type, array, value]) => [...cstring(n), ...varint(type), array, ...varuint(value)]),
];

const schema = () => Buffer.from([
  ...varuint(5),
  ...definition('NodeType', 0, [['TEXT', 0, 0, 1]]),
  ...definition('FontName', 1, [['family', STRING, 0, 1], ['style', STRING, 0, 2]]),
  ...definition('LetterSpacing', 1, [['value', FLOAT, 0, 1], ['units', STRING, 0, 2]]),
  ...definition('NodeChange', 2, [['type', 0, 0, 1], ['fontName', 1, 0, 2], ['fontSize', FLOAT, 0, 3], ['letterSpacing', 2, 0, 4]]),
  ...definition('Message', 2, [['nodeChanges', 3, 1, 1]]),
]);

const message = ({ style, fontSize, spacing, units }) => Buffer.from([
  ...varuint(1), ...varuint(1),
  ...varuint(1), 1,
  ...varuint(2), ...cstring('Inter'), ...cstring(style),
  ...varuint(3), ...float(fontSize),
  ...varuint(4), ...float(spacing), ...cstring(units),
  0,
  0,
]);

const chunk = (bytes) => {
  const packed = zlib.deflateRawSync(bytes), len = Buffer.alloc(4);
  len.writeUInt32LE(packed.length);
  return Buffer.concat([len, packed]);
};

const figFile = (node) => Buffer.concat([Buffer.alloc(12), chunk(schema()), chunk(message(node))]);

module.exports = { figFile };
