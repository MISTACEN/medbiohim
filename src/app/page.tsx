"use client";

/** Главная: состояние приходит из хука, разметка — из шапки и виджетов. */
import { SkeletonCards } from "@/components/ui/Skeleton";
import { ServiceNoticeBanner } from "@/components/ui/ServiceNoticeBanner";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeSignedOut } from "@/components/home/HomeSignedOut";
import { homeWidgets } from "@/components/home/HomeWidgets";
import { useHomeDashboard } from "@/components/home/useHomeDashboard";
import { defaultHomeLayout } from "@/lib/home-layout";

export default function DashboardPage() {
  const page = useHomeDashboard();

  if (page.authLoading || page.loading) {
    return (
      <div className="space-y-6">
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (!page.hasToken || !page.user) {
    return <HomeSignedOut />;
  }

  const { error, data } = page;

  return (
    <div className="space-y-6">
      {error && (
        <ServiceNoticeBanner
          title={data ? "Часть данных главной временно недоступна" : "Главная временно без данных"}
          message={
            (data?.degraded_sources?.length
              ? `${error} Недоступно: ${data.degraded_sources.join(", ")}.`
              : error) + " Никакие тестовые или устаревшие данные не подставляются."
          }
        />
      )}

      <HomeHero page={page} />

      <HomeDashboard
        layout={page.homePrefs.layout}
        note={page.homePrefs.note}
        sync={page.homeSync}
        widgets={homeWidgets(page)}
        onChange={(layout) => page.applyHome({ ...page.homePrefs, layout })}
        onReset={() => page.applyHome({ layout: defaultHomeLayout(), note: "" })}
      />
    </div>
  );
}
