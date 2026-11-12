import {
  Award, Battery, Check, Clock, Droplet, Dumbbell, Eye, Feather, Flame, Gem, Gift, Heart, Leaf, Lock, Moon,
  Music, Palette, Recycle, RotateCcw, ShieldCheck, Smartphone, Smile, Sparkles, Star, Sun, ThumbsUp, Timer,
  Truck, Wifi, Zap, type LucideIcon,
} from "lucide-react";
import type { IconName } from "@/lib/store-page";

const ICON_COMPONENTS: Record<IconName, LucideIcon> = {
  sparkles: Sparkles, zap: Zap, "shield-check": ShieldCheck, truck: Truck, heart: Heart, star: Star, leaf: Leaf,
  droplet: Droplet, sun: Sun, moon: Moon, battery: Battery, wifi: Wifi, smartphone: Smartphone, dumbbell: Dumbbell,
  timer: Timer, flame: Flame, gem: Gem, gift: Gift, clock: Clock, check: Check, "thumbs-up": ThumbsUp, award: Award,
  recycle: Recycle, feather: Feather, palette: Palette, music: Music, eye: Eye, smile: Smile, lock: Lock,
  "rotate-ccw": RotateCcw,
};

export function StoreIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  const Icon = ICON_COMPONENTS[name] ?? Check;
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

/** Picks a fitting icon for a trust badge from its wording. */
export function badgeIcon(text: string): IconName {
  const value = text.toLowerCase();
  if (/ship|deliver/.test(value)) return "truck";
  if (/return|refund|exchange/.test(value)) return "rotate-ccw";
  if (/secure|safe|checkout|pay/.test(value)) return "lock";
  if (/warrant|guarantee/.test(value)) return "shield-check";
  return "check";
}
