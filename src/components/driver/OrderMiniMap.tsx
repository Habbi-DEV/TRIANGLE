import { Navigation2 } from 'lucide-react';
import LeafletMap from '../shared/LeafletMap';
import { useLang } from '../../lib/i18n';

interface Props {
  lat: number;
  lng: number;
}

/**
 * A quick, non-interactive glance at the delivery location — shown on an
 * available order so the driver can gauge distance/direction before
 * deciding whether to accept it, without leaving the list.
 */
export default function OrderMiniMap({ lat, lng }: Props) {
  const { t } = useLang();
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className="relative mt-1.5 h-24 w-full overflow-hidden rounded-xl ring-1 ring-zinc-200">
      <LeafletMap
        center={[lat, lng]}
        zoom={14}
        markers={[{ id: 'dest', lat, lng, color: '#f97316' }]}
        interactive={false}
        className="h-full w-full"
      />
      <a
        href={gmapsUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-1.5 end-1.5 flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-zinc-700 shadow-sm ring-1 ring-zinc-200"
      >
        <Navigation2 size={10} />
        {t('driver.open_in_maps')}
      </a>
    </div>
  );
}
