import { Kiosk } from '@/components/app/kiosk';
import { InvalidStation } from './invalid';
import { loadStation, stationMetadata } from './station';

export const metadata = { title: 'Absen wajah', ...stationMetadata };

export default async function StationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { station, s, logo, enrolled } = await loadStation(token);
  if (!station) return <InvalidStation org={s['org.name']} />;
  return (
    <div className="dark min-h-dvh bg-background text-foreground">
      <Kiosk
        org={station.unit ? `${s['org.name']}, ${station.unit.name}` : s['org.name']} logo={logo} title={`Absen wajah, ${station.name}`}
        enabled={!!s['methods.faceKiosk']} requireLiveness={!!s['face.requireLiveness']} enrolled={enrolled}
        endpoint={`/api/v1/absen/${token}`} exitHref={null} requireLocation={station.requireLocation}
        fieldDutyHref={station.allowFieldDuty && s['methods.fieldDuty'] ? `/absen/${token}/dinas-luar` : null}
      />
    </div>
  );
}
