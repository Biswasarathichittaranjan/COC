// Historical Bay of Bengal cyclones used as replay scenarios.
//
// Tracks are approximate reconstructions from public best-track summaries (IMD / JTWC), rounded to
// ~0.1 deg and 5 kt; they are for exercise and calibration, not climatological analysis.
// "reported.peakSurgeM" ranges are approximate values from post-event reporting and literature.

import type { Storm, TrackPoint } from "../types";

type Row = [t: string, lat: number, lon: number, vmaxKt: number, pcHpa?: number];

function track(rows: Row[]): TrackPoint[] {
  return rows.map(([t, lat, lon, vmaxKt, pcHpa]) => ({ t: `${t}:00Z`, lat, lon, vmaxKt, pcHpa }));
}

export const HISTORICAL_STORMS: Storm[] = [
  {
    id: "amphan-2020",
    name: "Amphan",
    year: 2020,
    source: "historical",
    landfallPlace: "Bakkhali, West Bengal (near Sagar Island)",
    summary:
      "Super cyclone that rapidly intensified over the central Bay and crossed the Sundarbans on 20 May 2020; severe wind damage to Kolkata and extensive embankment breaches.",
    reported: { peakSurgeM: [2.5, 5], notes: "Sundarbans embankment overtopping; Kolkata wind damage" },
    track: track([
      ["2020-05-16T00:00", 10.4, 86.5, 25, 1002],
      ["2020-05-16T12:00", 11.0, 86.3, 35, 998],
      ["2020-05-17T00:00", 11.7, 86.1, 55, 990],
      ["2020-05-17T12:00", 12.3, 86.0, 90, 966],
      ["2020-05-18T00:00", 13.0, 86.2, 130, 935],
      ["2020-05-18T12:00", 14.1, 86.4, 140, 920],
      ["2020-05-19T00:00", 15.6, 86.6, 125, 932],
      ["2020-05-19T12:00", 17.6, 87.0, 115, 942],
      ["2020-05-20T00:00", 19.4, 87.6, 100, 955],
      ["2020-05-20T06:00", 20.6, 88.0, 95, 960],
      ["2020-05-20T12:00", 21.8, 88.4, 85, 968],
      ["2020-05-20T18:00", 22.9, 88.8, 60, 985],
      ["2020-05-21T00:00", 23.9, 89.2, 40, 994],
      ["2020-05-21T06:00", 24.9, 89.6, 25, 1000],
    ]),
  },
  {
    id: "fani-2019",
    name: "Fani",
    year: 2019,
    source: "historical",
    landfallPlace: "Puri, Odisha",
    summary:
      "Extremely severe cyclone that made landfall near Puri on 3 May 2019. Odisha's evacuation of ~1.2 million people kept fatalities low despite major power-grid and tree-fall damage.",
    reported: { peakSurgeM: [1.2, 2], notes: "Grid collapse across Puri/Khordha; ~1.2 million evacuated" },
    track: track([
      ["2019-04-27T00:00", 5.6, 88.6, 35, 1000],
      ["2019-04-28T00:00", 7.5, 87.8, 50, 992],
      ["2019-04-29T00:00", 9.6, 86.9, 60, 988],
      ["2019-04-30T00:00", 12.0, 85.6, 90, 968],
      ["2019-05-01T00:00", 14.3, 84.8, 120, 947],
      ["2019-05-01T12:00", 15.5, 84.6, 135, 932],
      ["2019-05-02T00:00", 16.6, 84.7, 130, 937],
      ["2019-05-02T12:00", 17.9, 85.0, 125, 940],
      ["2019-05-03T00:00", 19.3, 85.5, 115, 950],
      ["2019-05-03T03:00", 19.8, 85.8, 110, 952],
      ["2019-05-03T12:00", 21.2, 86.6, 75, 975],
      ["2019-05-04T00:00", 22.8, 87.9, 45, 990],
      ["2019-05-04T12:00", 24.3, 89.3, 30, 998],
    ]),
  },
  {
    id: "sidr-2007",
    name: "Sidr",
    year: 2007,
    source: "historical",
    landfallPlace: "Baleshwar river mouth (Barguna/Bagerhat), Bangladesh",
    summary:
      "Category-5-equivalent cyclone that struck south-western Bangladesh on 15 Nov 2007 with a 5-6 m surge; Bangladesh's shelter network and CPP volunteers limited losses relative to 1970/1991.",
    reported: { peakSurgeM: [4.5, 6], notes: "Surge heaviest in Barguna, Patuakhali, Bagerhat" },
    track: track([
      ["2007-11-11T12:00", 10.0, 92.3, 30, 1000],
      ["2007-11-12T12:00", 11.4, 91.4, 55, 990],
      ["2007-11-13T12:00", 13.0, 90.2, 85, 970],
      ["2007-11-14T12:00", 15.3, 89.5, 125, 940],
      ["2007-11-15T00:00", 17.3, 89.4, 140, 926],
      ["2007-11-15T12:00", 20.2, 89.5, 135, 932],
      ["2007-11-15T17:00", 21.8, 89.8, 125, 940],
      ["2007-11-16T00:00", 23.2, 90.3, 75, 975],
      ["2007-11-16T12:00", 25.2, 91.3, 35, 996],
    ]),
  },
  {
    id: "nargis-2008",
    name: "Nargis",
    year: 2008,
    source: "historical",
    landfallPlace: "Ayeyarwady delta, Myanmar",
    summary:
      "Turned east and struck the low-lying Ayeyarwady delta on 2 May 2008; a ~3.5-4 m surge penetrated tens of kilometres inland in Myanmar's deadliest recorded disaster.",
    reported: { peakSurgeM: [3.5, 5], notes: "Labutta, Bogale and Pyapon townships inundated" },
    track: track([
      ["2008-04-28T00:00", 12.3, 86.3, 45, 994],
      ["2008-04-29T00:00", 13.5, 86.2, 70, 980],
      ["2008-04-30T00:00", 14.2, 86.6, 75, 976],
      ["2008-05-01T00:00", 14.8, 88.6, 85, 968],
      ["2008-05-01T12:00", 15.3, 90.6, 95, 960],
      ["2008-05-02T00:00", 15.7, 92.6, 110, 948],
      ["2008-05-02T12:00", 15.9, 94.4, 115, 944],
      ["2008-05-02T18:00", 16.4, 95.5, 100, 955],
      ["2008-05-03T00:00", 16.9, 96.4, 75, 975],
      ["2008-05-03T12:00", 17.6, 97.9, 40, 994],
    ]),
  },
  {
    id: "mocha-2023",
    name: "Mocha",
    year: 2023,
    source: "historical",
    landfallPlace: "Near Sittwe, Rakhine (between Cox's Bazar and Kyaukphyu)",
    summary:
      "Very intense cyclone that crossed the coast near Sittwe on 14 May 2023, threatening Rohingya camps in Cox's Bazar and IDP camps in Rakhine.",
    reported: { peakSurgeM: [2.5, 4], notes: "Sittwe low-lying wards and IDP camps flooded" },
    track: track([
      ["2023-05-11T00:00", 11.5, 88.0, 35, 1000],
      ["2023-05-12T00:00", 12.9, 88.2, 60, 988],
      ["2023-05-12T12:00", 14.2, 88.5, 90, 966],
      ["2023-05-13T00:00", 15.6, 89.2, 125, 940],
      ["2023-05-13T12:00", 16.9, 90.3, 145, 922],
      ["2023-05-14T00:00", 18.5, 91.6, 140, 926],
      ["2023-05-14T07:00", 20.1, 92.8, 125, 938],
      ["2023-05-14T12:00", 21.2, 93.4, 80, 972],
      ["2023-05-15T00:00", 23.0, 94.2, 35, 996],
    ]),
  },
  {
    id: "remal-2024",
    name: "Remal",
    year: 2024,
    source: "historical",
    landfallPlace: "Between Sagar Island and Khepupara (near Mongla)",
    summary:
      "Slow-moving severe cyclone that made landfall on 26 May 2024; prolonged surge and rainfall breached embankments in Khulna and Barishal divisions.",
    reported: { peakSurgeM: [1.5, 2.5], notes: "Long-duration inundation; heavy rain in NE India afterwards" },
    track: track([
      ["2024-05-24T12:00", 15.8, 89.3, 30, 996],
      ["2024-05-25T00:00", 17.0, 89.2, 40, 992],
      ["2024-05-25T12:00", 18.5, 89.3, 50, 986],
      ["2024-05-26T00:00", 19.9, 89.3, 60, 980],
      ["2024-05-26T12:00", 21.2, 89.3, 65, 978],
      ["2024-05-26T18:00", 21.8, 89.3, 65, 978],
      ["2024-05-27T00:00", 22.5, 89.4, 50, 986],
      ["2024-05-27T12:00", 23.5, 90.0, 30, 996],
    ]),
  },
  {
    id: "odisha-1999",
    name: "Odisha Super Cyclone (05B)",
    year: 1999,
    source: "historical",
    landfallPlace: "Near Paradip, Odisha",
    summary:
      "Stalled over coastal Odisha after landfall on 29 Oct 1999, with a 5-7 m surge at Ersama. It is the benchmark event behind Odisha's shelter programme and 'zero casualty' policy.",
    reported: { peakSurgeM: [5, 7], notes: "Ersama/Jagatsinghpur worst affected" },
    track: track([
      ["1999-10-26T00:00", 11.0, 93.0, 45, 994],
      ["1999-10-27T00:00", 13.0, 91.2, 70, 980],
      ["1999-10-28T00:00", 16.0, 88.9, 125, 940],
      ["1999-10-28T12:00", 18.0, 87.7, 140, 918],
      ["1999-10-29T00:00", 19.6, 86.9, 140, 914],
      ["1999-10-29T06:00", 20.3, 86.4, 135, 920],
      ["1999-10-29T18:00", 20.6, 85.9, 90, 960],
      ["1999-10-30T12:00", 20.5, 85.5, 50, 990],
      ["1999-10-31T12:00", 20.1, 85.8, 30, 1000],
    ]),
  },
];

export const DEFAULT_CUSTOM = {
  landfallLat: 21.75,
  landfallLon: 89.4,
  headingDeg: 15,
  speedKmh: 16,
  vmaxKt: 110,
  peakVmaxKt: 130,
  rmaxKm: 30,
};
