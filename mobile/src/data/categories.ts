import {
  HairdryerIcon, NailPolishIcon, ThreadNeedleIcon, WaxWarmerIcon, LipstickBrushIcon,
  FacialProfileIcon, BrideProfileIcon, HennaConeIcon, MassageHandsIcon,
} from '../components/IllustratedIcons';
import { IconComp } from './occasions';

export interface Category {
  id: string;
  name: string;
  Icon: IconComp;
  serviceType: string; // matches ServiceItem.name / Booking.serviceType
  tint: string;
}

/**
 * Home screen's category grid — a curated grouping over the platform's real
 * ServiceItem catalog (see scripts/seed-catalog.js), the same relationship
 * OCCASIONS has to serviceType. Tapping a category jumps straight into
 * NewBooking with that service preset.
 */
export const CATEGORIES = [
  { id: 'hair',    name: 'Hair',                  Icon: HairdryerIcon,     serviceType: 'Hair Styling',  tint: '#FCECEF' },
  { id: 'nails',   name: 'Nails',                 Icon: NailPolishIcon,    serviceType: 'Nails',         tint: '#F6EBC9' },
  { id: 'brows',   name: 'Brows & Lashes',        Icon: ThreadNeedleIcon,  serviceType: 'Threading',     tint: '#FCECEF' },
  { id: 'waxing',  name: 'Waxing & Hair Removal', Icon: WaxWarmerIcon,     serviceType: 'Waxing',        tint: '#F6EBC9' },
  { id: 'makeup',  name: 'Makeup',                Icon: LipstickBrushIcon, serviceType: 'Makeup',        tint: '#FCECEF' },
  { id: 'facials', name: 'Facials & Skin',        Icon: FacialProfileIcon, serviceType: 'Facial',        tint: '#F6EBC9' },
  { id: 'bridal',  name: 'Bridal',                Icon: BrideProfileIcon,  serviceType: 'Bridal Makeup', tint: '#FCECEF' },
  { id: 'henna',   name: 'Henna',                 Icon: HennaConeIcon,     serviceType: 'Mehendi',       tint: '#F6EBC9' },
  { id: 'spa',     name: 'Spa & Massage',         Icon: MassageHandsIcon,  serviceType: 'Massage',       tint: '#FCECEF' },
] as const satisfies Category[];
