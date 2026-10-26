#!/usr/bin/perl
use strict; use warnings;
use File::Copy qw(copy);
use File::Path qw(make_path);
use File::Basename;
use Getopt::Long;

my ($path,$folder,$dry,$noart,$nodebug);
GetOptions('path=s'=>\$path,'folder=s'=>\$folder,'dry-run'=>\$dry,'no-artwork'=>\$noart,'no-debug-mode'=>\$nodebug);

my $here = dirname(__FILE__);
my $START='<!-- flow-gif-bg:start -->';
my $END='<!-- flow-gif-bg:end -->';
my $BACKUP='index.html.flowbg-backup';

sub say { print $_[0]."\n"; }

my @targets;
if ($path) {
  push @targets, $path;
} else {
  my @roots = (glob("~")."/Library/Application Support/Adobe/CEP/extensions", "/Library/Application Support/Adobe/CEP/extensions");
  for my $root (@roots) {
    next unless -d $root;
    opendir(my $dh,$root) or next;
    for my $name (readdir($dh)) {
      next if $name =~ /^\./;
      my $d="$root/$name";
      next unless -d $d;
      my $idx="$d/panel/index.html";
      my $css="$d/panel/css";
      next unless -f $idx && -d $css;
      my $isflow = ($name =~ /flow/i);
      if (!$isflow) {
        my $mf="$d/CSXS/manifest.xml";
        if (-f $mf) {
          open(my $fh,'<',$mf); local $/; my $t=<$fh>; close $fh;
          $isflow = 1 if $t =~ /rendertom\.flow|>Flow</;
        }
      }
      push @targets,$d if $isflow;
    }
    closedir($dh);
  }
}

if (!@targets) { print "Flow was not found.\n"; exit 1; }
for my $t (@targets) { print "  found  $t\n"; }

my $user_dir = $folder ? $folder : (glob("~")."/Documents/Flow Backgrounds");
my $user_uri = 'file://'.$user_dir;
$user_uri =~ s/ /%20/g;
# ensure trailing slash
$user_uri .= '/' unless $user_uri =~ /\/$/;

my $link='<link href="css/flow-bg.css" rel="stylesheet" />';
my $script_tag='<script type="text/javascript" src="js/flow-bg.js"></script>';
my $block=$START."\n    ".$link."\n    ".$script_tag."\n  ".$END;

sub clean_loose {
  my $t=shift;
  $t =~ s/^[ \t]*<!--[^<>\r\n]*(?:gif background|animated GIF|flow bg|flow-bg)[^<>\r\n]*-->[ \t]*\r?\n//gmi;
  $t =~ s/^[ \t]*<link[^>]*flow-bg\.css[^>]*\/?>[ \t]*\r?\n//gmi;
  $t =~ s/^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*<\/script>[ \t]*\r?\n//gmi;
  return $t;
}
sub clean_outside {
  my $t=shift;
  if ($t =~ /(\Q$START\E.*?\Q$END\E)/s) {
    my $m=$1;
    my $head=substr($t,0,index($t,$m));
    my $tail=substr($t,index($t,$m)+length($m));
    return clean_loose($head).$m.clean_loose($tail);
  }
  return clean_loose($t);
}

my @installed;
for my $target (@targets) {
  print "\nInstalling into ".basename($target)."\n";
  my $idx="$target/panel/index.html";
  my $cssd="$target/panel/css";
  my $jsd="$target/panel/js";
  make_path($cssd,$jsd) unless $dry;
  unless ($dry) {
    copy("$here/flow-bg.css","$cssd/flow-bg.css") or die $!;
    copy("$here/flow-bg.js","$jsd/flow-bg.js") or die $!;
  }
  print "  copied engine\n";
  my $cssf="$cssd/flow-bg.css";
  my $stamp="--flow-bg-dir: url('$user_uri');";
  unless ($dry) {
    open(my $fh,'<',$cssf); local $/; my $t=<$fh>; close $fh;
    $t =~ s/^[ \t]*--flow-bg-dir:[^;]*;/$stamp/m;
    open(my $out,'>',$cssf); print $out $t; close $out;
  }
  print "  point --flow-bg-dir at $user_dir\n";

  my $bak=dirname($idx)."/$BACKUP";
  open(my $fh,'<',$idx); local $/; my $raw=<$fh>; close $fh;
  if (index($raw,$START)<0) {
    unless ($dry || -f $bak) { copy($idx,$bak); }
  }
  my $new=clean_outside($raw);
  if (index($new,$START)>=0) {
    $new =~ s/\Q$START\E.*?\Q$END\E/$block/s;
    unless ($dry) { open(my $out,'>',$idx); print $out $new; close $out; }
    print "  refreshed block\n";
  } elsif ($new =~ /<\/head>/) {
    $new =~ s/<\/head>/$block\n  <\/head>/;
    unless ($dry) { open(my $out,'>',$idx); print $out $new; close $out; }
    print "  added block\n";
  } else {
    print "  ! could not find </head>\n"; next;
  }
  push @installed,$target;
}

print "\nYour picture folder\n";
make_path($user_dir) unless $dry;
unless ($dry) {
  open(my $fh,'>',"$user_dir/README.txt"); print $fh "Drop pictures here.\n"; close $fh;
}
my $sample="$here/bg.gif";
if (!$noart && -f $sample) {
  my $dest="$user_dir/bg.gif";
  if (-f $dest) { print "  picture already there - left untouched\n"; }
  else {
    copy($sample,$dest) unless $dry;
    print "  copied sample bg.gif\n";
  }
}

unless ($nodebug) {
  print "\nCEP debug mode\n";
  for my $n (6..15) {
    system('defaults','write',"com.adobe.CSXS.$n",'PlayerDebugMode','-string','1');
  }
}

print "\nDone.\n";
for my $t (@installed) { print "  installed into $t\n"; }
print "\nRemove with: ./Uninstall-FlowGifBg.pl\n";
