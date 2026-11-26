import { RecentIpos, UpcomingIpos } from "@/components/home/IpoTables";

export function HomepageV21Ipos() {
  return (
    <section className="hp-card grid gap-4 p-4 md:grid-cols-2">
      <RecentIpos />
      <UpcomingIpos />
    </section>
  );
}