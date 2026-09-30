// Seed registry of critical infrastructure around the Bay of Bengal.
//
// Locations are APPROXIMATE (city/facility-level, typically within a few km) and elevations are
// representative values. With Earth Engine connected, elevations are re-sampled from NASADEM; the
// OSM loader (/api/infrastructure) can add real facility geometry for an impact area. Replace with
// authoritative utility / health-ministry registries before operational use.

import type { Asset, AssetType, LonLat } from "../types";

type P = [name: string, lat: number, lon: number, elevM: number, districtId: string, crit: 1 | 2 | 3 | 4 | 5, capacity?: string];

const POWER_PLANTS: P[] = [
  ["North Chennai Thermal Power Station", 13.25, 80.32, 4, "chennai", 4, "1,830 MW"],
  ["Simhadri Super Thermal Power Station", 17.6, 83.09, 8, "visakhapatnam", 5, "2,000 MW"],
  ["Kakinada gas-based power cluster", 16.93, 82.23, 3, "east-godavari", 3, "~1,000 MW"],
  ["Kolaghat Thermal Power Station", 22.42, 87.87, 7, "purba-medinipur", 4, "1,260 MW"],
  ["Budge Budge Generating Station", 22.47, 88.14, 6, "south-24-parganas", 4, "750 MW"],
  ["Haldia Energy Plant", 22.03, 88.09, 5, "purba-medinipur", 3, "600 MW"],
  ["Payra Thermal Power Plant", 21.99, 90.29, 3, "patuakhali", 5, "1,320 MW"],
  ["Rampal (Maitree) Power Plant", 22.58, 89.56, 3, "bagerhat", 5, "1,320 MW"],
  ["Matarbari Power Plant", 21.72, 91.89, 4, "coxs-bazar", 5, "1,200 MW"],
  ["Khulna Power Station", 22.87, 89.57, 3, "khulna", 3, "~500 MW"],
  ["Bhola Combined Cycle Plant", 22.62, 90.66, 3, "bhola", 3, "~420 MW"],
  ["Raozan Power Station", 22.53, 91.92, 15, "chattogram", 3, "420 MW"],
  ["Yangon gas power stations (Thaketa/Ahlone)", 16.78, 96.2, 5, "yangon", 4, "~700 MW"],
  ["Kyaukphyu gas power station", 19.43, 93.55, 6, "kyaukphyu", 2, "~50 MW"],
];

const SUBSTATIONS: P[] = [
  ["Chennai (Tondiarpet) 230 kV substation", 13.12, 80.29, 4, "chennai", 3],
  ["Machilipatnam 132 kV substation", 16.2, 81.12, 4, "krishna", 3],
  ["Kakinada 220 kV substation", 16.97, 82.21, 4, "east-godavari", 3],
  ["Kalapaka 400 kV substation (Vizag)", 17.67, 83.03, 30, "visakhapatnam", 5],
  ["Berhampur 220 kV substation", 19.33, 84.78, 25, "ganjam", 3],
  ["Puri 132 kV grid substation", 19.83, 85.8, 8, "puri", 3],
  ["Mendhasal 400 kV substation", 20.21, 85.63, 60, "khordha", 5],
  ["Paradip 220 kV grid substation", 20.3, 86.6, 5, "jagatsinghpur", 4],
  ["Balasore 220 kV grid substation", 21.5, 86.9, 15, "balasore", 4],
  ["Contai 132 kV substation", 21.78, 87.75, 5, "purba-medinipur", 3],
  ["Kakdwip 132 kV substation", 21.87, 88.18, 3, "south-24-parganas", 4],
  ["Joka 220 kV substation", 22.45, 88.3, 6, "kolkata", 4],
  ["Basirhat 132 kV substation", 22.66, 88.87, 5, "north-24-parganas", 3],
  ["Satkhira 132 kV substation", 22.71, 89.08, 3, "satkhira", 3],
  ["Khulna South 230 kV substation", 22.78, 89.56, 3, "khulna", 4],
  ["Barishal 132 kV substation", 22.69, 90.34, 3, "barishal", 3],
  ["Patuakhali 132 kV substation", 22.35, 90.33, 2, "patuakhali", 3],
  ["Bhola 132 kV substation", 22.68, 90.64, 2, "bhola", 3],
  ["Hathazari 230 kV substation", 22.5, 91.8, 12, "chattogram", 4],
  ["Cox's Bazar 132 kV substation", 21.45, 92.0, 6, "coxs-bazar", 4],
  ["Sittwe substation", 20.15, 92.88, 4, "sittwe", 3],
  ["Pathein substation", 16.79, 94.74, 4, "pathein", 3],
];

