p='C:/Users/antho/Downloads/scripts/FlowBackground/flow-bg.js'
s=open(p).read()
old="""      var names, best = null, i, re = anyName ? ANY_IMG_RE : NAME_RE;
      try { names = fs.readdirSync(dir); } catch (e) { return null; }     // folder absent
      for (i = 0; i < names.length; i++) {
        if (!re.test(names[i])) { continue; }
        var full = np.join(dir, names[i]), st;
        try { st = fs.statSync(full); } catch (e) { continue; }
        if (!st.isFile() || !st.size) { continue; }
        if (!best || st.mtimeMs > best.mt) {                             // newest wins
          best = { mt: st.mtimeMs, size: st.size, url: toUrl(full),
                   label: (prefix || '') + names[i] };
        }
      }
      return best;"""
new="""      var names, best = null, i, re = anyName ? ANY_IMG_RE : NAME_RE;
      try { names = fs.readdirSync(dir); } catch (e) { return null; }     // folder absent
      for (i = 0; i < names.length; i++) {
        var nm = String(names[i]);
        var bn = nm.replace(/.*[\\\\/]/, '');
        if (!re.test(bn)) { continue; }
        var full = (nm.indexOf('/') >= 0 || nm.indexOf('\\\\') >= 0) ? nm : np.join(dir, nm);
        var st = null;
        try { st = fs.statSync(full); } catch (e) { st = null; }
        var isFile = true, size = 1, mt = 0;
        if (st) {
          try { isFile = st.isFile(); } catch (e2) { isFile = true; }
          try { size = st.size || 1; } catch (e3) { size = 1; }
          try { mt = st.mtimeMs || 0; } catch (e4) { mt = 0; }
        }
        if (!isFile || !size) { continue; }
        if (!best || mt > best.mt) {                             // newest wins
          best = { mt: mt, size: size, url: toUrl(full),
                   label: (prefix || '') + bn };
        }
      }
      return best;"""
assert old in s
s=s.replace(old,new)
open(p,'w').write(s)
print('done')
'''
