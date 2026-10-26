#!/usr/bin/env python3
import argparse,os,sys,shutil,re,subprocess,urllib.parse
START='<!-- flow-gif-bg:start -->'; END='<!-- flow-gif-bg:end -->'; BACKUP='index.html.flowbg-backup'
def say(m): print(m,flush=True)
def clean_loose(t):
    for p in [r'(?m)^[ \t]*<!--[^<>\r\n]*(?:gif background|animated GIF|flow bg|flow-bg)[^<>\r\n]*-->[ \t]*\r?\n',r'(?m)^[ \t]*<link[^>]*flow-bg\.css[^>]*/?>[ \t]*\r?\n',r'(?m)^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*</script>[ \t]*\r?\n']:
        t=re.sub(p,'',t)
    return t
def clean_outside(t):
    m=re.search(re.escape(START)+'.*?'+re.escape(END),t,re.S)
    return clean_loose(t[:m.start()])+m.group(0)+clean_loose(t[m.end():]) if m else clean_loose(t)
def find_flow(pa):
    if pa: return [os.path.abspath(pa)]
    roots=[os.path.expanduser('~/Library/Application Support/Adobe/CEP/extensions'),'/Library/Application Support/Adobe/CEP/extensions']
    out=[]
    for r in roots:
        if not os.path.isdir(r): continue
        for n in os.listdir(r):
            d=os.path.join(r,n)
            if not os.path.isdir(d): continue
            if not (os.path.isfile(os.path.join(d,'panel','index.html')) and os.path.isdir(os.path.join(d,'panel','css'))): continue
            isf='flow' in n.lower()
            if not isf:
                mf=os.path.join(d,'CSXS','manifest.xml')
                if os.path.isfile(mf):
                    try:
                        if re.search(r'rendertom\.flow|>Flow<',open(mf).read()): isf=True
                    except: pass
            if isf: out.append(d)
    return out
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--path'); ap.add_argument('--folder'); ap.add_argument('--dry-run',action='store_true'); ap.add_argument('--no-artwork',action='store_true'); ap.add_argument('--no-debug-mode',action='store_true')
    a=ap.parse_args()
    here=os.path.dirname(os.path.abspath(__file__))
    targets=find_flow(a.path)
    if not targets:
        print('Flow was not found.'); sys.exit(1)
    for t in targets: print('  found  '+t)
    user_dir=a.folder or os.path.join(os.path.expanduser('~/Documents'),'Flow Backgrounds')
    user_uri='file://'+urllib.parse.quote(os.path.abspath(user_dir).replace(os.sep,'/'),safe='/')+'/'
    link='<link href="css/flow-bg.css" rel="stylesheet" />'; st='<script type="text/javascript" src="js/flow-bg.js"></script>'
    block=START+"\n    "+link+"\n    "+st+"\n  "+END
    installed=[]
    for target in targets:
        print('\nInstalling into '+os.path.basename(target))
        idx=os.path.join(target,'panel','index.html'); cssd=os.path.join(target,'panel','css'); jsd=os.path.join(target,'panel','js')
        os.makedirs(cssd,exist_ok=True); os.makedirs(jsd,exist_ok=True)
        if not a.dry_run:
            shutil.copyfile(os.path.join(here,'flow-bg.css'),os.path.join(cssd,'flow-bg.css'))
            shutil.copyfile(os.path.join(here,'flow-bg.js'),os.path.join(jsd,'flow-bg.js'))
        print('  copied engine')
        cssf=os.path.join(cssd,'flow-bg.css'); stamp="--flow-bg-dir: url('"+user_uri+"');"
        if not a.dry_run:
            t=open(cssf).read(); t=re.sub(r'(?m)^[ \t]*--flow-bg-dir:[^;]*;',stamp,t); open(cssf,'w').write(t)
        bak=os.path.join(os.path.dirname(idx),BACKUP); raw=open(idx).read()
        if START not in raw and not a.dry_run and not os.path.exists(bak): shutil.copyfile(idx,bak)
        new=clean_outside(raw)
        if START in new:
            new2=re.sub(re.escape(START)+'.*?'+re.escape(END),block,new,count=1,flags=re.S)
            if not a.dry_run: open(idx,'w').write(new2)
            print('  refreshed block')
        elif '</head>' in new:
            new2=new.replace('</head>',block+"\n  </head>",1)
            if not a.dry_run: open(idx,'w').write(new2)
            print('  added block')
        else:
            print('  ! no </head>'); continue
        installed.append(target)
    print('\nYour picture folder'); os.makedirs(user_dir,exist_ok=True)
    if not a.dry_run:
        with open(os.path.join(user_dir,'README.txt'),'w') as f: f.write('Drop pictures here.\n')
    sample=os.path.join(here,'bg.gif')
    if not a.no_artwork and os.path.isfile(sample):
        dest=os.path.join(user_dir,'bg.gif')
        if os.path.exists(dest): print('  picture already there - left untouched')
        else:
            if not a.dry_run: shutil.copyfile(sample,dest)
            print('  copied sample bg.gif')
    if not a.no_debug_mode:
        print('\nCEP debug mode'); 
        for n in range(6,14):
            try: subprocess.run(['defaults','write','com.adobe.CSXS.%d'%n,'PlayerDebugMode','-string','1'],check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            except: pass
    print('\nDone.'); 
    for t in installed: print('  installed into '+t)
    print('\nRemove with: ./Uninstall-FlowGifBg.py')
if __name__=='__main__': main()