const HOSPITALS: P[] = [
  ["Rajiv Gandhi Govt. General Hospital, Chennai", 13.08, 80.28, 6, "chennai", 5],
  ["Nagapattinam Govt. Hospital", 10.77, 79.84, 4, "nagapattinam", 3],
  ["Nellore Govt. General Hospital", 14.44, 79.98, 18, "nellore", 4],
  ["Machilipatnam District Hospital", 16.18, 81.13, 5, "krishna", 3],
  ["Kakinada Govt. General Hospital", 16.96, 82.24, 5, "east-godavari", 4],
  ["King George Hospital, Visakhapatnam", 17.71, 83.3, 12, "visakhapatnam", 5],
  ["RIMS Srikakulam", 18.29, 83.89, 20, "srikakulam", 3],
  ["MKCG Medical College Hospital, Berhampur", 19.31, 84.8, 30, "ganjam", 4],
  ["Puri District HQ Hospital", 19.81, 85.83, 6, "puri", 3],
  ["AIIMS Bhubaneswar", 20.23, 85.78, 40, "khordha", 5],
  ["SCB Medical College Hospital, Cuttack", 20.47, 85.89, 25, "cuttack", 5],
  ["Jagatsinghpur District HQ Hospital", 20.26, 86.17, 8, "jagatsinghpur", 3],
  ["Kendrapara District HQ Hospital", 20.5, 86.42, 8, "kendrapara", 3],
  ["FM Medical College Hospital, Balasore", 21.49, 86.93, 15, "balasore", 4],
  ["Contai Sub-Divisional Hospital", 21.78, 87.75, 5, "purba-medinipur", 3],
  ["Diamond Harbour Govt. Medical College", 22.19, 88.19, 5, "south-24-parganas", 4],
  ["Kakdwip Sub-Divisional Hospital", 21.88, 88.18, 3, "south-24-parganas", 3],
  ["SSKM Hospital, Kolkata", 22.54, 88.34, 7, "kolkata", 5],
  ["Basirhat District Hospital", 22.66, 88.87, 5, "north-24-parganas", 3],
  ["Satkhira Medical College Hospital", 22.72, 89.07, 3, "satkhira", 3],
  ["Khulna Medical College Hospital", 22.83, 89.54, 3, "khulna", 5],
  ["Bagerhat District Hospital", 22.66, 89.79, 3, "bagerhat", 3],
  ["Barguna District Hospital", 22.15, 90.12, 2, "barguna", 3],
  ["Patuakhali Medical College Hospital", 22.35, 90.33, 2, "patuakhali", 3],
  ["Sher-e-Bangla Medical College Hospital, Barishal", 22.69, 90.36, 3, "barishal", 5],
  ["Bhola District Hospital", 22.69, 90.65, 2, "bhola", 3],
  ["Hatiya Upazila Health Complex", 22.3, 91.1, 1.5, "noakhali", 2],
  ["Noakhali General Hospital (Maijdee)", 22.87, 91.1, 4, "noakhali", 3],
  ["Chattogram Medical College Hospital", 22.36, 91.83, 8, "chattogram", 5],
  ["Cox's Bazar District Sadar Hospital", 21.44, 91.98, 6, "coxs-bazar", 4],
  ["Ukhia camp field hospitals", 21.21, 92.16, 20, "coxs-bazar", 4],
  ["Sittwe General Hospital", 20.15, 92.89, 5, "sittwe", 4],
  ["Kyaukphyu District Hospital", 19.43, 93.54, 6, "kyaukphyu", 2],
  ["Pathein General Hospital", 16.78, 94.73, 5, "pathein", 4],
  ["Labutta Hospital", 16.15, 94.76, 2, "labutta", 2],
  ["Bogale Hospital", 16.29, 95.4, 2, "pyapon", 2],
  ["Yangon General Hospital", 16.78, 96.15, 10, "yangon", 5],
];

