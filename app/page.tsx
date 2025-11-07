"use client";

import dynamic from "next/dynamic";

const CityCanvas = dynamic(() => import("@/app/components/CityTimelapse").then(m => m.CityCanvas), { ssr: false });

export default function Page() {
  return (
    <main style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <CityCanvas />

      <div className="overlay">
        <div className="overlay-inner">
          <div>
            <div className="brand">Luxe Realty</div>
            <h1 className="headline">Website under development</h1>
            <p className="subcopy">
              We are crafting a modern real estate experience. Enjoy a time?lapse of a city rising ? from blueprint to skyline.
            </p>
            <div className="badge">
              <span style={{ width: 8, height: 8, background: "var(--brand)", borderRadius: 999 }} />
              Building the future of premium living
            </div>
          </div>

          <div className="footer">
            ? {new Date().getFullYear()} Luxe Realty ? All rights reserved ? Contact: <a href="mailto:hello@luxerealty.example">hello@luxerealty.example</a>
          </div>
        </div>
      </div>
      <div className="rim-light" />
    </main>
  );
}
