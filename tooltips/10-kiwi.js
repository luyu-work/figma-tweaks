// Part of the tooltips script, see 00-core.js. Parts are joined in file name order into one function by desktop/launch.js.
// Kiwi binary decoder, used to read a published style's .fig file.
  // ---- Font weight and letter spacing of a style ----
  // Figma serves the node of a published style as a small .fig file (Kiwi binary, two deflate chunks: the schema and
  // the data) from its own endpoint, with the user's session cookie. We read the TEXT node out of it, no token needed.
  function inflate(u8) {
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
    w.write(u8); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function kiwiDecode(schemaBytes, dataBytes) {
    function Reader(b) { this.b = b; this.i = 0; }
    Reader.prototype.byte = function () { return this.b[this.i++]; };
    Reader.prototype.varuint = function () { var v = 0, s = 0, c; do { c = this.b[this.i++]; v += (c & 127) * Math.pow(2, s); s += 7; } while (c & 128); return v; };
    Reader.prototype.varint = function () { var v = this.varuint(); return v % 2 ? -Math.floor(v / 2) - 1 : Math.floor(v / 2); };
    Reader.prototype.float = function () {
      var f = this.b[this.i];
      if (f === 0) { this.i++; return 0; }
      var bits = f | (this.b[this.i + 1] << 8) | (this.b[this.i + 2] << 16) | (this.b[this.i + 3] << 24);
      this.i += 4;
      bits = (bits << 23) | (bits >>> 9);
      var dv = new DataView(new ArrayBuffer(4)); dv.setInt32(0, bits); return dv.getFloat32(0);
    };
    Reader.prototype.string = function () { var s = this.i; while (this.b[this.i] !== 0) this.i++; var t = new TextDecoder().decode(this.b.subarray(s, this.i)); this.i++; return t; };
    Reader.prototype.varuint64 = function () { var v = 0n, s = 0n, c; do { c = this.b[this.i++]; v |= BigInt(c & 127) << s; s += 7n; } while (c & 128); return v; };

    var native = ['bool', 'byte', 'int', 'uint', 'float', 'string', 'int64', 'uint64'];
    var sr = new Reader(schemaBytes), defs = [], n = sr.varuint();
    for (var d = 0; d < n; d++) {
      var name = sr.string(), kind = sr.byte(), fc = sr.varuint(), fields = [];
      for (var f = 0; f < fc; f++) fields.push({ name: sr.string(), type: sr.varint(), arr: !!sr.byte(), value: sr.varuint() });
      defs.push({ name: name, kind: kind, fields: fields });
    }
    var dr = new Reader(dataBytes);
    function field(fl) { return fl.arr ? Array.from({ length: dr.varuint() }, function () { return read(fl.type); }) : read(fl.type); }
    function read(t) {
      if (t < 0) {
        switch (native[~t]) {
          case 'bool': return !!dr.byte();
          case 'byte': return dr.byte();
          case 'int': return dr.varint();
          case 'uint': return dr.varuint();
          case 'float': return dr.float();
          case 'string': return dr.string();
          default: return String(dr.varuint64());
        }
      }
      var def = defs[t], o = {};
      if (def.kind === 0) { var v = dr.varuint(); var e = def.fields.find(function (x) { return x.value === v; }); return e ? e.name : v; }
      if (def.kind === 1) { def.fields.forEach(function (fl) { o[fl.name] = field(fl); }); return o; }
      for (;;) {
        var id = dr.varuint();
        if (id === 0) break;
        var fl = def.fields.find(function (x) { return x.value === id; });
        if (!fl) throw new Error('unknown field ' + id);
        o[fl.name] = field(fl);
      }
      return o;
    }
    return read(defs.findIndex(function (d) { return d.name === 'Message'; }));
  }