const SHELTERS: P[] = [
  ["Diviseema cyclone shelter cluster", 15.95, 80.92, 3, "krishna", 3],
  ["Konaseema cyclone shelters (Uppalaguptam)", 16.55, 82.08, 3, "east-godavari", 3],
  ["Uppada cyclone shelter", 17.08, 82.34, 4, "east-godavari", 2],
  ["Satapada multipurpose cyclone shelter", 19.67, 85.44, 4, "puri", 3],
  ["Astaranga multipurpose cyclone shelter", 19.99, 86.27, 4, "puri", 3],
  ["Ersama multipurpose cyclone shelters", 20.2, 86.37, 3, "jagatsinghpur", 4],
  ["Mahakalpada multipurpose cyclone shelters", 20.43, 86.75, 3, "kendrapara", 3],
  ["Basudevpur multipurpose cyclone shelters", 21.1, 86.73, 4, "bhadrak", 3],
  ["Chandipur multipurpose cyclone shelter", 21.44, 87.02, 5, "balasore", 3],
  ["Ramnagar (Digha) flood/cyclone shelters", 21.66, 87.56, 4, "purba-medinipur", 3],
  ["Sagar Island flood/cyclone shelters", 21.7, 88.1, 2.5, "south-24-parganas", 4],
  ["Patharpratima flood/cyclone shelters", 21.79, 88.36, 2, "south-24-parganas", 3],
  ["Gosaba flood/cyclone shelters", 22.16, 88.8, 2, "south-24-parganas", 3],
  ["Hingalganj flood/cyclone shelters", 22.47, 88.97, 2.5, "north-24-parganas", 3],
  ["Shyamnagar cyclone shelters", 22.33, 89.1, 1.5, "satkhira", 4],
  ["Koyra cyclone shelters", 22.34, 89.3, 1.5, "khulna", 4],
  ["Dacope cyclone shelters", 22.57, 89.52, 1.5, "khulna", 3],
  ["Sarankhola cyclone shelters", 22.3, 89.79, 1.5, "bagerhat", 4],
  ["Pathorghata cyclone shelters", 22.05, 89.97, 1.2, "barguna", 4],
  ["Kalapara cyclone shelters", 21.98, 90.24, 1.2, "patuakhali", 4],
  ["Char Fasson cyclone shelters", 22.19, 90.76, 1.0, "bhola", 5],
  ["Hatiya cyclone shelters", 22.25, 91.12, 1.0, "noakhali", 5],
  ["Sandwip cyclone shelters", 22.49, 91.45, 1.2, "chattogram", 4],
  ["Kutubdia cyclone shelters", 21.82, 91.86, 1.5, "coxs-bazar", 4],
  ["Maheshkhali cyclone shelters", 21.55, 91.93, 2, "coxs-bazar", 3],
  ["Teknaf cyclone shelters", 20.87, 92.3, 3, "coxs-bazar", 3],
  ["Kutupalong-Balukhali camp shelters", 21.19, 92.15, 15, "coxs-bazar", 5],
  ["Sittwe cyclone shelters", 20.14, 92.88, 3, "sittwe", 4],
  ["Labutta cyclone shelters", 16.1, 94.77, 2, "labutta", 4],
  ["Bogale cyclone shelters", 16.28, 95.4, 2, "pyapon", 4],
];

const PORTS: P[] = [
  ["Chennai Port", 13.1, 80.3, 3, "chennai", 4],
  ["Kakinada Port", 16.95, 82.27, 3, "east-godavari", 3],
  ["Visakhapatnam Port", 17.69, 83.28, 3, "visakhapatnam", 5],
  ["Paradip Port", 20.26, 86.67, 3, "jagatsinghpur", 5],
  ["Dhamra Port", 20.82, 86.97, 3, "bhadrak", 3],
  ["Haldia Dock Complex", 22.03, 88.08, 4, "purba-medinipur", 4],
  ["Kolkata Dock System", 22.54, 88.31, 5, "kolkata", 4],
  ["Mongla Port", 22.49, 89.59, 2, "bagerhat", 4],
  ["Payra Port", 21.95, 90.28, 2, "patuakhali", 3],
  ["Chattogram Port", 22.31, 91.8, 3, "chattogram", 5],
  ["Sittwe Port", 20.13, 92.89, 3, "sittwe", 3],
  ["Yangon Port (Thilawa)", 16.66, 96.26, 3, "yangon", 4],
];

type R = [name: string, path: [number, number][], elevM: number, districtId: string, crit: 1 | 2 | 3 | 4 | 5];

