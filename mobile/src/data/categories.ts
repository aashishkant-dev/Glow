import {
  ScissorsIcon, NailIcon, BrushIcon, WaxIcon, LipstickIcon, FacialIcon, CrownIcon, HennaIcon, LotusIcon,
} from '../components/BeautyIcons';
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
  { id: 'hair',    name: 'Hair',                  Icon: ScissorsIcon, serviceType: 'Hair Styling',  tint: '#FCECEF' },
  { id: 'nails',   name: 'Nails',                 Icon: NailIcon,     serviceType: 'Nails',         tint: '#F6EBC9' },
  { id: 'brows',   name: 'Brows & Lashes',        Icon: BrushIcon,    serviceType: 'Threading',     tint: '#FCECEF' },
  { id: 'waxing',  name: 'Waxing & Hair Removal', Icon: WaxIcon,      serviceType: 'Waxing',        tint: '#F6EBC9' },
  { id: 'makeup',  name: 'Makeup',                Icon: LipstickIcon, serviceType: 'Makeup',        tint: '#FCECEF' },
  { id: 'facials', name: 'Facials & Skin',        Icon: FacialIcon,   serviceType: 'Facial',        tint: '#F6EBC9' },
  { id: 'bridal',  name: 'Bridal',                Icon: CrownIcon,    serviceType: 'Bridal Makeup', tint: '#FCECEF' },
  { id: 'henna',   name: 'Henna',                 Icon: HennaIcon,    serviceType: 'Mehendi',       tint: '#F6EBC9' },
  { id: 'spa',     name: 'Spa & Massage',         Icon: LotusIcon,    serviceType: 'Massage',       tint: '#FCECEF' },
] as const satisfies Category[];
