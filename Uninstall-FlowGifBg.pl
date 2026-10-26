#!/usr/bin/perl
use File::Spec;

use strict; use warnings;
use File::Copy qw(copy);
use File::Path qw(remove_tree);
use File::Basename;
use Getopt::Long;

my ($path,$keep,$removeart,$dry);
GetOptions('path=s'=>\$path,'keep-files'=>\$keep,'remove-artwork'=>\$removeart,'dry-run'=>\$dry);

my $START='<!-- flow-gif-bg:start -->';
my $END='<!-- flow-gif-bg:end -->';
my $BACKUP='index.html.flowbg-backup';

sub find_flow {
  my $pa=shift;
  if ($pa) { return ($pa); }
  my @roots=(glob("~")."/Library/Application Support/Adobe/CEP/extensions","/Library/Application Support/Adobe/CEP/extensions");
  my @out;
  for my $root (@roots) {
    next unless -d $root;
    opendir(my $dh,$root) or next;
    for my $name (readdir($dh)) {
      next if $name=~/^\./;
      my $d="$root/$name";
      next unless -d $d;
      my $idx="$d/panel/index.html";
      next unless -f $idx;
      open(my $fh,'<',$idx); local $/; my $raw=<$fh>; close $fh;
      if (index($raw,$START)>=0 || -f "$d/panel/$BACKUP" || -f "$d/panel/css/flow-bg.css") {
        push @out,$d;
      }
    }
    closedir($dh);
  }
  return @out;
}

my @targets=find_flow($path);
if (!@targets) { print "Nothing installed to remove.\n"; exit 0; }

for my $target (@targets) {
  print "\nCleaning ".basename($target)."\n";
  my $idx="$target/panel/index.html";
  my $bak="$target/panel/$BACKUP";
  open(my $fh,'<',$idx); local $/; my $raw=<$fh>; close $fh;
  my $cur=$raw;
  if (index($raw,$START)>=0) {
    $cur =~ s/\Q$START\E.*?\Q$END\E//s;
    unless ($dry) { open(my $out,'>',$idx); print $out $cur; close $out; }
    print "  removed block\n";
  } elsif (-f $bak) {
    unless ($dry) { copy($bak,$idx); }
    open(my $fh2,'<',$idx); local $/; $cur=<$fh2>; close $fh2;
    print "  restored backup\n";
  } else {
    print "  already clean\n";
  }
  unless ($keep) {
    # remove loose lines
    my $loose=$cur;
    $loose =~ s/^[ \t]*<!--[^<>\r\n]*(?:gif background|animated GIF|flow bg|flow-bg)[^<>\r\n]*-->[ \t]*\r?\n//gmi;
    $loose =~ s/^[ \t]*<link[^>]*flow-bg\.css[^>]*\/?>[ \t]*\r?\n//gmi;
    $loose =~ s/^[ \t]*<script[^>]*flow-bg\.js[^>]*>[ \t]*<\/script>[ \t]*\r?\n//gmi;
    if ($loose ne $cur) {
      unless ($dry) { open(my $out,'>',$idx); print $out $loose; close $out; }
      $cur=$loose;
      print "  removed loose lines\n";
    }
  }
  if (-f $bak && !$dry) {
    open(my $fh2,'<',$idx); local $/; my $now=<$fh2>; close $fh2;
    if (index($now,$START)<0) { unlink $bak; print "  deleted backup\n"; }
  }
  unless ($keep) {
    for my $f ("$target/panel/css/flow-bg.css","$target/panel/js/flow-bg.js") {
      if (-f $f) { unlink $f unless $dry; print "  deleted ".File::Spec->abs2rel($f,$target)."\n"; }
    }
  }
  if ($removeart) {
    opendir(my $dh,$target) or next;
    for my $fn (readdir($dh)) {
      if ($fn =~ /^(bg|bgs|background|my-bg|flow-bg|panel-bg)([-_. 0-9]*)?\.(gif|png|jpe?g|webp|bmp|apng)$/i) {
        my $p="$target/$fn";
        if (-f $p) { unlink $p unless $dry; print "  deleted picture $fn\n"; }
      }
    }
    closedir($dh);
  }
}
print "\nDone. Flow is back to stock.\n";
use File::Spec;
