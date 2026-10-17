import { requireFan, fanScans, formatDate } from "@/lib/fan";
import { Page, Card, Empty, Points } from "@/components/ui";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";

export default async function ConcertsPage() {
  const { supabase, user } = await requireFan("/concerts");

  const [{ data: bands }, scans] = await Promise.all([
    supabase
      .from("bands")
      .select("uid, concert:concerts(id, name, artist, venue, date)")
      .eq("user_id", user.id),
    fanScans(supabase),
  ]);

  type C = { id: string; name: string; artist: string; venue: string; date: string };
  const byId = new Map<string, C>();
  for (const b of bands ?? []) {
    const c = (Array.isArray(b.concert) ? b.concert[0] : b.concert) as C | null;
    if (c) byId.set(c.id, c);
  }
  const concerts = [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Page>
      <Header title="Your shows" />
      <h1 className="text-3xl font-bold mb-5">Shows</h1>
      {concerts.length === 0 ? (
        <Empty>No shows yet. Claim a band to start your history.</Empty>
      ) : (
        <div className="space-y-4">
          {concerts.map((c) => {
            const mine = scans.filter((s) => s.activity?.concert_id === c.id);
            const total = mine.reduce((n, s) => n + (s.activity?.points ?? 0), 0);
            return (
              <Card key={c.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-lg">{c.artist}</p>
                    <p className="text-muted text-sm">
                      {c.venue} · {formatDate(c.date)}
                    </p>
                  </div>
                  <p className="text-accent font-mono text-lg">
                    <Points value={total} />
                  </p>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {mine.length === 0 && <li className="text-muted text-sm">No activities logged.</li>}
                  {mine.map((s) => (
                    <li key={s.id} className="flex justify-between text-sm">
                      <span>{s.activity?.name}</span>
                      <span className="text-muted font-mono">+{s.activity?.points}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      <Nav />
    </Page>
  );
}
