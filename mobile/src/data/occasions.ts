import React from 'react';
import { CameraIcon } from '../components/TabIcons';
import {
  SparkleIcon, CrownIcon, LipstickIcon, HennaIcon, MirrorIcon, FacialIcon,
} from '../components/BeautyIcons';

export type IconComp = (p: { size?: number; color?: string }) => React.ReactElement;

export interface Occasion {
  id: string;
  name: string;
  sub: string;
  Icon: IconComp;
  serviceType: string | null; // null → opens a role picker (Wedding) — HomeScreen-only flow
  tint: string;
  big?: boolean;
}

/**
 * Occasion packages — shared catalog used by both HomeScreen's occasion grid
 * (the primary "what are we getting ready for" entry point) and
 * CreateBookingScreen's "For an occasion" section (a lower-priority second
 * path in the booking flow's service picker). Single source of truth so the
 * two screens can't silently drift out of sync.
 *
 * CreateBookingScreen doesn't implement the wedding-role picker, so it filters
 * out the `serviceType === null` ('wedding') entry when consuming this list —
 * see CreateBookingScreen.tsx's OCCASIONS usage.
 */
export const OCCASIONS: Occasion[] = [
  { id: 'wedding',    name: 'Wedding',       sub: 'Your big day, handled',   Icon: CrownIcon,    serviceType: null,            tint: '#FCECEF', big: true },
  { id: 'engagement', name: 'Engagement',    sub: 'Ring-light ready',        Icon: SparkleIcon,  serviceType: 'Bridal Makeup', tint: '#F6EBC9' },
  { id: 'reception',  name: 'Reception',     sub: 'Second-look sparkle',     Icon: MirrorIcon,   serviceType: 'Party Makeup',  tint: '#FCECEF' },
  { id: 'party',      name: 'Party',         sub: 'Full glam night',         Icon: SparkleIcon,  serviceType: 'Party Makeup',  tint: '#FCECEF' },
  { id: 'date',       name: 'Date Night',    sub: 'Soft & radiant',          Icon: LipstickIcon, serviceType: 'Makeup',        tint: '#F6EBC9' },
  { id: 'birthday',   name: 'Birthday',      sub: 'Main-character glow',     Icon: SparkleIcon,  serviceType: 'Party Makeup',  tint: '#FCECEF' },
  { id: 'festival',   name: 'Festival',      sub: 'Mehendi & shimmer',       Icon: HennaIcon,    serviceType: 'Mehendi',       tint: '#F6EBC9' },
  { id: 'office',     name: 'Office Event',  sub: 'Polished, not loud',      Icon: MirrorIcon,   serviceType: 'Makeup',        tint: '#FCECEF' },
  { id: 'photoshoot', name: 'Photoshoot',    sub: 'Camera-proof finish',     Icon: CameraIcon as IconComp, serviceType: 'Makeup', tint: '#F6EBC9' },
  { id: 'graduation', name: 'Graduation',    sub: 'Cap-and-gown glam',       Icon: CrownIcon,    serviceType: 'Party Makeup',  tint: '#FCECEF' },
  { id: 'everyday',   name: 'Everyday Glow', sub: 'Skin-first beauty',       Icon: FacialIcon,   serviceType: 'Facial',        tint: '#F6EBC9' },
];
