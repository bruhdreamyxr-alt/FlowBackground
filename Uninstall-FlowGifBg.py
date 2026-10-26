#!/usr/bin/env python3
import argparse,os,sys,shutil,re
START='<!-- flow-gif-bg:start -->'; END='<!-- flow-gif-bg:end -->'; BACKUP='index.html.flowbg-backup'
def find_flow(pa):
    if pa: return [os.path.abspath(pa)]
    roots=[os.path.expanduser('~/Library/Application Support/Adobe/CEP/extensions'),'/Library/Application Support/Adobe/CEP/extensions']
    out=[]
    for r in roots:
        if not os.path.isdir(r): continue
        for n in os.listdir(r):
            d=os.path.join(r,n)
            if not os.path.isdir(d): continue
            idx=os.path.join(d,'panel','index.html')
            if not os.path.isfile(idx): continue
            try: raw=open(idx).read()
            except: continue
            if START in raw or os.path.exists(os.path.join(d,'panel',BACKUP)) or os.path.exists(os.path.join(d,'panel','css','flow-bg.css')):
                out.append(d)
    return out
def clean_loose(t):
    for p in [r'(?m)^[ \t]*<!--[^<>\r\n]*(?:gif background|animated GIF|flow bg|flow-bg)[^<>\r\n]*-->[ \t]*\r?\n',r'(?m)^[ \t]*<link[^>]*flow-bg\.css[^>]*/?>[ \t]*\r?\n',r'(?m)^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*</script>[ \t]*\r?\n']:
        t=re.sub(p,'',t)
    return t
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--path'); ap.add_argument('--keep-files',action='store_true'); ap.add_argument('--remove-artwork',action='store_true'); ap.add_argument('--dry-run',action='store_true')
    a=ap.parse_args()
    targets=find_flow(a.path)
    if not targets:
        print('Nothing installed to remove.'); return
    for target in targets:
        print('\nCleaning '+os.path.basename(target))
        idx=os.path.join(target,'panel','index.html'); bak=os.path.join(target,'panel',BACKUP)
        raw=open(idx).read()
        if START in raw:
            pat=re.compile(re.escape(START)+'.*?'+re.escape(END),re.S)
            cur=pat.sub('',raw)
            if not a.dry_run: open(idx,'w').write(cur)
            print('  removed block')
        elif os.path.exists(bak):
            if not a.dry_run: shutil.copyfile(bak,idx)
            cur=open(idx).read()
            print('  restored backup')
        else:
            cur=raw; print('  already clean')
        if not a.keep_files:
            loose=clean_loose(cur)
            if loose!=cur:
                if not a.dry_run: open(idx,'w').write(loose)
                cur=loose
                print('  removed loose lines')
        if os.path.exists(bak) and not a.dry_run:
            if START not in open(idx).read():
                os.remove(bak); print('  deleted backup')
        if not a.keep_files:
            for f in [os.path.join(target,'panel','css','flow-bg.css'),os.path.join(target,'panel','js','flow-bg.js')]:
                if os.path.exists(f):
                    if not a.dry_run: os.remove(f)
                    print('  deleted '+os.path.relpath(f,target))
        if a.remove_artwork:
            d=target
            for fn in os.listdir(d):
                if re.match(r'^(bg|bgs|background|my-bg|flow-bg|panel-bg)([-_. 0-9]*)?\.(gif|png|jpe?g|webp|bmp|apng)$',fn,re.I):
                    p=os.path.join(d,fn)
                    if os.path.isfile(p):
                        if not a.dry_run: os.remove(p)
                        print('  deleted picture '+fn)
    print('\nDone. Flow is back to stock.')
if __name__=='__main__': main()