// Arterial road links as [lat, lon] waypoints (generalised alignments).
const ROADS: R[] = [
  ["NH-16 Chennai - Nellore", [[13.08, 80.27], [13.4, 80.11], [14.15, 79.85], [14.44, 79.99]], 8, "nellore", 4],
  ["NH-16 Ongole - Vijayawada", [[15.5, 80.05], [16.09, 80.17], [16.31, 80.44], [16.51, 80.65]], 20, "guntur", 4],
  ["NH-216 Machilipatnam - Kakinada coastal highway", [[16.19, 81.14], [16.43, 81.7], [16.58, 82.01], [16.99, 82.25]], 3, "east-godavari", 3],
  ["NH-16 Rajahmundry - Visakhapatnam", [[17.0, 81.8], [17.36, 82.55], [17.69, 83.0], [17.73, 83.25]], 20, "visakhapatnam", 5],
  ["NH-16 Visakhapatnam - Berhampur", [[17.73, 83.25], [18.11, 83.4], [18.3, 83.9], [19.11, 84.69], [19.31, 84.79]], 25, "srikakulam", 4],
  ["NH-16 Berhampur - Bhubaneswar", [[19.31, 84.79], [19.36, 84.98], [19.52, 85.1], [19.74, 85.22], [20.18, 85.62], [20.3, 85.82]], 20, "khordha", 5],
  ["NH-316 Bhubaneswar - Puri", [[20.3, 85.82], [20.12, 85.83], [19.81, 85.83]], 8, "puri", 4],
  ["NH-53 Cuttack - Paradip", [[20.46, 85.88], [20.33, 86.17], [20.26, 86.4], [20.28, 86.62]], 5, "jagatsinghpur", 4],
  ["NH-16 Cuttack - Balasore", [[20.46, 85.88], [20.85, 86.25], [21.06, 86.5], [21.49, 86.93]], 12, "bhadrak", 5],
  ["NH-16 Balasore - Kolkata", [[21.49, 86.93], [21.95, 87.3], [22.34, 87.32], [22.45, 87.85], [22.58, 88.26]], 8, "purba-medinipur", 5],
  ["NH-116B Nandakumar - Contai - Digha", [[22.2, 87.92], [21.78, 87.75], [21.63, 87.51]], 4, "purba-medinipur", 3],
  ["NH-12 Kolkata - Diamond Harbour - Namkhana", [[22.5, 88.32], [22.19, 88.19], [21.87, 88.19], [21.77, 88.23]], 4, "south-24-parganas", 4],
  ["Basanti Highway Kolkata - Canning - Sonakhali", [[22.52, 88.4], [22.31, 88.66], [22.2, 88.75]], 3, "south-24-parganas", 3],
  ["Satkhira - Shyamnagar road", [[22.72, 89.07], [22.5, 89.08], [22.33, 89.1]], 2, "satkhira", 3],
  ["N7 Khulna - Mongla", [[22.82, 89.55], [22.65, 89.6], [22.49, 89.6]], 2, "bagerhat", 4],
  ["N8 Barishal - Patuakhali - Kuakata", [[22.7, 90.37], [22.36, 90.33], [22.1, 90.2], [21.82, 90.12]], 2, "patuakhali", 4],
  ["N1 Feni - Chattogram", [[23.01, 91.4], [22.78, 91.55], [22.36, 91.78]], 5, "chattogram", 5],
  ["N1 Chattogram - Cox's Bazar", [[22.36, 91.78], [22.08, 92.05], [21.77, 92.08], [21.43, 92.01]], 8, "coxs-bazar", 5],
  ["Cox's Bazar - Teknaf Marine Drive", [[21.43, 91.97], [21.2, 92.05], [20.86, 92.3]], 3, "coxs-bazar", 4],
  ["Sittwe - Kyauktaw road", [[20.15, 92.9], [20.5, 93.0], [20.84, 92.98]], 3, "sittwe", 3],
  ["Yangon - Pathein highway", [[16.84, 96.17], [16.87, 95.6], [16.78, 95.2], [16.78, 94.73]], 4, "pathein", 4],
  ["Pathein - Labutta road", [[16.78, 94.73], [16.45, 94.75], [16.15, 94.76]], 2, "labutta", 3],
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function points(type: AssetType, rows: P[]): Asset[] {
  return rows.map(([name, lat, lon, elevM, districtId, criticality, capacity]) => ({
    id: `${type}:${slug(name)}`,
    name,
    type,
    lat,
    lon,
    elevM,
    districtId,
    criticality,
    capacity,
    source: "seed" as const,
    elevSource: "seed" as const,
  }));
}

export const SEED_ASSETS: Asset[] = [
  ...points("power_plant", POWER_PLANTS),
  ...points("substation", SUBSTATIONS),
  ...points("hospital", HOSPITALS),
  ...points("shelter", SHELTERS),
  ...points("port", PORTS),
  ...ROADS.map(([name, path, elevM, districtId, criticality]) => {
    const mid = path[Math.floor(path.length / 2)];
    return {
      id: `road:${slug(name)}`,
      name,
      type: "road" as const,
      lat: mid[0],
      lon: mid[1],
      elevM,
      districtId,
      criticality,
      path: path.map(([la, lo]) => [lo, la] as LonLat),
      source: "seed" as const,
      elevSource: "seed" as const,
    };
  }),
];

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  power_plant: "Power plant",
  substation: "Substation",
  hospital: "Hospital",
  shelter: "Cyclone shelter",
  road: "Arterial road",
  port: "Port",
};
